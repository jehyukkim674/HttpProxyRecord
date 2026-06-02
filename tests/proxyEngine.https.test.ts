import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import forge from 'node-forge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type { CapturedTraffic } from '../src/shared/types';

/** 테스트용 자가서명 인증서 생성 (대상 HTTPS echo 서버용) */
const createSelfSignedCert = (commonName: string): { key: string; cert: string } => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: commonName }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
};

/** HTTPS echo 서버 */
const startHttpsEchoServer = (): Promise<{ server: https.Server; port: number }> =>
  new Promise((resolve) => {
    const selfSigned = createSelfSignedCert('localhost');
    const server = https.createServer({ key: selfSigned.key, cert: selfSigned.cert }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, url: req.url, secure: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });

/**
 * 프록시에 CONNECT를 보낸 뒤, 그 터널 위에서 TLS 핸드셰이크를 하고 HTTPS 요청을 보낸다.
 * 클라이언트는 프록시의 루트 CA를 신뢰한다 (MITM 인증서 검증).
 */
const requestHttpsViaProxy = (
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  requestPath: string,
  rootCaPem: string,
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const proxySocket = net.connect(proxyPort, '127.0.0.1', () => {
      proxySocket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`,
      );
    });

    proxySocket.once('data', (data: Buffer) => {
      if (!data.toString().startsWith('HTTP/1.1 200')) {
        reject(new Error(`CONNECT 실패: ${data.toString()}`));
        return;
      }

      // 터널 위에서 TLS 핸드셰이크 — 프록시가 제시하는 인증서는 루트 CA로 검증돼야 한다
      const tlsSocket = tls.connect(
        {
          socket: proxySocket,
          servername: targetHost,
          ca: [rootCaPem],
          rejectUnauthorized: true,
        },
        () => {
          tlsSocket.write(
            `GET ${requestPath} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nConnection: close\r\n\r\n`,
          );
        },
      );

      const responseChunks: Buffer[] = [];
      tlsSocket.on('data', (chunk: Buffer) => responseChunks.push(chunk));
      tlsSocket.on('end', () => {
        const raw = Buffer.concat(responseChunks).toString();
        const [headerPart, ...bodyParts] = raw.split('\r\n\r\n');
        const statusLine = headerPart.split('\r\n')[0];
        const status = Number(statusLine.split(' ')[1]);
        resolve({ status, body: bodyParts.join('\r\n\r\n') });
      });
      tlsSocket.on('error', reject);
    });

    proxySocket.on('error', reject);
  });

describe('ProxyEngine - HTTPS MITM', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let rootCaPem: string;
  let echoServer: https.Server;
  let echoPort: number;
  let proxyPort: number;
  let captured: CapturedTraffic[];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-mitm-test-'));
    const certManager = new CertManager(tempDir);
    rootCaPem = certManager.loadOrCreateRootCa().cert;

    const echo = await startHttpsEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;

    captured = [];
    engine = new ProxyEngine(certManager);
    engine.onTraffic((traffic) => captured.push(traffic));
    proxyPort = await engine.start(0);
  });

  afterEach(async () => {
    await engine.stop();
    echoServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('CONNECT 터널을 MITM해 HTTPS 요청/응답을 복호화하고 중계한다', async () => {
    const result = await requestHttpsViaProxy(proxyPort, 'localhost', echoPort, '/secure-api', rootCaPem);

    expect(result.status).toBe(200);
    expect(result.body).toContain('"secure":true');
  });

  it('복호화된 HTTPS 트래픽을 캡처한다', async () => {
    await requestHttpsViaProxy(proxyPort, 'localhost', echoPort, '/secure-capture', rootCaPem);

    // 캡처는 응답 종료 후 비동기로 발생하므로 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const traffic = captured[0];
    expect(traffic.isHttps).toBe(true);
    expect(traffic.path).toBe('/secure-capture');
    expect(traffic.statusCode).toBe(200);
    expect(traffic.responseBody).toContain('"secure":true');
  });
});
