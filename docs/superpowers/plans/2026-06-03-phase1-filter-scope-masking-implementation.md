# Phase 1 Implementation Plan: 필터+검색 / 캡처 범위 필터 / 민감정보 마스킹

> **For agentic workers:** TDD. 각 Task는 실패 테스트 → 구현 → 통과 → 커밋. 순수함수 우선.

**Goal:** 트래픽 필터+검색(클라이언트), 제외 도메인 캡처 차단, 내보내기 시 민감 헤더 마스킹 추가.

**Spec:** `docs/superpowers/specs/2026-06-03-phase1-filter-scope-masking-design.md`

**작업 디렉터리:** `~/Dev/HttpProxyRecord` (main 브랜치)

---

## Task 1: maskSensitiveHeaders (내보내기 마스킹)

**Files:** Modify `src/main/export/exporter.ts`, Test `tests/exporter.test.ts`

- [ ] **Step 1:** `tests/exporter.test.ts`에 테스트 추가

```typescript
import { maskSensitiveHeaders } from '../src/main/export/exporter';

describe('maskSensitiveHeaders', () => {
  it('민감 헤더 값을 REDACTED로 치환한다 (대소문자 무시)', () => {
    const masked = maskSensitiveHeaders({
      Authorization: 'Bearer secret',
      Cookie: 'session=abc',
      'Content-Type': 'application/json',
    });
    expect(masked.Authorization).toBe('***REDACTED***');
    expect(masked.Cookie).toBe('***REDACTED***');
    expect(masked['Content-Type']).toBe('application/json');
  });

  it('set-cookie / x-api-key / x-auth-token / x-csrf-token / proxy-authorization 도 마스킹', () => {
    const masked = maskSensitiveHeaders({
      'set-cookie': 'a=1',
      'x-api-key': 'k',
      'x-auth-token': 't',
      'x-csrf-token': 'c',
      'proxy-authorization': 'p',
    });
    expect(Object.values(masked).every((v) => v === '***REDACTED***')).toBe(true);
  });
});
```

기존 HAR/curl/MD 테스트에 마스킹 회귀 검증 추가:

```typescript
  it('toHar 는 민감 헤더를 마스킹한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: { entries: Array<{ request: { headers: Array<{ name: string; value: string }> } }> };
    };
    const authHeader = har.log.entries[0].request.headers.find((h) => h.name.toLowerCase() === 'authorization');
    expect(authHeader?.value).toBe('***REDACTED***');
  });

  it('toCurl 은 민감 헤더를 마스킹한다', () => {
    const curl = toCurl(sampleRecord());
    expect(curl).toContain("-H 'authorization: ***REDACTED***'");
    expect(curl).not.toContain('Bearer token123');
  });
```

- [ ] **Step 2:** 실패 확인 `npx vitest run tests/exporter.test.ts`

- [ ] **Step 3:** `exporter.ts` 구현

```typescript
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
]);

const REDACTED = '***REDACTED***';

/** 민감 헤더 값을 마스킹한다 (내보내기 전용). 대소문자 무시. */
export const maskSensitiveHeaders = (headers: Record<string, string>): Record<string, string> => {
  const masked: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    masked[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? REDACTED : value;
  }
  return masked;
};
```

`toHarHeaders`가 받기 전, `toHar`/`toCurl`/`toMarkdown`에서 헤더를 쓰는 지점을 `maskSensitiveHeaders(record.requestHeaders)` / `maskSensitiveHeaders(record.responseHeaders)`로 감싼다.
- `toHar`: `headers: toHarHeaders(maskSensitiveHeaders(record.requestHeaders))` (요청/응답 모두)
- `toCurl`: 헤더 루프를 `Object.entries(maskSensitiveHeaders(record.requestHeaders))`로
- `toMarkdown`: 요청/응답 헤더 루프 둘 다 `maskSensitiveHeaders(...)`로

- [ ] **Step 4:** 통과 확인 → **Step 5:** 커밋
```bash
git add src/main/export/exporter.ts tests/exporter.test.ts
git commit -m "기능: 내보내기 시 민감 헤더 마스킹 추가 (#11)"
```

---

## Task 2: matchExcludeDomain (glob 매칭 순수함수)

**Files:** Create `src/main/proxy/excludeFilter.ts`, Test `tests/excludeFilter.test.ts`

- [ ] **Step 1:** 테스트

```typescript
import { describe, expect, it } from 'vitest';
import { matchExcludeDomain } from '../src/main/proxy/excludeFilter';

describe('matchExcludeDomain', () => {
  it('정확히 일치하는 도메인을 매칭한다', () => {
    expect(matchExcludeDomain('api.example.com', ['api.example.com'])).toBe(true);
    expect(matchExcludeDomain('api.example.com', ['other.com'])).toBe(false);
  });

  it('와일드카드 패턴을 매칭한다', () => {
    expect(matchExcludeDomain('www.google-analytics.com', ['*.google-analytics.com'])).toBe(true);
    expect(matchExcludeDomain('google-analytics.com', ['*.google-analytics.com'])).toBe(false);
  });

  it('host에 포트가 붙어도 매칭한다', () => {
    expect(matchExcludeDomain('api.example.com:443', ['api.example.com'])).toBe(true);
  });

  it('패턴이 없으면 항상 false', () => {
    expect(matchExcludeDomain('api.example.com', [])).toBe(false);
  });

  it('공백 패턴은 무시한다', () => {
    expect(matchExcludeDomain('api.example.com', ['  ', ''])).toBe(false);
  });
});
```

- [ ] **Step 2:** 실패 확인

- [ ] **Step 3:** 구현

```typescript
/** host(포트 포함 가능)가 제외 패턴(glob) 중 하나라도 매칭하는지 */
export const matchExcludeDomain = (host: string, patterns: string[]): boolean => {
  const hostname = host.split(':')[0].toLowerCase();
  return patterns.some((pattern) => {
    const trimmed = pattern.trim().toLowerCase();
    if (trimmed.length === 0) return false;
    const regex = new RegExp(
      '^' + trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    return regex.test(hostname);
  });
};
```

- [ ] **Step 4:** 통과 확인 → **Step 5:** 커밋
```bash
git add src/main/proxy/excludeFilter.ts tests/excludeFilter.test.ts
git commit -m "기능: 제외 도메인 glob 매칭 순수함수 추가 (#6)"
```

---

## Task 3: SettingsStore (settings 테이블)

**Files:** Modify `src/main/store/recordStore.ts`, Test `tests/recordStore.test.ts`

- [ ] **Step 1:** `tests/recordStore.test.ts`에 테스트 추가

```typescript
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
```

- [ ] **Step 2:** 실패 확인

- [ ] **Step 3:** `recordStore.ts` 구현 — `migrate()`의 exec에 테이블 추가:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

메서드 추가:

```typescript
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
```

- [ ] **Step 4:** 통과 확인 → **Step 5:** 커밋
```bash
git add src/main/store/recordStore.ts tests/recordStore.test.ts
git commit -m "기능: SettingsStore key-value 설정 저장 추가 (#6)"
```

---

## Task 4: filterTraffic + TrafficFilter 타입

**Files:** Modify `src/shared/types.ts`, Create `src/renderer/src/services/filterTraffic.ts`, Test `tests/filterTraffic.test.ts`

- [ ] **Step 1:** `src/shared/types.ts`에 타입 추가 (파일 끝)

```typescript
export type TrafficFilter = {
  domain: string;
  methods: string[];
  statusClasses: number[];
  search: string;
};
```

- [ ] **Step 2:** 테스트 `tests/filterTraffic.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { filterTraffic, emptyFilter } from '../src/renderer/src/services/filterTraffic';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1, sessionId: 1, timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET', url: 'https://api.example.com/users', host: 'api.example.com', path: '/users',
  requestHeaders: {}, requestBody: null, statusCode: 200, responseHeaders: {}, responseBody: null,
  durationMs: 10, requestSize: 0, responseSize: 0, isHttps: true, clientIp: '127.0.0.1', ...over,
});

describe('filterTraffic', () => {
  const rows = [
    rec({ id: 1, method: 'GET', statusCode: 200, host: 'api.example.com', url: 'https://api.example.com/users', path: '/users' }),
    rec({ id: 2, method: 'POST', statusCode: 404, host: 'api.example.com', url: 'https://api.example.com/orders', path: '/orders' }),
    rec({ id: 3, method: 'GET', statusCode: 500, host: 'cdn.other.com', url: 'https://cdn.other.com/img', path: '/img' }),
  ];

  it('빈 필터는 전체를 반환한다', () => {
    expect(filterTraffic(rows, emptyFilter())).toHaveLength(3);
  });

  it('도메인 부분일치로 거른다', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), domain: 'example' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('메서드로 거른다', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), methods: ['POST'] }).map((r) => r.id)).toEqual([2]);
  });

  it('상태 대역으로 거른다 (4xx,5xx)', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), statusClasses: [4, 5] }).map((r) => r.id)).toEqual([2, 3]);
  });

  it('검색어로 URL/경로를 거른다 (대소문자 무시)', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), search: 'ORDERS' }).map((r) => r.id)).toEqual([2]);
  });

  it('조건을 AND로 결합한다', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), methods: ['GET'], statusClasses: [5] }).map((r) => r.id)).toEqual([3]);
  });
});
```

- [ ] **Step 3:** 실패 확인

- [ ] **Step 4:** 구현 `src/renderer/src/services/filterTraffic.ts`

```typescript
import type { TrafficFilter, TrafficRecord } from '../../../shared/types';

export const emptyFilter = (): TrafficFilter => ({
  domain: '',
  methods: [],
  statusClasses: [],
  search: '',
});

export const filterTraffic = (records: TrafficRecord[], filter: TrafficFilter): TrafficRecord[] => {
  const domain = filter.domain.trim().toLowerCase();
  const search = filter.search.trim().toLowerCase();

  return records.filter((record) => {
    if (domain && !record.host.toLowerCase().includes(domain)) return false;
    if (filter.methods.length > 0 && !filter.methods.includes(record.method)) return false;
    if (filter.statusClasses.length > 0 && !filter.statusClasses.includes(Math.floor(record.statusCode / 100))) {
      return false;
    }
    if (search && !record.url.toLowerCase().includes(search) && !record.path.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
};
```

- [ ] **Step 5:** 통과 확인 → **Step 6:** 커밋
```bash
git add src/shared/types.ts src/renderer/src/services/filterTraffic.ts tests/filterTraffic.test.ts
git commit -m "기능: 트래픽 필터 순수함수 + TrafficFilter 타입 추가 (#1)"
```

---

## Task 5: AppContext 제외 캡처 차단 + 설정 IPC

**Files:** Modify `src/main/appContext.ts`, `src/main/ipcHandlers.ts`, `src/preload/index.ts`, `src/renderer/src/services/ipc.ts`

- [ ] **Step 1:** `appContext.ts`
  - import: `import { matchExcludeDomain } from './proxy/excludeFilter';`
  - 필드: `private excludeDomains: string[] = [];`
  - 생성자 끝에서 로드: `this.excludeDomains = this.loadExcludeDomains();`
  - 메서드:

```typescript
  private loadExcludeDomains(): string[] {
    const raw = this.recordStore.getSetting('excludeDomains');
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  getExcludeDomains(): string[] {
    return this.excludeDomains;
  }

  setExcludeDomains(domains: string[]): string[] {
    this.excludeDomains = domains.map((d) => d.trim()).filter((d) => d.length > 0);
    this.recordStore.setSetting('excludeDomains', JSON.stringify(this.excludeDomains));
    return this.excludeDomains;
  }
```

  - `handleTraffic` 맨 앞에 제외 가드:

```typescript
  private handleTraffic(traffic: CapturedTraffic): void {
    if (this.recordingSessionId === null) return;
    if (matchExcludeDomain(traffic.host, this.excludeDomains)) return; // 제외 도메인은 기록·표시 안 함
    const record = this.recordStore.insertTraffic(this.recordingSessionId, traffic);
    this.broadcaster?.(record);
  }
```

- [ ] **Step 2:** `ipcHandlers.ts`에 채널 추가

```typescript
  ipcMain.handle('settings:get-exclude-domains', () => context.getExcludeDomains());
  ipcMain.handle('settings:set-exclude-domains', (_event, domains: string[]) =>
    context.setExcludeDomains(domains),
  );
```

- [ ] **Step 3:** `preload/index.ts` api에 추가

```typescript
  getExcludeDomains: (): Promise<string[]> => ipcRenderer.invoke('settings:get-exclude-domains'),
  setExcludeDomains: (domains: string[]): Promise<string[]> =>
    ipcRenderer.invoke('settings:set-exclude-domains', domains),
```

- [ ] **Step 4:** `renderer/src/services/ipc.ts`에 추가

```typescript
  getExcludeDomains: (): Promise<string[]> => window.api.getExcludeDomains(),
  setExcludeDomains: (domains: string[]): Promise<string[]> => window.api.setExcludeDomains(domains),
```

- [ ] **Step 5:** build/lint/test 확인 → 커밋
```bash
git add src/main src/preload src/renderer/src/services/ipc.ts
git commit -m "기능: 제외 도메인 캡처 차단 + 설정 IPC 연결 (#6)"
```

---

## Task 6: TrafficFilterBar + useTrafficFilter + App 통합

**Files:** Create `src/renderer/src/components/TrafficFilterBar.tsx`, `src/renderer/src/hooks/useTrafficFilter.ts`, Modify `src/renderer/src/App.tsx`

- [ ] **Step 1:** `useTrafficFilter.ts`

```typescript
import { useMemo, useState } from 'react';
import { emptyFilter, filterTraffic } from '../services/filterTraffic';
import type { TrafficFilter, TrafficRecord } from '../../../shared/types';

export const useTrafficFilter = (records: TrafficRecord[]) => {
  const [filter, setFilter] = useState<TrafficFilter>(emptyFilter);
  const filtered = useMemo(() => filterTraffic(records, filter), [records, filter]);
  return { filter, setFilter, filtered };
};
```

- [ ] **Step 2:** `TrafficFilterBar.tsx`

```typescript
import { Button, Input, Select, Space, Tag } from 'antd';
import type { TrafficFilter } from '../../../shared/types';
import { emptyFilter } from '../services/filterTraffic';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_CLASSES = [
  { value: 2, label: '2xx' },
  { value: 3, label: '3xx' },
  { value: 4, label: '4xx' },
  { value: 5, label: '5xx' },
];

type Props = {
  filter: TrafficFilter;
  onChange: (filter: TrafficFilter) => void;
  total: number;
  shown: number;
};

export const TrafficFilterBar = ({ filter, onChange, total, shown }: Props) => {
  const toggleStatus = (value: number) => {
    const next = filter.statusClasses.includes(value)
      ? filter.statusClasses.filter((c) => c !== value)
      : [...filter.statusClasses, value];
    onChange({ ...filter, statusClasses: next });
  };

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <Space wrap>
        <Input
          placeholder="도메인"
          allowClear
          value={filter.domain}
          onChange={(e) => onChange({ ...filter, domain: e.target.value })}
          style={{ width: 160 }}
        />
        <Select
          mode="multiple"
          placeholder="메서드"
          allowClear
          value={filter.methods}
          onChange={(methods) => onChange({ ...filter, methods })}
          options={METHODS.map((m) => ({ value: m, label: m }))}
          style={{ minWidth: 160 }}
        />
        <Space size={4}>
          {STATUS_CLASSES.map((s) => (
            <Tag.CheckableTag
              key={s.value}
              checked={filter.statusClasses.includes(s.value)}
              onChange={() => toggleStatus(s.value)}
            >
              {s.label}
            </Tag.CheckableTag>
          ))}
        </Space>
        <Input.Search
          placeholder="URL/경로 검색"
          allowClear
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          style={{ width: 220 }}
        />
        <Button size="small" onClick={() => onChange(emptyFilter())}>
          초기화
        </Button>
        <span style={{ color: '#999' }}>
          {shown}/{total}건
        </span>
      </Space>
    </div>
  );
};
```

- [ ] **Step 3:** `App.tsx` 통합
  - import: `TrafficFilterBar`, `useTrafficFilter`
  - `const { records } = useTraffic(selectedSessionId);` 아래:
    `const { filter, setFilter, filtered } = useTrafficFilter(records);`
  - 트래픽 테이블 영역 위에 `<TrafficFilterBar filter={filter} onChange={setFilter} total={records.length} shown={filtered.length} />` 추가
  - `<TrafficTable records={filtered} ... />` 로 변경 (filtered 전달)

- [ ] **Step 4:** build/lint 확인 → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 트래픽 필터바(도메인/메서드/상태/검색) UI 추가 (#1)"
```

---

## Task 7: 설정 Drawer (제외 도메인 UI)

**Files:** Create `src/renderer/src/components/SettingsDrawer.tsx`, Modify `src/renderer/src/components/TopToolbar.tsx`, `src/renderer/src/App.tsx`

- [ ] **Step 1:** `SettingsDrawer.tsx`

```typescript
import { useEffect, useState } from 'react';
import { Button, Drawer, Input, List, Space, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';

type Props = {
  open: boolean;
  onClose: () => void;
};

export const SettingsDrawer = ({ open, onClose }: Props) => {
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) void ipc.getExcludeDomains().then(setDomains);
  }, [open]);

  const persist = async (next: string[]) => {
    setDomains(await ipc.setExcludeDomains(next));
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    void persist([...domains, value]);
    setDraft('');
  };

  return (
    <Drawer title="설정" open={open} onClose={onClose} width={420}>
      <Typography.Title level={5}>캡처 제외 도메인</Typography.Title>
      <Typography.Paragraph type="secondary">
        여기 등록한 도메인은 기록하지 않습니다. 와일드카드(*) 사용 가능. 예: *.google-analytics.com
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="예: *.google-analytics.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={add}
        />
        <Button type="primary" onClick={add}>
          추가
        </Button>
      </Space.Compact>
      <List
        size="small"
        bordered
        dataSource={domains}
        locale={{ emptyText: '제외 도메인 없음' }}
        renderItem={(domain) => (
          <List.Item
            actions={[
              <Button
                key="del"
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => void persist(domains.filter((d) => d !== domain))}
              />,
            ]}
          >
            {domain}
          </List.Item>
        )}
      />
    </Drawer>
  );
};
```

- [ ] **Step 2:** `TopToolbar.tsx`에 ⚙️ 버튼 추가
  - props에 `onOpenSettings: () => void` 추가
  - import에 `SettingOutlined` 추가
  - `<Space wrap>` 안 인증서 버튼 뒤에:
    `<Button icon={<SettingOutlined />} onClick={onOpenSettings}>설정</Button>`

- [ ] **Step 3:** `App.tsx`
  - import `SettingsDrawer`
  - `const [settingsOpen, setSettingsOpen] = useState(false);`
  - `<TopToolbar ... onOpenSettings={() => setSettingsOpen(true)} />`
  - JSX에 `<SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />`

- [ ] **Step 4:** build/lint 확인 → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 설정 Drawer에 캡처 제외 도메인 관리 UI 추가 (#6)"
```

---

## Task 8: 통합 검증

- [ ] **Step 1:** 전체 게이트 `npm run test && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 2:** E2E (CDP) — 녹화 시작 → 필터바로 메서드/상태 필터 → 결과 건수 확인, 설정 Drawer에서 제외 도메인 추가 → 해당 도메인 캡처 안 됨 확인, HAR 내보내기 → Authorization 마스킹 확인
- [ ] **Step 3:** 최종 커밋 (플랜 완료 노트)

## Self-Review 체크리스트
- [x] 스펙 커버리지: #1(Task 4,6), #6(Task 2,3,5,7), #11(Task 1)
- [x] 타입 일관성: TrafficFilter는 shared/types 단일 정의, emptyFilter/filterTraffic 시그니처 일치
- [x] 순수함수 우선 TDD: maskSensitiveHeaders/matchExcludeDomain/filterTraffic/SettingsStore
