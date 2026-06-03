import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';

const startEchoServer = (): Promise<{ server: http.Server; port: number }> =>
  new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });

const requestViaProxy = (proxyPort: number, targetUrl: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const req = http.request(
      { host: '127.0.0.1', port: proxyPort, path: targetUrl, method: 'GET', headers: { host: target.host } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end();
  });

describe('ProxyEngine 회복력', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let echoServer: http.Server;
  let echoPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-resil-'));
    const certManager = new CertManager(tempDir);
    certManager.loadOrCreateRootCa();
    const echo = await startEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;
    engine = new ProxyEngine(certManager);
    proxyPort = await engine.start(0);
  });

  afterEach(async () => {
    await engine.stop();
    echoServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('트래픽 리스너가 throw해도 프록시는 응답을 계속 중계한다', async () => {
    let secondListenerCalled = false;
    engine.onTraffic(() => {
      throw new Error('리스너 폭발');
    });
    engine.onTraffic(() => {
      secondListenerCalled = true;
    });

    // 첫 리스너가 throw해도 응답은 정상이어야 한다 (emit 격리)
    const status = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/x`);
    expect(status).toBe(200);

    // 후속 요청도 정상 — 프록시가 죽지 않았다
    const status2 = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/y`);
    expect(status2).toBe(200);

    // 두 번째 리스너는 첫 리스너의 throw와 무관하게 호출됨
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(secondListenerCalled).toBe(true);
  });
});
