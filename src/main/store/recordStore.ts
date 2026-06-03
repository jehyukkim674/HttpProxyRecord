import { DatabaseSync } from 'node:sqlite';
import type {
  CapturedTraffic,
  Favorite,
  Guide,
  GuideStep,
  GuideSummary,
  Session,
  Snapshot,
  TrafficRecord,
} from '../../shared/types';

type GuideRow = { id: number; title: string; data: string; created_at: string };

type FavoriteRow = { id: number; method: string; url: string; note: string; created_at: string };

type SnapshotRow = {
  id: number;
  method: string;
  path: string;
  url: string;
  status_code: number;
  body: string;
  saved_at: string;
};

const MAX_BODY_BYTES = 10 * 1024 * 1024;

type SessionRow = {
  id: number;
  name: string;
  created_at: string;
  ended_at: string | null;
  record_count: number;
};

type TrafficRow = {
  id: number;
  session_id: number;
  timestamp: string;
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers: string;
  request_body: string | null;
  status_code: number;
  response_headers: string;
  response_body: string | null;
  duration_ms: number;
  request_size: number;
  response_size: number;
  is_https: number;
  client_ip: string;
};

/**
 * 세션/트래픽 영속 저장소.
 * Node 내장 node:sqlite(DatabaseSync) 사용 — 네이티브 모듈 빌드 불필요.
 */
export class RecordStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS traffic_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        path TEXT NOT NULL,
        request_headers TEXT NOT NULL,
        request_body TEXT,
        status_code INTEGER NOT NULL,
        response_headers TEXT NOT NULL,
        response_body TEXT,
        duration_ms INTEGER NOT NULL,
        request_size INTEGER NOT NULL,
        response_size INTEGER NOT NULL,
        is_https INTEGER NOT NULL,
        client_ip TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_traffic_session ON traffic_records(session_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        body TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS guides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  // ─────────────────────────── 캡처 가이드 ───────────────────────────

  private toGuide(row: GuideRow): Guide {
    const parsed = JSON.parse(row.data) as { steps?: GuideStep[] };
    return { id: row.id, title: row.title, steps: parsed.steps ?? [], createdAt: row.created_at };
  }

  saveGuide(input: { id?: number; title: string; steps: GuideStep[] }): Guide {
    const data = JSON.stringify({ steps: input.steps });
    if (input.id) {
      this.db.prepare('UPDATE guides SET title = ?, data = ? WHERE id = ?').run(input.title, data, input.id);
      const row = this.db.prepare('SELECT * FROM guides WHERE id = ?').get(input.id) as GuideRow;
      return this.toGuide(row);
    }
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO guides (title, data, created_at) VALUES (?, ?, ?)')
      .run(input.title, data, createdAt);
    return { id: Number(result.lastInsertRowid), title: input.title, steps: input.steps, createdAt };
  }

  listGuides(): GuideSummary[] {
    const rows = this.db
      .prepare('SELECT id, title, data, created_at FROM guides ORDER BY id DESC')
      .all() as unknown as GuideRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      stepCount: (JSON.parse(row.data) as { steps?: unknown[] }).steps?.length ?? 0,
    }));
  }

  getGuide(id: number): Guide | null {
    const row = this.db.prepare('SELECT * FROM guides WHERE id = ?').get(id) as GuideRow | undefined;
    return row ? this.toGuide(row) : null;
  }

  deleteGuide(id: number): void {
    this.db.prepare('DELETE FROM guides WHERE id = ?').run(id);
  }

  saveFavorite(input: { method: string; url: string; note: string }): Favorite {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO favorites (method, url, note, created_at) VALUES (?, ?, ?, ?)')
      .run(input.method, input.url, input.note, createdAt);
    return { ...input, id: Number(result.lastInsertRowid), createdAt };
  }

  listFavorites(): Favorite[] {
    const rows = this.db
      .prepare('SELECT * FROM favorites ORDER BY id DESC')
      .all() as unknown as FavoriteRow[];
    return rows.map((row) => ({
      id: row.id,
      method: row.method,
      url: row.url,
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  updateFavoriteNote(id: number, note: string): void {
    this.db.prepare('UPDATE favorites SET note = ? WHERE id = ?').run(note, id);
  }

  deleteFavorite(id: number): void {
    this.db.prepare('DELETE FROM favorites WHERE id = ?').run(id);
  }

  private toSnapshot(row: SnapshotRow): Snapshot {
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      url: row.url,
      statusCode: row.status_code,
      body: row.body,
      savedAt: row.saved_at,
    };
  }

  saveSnapshot(input: Omit<Snapshot, 'id' | 'savedAt'>): Snapshot {
    const savedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        'INSERT INTO snapshots (method, path, url, status_code, body, saved_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(input.method, input.path, input.url, input.statusCode, input.body, savedAt);
    return { ...input, id: Number(result.lastInsertRowid), savedAt };
  }

  listSnapshots(): Snapshot[] {
    const rows = this.db
      .prepare('SELECT * FROM snapshots ORDER BY id DESC')
      .all() as unknown as SnapshotRow[];
    return rows.map((row) => this.toSnapshot(row));
  }

  getSnapshotById(id: number): Snapshot | null {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;
    return row ? this.toSnapshot(row) : null;
  }

  deleteSnapshot(id: number): void {
    this.db.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  createSession(name: string): Session {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO sessions (name, created_at) VALUES (?, ?)')
      .run(name, createdAt);

    return {
      id: Number(result.lastInsertRowid),
      name,
      createdAt,
      endedAt: null,
      recordCount: 0,
    };
  }

  listSessions(): Session[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM traffic_records t WHERE t.session_id = s.id) AS record_count
         FROM sessions s ORDER BY s.id DESC`,
      )
      .all() as unknown as SessionRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      endedAt: row.ended_at,
      recordCount: row.record_count,
    }));
  }

  endSession(id: number): void {
    this.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  deleteSession(id: number): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  insertTraffic(sessionId: number, traffic: CapturedTraffic): TrafficRecord {
    const truncatedRequestBody = this.truncateBody(traffic.requestBody);
    const truncatedResponseBody = this.truncateBody(traffic.responseBody);

    const result = this.db
      .prepare(
        `INSERT INTO traffic_records (
          session_id, timestamp, method, url, host, path,
          request_headers, request_body, status_code, response_headers, response_body,
          duration_ms, request_size, response_size, is_https, client_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        traffic.timestamp,
        traffic.method,
        traffic.url,
        traffic.host,
        traffic.path,
        JSON.stringify(traffic.requestHeaders),
        truncatedRequestBody,
        traffic.statusCode,
        JSON.stringify(traffic.responseHeaders),
        truncatedResponseBody,
        traffic.durationMs,
        traffic.requestSize,
        traffic.responseSize,
        traffic.isHttps ? 1 : 0,
        traffic.clientIp,
      );

    return {
      ...traffic,
      requestBody: truncatedRequestBody,
      responseBody: truncatedResponseBody,
      id: Number(result.lastInsertRowid),
      sessionId,
    };
  }

  listTraffic(sessionId: number): TrafficRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM traffic_records WHERE session_id = ? ORDER BY id ASC')
      .all(sessionId) as unknown as TrafficRow[];

    return rows.map((row) => this.toTrafficRecord(row));
  }

  getTrafficById(recordId: number): TrafficRecord | null {
    const row = this.db.prepare('SELECT * FROM traffic_records WHERE id = ?').get(recordId) as
      | TrafficRow
      | undefined;
    if (!row) return null;

    return this.toTrafficRecord(row);
  }

  private truncateBody(body: string | null): string | null {
    if (body !== null && body.length > MAX_BODY_BYTES) {
      return body.slice(0, MAX_BODY_BYTES);
    }
    return body;
  }

  private toTrafficRecord(row: TrafficRow): TrafficRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      method: row.method,
      url: row.url,
      host: row.host,
      path: row.path,
      requestHeaders: JSON.parse(row.request_headers) as Record<string, string>,
      requestBody: row.request_body,
      statusCode: row.status_code,
      responseHeaders: JSON.parse(row.response_headers) as Record<string, string>,
      responseBody: row.response_body,
      durationMs: row.duration_ms,
      requestSize: row.request_size,
      responseSize: row.response_size,
      isHttps: row.is_https === 1,
      clientIp: row.client_ip,
    };
  }
}
