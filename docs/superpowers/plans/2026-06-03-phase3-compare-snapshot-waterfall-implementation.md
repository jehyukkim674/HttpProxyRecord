# Phase 3 Implementation Plan: 세션 비교 / 스냅샷 / 워터폴

> **For agentic workers:** TDD. 순수함수 우선. 각 Task는 실패 테스트 → 구현 → 통과 → 커밋.

**Goal:** 두 세션 응답 비교(#25), 골든 응답 스냅샷 재전송 검증(#26), 요청 타임라인 워터폴(#27).

**Spec:** `docs/superpowers/specs/2026-06-03-phase3-compare-snapshot-waterfall-design.md`

**작업 디렉터리:** `~/Dev/HttpProxyRecord` (main 브랜치)

---

## Task 1: diffLines + compareResponses (shared)

**Files:** Modify `src/shared/types.ts`, Create `src/shared/diff.ts`, Test `tests/diff.test.ts`

- [ ] **Step 1:** `src/shared/types.ts`에 타입 추가 (파일 끝)

```typescript
export type LineDiff = { type: 'same' | 'added' | 'removed'; text: string };

export type ResponseComparison = {
  statusChanged: boolean;
  statusA: number;
  statusB: number;
  bodyDiff: LineDiff[];
};
```

- [ ] **Step 2:** 테스트 `tests/diff.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { compareResponses, diffLines } from '../src/shared/diff';

describe('diffLines', () => {
  it('동일하면 모두 same', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
  });
  it('추가된 라인을 added로', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
  });
  it('삭제된 라인을 removed로', () => {
    expect(diffLines('a\nb', 'a')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
    ]);
  });
  it('변경을 removed+added로', () => {
    const d = diffLines('x', 'y');
    expect(d).toContainEqual({ type: 'removed', text: 'x' });
    expect(d).toContainEqual({ type: 'added', text: 'y' });
  });
});

describe('compareResponses', () => {
  it('상태/본문 동일이면 변경 없음', () => {
    const c = compareResponses({ statusCode: 200, body: 'ok' }, { statusCode: 200, body: 'ok' });
    expect(c.statusChanged).toBe(false);
    expect(c.bodyDiff.every((d) => d.type === 'same')).toBe(true);
  });
  it('상태 변경 감지', () => {
    const c = compareResponses({ statusCode: 200, body: 'x' }, { statusCode: 500, body: 'x' });
    expect(c.statusChanged).toBe(true);
    expect(c.statusA).toBe(200);
    expect(c.statusB).toBe(500);
  });
  it('본문 차이 감지', () => {
    const c = compareResponses({ statusCode: 200, body: 'a\nb' }, { statusCode: 200, body: 'a\nc' });
    expect(c.bodyDiff.some((d) => d.type === 'removed' && d.text === 'b')).toBe(true);
    expect(c.bodyDiff.some((d) => d.type === 'added' && d.text === 'c')).toBe(true);
  });
});
```

- [ ] **Step 3:** 실패 확인

- [ ] **Step 4:** 구현 `src/shared/diff.ts`

```typescript
import type { LineDiff, ResponseComparison } from './types';

/** LCS 기반 라인 단위 diff. */
export const diffLines = (a: string, b: string): LineDiff[] => {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length;
  const n = bLines.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        aLines[i] === bLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: LineDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: 'same', text: aLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', text: aLines[i] });
      i += 1;
    } else {
      result.push({ type: 'added', text: bLines[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: aLines[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: 'added', text: bLines[j] });
    j += 1;
  }
  return result;
};

/** 두 응답(상태코드+본문) 비교. #25 세션비교·#26 스냅샷 공통. */
export const compareResponses = (
  a: { statusCode: number; body: string },
  b: { statusCode: number; body: string },
): ResponseComparison => ({
  statusChanged: a.statusCode !== b.statusCode,
  statusA: a.statusCode,
  statusB: b.statusCode,
  bodyDiff: diffLines(a.body, b.body),
});
```

- [ ] **Step 5:** 통과 확인 → **Step 6:** 커밋
```bash
git add src/shared/types.ts src/shared/diff.ts tests/diff.test.ts
git commit -m "기능: LCS 라인 diff + 응답 비교 순수함수 추가 (#25 #26)"
```

---

## Task 2: 세션 비교 빌더 + 워터폴 계산 (shared)

**Files:** Modify `src/shared/types.ts`, Create `src/shared/sessionCompare.ts`, `src/shared/waterfall.ts`, Test `tests/sessionCompare.test.ts`, `tests/waterfall.test.ts`

- [ ] **Step 1:** `src/shared/types.ts`에 타입 추가

```typescript
export type SessionComparisonRow = {
  key: string;
  status: 'same' | 'changed' | 'onlyA' | 'onlyB';
  comparison: ResponseComparison | null;
};

export type WaterfallRow = {
  id: number;
  label: string;
  statusCode: number;
  leftMs: number;
  widthMs: number;
};
```

- [ ] **Step 2:** 테스트 `tests/sessionCompare.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { buildSessionComparison } from '../src/shared/sessionCompare';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1, sessionId: 1, timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET', url: 'https://api.example.com/users', host: 'api.example.com', path: '/users',
  requestHeaders: {}, requestBody: null, statusCode: 200, responseHeaders: {}, responseBody: 'ok',
  durationMs: 10, requestSize: 0, responseSize: 0, isHttps: true, clientIp: '127.0.0.1', ...over,
});

describe('buildSessionComparison', () => {
  it('동일 응답은 same', () => {
    const rows = buildSessionComparison([rec({ responseBody: 'x' })], [rec({ responseBody: 'x' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('same');
  });
  it('본문이 다르면 changed', () => {
    const rows = buildSessionComparison([rec({ responseBody: 'x' })], [rec({ responseBody: 'y' })]);
    expect(rows[0].status).toBe('changed');
    expect(rows[0].comparison).not.toBeNull();
  });
  it('상태코드가 다르면 changed', () => {
    const rows = buildSessionComparison([rec({ statusCode: 200 })], [rec({ statusCode: 500 })]);
    expect(rows[0].status).toBe('changed');
  });
  it('A에만 있으면 onlyA, B에만 있으면 onlyB', () => {
    const rows = buildSessionComparison(
      [rec({ path: '/a' })],
      [rec({ path: '/b' })],
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.status]));
    expect(byKey['GET /a']).toBe('onlyA');
    expect(byKey['GET /b']).toBe('onlyB');
  });
  it('쿼리스트링이 달라도 경로가 같으면 매칭', () => {
    const rows = buildSessionComparison([rec({ path: '/u?p=1' })], [rec({ path: '/u?p=2' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('same');
  });
});
```

- [ ] **Step 3:** 테스트 `tests/waterfall.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { computeWaterfallRows } from '../src/shared/waterfall';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1, sessionId: 1, timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET', url: 'https://x/a', host: 'x', path: '/a',
  requestHeaders: {}, requestBody: null, statusCode: 200, responseHeaders: {}, responseBody: null,
  durationMs: 100, requestSize: 0, responseSize: 0, isHttps: true, clientIp: '', ...over,
});

describe('computeWaterfallRows', () => {
  it('빈 배열은 빈 결과', () => {
    expect(computeWaterfallRows([])).toEqual([]);
  });
  it('최소 시작시각 기준 오프셋을 계산한다', () => {
    const rows = computeWaterfallRows([
      rec({ id: 1, timestamp: '2026-06-03T10:00:00.000Z', durationMs: 50 }),
      rec({ id: 2, timestamp: '2026-06-03T10:00:00.200Z', durationMs: 30 }),
    ]);
    expect(rows[0].leftMs).toBe(0);
    expect(rows[0].widthMs).toBe(50);
    expect(rows[1].leftMs).toBe(200);
    expect(rows[1].widthMs).toBe(30);
  });
  it('durationMs 0은 최소 1', () => {
    expect(computeWaterfallRows([rec({ durationMs: 0 })])[0].widthMs).toBe(1);
  });
  it('label은 METHOD path', () => {
    expect(computeWaterfallRows([rec({ method: 'POST', path: '/x' })])[0].label).toBe('POST /x');
  });
});
```

- [ ] **Step 4:** 실패 확인

- [ ] **Step 5:** 구현 `src/shared/sessionCompare.ts`

```typescript
import { compareResponses } from './diff';
import type { SessionComparisonRow, TrafficRecord } from './types';

const pathWithoutQuery = (path: string): string => path.split('?')[0];

const matchByMethodPath = (records: TrafficRecord[]): Map<string, TrafficRecord> => {
  const map = new Map<string, TrafficRecord>();
  for (const record of records) {
    const key = `${record.method} ${pathWithoutQuery(record.path)}`;
    if (!map.has(key)) map.set(key, record);
  }
  return map;
};

/** 두 세션을 METHOD+경로로 매칭해 same/changed/onlyA/onlyB 분류. */
export const buildSessionComparison = (
  rowsA: TrafficRecord[],
  rowsB: TrafficRecord[],
): SessionComparisonRow[] => {
  const mapA = matchByMethodPath(rowsA);
  const mapB = matchByMethodPath(rowsB);
  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();

  return keys.map((key) => {
    const a = mapA.get(key);
    const b = mapB.get(key);
    if (a && b) {
      const comparison = compareResponses(
        { statusCode: a.statusCode, body: a.responseBody ?? '' },
        { statusCode: b.statusCode, body: b.responseBody ?? '' },
      );
      const changed = comparison.statusChanged || comparison.bodyDiff.some((line) => line.type !== 'same');
      return { key, status: changed ? 'changed' : 'same', comparison };
    }
    return { key, status: a ? 'onlyA' : 'onlyB', comparison: null };
  });
};
```

- [ ] **Step 6:** 구현 `src/shared/waterfall.ts`

```typescript
import type { TrafficRecord, WaterfallRow } from './types';

/** 레코드를 시간축 막대(시작 오프셋/너비)로 변환. 순수 시각화 계산. */
export const computeWaterfallRows = (records: TrafficRecord[]): WaterfallRow[] => {
  if (records.length === 0) return [];
  const starts = records.map((record) => new Date(record.timestamp).getTime());
  const minStart = Math.min(...starts);

  return records.map((record) => ({
    id: record.id,
    label: `${record.method} ${record.path}`,
    statusCode: record.statusCode,
    leftMs: new Date(record.timestamp).getTime() - minStart,
    widthMs: Math.max(record.durationMs, 1),
  }));
};
```

- [ ] **Step 7:** 통과 확인 → **Step 8:** 커밋
```bash
git add src/shared/types.ts src/shared/sessionCompare.ts src/shared/waterfall.ts tests/sessionCompare.test.ts tests/waterfall.test.ts
git commit -m "기능: 세션 비교 빌더 + 워터폴 계산 순수함수 추가 (#25 #27)"
```

---

## Task 3: Snapshots 저장 + 검증 (Main)

**Files:** Modify `src/shared/types.ts`, `src/main/store/recordStore.ts`, Create `src/main/composer/snapshotVerifier.ts`, Test `tests/recordStore.test.ts`, `tests/snapshotVerifier.test.ts`

- [ ] **Step 1:** `src/shared/types.ts`에 타입 추가

```typescript
export type Snapshot = {
  id: number;
  method: string;
  path: string;
  url: string;
  statusCode: number;
  body: string;
  savedAt: string;
};

export type SnapshotVerifyResult = {
  snapshotId: number;
  passed: boolean;
  comparison: ResponseComparison;
};
```

- [ ] **Step 2:** `tests/recordStore.test.ts`에 스냅샷 테스트 추가 (기존 describe 안)

```typescript
  it('스냅샷을 저장하고 조회한다', () => {
    const snap = store.saveSnapshot({
      method: 'GET', path: '/users', url: 'https://api.example.com/users', statusCode: 200, body: '{"a":1}',
    });
    expect(snap.id).toBeGreaterThan(0);
    expect(snap.savedAt).not.toBe('');
    const list = store.listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://api.example.com/users');
  });

  it('스냅샷을 삭제한다', () => {
    const snap = store.saveSnapshot({ method: 'GET', path: '/x', url: 'http://x/x', statusCode: 200, body: '' });
    store.deleteSnapshot(snap.id);
    expect(store.listSnapshots()).toHaveLength(0);
  });

  it('id로 스냅샷을 조회한다', () => {
    const snap = store.saveSnapshot({ method: 'GET', path: '/x', url: 'http://x/x', statusCode: 200, body: 'b' });
    expect(store.getSnapshotById(snap.id)?.body).toBe('b');
    expect(store.getSnapshotById(9999)).toBeNull();
  });
```

- [ ] **Step 3:** 실패 확인 `npx vitest run tests/recordStore.test.ts`

- [ ] **Step 4:** `recordStore.ts` 구현
  - import에 `Snapshot` 추가: `import type { CapturedTraffic, Session, Snapshot, TrafficRecord } from '../../shared/types';`
  - `migrate()` exec에 테이블 추가:
```sql
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        body TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
```
  - 메서드 추가 (클래스 내부):
```typescript
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
    const rows = this.db.prepare('SELECT * FROM snapshots ORDER BY id DESC').all() as unknown as Array<{
      id: number; method: string; path: string; url: string; status_code: number; body: string; saved_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id, method: row.method, path: row.path, url: row.url,
      statusCode: row.status_code, body: row.body, savedAt: row.saved_at,
    }));
  }

  getSnapshotById(id: number): Snapshot | null {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
      | { id: number; method: string; path: string; url: string; status_code: number; body: string; saved_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id, method: row.method, path: row.path, url: row.url,
      statusCode: row.status_code, body: row.body, savedAt: row.saved_at,
    };
  }

  deleteSnapshot(id: number): void {
    this.db.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
  }
```

- [ ] **Step 5:** `tests/snapshotVerifier.test.ts` (로컬 서버 재전송)

```typescript
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
  id: 1, method: 'GET', path: '/v', url: `http://127.0.0.1:${port}/v`,
  statusCode: 200, body: '{"v":1}', savedAt: '2026-06-03T10:00:00.000Z', ...over,
});

describe('verifySnapshot', () => {
  it('응답이 같으면 passed', async () => {
    bodyToReturn = '{"v":1}'; statusToReturn = 200;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(true);
    expect(result.snapshotId).toBe(1);
  });
  it('본문이 다르면 실패 + diff', async () => {
    bodyToReturn = '{"v":2}'; statusToReturn = 200;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(false);
    expect(result.comparison.bodyDiff.some((d) => d.type !== 'same')).toBe(true);
  });
  it('상태코드가 다르면 실패', async () => {
    bodyToReturn = '{"v":1}'; statusToReturn = 500;
    const result = await verifySnapshot(snap());
    expect(result.passed).toBe(false);
    expect(result.comparison.statusChanged).toBe(true);
  });
});
```

- [ ] **Step 6:** 구현 `src/main/composer/snapshotVerifier.ts`

```typescript
import { compareResponses } from '../../shared/diff';
import { sendComposedRequest } from './requestSender';
import type { Snapshot, SnapshotVerifyResult } from '../../shared/types';

/** 스냅샷을 재전송해 현재 응답과 비교한다. */
export const verifySnapshot = async (snapshot: Snapshot): Promise<SnapshotVerifyResult> => {
  const live = await sendComposedRequest({
    method: snapshot.method,
    url: snapshot.url,
    headers: {},
    body: null,
  });
  const comparison = compareResponses(
    { statusCode: snapshot.statusCode, body: snapshot.body },
    { statusCode: live.statusCode, body: live.body },
  );
  const passed = !comparison.statusChanged && comparison.bodyDiff.every((line) => line.type === 'same');
  return { snapshotId: snapshot.id, passed, comparison };
};
```

- [ ] **Step 7:** 통과 확인 → **Step 8:** 커밋
```bash
git add src/shared/types.ts src/main/store/recordStore.ts src/main/composer/snapshotVerifier.ts tests/recordStore.test.ts tests/snapshotVerifier.test.ts
git commit -m "기능: 스냅샷 저장소 + 재전송 검증 추가 (#26)"
```

---

## Task 4: 스냅샷/세션 IPC 연결

**Files:** Modify `src/main/ipcHandlers.ts`, `src/preload/index.ts`, `src/renderer/src/services/ipc.ts`

- [ ] **Step 1:** `ipcHandlers.ts`
  - import: `import { verifySnapshot } from './composer/snapshotVerifier';`
  - import type에 `Snapshot` 추가
  - 핸들러 (composer 핸들러 아래):
```typescript
  // ── 스냅샷 (#26) ──
  ipcMain.handle('snapshot:save', (_event, record: TrafficRecord) =>
    context.recordStore.saveSnapshot({
      method: record.method,
      path: record.path,
      url: record.url,
      statusCode: record.statusCode,
      body: record.responseBody ?? '',
    }),
  );
  ipcMain.handle('snapshot:list', () => context.recordStore.listSnapshots());
  ipcMain.handle('snapshot:delete', (_event, id: number) => {
    context.recordStore.deleteSnapshot(id);
    return context.recordStore.listSnapshots();
  });
  ipcMain.handle('snapshot:verify', (_event, id: number) => {
    const snapshot = context.recordStore.getSnapshotById(id);
    if (!snapshot) throw new Error('스냅샷을 찾을 수 없어요.');
    return verifySnapshot(snapshot);
  });
```
  (import type 줄에 `TrafficRecord` 이미 있으면 그대로 사용)

- [ ] **Step 2:** `preload/index.ts` — import type에 `Snapshot, SnapshotVerifyResult` 추가, api에:
```typescript
  saveSnapshot: (record: TrafficRecord): Promise<Snapshot> => ipcRenderer.invoke('snapshot:save', record),
  listSnapshots: (): Promise<Snapshot[]> => ipcRenderer.invoke('snapshot:list'),
  deleteSnapshot: (id: number): Promise<Snapshot[]> => ipcRenderer.invoke('snapshot:delete', id),
  verifySnapshot: (id: number): Promise<SnapshotVerifyResult> => ipcRenderer.invoke('snapshot:verify', id),
```

- [ ] **Step 3:** `renderer/src/services/ipc.ts` — import type에 `Snapshot, SnapshotVerifyResult` 추가, 객체에:
```typescript
  saveSnapshot: (record: TrafficRecord): Promise<Snapshot> => window.api.saveSnapshot(record),
  listSnapshots: (): Promise<Snapshot[]> => window.api.listSnapshots(),
  deleteSnapshot: (id: number): Promise<Snapshot[]> => window.api.deleteSnapshot(id),
  verifySnapshot: (id: number): Promise<SnapshotVerifyResult> => window.api.verifySnapshot(id),
```

- [ ] **Step 4:** typecheck/build → 커밋
```bash
git add src/main/ipcHandlers.ts src/preload/index.ts src/renderer/src/services/ipc.ts
git commit -m "기능: 스냅샷 IPC 연결 (#26)"
```

---

## Task 5: 워터폴 뷰 + 탭 토글 (#27)

**Files:** Create `src/renderer/src/components/WaterfallView.tsx`, Modify `src/renderer/src/App.tsx`

- [ ] **Step 1:** `WaterfallView.tsx`

```typescript
import { useMemo } from 'react';
import { Empty } from 'antd';
import { computeWaterfallRows } from '../../../shared/waterfall';
import type { TrafficRecord } from '../../../shared/types';

const barColor = (statusCode: number): string => {
  if (statusCode >= 500) return '#ff4d4f';
  if (statusCode >= 400) return '#fa8c16';
  if (statusCode >= 300) return '#1677ff';
  return '#52c41a';
};

type WaterfallViewProps = { records: TrafficRecord[] };

export const WaterfallView = ({ records }: WaterfallViewProps) => {
  const rows = useMemo(() => computeWaterfallRows(records), [records]);
  const maxEnd = useMemo(() => Math.max(1, ...rows.map((r) => r.leftMs + r.widthMs)), [rows]);

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="표시할 트래픽이 없어요" />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ width: 260, flexShrink: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.label}
          </div>
          <div style={{ flex: 1, position: 'relative', height: 18, background: '#fafafa', borderRadius: 2 }}>
            <div
              title={`${row.leftMs}ms 시작 · ${row.widthMs}ms`}
              style={{
                position: 'absolute',
                left: `${(row.leftMs / maxEnd) * 100}%`,
                width: `${Math.max((row.widthMs / maxEnd) * 100, 0.5)}%`,
                height: '100%',
                background: barColor(row.statusCode),
                borderRadius: 2,
              }}
            />
          </div>
          <div style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: 12, color: '#999' }}>
            {row.widthMs}ms
          </div>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2:** `App.tsx` — 테이블/워터폴 탭 토글
  - import: `WaterfallView`, antd `Segmented`
  - 상태: `const [trafficView, setTrafficView] = useState<'table' | 'waterfall'>('table');`
  - 필터바 영역 위(또는 필터바 옆)에 Segmented 추가, 그리고 테이블 영역을 조건부 렌더:
    필터바 컴포넌트 아래의 `<div style={{ flex: 1, overflow: 'auto' }}>` 내부를:
```typescript
            <div style={{ flex: 1, overflow: 'auto' }}>
              {trafficView === 'table' ? (
                <TrafficTable
                  records={filtered}
                  selectedRecordId={selectedRecord?.id ?? null}
                  onSelect={setSelectedRecord}
                />
              ) : (
                <WaterfallView records={filtered} />
              )}
            </div>
```
  - `TrafficFilterBar` 위에 토글 배치:
```typescript
            <div style={{ padding: '8px 16px 0' }}>
              <Segmented
                size="small"
                value={trafficView}
                onChange={(value) => setTrafficView(value as 'table' | 'waterfall')}
                options={[
                  { label: '테이블', value: 'table' },
                  { label: '워터폴', value: 'waterfall' },
                ]}
              />
            </div>
```
  (import `Segmented`를 antd import에 추가)

- [ ] **Step 3:** typecheck/build/lint → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 워터폴 타임라인 뷰 + 테이블/워터폴 탭 추가 (#27)"
```

---

## Task 6: 세션 비교 모달 (#25)

**Files:** Create `src/renderer/src/components/DiffView.tsx`, `src/renderer/src/components/SessionCompareModal.tsx`, Modify `src/renderer/src/components/TopToolbar.tsx`, `src/renderer/src/App.tsx`

- [ ] **Step 1:** `DiffView.tsx` (라인 diff 렌더 — #25·#26 공용)

```typescript
import type { LineDiff } from '../../../shared/types';

const lineStyle = (type: LineDiff['type']): React.CSSProperties => ({
  background: type === 'added' ? '#f6ffed' : type === 'removed' ? '#fff1f0' : undefined,
  color: type === 'added' ? '#237804' : type === 'removed' ? '#a8071a' : '#333',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});

const prefix = (type: LineDiff['type']): string => (type === 'added' ? '+ ' : type === 'removed' ? '- ' : '  ');

type DiffViewProps = { diff: LineDiff[] };

export const DiffView = ({ diff }: DiffViewProps) => (
  <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 300, overflow: 'auto', margin: 0 }}>
    {diff.map((line, index) => (
      <div key={index} style={lineStyle(line.type)}>
        {prefix(line.type)}
        {line.text}
      </div>
    ))}
  </pre>
);
```

- [ ] **Step 2:** `SessionCompareModal.tsx`

```typescript
import { useEffect, useMemo, useState } from 'react';
import { Modal, Select, Space, Table, Tag } from 'antd';
import { buildSessionComparison } from '../../../shared/sessionCompare';
import { ipc } from '../services/ipc';
import { DiffView } from './DiffView';
import type { Session, SessionComparisonRow, TrafficRecord } from '../../../shared/types';

const STATUS_TAG: Record<SessionComparisonRow['status'], { color: string; label: string }> = {
  same: { color: 'default', label: '동일' },
  changed: { color: 'red', label: '변경' },
  onlyA: { color: 'blue', label: 'A만' },
  onlyB: { color: 'orange', label: 'B만' },
};

type SessionCompareModalProps = {
  open: boolean;
  sessions: Session[];
  onClose: () => void;
};

export const SessionCompareModal = ({ open, sessions, onClose }: SessionCompareModalProps) => {
  const [idA, setIdA] = useState<number | null>(null);
  const [idB, setIdB] = useState<number | null>(null);
  const [rowsA, setRowsA] = useState<TrafficRecord[]>([]);
  const [rowsB, setRowsB] = useState<TrafficRecord[]>([]);

  useEffect(() => {
    if (idA === null) return;
    void ipc.getSessionTraffic(idA).then(setRowsA);
  }, [idA]);
  useEffect(() => {
    if (idB === null) return;
    void ipc.getSessionTraffic(idB).then(setRowsB);
  }, [idB]);

  const comparison = useMemo(() => buildSessionComparison(rowsA, rowsB), [rowsA, rowsB]);

  const options = sessions.map((session) => ({ value: session.id, label: `${session.name} (${session.recordCount}건)` }));

  return (
    <Modal title="세션 비교" open={open} onCancel={onClose} width={860} footer={null}>
      <Space style={{ marginBottom: 12 }}>
        <Select placeholder="세션 A" options={options} value={idA ?? undefined} onChange={setIdA} style={{ width: 300 }} />
        <Select placeholder="세션 B" options={options} value={idB ?? undefined} onChange={setIdB} style={{ width: 300 }} />
      </Space>
      {idA !== null && idB !== null && (
        <Table<SessionComparisonRow>
          rowKey="key"
          size="small"
          dataSource={comparison}
          pagination={false}
          scroll={{ y: 400 }}
          expandable={{
            rowExpandable: (row) => row.status === 'changed',
            expandedRowRender: (row) => (row.comparison ? <DiffView diff={row.comparison.bodyDiff} /> : null),
          }}
          columns={[
            { title: '요청', dataIndex: 'key' },
            {
              title: '상태',
              dataIndex: 'status',
              width: 100,
              render: (status: SessionComparisonRow['status']) => (
                <Tag color={STATUS_TAG[status].color}>{STATUS_TAG[status].label}</Tag>
              ),
            },
            {
              title: '상태코드',
              width: 120,
              render: (_, row) =>
                row.comparison
                  ? row.comparison.statusChanged
                    ? `${row.comparison.statusA} → ${row.comparison.statusB}`
                    : row.comparison.statusA
                  : '-',
            },
          ]}
        />
      )}
    </Modal>
  );
};
```

- [ ] **Step 3:** `TopToolbar.tsx` — "세션 비교" 버튼
  - props에 `onOpenCompare: () => void`
  - import에 `DiffOutlined`
  - 설정 버튼 옆:
```typescript
        <Button icon={<DiffOutlined />} onClick={onOpenCompare}>
          세션 비교
        </Button>
```

- [ ] **Step 4:** `App.tsx`
  - import `SessionCompareModal`
  - 상태: `const [compareOpen, setCompareOpen] = useState(false);`
  - TopToolbar에 `onOpenCompare={() => setCompareOpen(true)}`
  - 모달 추가: `<SessionCompareModal open={compareOpen} sessions={sessions} onClose={() => setCompareOpen(false)} />`

- [ ] **Step 5:** typecheck/build/lint → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 세션 비교 모달 + 라인 diff 뷰 추가 (#25)"
```

---

## Task 7: 스냅샷 UI (저장 버튼 + Drawer 검증) (#26)

**Files:** Create `src/renderer/src/components/SnapshotsDrawer.tsx`, Modify `src/renderer/src/components/TrafficDetail.tsx`, `src/renderer/src/components/TopToolbar.tsx`, `src/renderer/src/App.tsx`

- [ ] **Step 1:** `TrafficDetail.tsx` — "스냅샷 저장" 버튼
  - props에 `onSaveSnapshot: (record: TrafficRecord) => void`
  - import에 `CameraOutlined`
  - 재전송 버튼 옆(같은 Space):
```typescript
        <Button size="small" icon={<CameraOutlined />} onClick={() => onSaveSnapshot(record)}>
          스냅샷 저장
        </Button>
```

- [ ] **Step 2:** `SnapshotsDrawer.tsx`

```typescript
import { useEffect, useState } from 'react';
import { Button, Drawer, List, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';
import { DiffView } from './DiffView';
import type { Snapshot, SnapshotVerifyResult } from '../../../shared/types';

type SnapshotsDrawerProps = { open: boolean; onClose: () => void };

export const SnapshotsDrawer = ({ open, onClose }: SnapshotsDrawerProps) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [results, setResults] = useState<Record<number, SnapshotVerifyResult>>({});
  const [verifying, setVerifying] = useState<number | null>(null);

  useEffect(() => {
    if (open) void ipc.listSnapshots().then(setSnapshots);
  }, [open]);

  const verify = async (id: number) => {
    setVerifying(id);
    try {
      const result = await ipc.verifySnapshot(id);
      setResults((previous) => ({ ...previous, [id]: result }));
      if (result.passed) void message.success('스냅샷 검증 통과');
      else void message.warning('스냅샷과 응답이 달라요');
    } catch (caught) {
      void message.error(caught instanceof Error ? caught.message : '검증 실패');
    } finally {
      setVerifying(null);
    }
  };

  const remove = async (id: number) => {
    setSnapshots(await ipc.deleteSnapshot(id));
  };

  return (
    <Drawer title="스냅샷" open={open} onClose={onClose} width={520}>
      <List
        dataSource={snapshots}
        locale={{ emptyText: '저장된 스냅샷이 없어요' }}
        renderItem={(snapshot) => {
          const result = results[snapshot.id];
          return (
            <List.Item
              actions={[
                <Button key="verify" size="small" loading={verifying === snapshot.id} onClick={() => void verify(snapshot.id)}>
                  검증
                </Button>,
                <Button key="del" size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => void remove(snapshot.id)} />,
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {snapshot.method} {snapshot.path}{' '}
                    {result &&
                      (result.passed ? (
                        <Tag icon={<CheckCircleOutlined />} color="success">통과</Tag>
                      ) : (
                        <Tag icon={<CloseCircleOutlined />} color="error">실패</Tag>
                      ))}
                  </span>
                }
                description={
                  <>
                    <Typography.Text type="secondary">{new Date(snapshot.savedAt).toLocaleString('ko-KR')}</Typography.Text>
                    {result && !result.passed && (
                      <div style={{ marginTop: 8 }}>
                        {result.comparison.statusChanged && (
                          <Tag color="red">{result.comparison.statusA} → {result.comparison.statusB}</Tag>
                        )}
                        <DiffView diff={result.comparison.bodyDiff} />
                      </div>
                    )}
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
    </Drawer>
  );
};
```

- [ ] **Step 3:** `TopToolbar.tsx` — "스냅샷" 버튼
  - props에 `onOpenSnapshots: () => void`
  - import에 `CameraOutlined`
  - 세션 비교 버튼 옆:
```typescript
        <Button icon={<CameraOutlined />} onClick={onOpenSnapshots}>
          스냅샷
        </Button>
```

- [ ] **Step 4:** `App.tsx`
  - import `SnapshotsDrawer`
  - 상태: `const [snapshotsOpen, setSnapshotsOpen] = useState(false);`
  - 핸들러:
```typescript
  const handleSaveSnapshot = useCallback(
    async (record: TrafficRecord) => {
      await ipc.saveSnapshot(record);
      void messageApi.success('스냅샷을 저장했어요');
    },
    [messageApi],
  );
```
  - TrafficDetail에 `onSaveSnapshot={(record) => void handleSaveSnapshot(record)}`
  - TopToolbar에 `onOpenSnapshots={() => setSnapshotsOpen(true)}`
  - 모달/Drawer 추가: `<SnapshotsDrawer open={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} />`

- [ ] **Step 5:** typecheck/build/lint/format → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 스냅샷 저장 버튼 + 스냅샷 Drawer(재전송 검증) 추가 (#26)"
```

---

## Task 8: 통합 검증 + E2E

- [ ] **Step 1:** 전체 게이트 `npm run test && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 2:** E2E (CDP): 워터폴 탭 전환 확인 / 세션 비교 모달에서 2개 세션 선택→변경 행 확인 / 스냅샷 저장→검증(IPC verifySnapshot로 pass·fail 둘 다)
- [ ] **Step 3:** 완료 노트 커밋

## Self-Review 체크리스트
- [x] 스펙 커버리지: #25(Task 2,6), #26(Task 3,4,7), #27(Task 2,5)
- [x] 타입 일관성: LineDiff/ResponseComparison/SessionComparisonRow/WaterfallRow/Snapshot/SnapshotVerifyResult shared 단일 정의. compareResponses 입력 {statusCode,body}로 통일
- [x] 순수함수 TDD: diffLines/compareResponses/buildSessionComparison/computeWaterfallRows/verifySnapshot
- [x] 재사용: snapshotVerifier가 Phase2 RequestSender + diff 재사용, DiffView가 #25·#26 공용
