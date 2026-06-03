# Phase 2 Implementation Plan: 요청 재전송 + 요청 체이닝

> **For agentic workers:** TDD. 순수함수 우선. 각 Task는 실패 테스트 → 구현 → 통과 → 커밋.

**Goal:** 캡처 요청을 Composer 모달에서 편집·재전송하고, 응답에서 dot-path로 값을 추출해 변수로 저장 후 다음 요청에 `{{var}}` 주입.

**Spec:** `docs/superpowers/specs/2026-06-03-phase2-resend-chaining-design.md`

**작업 디렉터리:** `~/Dev/HttpProxyRecord` (main 브랜치)

---

## Task 1: 변수 치환/추출 순수함수 (shared)

**Files:** Create `src/shared/composer.ts`, Test `tests/composer.test.ts`

- [ ] **Step 1:** 테스트 작성

```typescript
import { describe, expect, it } from 'vitest';
import { extractByDotPath, substituteVariables } from '../src/shared/composer';

describe('substituteVariables', () => {
  it('{{var}}를 값으로 치환한다', () => {
    expect(substituteVariables('Bearer {{token}}', { token: 'abc' })).toBe('Bearer abc');
  });
  it('여러 변수를 치환한다', () => {
    expect(substituteVariables('{{a}}/{{b}}', { a: '1', b: '2' })).toBe('1/2');
  });
  it('미정의 변수는 원문을 유지한다', () => {
    expect(substituteVariables('{{missing}}', {})).toBe('{{missing}}');
  });
  it('변수가 없으면 원문 그대로', () => {
    expect(substituteVariables('no vars', { x: '1' })).toBe('no vars');
  });
});

describe('extractByDotPath', () => {
  it('중첩 객체 경로를 추출한다', () => {
    expect(extractByDotPath({ data: { token: 'xyz' } }, 'data.token')).toBe('xyz');
  });
  it('배열 인덱스 경로를 추출한다', () => {
    expect(extractByDotPath({ items: [{ id: 7 }] }, 'items.0.id')).toBe('7');
  });
  it('도달 실패 시 null', () => {
    expect(extractByDotPath({ a: 1 }, 'a.b.c')).toBeNull();
    expect(extractByDotPath({}, 'missing')).toBeNull();
  });
  it('객체/배열은 JSON 문자열로 반환한다', () => {
    expect(extractByDotPath({ a: { b: 1 } }, 'a')).toBe('{"b":1}');
  });
  it('boolean/number를 문자열로 반환한다', () => {
    expect(extractByDotPath({ ok: true }, 'ok')).toBe('true');
    expect(extractByDotPath({ n: 0 }, 'n')).toBe('0');
  });
});
```

- [ ] **Step 2:** 실패 확인 `npx vitest run tests/composer.test.ts`

- [ ] **Step 3:** 구현 `src/shared/composer.ts`

```typescript
/** "{{name}}" 패턴을 vars[name]으로 치환한다. 미정의 변수는 원문 유지. */
export const substituteVariables = (text: string, vars: Record<string, string>): string =>
  text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole,
  );

/** "data.token", "items.0.id" 점/인덱스 경로로 값을 추출한다. 실패 시 null. */
export const extractByDotPath = (json: unknown, path: string): string | null => {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: unknown = json;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === null || current === undefined) return null;
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
};
```

- [ ] **Step 4:** 통과 확인 → **Step 5:** 커밋
```bash
git add src/shared/composer.ts tests/composer.test.ts
git commit -m "기능: 변수 치환/dot-path 추출 순수함수 추가 (#32)"
```

---

## Task 2: RequestSender (Main) + 타입

**Files:** Modify `src/shared/types.ts`, Create `src/main/composer/requestSender.ts`, Test `tests/requestSender.test.ts`

- [ ] **Step 1:** `src/shared/types.ts`에 타입 추가 (파일 끝)

```typescript
export type ComposedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
};

export type ComposedResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
};
```

- [ ] **Step 2:** 테스트 `tests/requestSender.test.ts`

```typescript
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
  beforeEach(async () => { const e = await startEcho(); server = e.server; port = e.port; });
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
```

- [ ] **Step 3:** 실패 확인

- [ ] **Step 4:** 구현 `src/main/composer/requestSender.ts`

```typescript
import http from 'node:http';
import https from 'node:https';
import type { ComposedRequest, ComposedResponse } from '../../shared/types';

/** 합성 요청을 실제로 전송하고 응답을 수집한다 (재전송/체이닝용). */
export const sendComposedRequest = (request: ComposedRequest): Promise<ComposedResponse> =>
  new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      reject(new Error(`잘못된 URL입니다: ${request.url}`));
      return;
    }

    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const startedAt = Date.now();

    const clientRequest = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value === undefined) continue;
            headers[name] = Array.isArray(value) ? value.join(', ') : value;
          }
          resolve({
            statusCode: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf-8'),
            durationMs: Date.now() - startedAt,
          });
        });
      },
    );

    clientRequest.on('error', reject);
    if (request.body !== null && request.body.length > 0) clientRequest.write(request.body);
    clientRequest.end();
  });
```

- [ ] **Step 5:** 통과 확인 → **Step 6:** 커밋
```bash
git add src/shared/types.ts src/main/composer/requestSender.ts tests/requestSender.test.ts
git commit -m "기능: 합성 요청 전송 RequestSender + 타입 추가 (#2)"
```

---

## Task 3: IPC composer:send 연결

**Files:** Modify `src/main/ipcHandlers.ts`, `src/preload/index.ts`, `src/renderer/src/services/ipc.ts`

- [ ] **Step 1:** `ipcHandlers.ts` — import + 핸들러

import:
```typescript
import { sendComposedRequest } from './composer/requestSender';
import type { ComposedRequest } from '../shared/types';
```
핸들러 (내보내기 핸들러 아래):
```typescript
  // ── Composer (재전송/체이닝) ──
  ipcMain.handle('composer:send', (_event, request: ComposedRequest) => sendComposedRequest(request));
```

- [ ] **Step 2:** `preload/index.ts` — import에 `ComposedRequest, ComposedResponse` 추가, api에:
```typescript
  composerSend: (request: ComposedRequest): Promise<ComposedResponse> =>
    ipcRenderer.invoke('composer:send', request),
```

- [ ] **Step 3:** `renderer/src/services/ipc.ts` — import에 `ComposedRequest, ComposedResponse` 추가, 객체에:
```typescript
  composerSend: (request: ComposedRequest): Promise<ComposedResponse> => window.api.composerSend(request),
```

- [ ] **Step 4:** typecheck/build 확인 → 커밋
```bash
git add src/main/ipcHandlers.ts src/preload/index.ts src/renderer/src/services/ipc.ts
git commit -m "기능: composer:send IPC 연결 (#2)"
```

---

## Task 4: useComposerVariables 훅

**Files:** Create `src/renderer/src/hooks/useComposerVariables.ts`

- [ ] **Step 1:** 구현 (앱레벨 변수 저장소)

```typescript
import { useCallback, useState } from 'react';

export const useComposerVariables = () => {
  const [variables, setVariables] = useState<Record<string, string>>({});

  const setVariable = useCallback((name: string, value: string) => {
    setVariables((previous) => ({ ...previous, [name]: value }));
  }, []);

  const removeVariable = useCallback((name: string) => {
    setVariables((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  return { variables, setVariable, removeVariable };
};
```

- [ ] **Step 2:** 커밋 (다음 Task와 함께 빌드 검증) — 일단 파일만 생성, Task 5에서 함께 커밋

---

## Task 5: ComposerModal 컴포넌트

**Files:** Create `src/renderer/src/components/ComposerModal.tsx`

- [ ] **Step 1:** 구현

```typescript
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { extractByDotPath, substituteVariables } from '../../../shared/composer';
import { ipc } from '../services/ipc';
import { BodyViewer } from './BodyViewer';
import type { ComposedRequest, ComposedResponse, TrafficRecord } from '../../../shared/types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

type HeaderRow = { key: string; name: string; value: string };

type ComposerModalProps = {
  open: boolean;
  initial: TrafficRecord | null;
  variables: Record<string, string>;
  onSetVariable: (name: string, value: string) => void;
  onRemoveVariable: (name: string) => void;
  onClose: () => void;
};

const toHeaderRows = (headers: Record<string, string>): HeaderRow[] =>
  Object.entries(headers).map(([name, value], index) => ({ key: `${index}-${name}`, name, value }));

const fromHeaderRows = (rows: HeaderRow[]): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    if (row.name.trim()) headers[row.name.trim()] = row.value;
  }
  return headers;
};

export const ComposerModal = ({
  open,
  initial,
  variables,
  onSetVariable,
  onRemoveVariable,
  onClose,
}: ComposerModalProps) => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<ComposedResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [extractName, setExtractName] = useState('');
  const [extractPath, setExtractPath] = useState('');

  useEffect(() => {
    if (!open) return;
    setMethod(initial?.method ?? 'GET');
    setUrl(initial?.url ?? '');
    setHeaderRows(toHeaderRows(initial?.requestHeaders ?? {}));
    setBody(initial?.requestBody ?? '');
    setResponse(null);
    setExtractName('');
    setExtractPath('');
  }, [open, initial]);

  const variableEntries = useMemo(() => Object.entries(variables), [variables]);

  const send = async () => {
    setSending(true);
    setResponse(null);
    try {
      const request: ComposedRequest = {
        method,
        url: substituteVariables(url, variables),
        headers: Object.fromEntries(
          Object.entries(fromHeaderRows(headerRows)).map(([name, value]) => [
            name,
            substituteVariables(value, variables),
          ]),
        ),
        body: body.length > 0 ? substituteVariables(body, variables) : null,
      };
      setResponse(await ipc.composerSend(request));
    } catch (caught) {
      void message.error(caught instanceof Error ? caught.message : '전송 실패');
    } finally {
      setSending(false);
    }
  };

  const runExtract = () => {
    if (!response || !extractName.trim() || !extractPath.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      void message.warning('응답이 JSON이 아니에요');
      return;
    }
    const value = extractByDotPath(parsed, extractPath.trim());
    if (value === null) {
      void message.warning('값을 찾지 못했어요');
      return;
    }
    onSetVariable(extractName.trim(), value);
    void message.success(`변수 ${extractName.trim()} = ${value}`);
    setExtractName('');
    setExtractPath('');
  };

  return (
    <Modal title="요청 작성 / 재전송" open={open} onCancel={onClose} width={760} footer={null}>
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Select value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m }))} style={{ width: 110 }} />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/path" />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()}>
          전송
        </Button>
      </Space.Compact>

      {variableEntries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {variableEntries.map(([name, value]) => (
            <Tag key={name} closable onClose={() => onRemoveVariable(name)} style={{ marginBottom: 4 }}>
              {`{{${name}}}`} = {value.length > 20 ? `${value.slice(0, 20)}…` : value}
            </Tag>
          ))}
        </div>
      )}

      <Typography.Text type="secondary">헤더</Typography.Text>
      <Table<HeaderRow>
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={headerRows}
        style={{ marginBottom: 8 }}
        columns={[
          {
            title: '이름',
            dataIndex: 'name',
            render: (_, row) => (
              <Input
                value={row.name}
                onChange={(e) =>
                  setHeaderRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))
                }
              />
            ),
          },
          {
            title: '값',
            dataIndex: 'value',
            render: (_, row) => (
              <Input
                value={row.value}
                onChange={(e) =>
                  setHeaderRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))
                }
              />
            ),
          },
          {
            title: '',
            width: 40,
            render: (_, row) => (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setHeaderRows((rows) => rows.filter((r) => r.key !== row.key))}
              />
            ),
          },
        ]}
      />
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={() => setHeaderRows((rows) => [...rows, { key: `new-${Date.now()}`, name: '', value: '' }])}
        style={{ marginBottom: 8 }}
      >
        헤더 추가
      </Button>

      <Typography.Text type="secondary">바디</Typography.Text>
      <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ marginBottom: 12 }} />

      {response && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Typography.Title level={5}>
            응답 <Tag color={response.statusCode < 400 ? 'green' : 'red'}>{response.statusCode}</Tag>
            <Typography.Text type="secondary">{response.durationMs}ms</Typography.Text>
          </Typography.Title>
          <BodyViewer body={response.body} contentType={response.headers['content-type']} />
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input placeholder="변수명 (예: token)" value={extractName} onChange={(e) => setExtractName(e.target.value)} />
            <Input placeholder="dot-path (예: data.token)" value={extractPath} onChange={(e) => setExtractPath(e.target.value)} />
            <Button onClick={runExtract}>추출</Button>
          </Space.Compact>
        </div>
      )}
    </Modal>
  );
};
```

- [ ] **Step 2:** 커밋
```bash
git add src/renderer/src/hooks/useComposerVariables.ts src/renderer/src/components/ComposerModal.tsx
git commit -m "기능: Composer 모달 + 변수 저장소 훅 추가 (#2 #32)"
```

---

## Task 6: App 통합 + 재전송 버튼

**Files:** Modify `src/renderer/src/components/TrafficDetail.tsx`, `src/renderer/src/App.tsx`

- [ ] **Step 1:** `TrafficDetail.tsx` — "재전송" 버튼 추가
  - props에 `onResend: (record: TrafficRecord) => void` 추가
  - import에 `SendOutlined` 추가 (`CopyOutlined` 옆)
  - "curl 복사" 버튼 옆에:
```typescript
      <Button size="small" icon={<SendOutlined />} onClick={() => onResend(record)} style={{ marginBottom: 12, marginLeft: 8 }}>
        재전송
      </Button>
```

- [ ] **Step 2:** `App.tsx` 통합
  - import: `ComposerModal`, `useComposerVariables`
  - 상태: `const composerVars = useComposerVariables();`
    `const [composerOpen, setComposerOpen] = useState(false);`
    `const [composerSeed, setComposerSeed] = useState<TrafficRecord | null>(null);`
  - `TrafficDetail`에 `onResend` 연결:
```typescript
              onResend={(record) => {
                setComposerSeed(record);
                setComposerOpen(true);
              }}
```
  - SettingsDrawer 옆에 모달 추가:
```typescript
      <ComposerModal
        open={composerOpen}
        initial={composerSeed}
        variables={composerVars.variables}
        onSetVariable={composerVars.setVariable}
        onRemoveVariable={composerVars.removeVariable}
        onClose={() => setComposerOpen(false)}
      />
```

- [ ] **Step 3:** typecheck/build/lint/format 확인 → 커밋
```bash
git add src/renderer/src
git commit -m "기능: 상세 패널 재전송 버튼 + Composer 모달 연결 (#2 #32)"
```

---

## Task 7: 통합 검증 + E2E

- [ ] **Step 1:** 전체 게이트 `npm run test && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 2:** E2E (CDP): 녹화→요청 캡처→상세 "재전송"→Composer 열림→전송→응답 표시→추출(변수 저장)→URL에 {{var}} 넣고 재전송 치환 확인
- [ ] **Step 3:** 완료 노트 커밋

## Self-Review 체크리스트
- [x] 스펙 커버리지: #2(Task 2,3,5,6), #32(Task 1,5)
- [x] 타입 일관성: ComposedRequest/ComposedResponse shared 단일 정의, composerSend 시그니처 일치
- [x] 순수함수 TDD: substituteVariables/extractByDotPath/sendComposedRequest
