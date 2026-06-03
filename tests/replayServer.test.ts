import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplayServer } from '../src/main/replay/replayServer';
import type { TrafficRecord } from '../src/shared/types';

const sampleRecord = (overrides: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  responseHeaders: { 'content-type': 'application/json', 'content-length': '12' },
  responseBody: '{"users":[]}',
  durationMs: 10,
  requestSize: 0,
  responseSize: 12,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

const fetchLocal = (
  port: number,
  requestPath: string,
  method = 'GET',
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });

describe('ReplayServer', () => {
  let replayServer: ReplayServer;

  afterEach(async () => {
    await replayServer.stop();
  });

  it('녹화된 응답을 메서드+경로 매칭으로 재생한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    const result = await fetchLocal(port, '/users');

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"users":[]}');
  });

  it('applyDelay 옵션이면 durationMs만큼 지연한다 (#17)', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord({ durationMs: 300 })], 0, { applyDelay: true });

    const started = Date.now();
    await fetchLocal(port, '/users');
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it('같은 경로의 다른 메서드는 각각 매칭된다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start(
      [
        sampleRecord({ id: 1, method: 'GET', responseBody: '{"action":"list"}' }),
        sampleRecord({ id: 2, method: 'POST', statusCode: 201, responseBody: '{"action":"create"}' }),
      ],
      0,
    );

    const getResult = await fetchLocal(port, '/users', 'GET');
    const postResult = await fetchLocal(port, '/users', 'POST');

    expect(getResult.body).toBe('{"action":"list"}');
    expect(postResult.status).toBe(201);
    expect(postResult.body).toBe('{"action":"create"}');
  });

  it('매칭되는 기록이 없으면 404와 안내 메시지를 반환한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    const result = await fetchLocal(port, '/unknown-path');

    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      error: '녹화된 응답이 없습니다',
      method: 'GET',
      path: '/unknown-path',
    });
  });

  it('히트/미스 카운트를 집계한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    await fetchLocal(port, '/users');
    await fetchLocal(port, '/users');
    await fetchLocal(port, '/missing');

    const status = replayServer.getStatus();
    expect(status.hitCount).toBe(2);
    expect(status.missCount).toBe(1);
  });

  it('쿼리 스트링이 다른 요청도 경로가 같으면 매칭한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord({ path: '/users?page=1' })], 0);

    const result = await fetchLocal(port, '/users?page=2');

    expect(result.status).toBe(200);
  });
});
