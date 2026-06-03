import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type {
  ScriptHooks,
  ScriptRequest,
  ScriptResponse,
  ScriptShortCircuit,
} from '../src/main/scripting/scriptRunner';

const startEcho = (): Promise<{
  server: http.Server;
  port: number;
  lastHeaders: () => http.IncomingHttpHeaders;
}> =>
  new Promise((resolve) => {
    let last: http.IncomingHttpHeaders = {};
    const server = http.createServer((req, res) => {
      last = req.headers;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('upstream-body');
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port, lastHeaders: () => last }),
    );
  });

const get = (proxyPort: number, targetUrl: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const t = new URL(targetUrl);
    const req = http.request(
      { host: '127.0.0.1', port: proxyPort, path: targetUrl, method: 'GET', headers: { host: t.host } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });

describe('ProxyEngine + 스크립트', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let echo: Awaited<ReturnType<typeof startEcho>>;
  let proxyPort: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-script-'));
    const cm = new CertManager(tempDir);
    cm.loadOrCreateRootCa();
    echo = await startEcho();
    engine = new ProxyEngine(cm);
    proxyPort = await engine.start(0);
  });

  afterEach(async () => {
    await engine.stop();
    echo.server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const hooks = (over: Partial<ScriptHooks>): ScriptHooks => ({
    hasRequestHooks: () => false,
    hasResponseHooks: () => false,
    runRequest: () => null,
    runResponse: () => {},
    ...over,
  });

  it('onRequest가 헤더를 주입하면 업스트림에 반영된다', async () => {
    engine.setScriptRunner(
      hooks({
        hasRequestHooks: () => true,
        runRequest: (req: ScriptRequest) => {
          req.headers['x-injected'] = 'yes';
          return null;
        },
      }),
    );
    await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(echo.lastHeaders()['x-injected']).toBe('yes');
  });

  it('onRequest가 가짜응답 반환 시 업스트림을 호출하지 않는다', async () => {
    let hit = false;
    const upstream = http.createServer((_req, res) => {
      hit = true;
      res.end('real');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const upstreamPort = (upstream.address() as AddressInfo).port;

    engine.setScriptRunner(
      hooks({
        hasRequestHooks: () => true,
        runRequest: (): ScriptShortCircuit => ({
          status: 201,
          headers: { 'content-type': 'text/plain' },
          body: 'mocked',
        }),
      }),
    );
    const r = await get(proxyPort, `http://127.0.0.1:${upstreamPort}/a`);
    upstream.close();

    expect(r.status).toBe(201);
    expect(r.body).toBe('mocked');
    expect(hit).toBe(false);
  });

  it('onResponse가 본문을 변조하면 클라이언트가 변조본을 받는다', async () => {
    engine.setScriptRunner(
      hooks({
        hasResponseHooks: () => true,
        runResponse: (_req: ScriptRequest, res: ScriptResponse) => {
          res.body = res.body.toUpperCase();
        },
      }),
    );
    const r = await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(r.body).toBe('UPSTREAM-BODY');
  });

  it('스크립트 러너가 없으면 기존 동작(패스스루) 유지', async () => {
    const r = await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(r.body).toBe('upstream-body');
  });
});
