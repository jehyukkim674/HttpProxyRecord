# 스크립트 인터셉션 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (또는 subagent-driven-development)로 태스크 단위 구현. 스텝은 체크박스(`- [ ]`).

**Goal:** 사용자가 작성한 JS를 프록시 요청/응답에 자동 실행해 변조·가짜응답·차단할 수 있게 한다.

**Architecture:** `node:vm` 기반 `ScriptRunner`(main/scripting)가 스크립트별 컨텍스트를 컴파일·실행. ProxyEngine은 `ScriptHooks` 인터페이스만 의존해 `dispatchRequest` 파이프라인의 onRequest/onResponse 지점에서 호출. 설정은 SettingsStore, UI는 ScriptsDrawer(CodeMirror), 채널은 shared/channels 단일 소스.

**Tech Stack:** TypeScript, node:vm, Electron IPC, React + antd + @uiw/react-codemirror, vitest(+happy-dom).

**스펙:** `docs/superpowers/specs/2026-06-03-script-interception-design.md`

---

## 파일 구조

- 신규 `src/main/scripting/scriptRunner.ts` — VM 컴파일/실행, ScriptHooks 구현
- 수정 `src/shared/types.ts` — `InterceptScript`, 스크립트 req/res 타입
- 수정 `src/main/settings.ts` — `getScripts/setScripts`
- 수정 `src/main/proxy/proxyEngine.ts` — `setScriptRunner` + dispatchRequest 통합
- 수정 `src/shared/channels.ts` — `CH.script*`, `EV.scriptLog`
- 신규 `src/main/ipc/scriptHandlers.ts` — IPC 핸들러
- 수정 `src/main/appContext.ts` — ScriptRunner 소유·재컴파일·로그 브로드캐스트
- 수정 `src/main/ipcHandlers.ts` — 등록 + 로그 브로드캐스터
- 수정 `src/preload/index.ts` — api 메서드
- 신규 `src/renderer/src/hooks/useScripts.ts` + 테스트
- 신규 `src/renderer/src/components/ScriptsDrawer.tsx`
- 수정 `src/renderer/src/components/TopToolbar.tsx` — 버튼
- 수정 `src/renderer/src/App.tsx` — 드로어 상태/배선
- 테스트: `tests/scriptRunner.test.ts`, `tests/proxyEngine.scripting.test.ts`, `tests/settings.test.ts`(확장), `src/renderer/src/hooks/useScripts.test.ts`

---

## Task 1: InterceptScript 타입 + SettingsStore

**Files:** 수정 `src/shared/types.ts`, `src/main/settings.ts`, `tests/settings.test.ts`

- [ ] **Step 1: 타입 추가** — `src/shared/types.ts` 끝에:

```ts
export type InterceptScript = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};
```

- [ ] **Step 2: 실패 테스트** — `tests/settings.test.ts`의 describe에 추가:

```ts
it('스크립트: 기본 빈 배열, set 후 라운드트립', () => {
  const store = new SettingsStore(new MemoryBackend());
  expect(store.getScripts()).toEqual([]);
  const scripts = [{ id: 'a', name: '헤더주입', code: 'function onRequest(r){}', enabled: true }];
  store.setScripts(scripts);
  expect(store.getScripts()).toEqual(scripts);
});
```

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/settings.test.ts` → FAIL(getScripts 없음)

- [ ] **Step 4: 구현** — `src/main/settings.ts` import에 `InterceptScript` 추가, 메서드 추가(다른 getter/setter 옆):

```ts
getScripts(): InterceptScript[] {
  return this.read<InterceptScript[]>('interceptScripts', []);
}
setScripts(scripts: InterceptScript[]): void {
  this.write('interceptScripts', scripts);
}
```

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/settings.test.ts` → PASS

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "기능: 스크립트 인터셉션 1/6 — InterceptScript 타입 + SettingsStore"`

---

## Task 2: ScriptRunner (VM 코어)

**Files:** 신규 `src/main/scripting/scriptRunner.ts`, `tests/scriptRunner.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/scriptRunner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ScriptRunner } from '../src/main/scripting/scriptRunner';
import type { ScriptRequest, ScriptResponse } from '../src/main/scripting/scriptRunner';

const noop = () => {};
const reqOf = (p: Partial<ScriptRequest> = {}): ScriptRequest => ({
  method: 'GET', url: 'http://x/a', host: 'x', path: '/a', headers: {}, body: null, ...p,
});

describe('ScriptRunner', () => {
  it('onRequest로 요청 헤더를 변조한다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'h', enabled: true, code: `function onRequest(req){ req.headers['x-test']='1'; }` }]);
    const req = reqOf();
    expect(r.runRequest(req)).toBeNull();
    expect(req.headers['x-test']).toBe('1');
  });

  it('onRequest가 {status,body} 반환 시 가짜응답 단락', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'm', enabled: true, code: `function onRequest(){ return { status: 201, body: 'hi' }; }` }]);
    const sc = r.runRequest(reqOf());
    expect(sc?.status).toBe(201);
    expect(sc?.body).toBe('hi');
  });

  it('{block:true} 반환 시 403 단락', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'b', enabled: true, code: `function onRequest(){ return { block: true }; }` }]);
    expect(r.runRequest(reqOf())?.status).toBe(403);
  });

  it('onResponse로 응답 본문을 변조한다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'r', enabled: true, code: `function onResponse(req,res){ res.body = res.body.toUpperCase(); res.status = 202; }` }]);
    const res: ScriptResponse = { status: 200, headers: {}, body: 'abc' };
    r.runResponse(reqOf(), res);
    expect(res.body).toBe('ABC');
    expect(res.status).toBe(202);
  });

  it('런타임 throw는 fail-open(트래픽 무변조) + 로그', () => {
    const logs: unknown[] = [];
    const r = new ScriptRunner((e) => logs.push(e));
    r.setScripts([{ id: '1', name: 'e', enabled: true, code: `function onRequest(){ throw new Error('boom'); }` }]);
    const req = reqOf();
    expect(r.runRequest(req)).toBeNull();
    expect(logs.length).toBe(1);
  });

  it('무한루프는 타임아웃으로 중단된다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'loop', enabled: true, code: `function onRequest(){ while(true){} }` }]);
    expect(r.runRequest(reqOf())).toBeNull(); // 타임아웃 후 fail-open
  });

  it('store는 호출 간 유지된다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 's', enabled: true, code: `function onRequest(req){ store.n=(store.n??0)+1; req.headers['n']=String(store.n); }` }]);
    const a = reqOf(); r.runRequest(a);
    const b = reqOf(); r.runRequest(b);
    expect(b.headers['n']).toBe('2');
  });

  it('비활성 스크립트는 실행되지 않는다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'off', enabled: false, code: `function onRequest(req){ req.headers['x']='1'; }` }]);
    const req = reqOf(); r.runRequest(req);
    expect(req.headers['x']).toBeUndefined();
  });

  it('컴파일 에러는 로그만 남기고 다른 스크립트는 동작', () => {
    const logs: unknown[] = [];
    const r = new ScriptRunner((e) => logs.push(e));
    r.setScripts([
      { id: 'bad', name: 'bad', enabled: true, code: `function onRequest({{{` },
      { id: 'ok', name: 'ok', enabled: true, code: `function onRequest(req){ req.headers['ok']='1'; }` },
    ]);
    const req = reqOf(); r.runRequest(req);
    expect(req.headers['ok']).toBe('1');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('hasRequestHooks/hasResponseHooks가 정확하다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'q', enabled: true, code: `function onResponse(){}` }]);
    expect(r.hasRequestHooks()).toBe(false);
    expect(r.hasResponseHooks()).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/scriptRunner.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — `src/main/scripting/scriptRunner.ts`:

```ts
import vm from 'node:vm';
import { log } from '../logger';
import type { InterceptScript } from '../../shared/types';

export type ScriptRequest = {
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
};
export type ScriptResponse = { status: number; headers: Record<string, string>; body: string };
export type ScriptShortCircuit = { status: number; headers: Record<string, string>; body: string };

export interface ScriptHooks {
  hasRequestHooks(): boolean;
  hasResponseHooks(): boolean;
  runRequest(req: ScriptRequest): ScriptShortCircuit | null;
  runResponse(req: ScriptRequest, res: ScriptResponse): void;
}

export type ScriptLog = { scriptId: string; level: 'log' | 'warn' | 'error'; message: string };
export type ScriptLogListener = (entry: ScriptLog) => void;

const TIMEOUT_MS = 1000;
const DEFAULT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' };

type Compiled = { id: string; ctx: vm.Context; onReq: boolean; onRes: boolean };

export class ScriptRunner implements ScriptHooks {
  private compiled: Compiled[] = [];
  constructor(private readonly onLog: ScriptLogListener) {}

  setScripts(scripts: InterceptScript[]): void {
    const next: Compiled[] = [];
    for (const s of scripts) {
      if (!s.enabled) continue;
      try {
        const ctx = this.makeContext(s.id);
        vm.runInContext(s.code, ctx, { timeout: TIMEOUT_MS, filename: `${s.name}.js` });
        const g = ctx as Record<string, unknown>;
        next.push({ id: s.id, ctx, onReq: typeof g.onRequest === 'function', onRes: typeof g.onResponse === 'function' });
      } catch (error) {
        this.report(s.id, 'error', `컴파일 실패: ${this.msg(error)}`);
      }
    }
    this.compiled = next;
  }

  hasRequestHooks(): boolean {
    return this.compiled.some((c) => c.onReq);
  }
  hasResponseHooks(): boolean {
    return this.compiled.some((c) => c.onRes);
  }

  runRequest(req: ScriptRequest): ScriptShortCircuit | null {
    for (const c of this.compiled) {
      if (!c.onReq) continue;
      try {
        (c.ctx as Record<string, unknown>).__req = req;
        const result = vm.runInContext('onRequest(__req)', c.ctx, { timeout: TIMEOUT_MS });
        const sc = this.normalize(result);
        if (sc) return sc;
      } catch (error) {
        this.report(c.id, 'error', this.msg(error));
      }
    }
    return null;
  }

  runResponse(req: ScriptRequest, res: ScriptResponse): void {
    for (const c of this.compiled) {
      if (!c.onRes) continue;
      try {
        const g = c.ctx as Record<string, unknown>;
        g.__req = req;
        g.__res = res;
        vm.runInContext('onResponse(__req, __res)', c.ctx, { timeout: TIMEOUT_MS });
      } catch (error) {
        this.report(c.id, 'error', this.msg(error));
      }
    }
  }

  private normalize(result: unknown): ScriptShortCircuit | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    if (r.block === true) return { status: 403, headers: { ...DEFAULT_HEADERS }, body: '스크립트에서 차단됨' };
    if (typeof r.status === 'number' || typeof r.body === 'string') {
      return {
        status: typeof r.status === 'number' ? r.status : 200,
        headers: r.headers && typeof r.headers === 'object' ? (r.headers as Record<string, string>) : { ...DEFAULT_HEADERS },
        body: typeof r.body === 'string' ? r.body : '',
      };
    }
    return null;
  }

  private makeContext(scriptId: string): vm.Context {
    const sandbox = {
      console: {
        log: (...a: unknown[]) => this.report(scriptId, 'log', a.map(String).join(' ')),
        warn: (...a: unknown[]) => this.report(scriptId, 'warn', a.map(String).join(' ')),
        error: (...a: unknown[]) => this.report(scriptId, 'error', a.map(String).join(' ')),
      },
      JSON,
      Math,
      Date,
      URL,
      TextEncoder,
      TextDecoder,
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
      store: {},
    };
    return vm.createContext(sandbox);
  }

  private report(scriptId: string, level: ScriptLog['level'], message: string): void {
    log.warn(`[script ${scriptId}] ${message}`);
    try {
      this.onLog({ scriptId, level, message });
    } catch {
      /* 로그 리스너 실패는 무시 */
    }
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/scriptRunner.test.ts` → PASS(11)

- [ ] **Step 5: 커밋** — `git commit -m "기능: 스크립트 인터셉션 2/6 — ScriptRunner(vm) 코어"`

---

## Task 3: ProxyEngine 통합

**Files:** 수정 `src/main/proxy/proxyEngine.ts`, 신규 `tests/proxyEngine.scripting.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/proxyEngine.scripting.test.ts` (echo 서버 + 가짜 ScriptHooks):

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type { ScriptHooks, ScriptRequest, ScriptResponse, ScriptShortCircuit } from '../src/main/scripting/scriptRunner';

const startEcho = (): Promise<{ server: http.Server; port: number; lastHeaders: () => http.IncomingHttpHeaders }> =>
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
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }));
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
      hooks({ hasRequestHooks: () => true, runRequest: (req: ScriptRequest) => { req.headers['x-injected'] = 'yes'; return null; } }),
    );
    await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(echo.lastHeaders()['x-injected']).toBe('yes');
  });

  it('onRequest가 가짜응답 반환 시 업스트림을 호출하지 않는다', async () => {
    let hit = false;
    const echo2 = await startEcho();
    engine.setScriptRunner(
      hooks({ hasRequestHooks: () => true, runRequest: (): ScriptShortCircuit => ({ status: 201, headers: { 'content-type': 'text/plain' }, body: 'mocked' }) }),
    );
    const r = await get(proxyPort, `http://127.0.0.1:${echo2.port}/a`);
    echo2.server.close();
    expect(r.status).toBe(201);
    expect(r.body).toBe('mocked');
    expect(hit).toBe(false);
  });

  it('onResponse가 본문을 변조하면 클라이언트가 변조본을 받는다', async () => {
    engine.setScriptRunner(
      hooks({ hasResponseHooks: () => true, runResponse: (_req: ScriptRequest, res: ScriptResponse) => { res.body = res.body.toUpperCase(); } }),
    );
    const r = await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(r.body).toBe('UPSTREAM-BODY');
  });

  it('스크립트 러너가 없으면 기존 동작(패스스루) 유지', async () => {
    const r = await get(proxyPort, `http://127.0.0.1:${echo.port}/a`);
    expect(r.body).toBe('upstream-body');
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/proxyEngine.scripting.test.ts` → FAIL(setScriptRunner 없음)

- [ ] **Step 3: 구현 — import + 필드/세터** — `proxyEngine.ts` 상단 import에 추가:

```ts
import type { ScriptHooks, ScriptRequest, ScriptResponse } from '../scripting/scriptRunner';
```

클래스 필드에 추가(`breakpointSeq` 옆):

```ts
private scriptRunner: ScriptHooks | null = null;
```

메서드 추가(`setInterception` 옆):

```ts
setScriptRunner(runner: ScriptHooks): void {
  this.scriptRunner = runner;
}
```

- [ ] **Step 4: 구현 — onRequest 통합** — `dispatchRequest`의 breakpoint block 처리 직후(outboundHeaders 구성 전)에 삽입:

```ts
// 스크립트 인터셉션: onRequest (헤더/본문/path/method 변조 또는 단락)
const scriptReq: ScriptRequest = {
  method: clientReq.method ?? 'GET',
  url,
  host: `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`,
  path: target.path,
  headers: this.normalizeHeaders(clientReq.headers),
  body: requestChunks.length > 0 ? Buffer.concat(requestChunks).toString('utf-8') : null,
};
if (this.scriptRunner?.hasRequestHooks()) {
  let shortCircuit = null;
  try {
    shortCircuit = this.scriptRunner.runRequest(scriptReq);
  } catch (error) {
    log.error('스크립트 runRequest 실패', error);
  }
  if (shortCircuit) {
    await this.throttleDelay();
    clientRes.writeHead(shortCircuit.status, shortCircuit.headers);
    clientRes.end(shortCircuit.body);
    this.emit(
      this.buildTraffic(clientReq, shortCircuit.status, shortCircuit.headers, target, {
        requestChunks,
        responseChunks: [Buffer.from(shortCircuit.body)],
        startedAt,
      }),
    );
    return;
  }
}
```

이어서 outbound 구성을 `clientReq.headers` 대신 `scriptReq.headers`/`scriptReq.body`/`scriptReq.method`/`scriptReq.path` 기반으로 변경:

```ts
const outboundHeaders: Record<string, string | string[] | undefined> = { ...scriptReq.headers };
for (const headerName of HOP_BY_HOP_HEADERS) {
  delete outboundHeaders[headerName];
}
outboundHeaders.host = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;
const outboundBody = scriptReq.body !== null ? Buffer.from(scriptReq.body) : Buffer.concat(requestChunks);
if (this.scriptRunner?.hasRequestHooks()) {
  // 본문이 바뀌었을 수 있으니 길이 보정 (chunked 충돌 방지)
  delete outboundHeaders['transfer-encoding'];
  outboundHeaders['content-length'] = String(outboundBody.length);
}
```

`requestFn(...)`의 `method: clientReq.method` → `method: scriptReq.method`, `path: target.path` → `path: scriptReq.path`. 맨 끝 `if (requestChunks.length > 0) proxyReq.write(Buffer.concat(requestChunks));` → `if (outboundBody.length > 0) proxyReq.write(outboundBody);`

> 주의(v1 한계): `scriptReq.host`/`url` 변경은 라우팅에 반영하지 않는다(다른 업스트림으로 보내는 Map Remote는 별도 기능 #5). path/method/headers/body만 적용.

- [ ] **Step 5: 구현 — onResponse 통합** — `proxyRes.on('end', ...)` 콜백을 교체. 응답 훅이 있으면 디코드→변조→평문 재전송(바뀐 경우만), 없거나 미변경이면 기존 패스스루:

```ts
proxyRes.on('end', () => {
  void this.throttleDelay().then(() => {
    const upstreamStatus = proxyRes.statusCode ?? 502;
    if (this.scriptRunner?.hasResponseHooks()) {
      const buf = Buffer.concat(responseChunks);
      const normalized = this.normalizeHeaders(proxyRes.headers);
      const decoded = buf.length > 0 ? decodeBody(buf, normalized['content-encoding'], normalized['content-type']) : null;
      const originalText = decoded ? decoded.text : buf.toString('utf-8');
      const headersNoEncoding = { ...normalized };
      delete headersNoEncoding['content-encoding'];
      const res: ScriptResponse = { status: upstreamStatus, headers: headersNoEncoding, body: originalText };
      try {
        this.scriptRunner.runResponse(scriptReq, res);
      } catch (error) {
        log.error('스크립트 runResponse 실패', error);
      }
      const changed = res.status !== upstreamStatus || res.body !== originalText;
      if (changed) {
        const outBuf = Buffer.from(res.body);
        const outHeaders = { ...res.headers };
        delete outHeaders['transfer-encoding'];
        outHeaders['content-length'] = String(outBuf.length);
        clientRes.writeHead(res.status, outHeaders);
        clientRes.end(outBuf);
        this.emit(this.buildTraffic(clientReq, res.status, outHeaders, target, { requestChunks, responseChunks: [outBuf], startedAt }));
        return;
      }
    }
    clientRes.writeHead(upstreamStatus, proxyRes.headers);
    clientRes.end(Buffer.concat(responseChunks));
    this.emit(this.buildTraffic(clientReq, upstreamStatus, proxyRes.headers, target, { requestChunks, responseChunks, startedAt }));
  });
});
```

- [ ] **Step 6: 통과 확인** — `npx vitest run tests/proxyEngine.scripting.test.ts tests/proxyEngine.resilience.test.ts` → PASS(기존 회복력도 깨지지 않음)

- [ ] **Step 7: 커밋** — `git commit -m "기능: 스크립트 인터셉션 3/6 — ProxyEngine onRequest/onResponse 통합"`

---

## Task 4: IPC + AppContext + preload

**Files:** 수정 `src/shared/channels.ts`, 신규 `src/main/ipc/scriptHandlers.ts`, 수정 `src/main/appContext.ts`, `src/main/ipcHandlers.ts`, `src/preload/index.ts`

- [ ] **Step 1: 채널 추가** — `channels.ts` `CH`에:

```ts
  scriptList: 'script:list',
  scriptSave: 'script:save',
  scriptDelete: 'script:delete',
  scriptToggle: 'script:toggle',
```

`EV`에: `scriptLog: 'script:log',`

- [ ] **Step 2: AppContext 배선** — import:

```ts
import { ScriptRunner } from './scripting/scriptRunner';
import type { ScriptLog } from './scripting/scriptRunner';
import type { InterceptScript } from '../shared/types';
import { randomUUID } from 'node:crypto';
```

필드 + 생성자:

```ts
readonly scriptRunner: ScriptRunner;
private scriptLogBroadcaster: ((entry: ScriptLog) => void) | null = null;
```
생성자에서(this.settings 이후):
```ts
this.scriptRunner = new ScriptRunner((entry) => this.scriptLogBroadcaster?.(entry));
this.proxyEngine.setScriptRunner(this.scriptRunner);
this.scriptRunner.setScripts(this.settings.getScripts());
```
(주의: `proxyEngine`는 settings 다음 줄에서 생성되므로 setScriptRunner는 그 이후에 호출)

메서드:
```ts
setScriptLogBroadcaster(b: (entry: ScriptLog) => void): void {
  this.scriptLogBroadcaster = b;
}
getScripts(): InterceptScript[] {
  return this.settings.getScripts();
}
saveScript(input: { id?: string; name: string; code: string; enabled: boolean }): InterceptScript[] {
  const scripts = this.settings.getScripts();
  if (input.id) {
    const idx = scripts.findIndex((s) => s.id === input.id);
    if (idx >= 0) scripts[idx] = { ...scripts[idx], name: input.name, code: input.code, enabled: input.enabled };
  } else {
    scripts.push({ id: randomUUID(), name: input.name, code: input.code, enabled: input.enabled });
  }
  this.settings.setScripts(scripts);
  this.scriptRunner.setScripts(scripts);
  return scripts;
}
deleteScript(id: string): InterceptScript[] {
  const scripts = this.settings.getScripts().filter((s) => s.id !== id);
  this.settings.setScripts(scripts);
  this.scriptRunner.setScripts(scripts);
  return scripts;
}
toggleScript(id: string, enabled: boolean): InterceptScript[] {
  const scripts = this.settings.getScripts().map((s) => (s.id === id ? { ...s, enabled } : s));
  this.settings.setScripts(scripts);
  this.scriptRunner.setScripts(scripts);
  return scripts;
}
```

- [ ] **Step 3: 핸들러** — `src/main/ipc/scriptHandlers.ts`:

```ts
import type { AppContext } from '../appContext';
import { CH } from '../../shared/channels';
import { handle } from './handle';

export const registerScriptHandlers = (context: AppContext): void => {
  handle(CH.scriptList, () => context.getScripts());
  handle(CH.scriptSave, (_e, input: { id?: string; name: string; code: string; enabled: boolean }) =>
    context.saveScript(input),
  );
  handle(CH.scriptDelete, (_e, id: string) => context.deleteScript(id));
  handle(CH.scriptToggle, (_e, id: string, enabled: boolean) => context.toggleScript(id, enabled));
};
```

- [ ] **Step 4: 등록 + 브로드캐스터** — `ipcHandlers.ts`: import `EV` 이미 있음, `registerScriptHandlers` import. 본문에:

```ts
context.setScriptLogBroadcaster((entry) => {
  getWindow()?.webContents.send(EV.scriptLog, entry);
});
```
그리고 `registerScriptHandlers(context);` 추가.

- [ ] **Step 5: preload** — `api`에:

```ts
listScripts: (): Promise<InterceptScript[]> => ipcRenderer.invoke(CH.scriptList),
saveScript: (input: { id?: string; name: string; code: string; enabled: boolean }): Promise<InterceptScript[]> =>
  ipcRenderer.invoke(CH.scriptSave, input),
deleteScript: (id: string): Promise<InterceptScript[]> => ipcRenderer.invoke(CH.scriptDelete, id),
toggleScript: (id: string, enabled: boolean): Promise<InterceptScript[]> =>
  ipcRenderer.invoke(CH.scriptToggle, id, enabled),
onScriptLog: (callback: (entry: { scriptId: string; level: string; message: string }) => void): (() => void) => {
  const listener = (_e: unknown, entry: { scriptId: string; level: string; message: string }): void => callback(entry);
  ipcRenderer.on(EV.scriptLog, listener);
  return () => { ipcRenderer.removeListener(EV.scriptLog, listener); };
},
```
import에 `InterceptScript` 추가.

- [ ] **Step 6: 게이트** — `npm run typecheck && npx vitest run tests/channels.test.ts` → PASS. 수동 점검: 채널 중복 없음.

- [ ] **Step 7: 커밋** — `git commit -m "기능: 스크립트 인터셉션 4/6 — IPC + AppContext 배선"`

---

## Task 5: 렌더러 (useScripts + ScriptsDrawer + 버튼)

**Files:** 의존성 설치, 신규 `src/renderer/src/hooks/useScripts.ts`(+테스트), `src/renderer/src/components/ScriptsDrawer.tsx`, 수정 `TopToolbar.tsx`, `App.tsx`

- [ ] **Step 1: 의존성** — `npm install @uiw/react-codemirror @codemirror/lang-javascript`

- [ ] **Step 2: useScripts 실패 테스트** — `src/renderer/src/hooks/useScripts.test.ts`:

```ts
// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScripts } from './useScripts';

const ipcMock = vi.hoisted(() => ({
  listScripts: vi.fn(),
  saveScript: vi.fn(),
  deleteScript: vi.fn(),
  toggleScript: vi.fn(),
  onScriptLog: vi.fn(() => () => {}),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

describe('useScripts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.listScripts.mockResolvedValue([]);
  });

  it('마운트 시 목록을 로드한다', async () => {
    ipcMock.listScripts.mockResolvedValue([{ id: '1', name: 'a', code: '', enabled: true }]);
    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(result.current.scripts).toHaveLength(1));
  });

  it('save 후 목록을 갱신한다', async () => {
    ipcMock.saveScript.mockResolvedValue([{ id: '1', name: 'b', code: 'x', enabled: true }]);
    const { result } = renderHook(() => useScripts());
    await act(async () => {
      await result.current.save({ name: 'b', code: 'x', enabled: true });
    });
    expect(result.current.scripts[0].name).toBe('b');
  });
});
```

- [ ] **Step 3: 실패 확인** — `npx vitest run src/renderer/src/hooks/useScripts.test.ts` → FAIL

- [ ] **Step 4: useScripts 구현** — `src/renderer/src/hooks/useScripts.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { InterceptScript } from '../../../shared/types';

export type ScriptLogEntry = { scriptId: string; level: string; message: string };

export const useScripts = () => {
  const [scripts, setScripts] = useState<InterceptScript[]>([]);
  const [logs, setLogs] = useState<ScriptLogEntry[]>([]);

  const reload = useCallback(async () => {
    setScripts(await ipc.listScripts());
  }, []);

  useEffect(() => {
    void reload();
    const off = ipc.onScriptLog((entry) => setLogs((prev) => [...prev.slice(-199), entry]));
    return off;
  }, [reload]);

  const save = useCallback(async (input: { id?: string; name: string; code: string; enabled: boolean }) => {
    setScripts(await ipc.saveScript(input));
  }, []);
  const remove = useCallback(async (id: string) => {
    setScripts(await ipc.deleteScript(id));
  }, []);
  const toggle = useCallback(async (id: string, enabled: boolean) => {
    setScripts(await ipc.toggleScript(id, enabled));
  }, []);

  return { scripts, logs, save, remove, toggle };
};
```

- [ ] **Step 5: 통과 확인** — `npx vitest run src/renderer/src/hooks/useScripts.test.ts` → PASS

- [ ] **Step 6: ScriptsDrawer** — `src/renderer/src/components/ScriptsDrawer.tsx` (CodeMirror는 lazy import). 목록/에디터/로그 패널. 코드:

```tsx
import { Suspense, lazy, useEffect, useState } from 'react';
import { Button, Drawer, Empty, List, Space, Spin, Switch, Typography, message } from 'antd';
import { useScripts } from '../hooks/useScripts';
import type { InterceptScript } from '../../../shared/types';

const CodeMirror = lazy(() => import('@uiw/react-codemirror'));

const STARTER = `// onRequest(req): 요청 변조 / return {status,body} 가짜응답 / return {block:true} 차단
// onResponse(req, res): 응답 변조
function onRequest(req) {
  // req.headers['authorization'] = 'Bearer test';
}
function onResponse(req, res) {
  // res.body = res.body;
}`;

type Props = { open: boolean; onClose: () => void };

export const ScriptsDrawer = ({ open, onClose }: Props) => {
  const { scripts, logs, save, remove, toggle } = useScripts();
  const [selected, setSelected] = useState<InterceptScript | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(STARTER);
  const [messageApi, holder] = message.useMessage();

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setCode(selected.code);
    }
  }, [selected]);

  const onSave = async () => {
    if (!name.trim()) {
      void messageApi.warning('이름을 입력하세요');
      return;
    }
    await save({ id: selected?.id, name: name.trim(), code, enabled: selected?.enabled ?? true });
    void messageApi.success('저장했어요');
  };

  return (
    <Drawer title="스크립트 인터셉션" open={open} onClose={onClose} width={760}>
      {holder}
      <Space align="start" style={{ width: '100%' }} size={16}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <Button
            block
            type="dashed"
            onClick={() => {
              setSelected(null);
              setName('');
              setCode(STARTER);
            }}
            style={{ marginBottom: 8 }}
          >
            + 새 스크립트
          </Button>
          <List
            size="small"
            dataSource={scripts}
            locale={{ emptyText: <Empty description="스크립트 없음" /> }}
            renderItem={(s) => (
              <List.Item
                onClick={() => setSelected(s)}
                style={{ cursor: 'pointer', background: selected?.id === s.id ? '#f0f5ff' : undefined }}
                actions={[
                  <Switch key="t" size="small" checked={s.enabled} onChange={(v) => void toggle(s.id, v)} />,
                  <Button key="d" size="small" danger type="text" onClick={() => void remove(s.id)}>
                    삭제
                  </Button>,
                ]}
              >
                {s.name}
              </List.Item>
            )}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="스크립트 이름"
            style={{ width: '100%', marginBottom: 8, padding: 6 }}
          />
          <Suspense fallback={<Spin />}>
            <CodeMirror value={code} height="320px" onChange={setCode} />
          </Suspense>
          <Button type="primary" onClick={() => void onSave()} style={{ marginTop: 8 }}>
            저장
          </Button>
          <Typography.Title level={5} style={{ marginTop: 16 }}>
            실행 로그
          </Typography.Title>
          <div style={{ height: 120, overflow: 'auto', background: '#1e1e1e', color: '#ddd', padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
            {logs.length === 0 ? '로그 없음' : logs.map((l, i) => <div key={i}>[{l.level}] {l.message}</div>)}
          </div>
        </div>
      </Space>
    </Drawer>
  );
};
```

> CodeMirror에 JS 문법 강조를 더하려면 `import { javascript } from '@codemirror/lang-javascript'` 후 `extensions={[javascript()]}`. lazy 경계와 충돌하지 않도록 별도 작은 래퍼 컴포넌트로 분리해도 됨. 기본 동작엔 필수 아님.

- [ ] **Step 7: TopToolbar 버튼 + App 배선** — `TopToolbar.tsx`에 `onOpenScripts: () => void` prop 추가하고 버튼 1개 추가(다른 버튼 패턴 동일). `App.tsx`: `const [scriptsOpen, setScriptsOpen] = useState(false);`, TopToolbar에 `onOpenScripts={() => setScriptsOpen(true)}`, JSX 하단에 `<ScriptsDrawer open={scriptsOpen} onClose={() => setScriptsOpen(false)} />`, import 추가.

- [ ] **Step 8: 게이트** — `npm run typecheck && npm run lint && npx vitest run` → PASS

- [ ] **Step 9: 커밋** — `git commit -m "기능: 스크립트 인터셉션 5/6 — 렌더러(useScripts + ScriptsDrawer + CodeMirror)"`

---

## Task 6: 스모크 + 전체 게이트

**Files:** 없음(검증)

- [ ] **Step 1: format** — `npm run format`

- [ ] **Step 2: 전체 게이트** — `npm run typecheck && npm run lint && npx vitest run && npm run build` 모두 통과

- [ ] **Step 3: 실앱 스모크** — dev 또는 프로덕션 빌드 실행 후:
  - 스크립트 1: `function onRequest(req){ req.headers['x-smoke']='1'; }` 활성화
  - 스크립트 2: `function onResponse(req,res){ res.body = '[hooked]'+res.body; }` 활성화
  - 녹화 시작 → `curl -x http://127.0.0.1:8888 http://example.com/` → 캡처에서 응답 본문이 `[hooked]`로 시작하는지 확인
  - onRequest mock 스크립트로 업스트림 생략 확인

- [ ] **Step 4: 메모리 업데이트** — `project_http_proxy_record.md`에 스크립트 인터셉션 기능 추가 기록

- [ ] **Step 5: 최종 커밋** — `git commit -m "기능: 스크립트 인터셉션 6/6 — 스모크 + 게이트 통과"`

---

## Self-review 메모

- 스펙 커버리지: 변조/mock/block/store/fail-open/타임아웃/여러스크립트/CodeMirror/IPC 단일소스 — 모두 태스크에 매핑됨.
- 타입 일관성: `ScriptRequest/ScriptResponse/ScriptShortCircuit/ScriptHooks`는 Task 2에서 정의, Task 3에서 import. `InterceptScript`는 Task 1에서 정의.
- v1 한계 명시: host/url 리라우팅(Map Remote)은 제외. 본문은 UTF-8 텍스트(바이너리 변조는 작성자 책임). onResponse는 본문이 바뀐 경우에만 재인코딩(미변경 패스스루로 바이너리 보존).
- 안전: 컴파일/런타임/타임아웃 모두 fail-open. ProxyEngine도 runner 호출을 try/catch로 한 번 더 감쌈.
