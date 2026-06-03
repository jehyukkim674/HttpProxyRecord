import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifySnapshot } from '../src/main/composer/snapshotVerifier';
import type { Snapshot } from '../src/shared/types';

let server: http.Server;
let port: number;
let bodyToReturn = '{"v":1}';
let statusToReturn = 200;

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(statusToReturn, { 'content-type': 'application/json' });
      res.end(bodyToReturn);
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});
afterEach(() => server.close());

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  id: 1,
  method: 'GET',
  path: '/v',
  url: `http://127.0.0.1:${port}/v`,
  statusCode: 200,
  body: '{"v":1}',
  savedAt: '2026-06-03T10:00:00.000Z',
  ...over,
});

describe('verifySnapshot', () => {
  it('응답이 같으면 passed', async () => {
    bodyToReturn = '{"v":1}';
    statusToReturn = 200;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(true);
    expect(result.snapshotId).toBe(1);
  });
  it('본문이 다르면 실패 + diff', async () => {
    bodyToReturn = '{"v":2}';
    statusToReturn = 200;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(false);
    expect(result.comparison.bodyDiff.some((d) => d.type !== 'same')).toBe(true);
  });
  it('상태코드가 다르면 실패', async () => {
    bodyToReturn = '{"v":1}';
    statusToReturn = 500;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(false);
    expect(result.comparison.statusChanged).toBe(true);
  });
});
