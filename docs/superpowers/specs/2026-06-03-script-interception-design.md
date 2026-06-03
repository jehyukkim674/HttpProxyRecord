# 스크립트 인터셉션 설계 (Scriptable Interception)

> 상태: 승인됨 (2026-06-03). 다음 단계: 구현 플랜 작성(writing-plans).

## 개요

프록시를 지나는 모든 요청/응답에 대해 사용자가 작성한 JavaScript를 자동 실행해
내용을 읽거나 변조할 수 있는 기능. Charles의 Rewrite, Proxyman의 Scripting,
mitmproxy의 addon과 같은 계열의 "프로그래머블 인터셉션".

기존 인터셉션 기능과의 관계:
- **응답 오버라이드(Map Local)**: 고정 규칙 — "이 URL이면 이 응답". 스크립트는 그 프로그래머블 상위호환.
- **브레이크포인트**: 수동 일시정지·편집. 스크립트는 그 자동화.
- **throttle**: 단순 지연. 스크립트는 조건부 지연/장애주입 가능.

## 목표 / 비목표

**목표**
- 요청(method/url/headers/body)과 응답(status/headers/body)을 코드로 변조
- onRequest에서 가짜 응답 반환 시 업스트림 생략(프로그래머블 목)
- 요청 차단
- 요청 간 공유 상태(`store`)로 체이닝/카운팅
- 여러 스크립트를 이름 붙여 개별 on/off
- 스크립트 오류가 프록시를 죽이지 않음(fail-open)

**비목표(이번 범위 아님)**
- async/await 훅 (타임아웃 보장 위해 동기 전용)
- 샌드박스에서 네트워크/파일시스템 접근(`fetch`/`fs`/`require`)
- `store`의 디스크 영속화(프록시 재시작 시 초기화)
- 스트리밍 변조(본문은 이미 통합 버퍼 방식으로 전량 버퍼링되므로 불필요)

## 아키텍처

VM 실행 로직을 `ScriptRunner`로 분리해 ProxyEngine은 transport에 집중시킨다
(기존 모듈 분리 패턴과 일관, 단위 테스트 가능).

```
AppContext
  ├─ SettingsStore.getScripts()  → InterceptScript[]
  ├─ ScriptRunner (설정 변경 시 컴파일)
  └─ ProxyEngine.setScriptRunner(runner)

ProxyEngine.dispatchRequest:
  요청버퍼 완성 → override → breakpoint
    → [runner.runRequest(req)]    헤더/본문/URL 제자리 변조, {mock|block} 반환 시 단락
    → 업스트림 요청
  업스트림 응답버퍼 완성 → [runner.runResponse(req, res)]   status/헤더/본문 제자리 변조
    → throttle → 클라이언트 전송 + emit(기록)
```

본문이 이미 메모리에 전량 버퍼링된 뒤 중계되므로(통합 버퍼 방식) 본문 통째 변조에
스트리밍 복잡성이 없다.

## 스크립트 API (사용자 계약)

사용자는 선택적 최상위 함수 두 개를 정의한다. **둘 다 동기 함수**(vm 타임아웃 보장).

```js
function onRequest(req) {
  // req: { method: string, url: string, host: string, path: string,
  //        headers: Record<string,string>, body: string | null }
  // 제자리 변조:
  req.headers['authorization'] = 'Bearer test-token';
  // 단락(업스트림 생략):
  if (req.path === '/blocked') return { block: true };               // → 403
  if (req.path === '/mock')    return { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' };
  // falsy 반환/미반환 → 그대로 진행
}

function onResponse(req, res) {
  // res: { status: number, headers: Record<string,string>, body: string }
  if (req.host === 'api.example.com' && res.status === 200) {
    const j = JSON.parse(res.body);
    j.featureFlag = true;
    res.body = JSON.stringify(j);
  }
}

// 요청 간 공유 상태 (스크립트별, 프록시 재시작 시 초기화)
store.count = (store.count ?? 0) + 1;
```

**반환 규약(onRequest)**
- `undefined`/falsy → 변조된 req로 업스트림 진행
- `{ block: true }` → 403 단락
- `{ status, headers?, body? }` → 가짜 응답으로 단락(업스트림 생략). headers 생략 시 `{ 'content-type': 'text/plain; charset=utf-8' }`, body 생략 시 빈 문자열, status 생략 시 200.

**제공 전역(샌드박스)**: `console`(로그 라우팅), `JSON`, `Math`, `Date`, `URL`, `TextEncoder`/`TextDecoder`, `atob`/`btoa`, `store`. 그 외(`require`/`process`/`fs`/`fetch`/`global`) 미제공.

## 실행 / 안전

`ScriptRunner` (신규: `src/main/scripting/scriptRunner.ts`)

- **컴파일**: `setScripts(scripts)` 호출 시 enabled 스크립트마다 `vm.createContext(sandbox)` 생성 후
  사용자 코드를 그 컨텍스트에서 1회 실행(→ onRequest/onResponse/store 정의). 컨텍스트를 보관.
- **실행(요청)**: `context.__req = reqObj` 주입 후
  `vm.runInContext('typeof onRequest === "function" ? onRequest(__req) : undefined', context, { timeout: 1000 })`.
  객체는 참조 공유되므로 `__req` 제자리 변조가 호스트 객체에 반영됨. 반환값으로 단락 판단.
- **실행(응답)**: `context.__req`, `context.__res` 주입 후 `onResponse(__req, __res)` 실행. `__res` 변조 반영.
- **순차 적용**: enabled 스크립트를 순서대로 실행. onRequest가 단락(mock/block) 반환하면 이후 스크립트의 onRequest는 건너뛰고 즉시 단락.
- **타임아웃**: `{ timeout: 1000 }` — 동기 무한루프 차단(그래서 훅은 동기 전용).
- **fail-open**: 각 실행을 try/catch. 컴파일/런타임/타임아웃 오류 시 로그만 남기고 해당 스크립트는 건너뜀 → 트래픽은 무변조 진행. 스크립트 오류가 프록시를 죽이지 않음(크래시 하드닝 원칙).
- **로그 라우팅**: 샌드박스 `console.log/warn/error` → `onLog(scriptId, level, message)` 콜백 → main 로거 + 렌더러 푸시(`EV.scriptLog`).
- **본문 길이 보정**: 변조 후 `content-length`를 재계산(요청·응답 모두). hop-by-hop/transfer-encoding 충돌 방지 위해 chunked 관련 헤더는 제거하고 length 명시.

## 데이터 / 저장

```ts
// src/shared/types.ts 에 추가
export type InterceptScript = {
  id: string;       // crypto.randomUUID()
  name: string;
  code: string;
  enabled: boolean;
};
```

`SettingsStore`에 추가(기존 파사드 패턴):
- `getScripts(): InterceptScript[]` (키 `interceptScripts`, 기본값 `[]`)
- `setScripts(scripts: InterceptScript[]): void`

## 파이프라인 통합 (ProxyEngine)

- `setScriptRunner(runner: ScriptHooks)` 추가. `ScriptHooks` 인터페이스:
  ```ts
  interface ScriptHooks {
    runRequest(req: ScriptRequest): ScriptShortCircuit | null; // null이면 통과
    runResponse(req: ScriptRequest, res: ScriptResponse): void;
  }
  ```
  (ProxyEngine은 인터페이스만 의존 → 테스트 시 가짜 주입 가능, vm 의존 없음)
- `dispatchRequest`에서:
  - breakpoint 통과 후, outbound 구성 직전: `ScriptRequest` 생성(method/url/host/path/headers/body) → `runRequest`.
    - 반환이 mock/block이면 override와 동일 경로로 단락 응답 + emit.
    - 통과면 변조된 headers/body/method/path를 outbound에 반영(host 헤더·content-length 재설정).
  - 응답 버퍼 완성 후, `writeHead` 직전: `ScriptResponse` 생성 → `runResponse` → 변조된 status/headers/body로 전송 + emit.
- ProxyEngine은 runner 호출 자체도 try/catch로 한 번 더 감싼다(이중 안전).

## IPC (단일 소스 채널 확장)

`src/shared/channels.ts`의 `CH`에 추가: `scriptList`, `scriptSave`, `scriptDelete`, `scriptToggle`.
`EV`에 추가: `scriptLog`('script:log').

- `script:list` → `InterceptScript[]`
- `script:save` (생성/수정; id 없으면 randomUUID로 생성) → `InterceptScript[]`
- `script:delete` (id) → `InterceptScript[]`
- `script:toggle` (id, enabled) → `InterceptScript[]`
- 푸시 `script:log` → `{ scriptId, level, message, timestamp }`

저장/토글 시 AppContext가 `runner.setScripts(...)`로 재컴파일.
핸들러는 신규 `src/main/ipc/scriptHandlers.ts`(handle 래퍼 사용), `registerIpcHandlers`에 등록.
preload `api`에 메서드 추가, `EV.scriptLog` 브로드캐스터 연결.

## UI (렌더러)

- **ScriptsDrawer** (`src/renderer/src/components/ScriptsDrawer.tsx`): SnapshotsDrawer 톤.
  - 좌: 스크립트 목록(이름 + enabled 스위치 + 삭제), "새 스크립트" 버튼
  - 우: 선택 스크립트 이름 입력 + **CodeMirror 6** 에디터(JS) + 저장 버튼
  - 하단: 실행 로그/에러 패널(`script:log` 수신 표시, 스크립트별 필터)
- **TopToolbar**에 "스크립트" 버튼 추가(드로어 오픈).
- **useScripts 훅** (`src/renderer/src/hooks/useScripts.ts`): list/save/delete/toggle + 로그 구독.
- CodeMirror: `@uiw/react-codemirror` + `@codemirror/lang-javascript`. 거대 모듈이므로 `React.lazy`로 ScriptsDrawer(또는 에디터)만 지연 로드해 초기 번들 영향 최소화.

## 에러 처리 요약

| 상황 | 처리 |
|------|------|
| 컴파일 에러(저장 시) | 저장은 허용, 해당 스크립트 비활성 처리 + script:log로 에러 표시 |
| 런타임 에러/타임아웃 | fail-open(무변조 통과) + script:log |
| 스크립트가 잘못된 mock 반환 | 기본값 보정(status 200, text/plain, 빈 본문) |
| runner 자체 예외 | ProxyEngine try/catch로 흡수, 트래픽 계속 |

## 테스트 전략

- **ScriptRunner 단위(node, tests/)**: 요청 헤더/본문 변조, URL/method 변조, onRequest mock 단락, block(403),
  onResponse status/헤더/본문 변조, 컴파일 에러 fail-open, 런타임 throw fail-open, 무한루프 타임아웃 인터럽트,
  store가 호출 간 유지됨, 비활성 스크립트는 실행 안 됨, 여러 스크립트 순차 적용.
- **ProxyEngine 통합(node, tests/)**: 실제 프록시+echo 서버로, 헤더 주입 스크립트가 업스트림에 반영 / onResponse 본문 변조가 클라이언트에 도달 / onRequest mock이 업스트림 호출 생략(echo 미도달).
- **useScripts 훅(happy-dom)**: list/save/delete/toggle ipc 호출 + 로그 수신.
- **실앱 스모크**: 헤더 주입 + 응답 본문 리라이트 스크립트 켜고 캡처로 확인.

## 의존성 추가

- `@uiw/react-codemirror`, `@codemirror/lang-javascript` (렌더러 에디터)

## 작업 분해 (플랜 예고)

1. 타입(InterceptScript) + SettingsStore getScripts/setScripts (+테스트)
2. **ScriptRunner**(vm 컴파일/실행/타임아웃/fail-open/store/로그) (+테스트) — 코어
3. ProxyEngine 통합(ScriptHooks 주입, onRequest 단락/변조, onResponse 변조, content-length 보정) (+통합테스트)
4. IPC 채널 + scriptHandlers + AppContext 배선(runner 재컴파일, 로그 브로드캐스트) + preload
5. 렌더러: useScripts(+테스트) + ScriptsDrawer(CodeMirror, lazy) + TopToolbar 버튼
6. 실앱 스모크 + 전체 게이트(test/typecheck/lint/build) + 커밋
