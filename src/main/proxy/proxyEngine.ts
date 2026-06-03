import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import type { CapturedTraffic, OverrideRule, ThrottleConfig } from '../../shared/types';
import type { CertManager } from './certManager';
import { decodeBody } from './decompress';
import { matchOverrideRule } from '../../shared/interception';
import { log } from '../logger';
import type {
  ScriptHooks,
  ScriptRequest,
  ScriptResponse,
  ScriptShortCircuit,
} from '../scripting/scriptRunner';

type InterceptionConfig = {
  overrideRules: OverrideRule[];
  throttle: ThrottleConfig;
  breakpointPatterns: string[];
};

export type TrafficListener = (traffic: CapturedTraffic) => void;
export type BreakpointHit = { id: number; method: string; url: string };
export type BreakpointListener = (hit: BreakpointHit) => void;
export type BreakpointAction = 'forward' | 'block';

const BREAKPOINT_TIMEOUT_MS = 30000;

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
  private interception: InterceptionConfig = {
    overrideRules: [],
    throttle: { enabled: false, latencyMs: 0 },
    breakpointPatterns: [],
  };
  private readonly breakpointListeners: BreakpointListener[] = [];
  private readonly pendingBreakpoints = new Map<number, (action: BreakpointAction) => void>();
  private breakpointSeq = 0;
  private scriptRunner: ScriptHooks | null = null;

  constructor(private readonly certManager: CertManager) {}

  onTraffic(listener: TrafficListener): void {
    this.listeners.push(listener);
  }

  onBreakpoint(listener: BreakpointListener): void {
    this.breakpointListeners.push(listener);
  }

  /** 오버라이드 규칙/throttle/브레이크포인트 설정을 갱신한다 (#4 #7 #3). */
  setInterception(config: InterceptionConfig): void {
    this.interception = config;
  }

  /** 스크립트 인터셉션 훅을 주입한다 (프로그래머블 인터셉션). */
  setScriptRunner(runner: ScriptHooks): void {
    this.scriptRunner = runner;
  }

  /** 일시정지된 요청을 통과/차단으로 재개한다 (#3). */
  resolveBreakpoint(id: number, action: BreakpointAction): void {
    const resolver = this.pendingBreakpoints.get(id);
    if (resolver) resolver(action);
  }

  /** 브레이크포인트 패턴에 매칭되면 결정(통과/차단)을 기다린다. 30초 후 자동 통과(안전). */
  private waitForBreakpoint(method: string, url: string): Promise<BreakpointAction> {
    const matches = this.interception.breakpointPatterns.some((pattern) => {
      const trimmed = pattern.trim();
      if (trimmed.length === 0) return false;
      const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`).test(url);
    });
    if (!matches) return Promise.resolve('forward');

    const id = (this.breakpointSeq += 1);
    return new Promise<BreakpointAction>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingBreakpoints.delete(id);
        resolve('forward');
      }, BREAKPOINT_TIMEOUT_MS);
      this.pendingBreakpoints.set(id, (action) => {
        clearTimeout(timer);
        this.pendingBreakpoints.delete(id);
        resolve(action);
      });
      for (const listener of this.breakpointListeners) listener({ id, method, url });
    });
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
    // 리스너 하나가 throw해도 다른 리스너/프록시 흐름이 죽지 않도록 격리한다.
    for (const listener of this.listeners) {
      try {
        listener(traffic);
      } catch (error) {
        log.error('트래픽 리스너 처리 실패', error);
      }
    }
  }

  // ─────────────────────────── HTTP 프록시 서버 ───────────────────────────

  private startHttpServer(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handlePlainRequest(req, res));
      server.on('connect', (req, socket, head) => this.handleConnect(req, socket as net.Socket, head));
      server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket as net.Socket, head));
      server.on('connection', (socket) => this.trackSocket(socket));
      server.on('error', (error) => {
        log.error('프록시 서버 오류', error);
        reject(error);
      });
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

  /** WebSocket 업그레이드(ws://): 원본으로 raw 터널링하고 연결을 기록한다 (#20). */
  private handleUpgrade(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      clientSocket.destroy();
      return;
    }

    const startedAt = Date.now();
    const upstream = net.connect(Number(url.port || '80'), url.hostname, () => {
      const headerLines = Object.entries(req.headers).map(
        ([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`,
      );
      upstream.write(
        `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n`,
      );
      if (head.length > 0) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });

    this.trackSocket(upstream);
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
    // WebSocket 연결 수립을 트래픽으로 기록 (프레임 단위 캡처는 향후)
    this.emit({
      timestamp: new Date(startedAt).toISOString(),
      method: 'WS',
      url: `ws://${url.host}${url.pathname}${url.search}`,
      host: url.host,
      path: `${url.pathname}${url.search}`,
      requestHeaders: this.normalizeHeaders(req.headers),
      requestBody: null,
      statusCode: 101,
      responseHeaders: {},
      responseBody: null,
      durationMs: 0,
      requestSize: 0,
      responseSize: 0,
      isHttps: false,
      clientIp: clientSocket.remoteAddress ?? '',
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
      server.on('error', (error) => {
        log.error('MITM 서버 오류', error);
        reject(error);
      });
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

  private fullUrl(target: ForwardTarget): string {
    const hostWithPort = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;
    return `${target.isHttps ? 'https' : 'http'}://${hostWithPort}${target.path}`;
  }

  /** throttle 설정에 따라 응답 전송을 지연시킨다 (#7). */
  private throttleDelay(): Promise<void> {
    const { enabled, latencyMs } = this.interception.throttle;
    if (!enabled || latencyMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, latencyMs));
  }

  private forwardRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    target: ForwardTarget,
  ): void {
    const startedAt = Date.now();
    const requestChunks: Buffer[] = [];

    // 요청 본문을 모두 모은 뒤 오버라이드/브레이크포인트/중계를 결정한다 (통합 버퍼 방식)
    clientReq.on('data', (chunk: Buffer) => requestChunks.push(chunk));
    clientReq.on('error', () => clientRes.destroy());
    clientReq.on('end', () => {
      this.dispatchRequest(clientReq, clientRes, target, startedAt, requestChunks).catch((error) => {
        log.error('요청 중계 실패', error);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        }
        clientRes.end('프록시 처리 중 오류가 발생했어요.');
      });
    });
  }

  private async dispatchRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    target: ForwardTarget,
    startedAt: number,
    requestChunks: Buffer[],
  ): Promise<void> {
    const url = this.fullUrl(target);

    // #4 오버라이드: 매칭 규칙이 있으면 업스트림 없이 가짜 응답 반환
    const override = matchOverrideRule(url, this.interception.overrideRules);
    if (override) {
      await this.throttleDelay();
      clientRes.writeHead(override.statusCode, { 'content-type': override.contentType });
      clientRes.end(override.body);
      this.emit(
        this.buildTraffic(clientReq, override.statusCode, { 'content-type': override.contentType }, target, {
          requestChunks,
          responseChunks: [Buffer.from(override.body)],
          startedAt,
        }),
      );
      return;
    }

    // #3 브레이크포인트: 매칭 시 사용자 결정(통과/차단) 대기 (30초 타임아웃 자동 통과)
    const action = await this.waitForBreakpoint(clientReq.method ?? 'GET', url);
    if (action === 'block') {
      clientRes.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      clientRes.end('브레이크포인트에서 차단됨');
      this.emit(
        this.buildTraffic(clientReq, 403, {}, target, {
          requestChunks,
          responseChunks: [Buffer.from('브레이크포인트에서 차단됨')],
          startedAt,
        }),
      );
      return;
    }

    // 스크립트 인터셉션: onRequest (헤더/본문/path/method 변조 또는 단락)
    const scriptReq: ScriptRequest = {
      method: clientReq.method ?? 'GET',
      url,
      host: `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`,
      path: target.path,
      headers: this.normalizeHeaders(clientReq.headers),
      body: requestChunks.length > 0 ? Buffer.concat(requestChunks).toString('utf-8') : null,
    };
    if (this.scriptRunner?.hasRequestHooks()) {
      let shortCircuit: ScriptShortCircuit | null = null;
      try {
        shortCircuit = this.scriptRunner.runRequest(scriptReq);
      } catch (error) {
        log.error('스크립트 runRequest 실패', error);
      }
      if (shortCircuit) {
        await this.throttleDelay();
        clientRes.writeHead(shortCircuit.status, shortCircuit.headers);
        clientRes.end(shortCircuit.body);
        this.emit(
          this.buildTraffic(clientReq, shortCircuit.status, shortCircuit.headers, target, {
            requestChunks,
            responseChunks: [Buffer.from(shortCircuit.body)],
            startedAt,
          }),
        );
        return;
      }
    }

    const outboundHeaders: Record<string, string | string[] | undefined> = { ...scriptReq.headers };
    for (const headerName of HOP_BY_HOP_HEADERS) {
      delete outboundHeaders[headerName];
    }
    outboundHeaders.host = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;
    const outboundBody = scriptReq.body !== null ? Buffer.from(scriptReq.body) : Buffer.concat(requestChunks);
    if (this.scriptRunner?.hasRequestHooks()) {
      // 본문이 바뀌었을 수 있으니 길이 보정 (chunked 충돌 방지)
      delete outboundHeaders['transfer-encoding'];
      outboundHeaders['content-length'] = String(outboundBody.length);
    }

    const responseChunks: Buffer[] = [];
    const requestFn = target.isHttps ? https.request : http.request;
    const proxyReq = requestFn(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: scriptReq.path,
        method: scriptReq.method,
        headers: outboundHeaders,
        // 디버깅 프록시 특성상 업스트림 인증서 검증은 끈다 (사설 인증서 API 대응)
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        // 응답을 모두 버퍼링한 뒤(throttle 지연 적용 가능) 한 번에 전송
        proxyRes.on('data', (chunk: Buffer) => responseChunks.push(chunk));
        proxyRes.on('end', () => {
          void this.throttleDelay().then(() => {
            const upstreamStatus = proxyRes.statusCode ?? 502;

            // 스크립트 인터셉션: onResponse (응답 훅이 있을 때만 디코드→변조→재전송)
            if (this.scriptRunner?.hasResponseHooks()) {
              const buf = Buffer.concat(responseChunks);
              const normalized = this.normalizeHeaders(proxyRes.headers);
              const decoded =
                buf.length > 0
                  ? decodeBody(buf, normalized['content-encoding'], normalized['content-type'])
                  : null;
              const originalText = decoded ? decoded.text : buf.toString('utf-8');
              const headersNoEncoding = { ...normalized };
              delete headersNoEncoding['content-encoding'];
              const res: ScriptResponse = {
                status: upstreamStatus,
                headers: headersNoEncoding,
                body: originalText,
              };
              try {
                this.scriptRunner.runResponse(scriptReq, res);
              } catch (error) {
                log.error('스크립트 runResponse 실패', error);
              }
              // 본문/상태가 바뀐 경우에만 평문으로 재전송(미변경 시 원본 패스스루로 바이너리 보존)
              if (res.status !== upstreamStatus || res.body !== originalText) {
                const outBuf = Buffer.from(res.body);
                const outHeaders = { ...res.headers };
                delete outHeaders['transfer-encoding'];
                outHeaders['content-length'] = String(outBuf.length);
                clientRes.writeHead(res.status, outHeaders);
                clientRes.end(outBuf);
                this.emit(
                  this.buildTraffic(clientReq, res.status, outHeaders, target, {
                    requestChunks,
                    responseChunks: [outBuf],
                    startedAt,
                  }),
                );
                return;
              }
            }

            clientRes.writeHead(upstreamStatus, proxyRes.headers);
            clientRes.end(Buffer.concat(responseChunks));
            this.emit(
              this.buildTraffic(clientReq, upstreamStatus, proxyRes.headers, target, {
                requestChunks,
                responseChunks,
                startedAt,
              }),
            );
          });
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

    if (outboundBody.length > 0) proxyReq.write(outboundBody);
    proxyReq.end();
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

    const normalizedResponseHeaders = this.normalizeHeaders(responseHeaders);
    const contentEncoding = normalizedResponseHeaders['content-encoding'];
    const decodedResponse =
      responseBodyBuffer.length > 0
        ? decodeBody(responseBodyBuffer, contentEncoding, normalizedResponseHeaders['content-type'])
        : null;
    // 본문을 해제했으므로 content-encoding 헤더는 제거(저장된 본문은 평문/그대로)
    delete normalizedResponseHeaders['content-encoding'];

    return {
      timestamp: new Date(data.startedAt).toISOString(),
      method: clientReq.method ?? 'GET',
      url: `${scheme}://${hostWithPort}${target.path}`,
      host: hostWithPort,
      path: target.path,
      requestHeaders: this.normalizeHeaders(clientReq.headers),
      requestBody: requestBodyBuffer.length > 0 ? requestBodyBuffer.toString('utf-8') : null,
      statusCode,
      responseHeaders: normalizedResponseHeaders,
      responseBody: decodedResponse ? decodedResponse.text : null,
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
