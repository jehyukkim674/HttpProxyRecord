import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import type { CapturedTraffic } from '../../shared/types';
import type { CertManager } from './certManager';

export type TrafficListener = (traffic: CapturedTraffic) => void;

type ForwardTarget = {
  hostname: string;
  port: string;
  path: string;
  isHttps: boolean;
};

/** 업스트림으로 전달하지 않을 hop-by-hop 헤더 */
const HOP_BY_HOP_HEADERS = ['proxy-connection', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer'];

/**
 * HTTP/HTTPS MITM 프록시 엔진.
 * - HTTP: 절대 URL 프록시 요청을 그대로 중계
 * - HTTPS: CONNECT 터널을 내부 MITM 서버로 보내 TLS를 종단(복호화)한 뒤 중계
 * - 모든 요청/응답 쌍을 CapturedTraffic으로 리스너에 전달
 */
export class ProxyEngine {
  private httpServer: http.Server | null = null;
  private mitmServer: https.Server | null = null;
  private mitmPort = 0;
  private readonly listeners: TrafficListener[] = [];
  private readonly activeSockets = new Set<net.Socket>();

  constructor(private readonly certManager: CertManager) {}

  onTraffic(listener: TrafficListener): void {
    this.listeners.push(listener);
  }

  /** @returns 실제 리스닝 포트 (port=0이면 OS가 할당) */
  async start(port: number): Promise<number> {
    await this.startMitmServer();
    return this.startHttpServer(port);
  }

  async stop(): Promise<void> {
    // 열린 터널/연결 소켓을 강제 종료해야 server.close()가 완료된다
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    await Promise.all([
      new Promise<void>((resolve) => {
        if (this.httpServer) this.httpServer.close(() => resolve());
        else resolve();
      }),
      new Promise<void>((resolve) => {
        if (this.mitmServer) this.mitmServer.close(() => resolve());
        else resolve();
      }),
    ]);
    this.httpServer = null;
    this.mitmServer = null;
  }

  /** 소켓을 추적해 stop() 시 강제 정리할 수 있게 한다 */
  private trackSocket(socket: net.Socket): void {
    this.activeSockets.add(socket);
    socket.on('close', () => this.activeSockets.delete(socket));
  }

  get isRunning(): boolean {
    return this.httpServer !== null;
  }

  private emit(traffic: CapturedTraffic): void {
    for (const listener of this.listeners) listener(traffic);
  }

  // ─────────────────────────── HTTP 프록시 서버 ───────────────────────────

  private startHttpServer(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handlePlainRequest(req, res));
      server.on('connect', (req, socket, head) => this.handleConnect(req, socket as net.Socket, head));
      server.on('connection', (socket) => this.trackSocket(socket));
      server.on('error', reject);
      server.listen(port, () => {
        this.httpServer = server;
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  /** 평문 HTTP 프록시 요청 (요청 라인에 절대 URL이 들어옴) */
  private handlePlainRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    let url: URL;
    try {
      url = new URL(clientReq.url ?? '');
    } catch {
      clientRes.writeHead(400);
      clientRes.end('Invalid proxy request URL');
      return;
    }

    this.forwardRequest(clientReq, clientRes, {
      hostname: url.hostname,
      port: url.port || '80',
      path: `${url.pathname}${url.search}`,
      isHttps: false,
    });
  }

  // ─────────────────────────── HTTPS MITM ───────────────────────────

  /** 내부 MITM HTTPS 서버: CONNECT 터널의 TLS를 종단해 복호화한다 */
  private startMitmServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const fallbackCert = this.certManager.getCertForHost('localhost');
      const server = https.createServer(
        {
          key: fallbackCert.key,
          cert: fallbackCert.cert,
          SNICallback: (servername, callback) => {
            try {
              const pair = this.certManager.getCertForHost(servername);
              callback(null, tls.createSecureContext({ key: pair.key, cert: pair.cert }));
            } catch (error) {
              callback(error as Error);
            }
          },
        },
        (req, res) => this.handleDecryptedRequest(req, res),
      );
      server.on('connection', (socket) => this.trackSocket(socket));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.mitmPort = (server.address() as AddressInfo).port;
        this.mitmServer = server;
        resolve();
      });
    });
  }

  /** MITM 서버에서 복호화된 HTTPS 요청 — 실제 서버로 다시 TLS로 전달 */
  private handleDecryptedRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    const hostHeader = clientReq.headers.host ?? '';
    const [hostname, portString] = hostHeader.split(':');

    this.forwardRequest(clientReq, clientRes, {
      hostname,
      port: portString || '443',
      path: clientReq.url ?? '/',
      isHttps: true,
    });
  }

  /** CONNECT 요청: 클라이언트 소켓을 내부 MITM 서버로 파이프 */
  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const serverSocket = net.connect(this.mitmPort, '127.0.0.1', () => {
      // 중요: 200 응답은 터널(pipe)이 준비된 다음에 보내야 한다.
      // 먼저 보내면 클라이언트의 TLS ClientHello가 pipe 연결 전에 도착해 유실된다.
      if (head.length > 0) serverSocket.write(head);
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    });

    this.trackSocket(serverSocket);
    serverSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => serverSocket.destroy());
  }

  // ─────────────────────────── 공통 중계 + 캡처 ───────────────────────────

  private forwardRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    target: ForwardTarget,
  ): void {
    const startedAt = Date.now();
    const requestChunks: Buffer[] = [];
    const responseChunks: Buffer[] = [];

    const outboundHeaders: Record<string, string | string[] | undefined> = { ...clientReq.headers };
    for (const headerName of HOP_BY_HOP_HEADERS) {
      delete outboundHeaders[headerName];
    }
    outboundHeaders.host = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;

    const requestFn = target.isHttps ? https.request : http.request;
    const proxyReq = requestFn(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.path,
        method: clientReq.method,
        headers: outboundHeaders,
        // 디버깅 프록시 특성상 업스트림 인증서 검증은 끈다 (사설 인증서 API 대응)
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.on('data', (chunk: Buffer) => {
          responseChunks.push(chunk);
          clientRes.write(chunk);
        });
        proxyRes.on('end', () => {
          clientRes.end();
          this.emit(
            this.buildTraffic(clientReq, proxyRes.statusCode ?? 0, proxyRes.headers, target, {
              requestChunks,
              responseChunks,
              startedAt,
            }),
          );
        });
      },
    );

    proxyReq.on('error', (error: Error) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      clientRes.end(`프록시 중계 실패: ${error.message}`);
      this.emit(this.buildTraffic(clientReq, 502, {}, target, { requestChunks, responseChunks, startedAt }));
    });

    clientReq.on('data', (chunk: Buffer) => {
      requestChunks.push(chunk);
      proxyReq.write(chunk);
    });
    clientReq.on('end', () => proxyReq.end());
    clientReq.on('error', () => proxyReq.destroy());
  }

  private isDefaultPort(target: ForwardTarget): boolean {
    return (target.isHttps && target.port === '443') || (!target.isHttps && target.port === '80');
  }

  private buildTraffic(
    clientReq: http.IncomingMessage,
    statusCode: number,
    responseHeaders: http.IncomingHttpHeaders,
    target: ForwardTarget,
    data: { requestChunks: Buffer[]; responseChunks: Buffer[]; startedAt: number },
  ): CapturedTraffic {
    const requestBodyBuffer = Buffer.concat(data.requestChunks);
    const responseBodyBuffer = Buffer.concat(data.responseChunks);
    const hostWithPort = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;
    const scheme = target.isHttps ? 'https' : 'http';

    return {
      timestamp: new Date(data.startedAt).toISOString(),
      method: clientReq.method ?? 'GET',
      url: `${scheme}://${hostWithPort}${target.path}`,
      host: hostWithPort,
      path: target.path,
      requestHeaders: this.normalizeHeaders(clientReq.headers),
      requestBody: requestBodyBuffer.length > 0 ? requestBodyBuffer.toString('utf-8') : null,
      statusCode,
      responseHeaders: this.normalizeHeaders(responseHeaders),
      responseBody: responseBodyBuffer.length > 0 ? responseBodyBuffer.toString('utf-8') : null,
      durationMs: Date.now() - data.startedAt,
      requestSize: requestBodyBuffer.length,
      responseSize: responseBodyBuffer.length,
      isHttps: target.isHttps,
      clientIp: clientReq.socket.remoteAddress ?? '',
    };
  }

  private normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      normalized[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    return normalized;
  }
}
