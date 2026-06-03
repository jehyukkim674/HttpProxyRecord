import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendComposedRequest } from '../src/main/composer/requestSender';

const startEcho = (): Promise<{ server: http.Server; port: number }> =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(201, { 'content-type': 'application/json', 'x-method': req.method ?? '' });
        res.end(JSON.stringify({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });

describe('sendComposedRequest', () => {
  let server: http.Server;
  let port: number;
  beforeEach(async () => {
    const e = await startEcho();
    server = e.server;
    port = e.port;
  });
  afterEach(() => server.close());

  it('메서드/바디를 전송하고 응답을 수집한다', async () => {
    const res = await sendComposedRequest({
      method: 'POST',
      url: `http://127.0.0.1:${port}/users`,
      headers: { 'content-type': 'application/json' },
      body: '{"name":"x"}',
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['x-method']).toBe('POST');
    const parsed = JSON.parse(res.body) as { method: string; body: string };
    expect(parsed.method).toBe('POST');
    expect(parsed.body).toBe('{"name":"x"}');
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('바디 없는 GET도 전송한다', async () => {
    const res = await sendComposedRequest({
      method: 'GET',
      url: `http://127.0.0.1:${port}/ping`,
      headers: {},
      body: null,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).url).toBe('/ping');
  });

  it('잘못된 URL이면 에러를 던진다', async () => {
    await expect(
      sendComposedRequest({ method: 'GET', url: 'not-a-url', headers: {}, body: null }),
    ).rejects.toThrow();
  });
});
