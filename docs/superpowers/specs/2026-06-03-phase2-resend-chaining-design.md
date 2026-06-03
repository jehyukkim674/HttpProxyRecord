# Phase 2 설계: 요청 재전송 + 요청 체이닝

**작성일:** 2026-06-03
**상태:** 승인됨
**대상 기능:** #2 요청 편집 후 재전송, #32 요청 체이닝

## 개요

캡처한 요청을 골라 편집·재전송하고(#2), 응답에서 값을 추출해 변수로 저장한 뒤 다음 요청에
주입(#32)하는 디버깅 워크플로우를 추가한다. Postman 없이 앱 안에서 요청을 조립·연쇄 실행한다.

| 기능 | 핵심 결정 |
|------|-----------|
| #2 재전송 | **Composer 모달** — 선택 트래픽 시드 → 편집 → 전송 → 응답 표시 |
| #32 체이닝 | **dot-path 추출** + **변수 저장소 + 수동 순차** (`{{var}}` 치환) |

## 아키텍처

```
Main:     RequestSender(신규) — 합성 요청 전송, 응답 반환   → IPC composer:send
Shared:   substituteVariables({{var}} 치환) + extractByDotPath  (둘 다 순수함수)
Renderer: ComposerModal + useComposerVariables(앱레벨 변수 저장소)
```

## Main — RequestSender

- `send(request: ComposedRequest): Promise<ComposedResponse>`
- Node `http`/`https`로 직접 전송. `rejectUnauthorized: false`(사설 인증서 API 디버깅 대응).
- 요청 바디 전송, 응답 바디 수집, 소요시간(durationMs) 측정.
- 응답 헤더는 `Record<string, string>`로 정규화(배열 헤더는 `, ` join).
- IPC `composer:send`로 노출. 전송 실패 시 에러를 throw → Renderer에서 메시지 표시.
- 로컬 echo 서버로 통합 테스트.

## Shared — 순수함수 (TDD)

- `substituteVariables(text: string, vars: Record<string, string>): string`
  - `{{name}}` 패턴을 `vars[name]`으로 치환. 미정의 변수는 원문 유지.
  - URL·헤더 값·바디에 각각 적용.
- `extractByDotPath(json: unknown, path: string): string | null`
  - `data.token`, `items.0.id` 같은 점/인덱스 경로 탐색.
  - 도달 실패 시 null. 원시값(string/number/boolean)은 문자열로 반환, 객체/배열은 JSON 문자열.

## Renderer — ComposerModal

- **요청 편집기**: 메서드(Select) / URL(Input) / 헤더(편집 가능 key-value 테이블, 행 추가·삭제) / 바디(textarea)
- **변수 패널**: 현재 변수 목록(name→value) 표시·삭제.
- **전송**: 모든 필드에 `{{var}}` 치환 적용 후 `ipc.composerSend` 호출 → 응답(상태/헤더/바디) 표시. 바디는 BodyViewer 재사용.
- **추출 룰**: 응답 수신 후 `변수명` + `dot-path` 입력 → "추출" → `extractByDotPath`로 값을 구해 변수 저장소에 저장(성공/실패 메시지).
- **시드**: 상세 패널(TrafficDetail)에 "재전송" 버튼 추가 → 선택 트래픽의 메서드/URL/헤더/바디로 모달을 연다.

## 변수 저장소 (수동 순차의 핵심)

- `useComposerVariables` 앱레벨 훅: `{ variables, setVariable, removeVariable }`.
- 모달을 닫았다 다시 열어도 변수 유지 → 요청 A에서 `token` 추출 후 요청 B에서 `{{token}}` 사용 가능.

## 타입 (shared/types.ts 추가)

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

## IPC

- `composer:send(request: ComposedRequest) → ComposedResponse`
- preload `api.composerSend`, renderer `ipc.composerSend`.

## 에러 처리

- 전송 실패(네트워크/DNS): RequestSender가 throw → 모달에 에러 메시지, 응답 영역은 비움.
- 잘못된 URL: 전송 전 `new URL()` 검증, 실패 시 사용자 안내.
- 추출 경로 미존재: null 반환 → "값을 찾지 못했어요" 경고, 변수 저장 안 함.
- 미정의 `{{var}}`: 치환 안 하고 원문 유지(전송은 진행).

## 테스트 전략

- **단위 (순수함수)**: `substituteVariables`(치환/미정의/다중), `extractByDotPath`(중첩/배열인덱스/실패/원시값)
- **통합**: `RequestSender` — 로컬 echo 서버로 메서드/헤더/바디 전달·응답 수집·소요시간 검증
- **E2E**: 재전송 모달 열기 → 편집 → 전송 → 응답 확인, 추출 → 변수 저장 → 다음 요청 `{{var}}` 치환 전송

## 범위 밖 (이번 Phase 제외)

- 체인 일괄 실행(여러 요청 자동 순차) — 수동 순차로 충분, 추후
- JSONPath/정규식 추출 — dot-path로 시작
- 재전송 결과를 세션에 기록 — Composer 모달 내 표시로 충분
