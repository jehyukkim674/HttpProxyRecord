import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../src/main/store/recordStore';
import type { CapturedTraffic } from '../src/shared/types';

const sampleTraffic = (overrides: Partial<CapturedTraffic> = {}): CapturedTraffic => ({
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users?page=1',
  host: 'api.example.com',
  path: '/users?page=1',
  requestHeaders: { host: 'api.example.com', accept: 'application/json' },
  requestBody: null,
  statusCode: 200,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"users":[]}',
  durationMs: 42,
  requestSize: 120,
  responseSize: 13,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

describe('RecordStore', () => {
  let tempDir: string;
  let store: RecordStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-store-test-'));
    store = new RecordStore(path.join(tempDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('세션을 생성하고 목록을 조회한다', () => {
    const session = store.createSession('테스트 세션');

    expect(session.id).toBeGreaterThan(0);
    expect(session.name).toBe('테스트 세션');
    expect(session.endedAt).toBeNull();
    expect(session.recordCount).toBe(0);

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
  });

  it('세션을 종료하면 endedAt이 기록된다', () => {
    const session = store.createSession('세션');

    store.endSession(session.id);

    const sessions = store.listSessions();
    expect(sessions[0].endedAt).not.toBeNull();
  });

  it('트래픽을 저장하고 세션별로 조회한다', () => {
    const session = store.createSession('세션');

    const record = store.insertTraffic(session.id, sampleTraffic());

    expect(record.id).toBeGreaterThan(0);
    expect(record.sessionId).toBe(session.id);
    expect(record.requestHeaders).toEqual({ host: 'api.example.com', accept: 'application/json' });

    const records = store.listTraffic(session.id);
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe('https://api.example.com/users?page=1');
    expect(records[0].responseBody).toBe('{"users":[]}');
    expect(records[0].isHttps).toBe(true);
  });

  it('세션 목록의 recordCount는 저장된 트래픽 수를 반영한다', () => {
    const session = store.createSession('세션');
    store.insertTraffic(session.id, sampleTraffic());
    store.insertTraffic(session.id, sampleTraffic({ method: 'POST', statusCode: 201 }));

    const sessions = store.listSessions();
    expect(sessions[0].recordCount).toBe(2);
  });

  it('세션을 삭제하면 트래픽도 함께 삭제된다', () => {
    const session = store.createSession('세션');
    store.insertTraffic(session.id, sampleTraffic());

    store.deleteSession(session.id);

    expect(store.listSessions()).toHaveLength(0);
    expect(store.listTraffic(session.id)).toHaveLength(0);
  });

  it('id로 단일 트래픽을 조회한다', () => {
    const session = store.createSession('세션');
    const inserted = store.insertTraffic(session.id, sampleTraffic());

    const found = store.getTrafficById(inserted.id);

    expect(found).not.toBeNull();
    expect(found!.url).toBe('https://api.example.com/users?page=1');
    expect(store.getTrafficById(99999)).toBeNull();
  });

  it('10MB를 초과하는 바디는 잘라서 저장한다', () => {
    const session = store.createSession('세션');
    const bigBody = 'x'.repeat(11 * 1024 * 1024);

    store.insertTraffic(session.id, sampleTraffic({ responseBody: bigBody }));

    const stored = store.listTraffic(session.id)[0];
    expect(stored.responseBody!.length).toBe(10 * 1024 * 1024);
  });

  it('설정을 저장하고 조회한다', () => {
    store.setSetting('excludeDomains', JSON.stringify(['*.ga.com']));
    expect(store.getSetting('excludeDomains')).toBe('["*.ga.com"]');
  });

  it('없는 설정은 null을 반환한다', () => {
    expect(store.getSetting('missing')).toBeNull();
  });

  it('설정을 덮어쓴다', () => {
    store.setSetting('k', 'a');
    store.setSetting('k', 'b');
    expect(store.getSetting('k')).toBe('b');
  });

  it('스냅샷을 저장하고 조회한다', () => {
    const snap = store.saveSnapshot({
      method: 'GET',
      path: '/users',
      url: 'https://api.example.com/users',
      statusCode: 200,
      body: '{"a":1}',
    });
    expect(snap.id).toBeGreaterThan(0);
    expect(snap.savedAt).not.toBe('');
    const list = store.listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://api.example.com/users');
  });

  it('스냅샷을 삭제한다', () => {
    const snap = store.saveSnapshot({
      method: 'GET',
      path: '/x',
      url: 'http://x/x',
      statusCode: 200,
      body: '',
    });
    store.deleteSnapshot(snap.id);
    expect(store.listSnapshots()).toHaveLength(0);
  });

  it('id로 스냅샷을 조회한다', () => {
    const snap = store.saveSnapshot({
      method: 'GET',
      path: '/x',
      url: 'http://x/x',
      statusCode: 200,
      body: 'b',
    });
    expect(store.getSnapshotById(snap.id)?.body).toBe('b');
    expect(store.getSnapshotById(9999)).toBeNull();
  });

  it('즐겨찾기: 저장·목록·메모수정·삭제 라운드트립', () => {
    const fav = store.saveFavorite({ method: 'POST', url: 'https://h/login', note: '로그인' });
    expect(fav.id).toBeGreaterThan(0);

    expect(store.listFavorites()).toHaveLength(1);

    store.updateFavoriteNote(fav.id, '수정된 메모');
    expect(store.listFavorites()[0].note).toBe('수정된 메모');

    store.deleteFavorite(fav.id);
    expect(store.listFavorites()).toEqual([]);
  });
});
