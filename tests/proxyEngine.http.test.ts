import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type { CapturedTraffic } from '../src/shared/types';

/** 테스트용 echo 서버: 요청 메서드/경로/바디를 JSON으로 돌려준다 */
const startEchoServer = (): Promise<{ server: http.Server; port: number }> =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json', 'x-echo': 'true' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });

/** 프록시를 경유해 HTTP 요청을 보낸다 (절대 URL 방식) */
const requestViaProxy = (
  proxyPort: number,
  targetUrl: string,
  options: { method?: string; body?: string } = {},
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> =>
  new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: targetUrl,
        method: options.method ?? 'GET',
        headers: { host: target.host, 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });

describe('ProxyEngine - HTTP', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let echoServer: http.Server;
  let echoPort: number;
  let proxyPort: number;
  let captured: CapturedTraffic[];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-proxy-test-'));
    const certManager = new CertManager(tempDir);
    certManager.loadOrCreateRootCa();

    const echo = await startEchoServer();
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

  it('GET 요청을 중계하고 응답을 그대로 돌려준다', async () => {
    const result = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/users?page=1`);

    expect(result.status).toBe(200);
    expect(result.headers['x-echo']).toBe('true');
    const parsed = JSON.parse(result.body) as { method: string; url: string };
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('/users?page=1');
  });

  it('POST 바디를 그대로 전달한다', async () => {
    const result = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/items`, {
      method: 'POST',
      body: '{"name":"테스트"}',
    });

    expect(result.status).toBe(200);
    const parsed = JSON.parse(result.body) as { body: string };
    expect(parsed.body).toBe('{"name":"테스트"}');
  });

  it('요청/응답을 캡처해 리스너에 전달한다', async () => {
    await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/capture-me`, {
      method: 'POST',
      body: '{"k":"v"}',
    });

    // 캡처 이벤트는 응답 종료 후 발생하므로 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(captured).toHaveLength(1);
    const traffic = captured[0];
    expect(traffic.method).toBe('POST');
    expect(traffic.host).toBe(`127.0.0.1:${echoPort}`);
    expect(traffic.path).toBe('/capture-me');
    expect(traffic.url).toBe(`http://127.0.0.1:${echoPort}/capture-me`);
    expect(traffic.statusCode).toBe(200);
    expect(traffic.requestBody).toBe('{"k":"v"}');
    expect(JSON.parse(traffic.responseBody!).body).toBe('{"k":"v"}');
    expect(traffic.isHttps).toBe(false);
    expect(traffic.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('연결할 수 없는 대상이면 502를 반환한다', async () => {
    const result = await requestViaProxy(proxyPort, 'http://127.0.0.1:1/unreachable');

    expect(result.status).toBe(502);
  });
});
