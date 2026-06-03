# Phase 1 설계: 필터+검색 / 캡처 범위 필터 / 민감정보 마스킹

**작성일:** 2026-06-03
**상태:** 승인됨
**대상 기능:** #1 필터+검색, #6 캡처 범위 필터, #11 민감정보 마스킹

## 개요

HttpProxyRecord에 트래픽이 많아질 때 필요한 3가지 기반 기능을 추가한다. 세 기능 모두
트래픽 테이블·캡처·내보내기 경로를 건드리므로 한 Phase로 묶어 구현한다.

| 기능 | 핵심 결정 |
|------|-----------|
| #1 필터+검색 | 도메인·메서드·상태코드 필터 + URL/경로 텍스트 검색, **클라이언트측** |
| #6 캡처 범위 필터 | **캡처 자체 차단** (제외 도메인은 기록·표시 안 함, 중계는 정상) |
| #11 민감정보 마스킹 | **내보낼 때만**, 기본 민감 헤더 세트 고정 |

## 아키텍처 (각 기능이 사는 곳)

```
#6 범위 차단     → SettingsStore(신규) + AppContext.handleTraffic에서 제외 호스트 skip
#11 마스킹       → Exporter (toHar/toCurl/toMarkdown 앞단 순수함수)
#1 필터+검색     → Renderer 전용 (TrafficFilterBar + useTrafficFilter 훅)
```

## #6 캡처 범위 필터

- **SettingsStore** (신규): `RecordStore`에 `settings(key TEXT PRIMARY KEY, value TEXT)` 테이블을 추가하고 `getSetting/setSetting` 메서드 제공. 제외 도메인은 `excludeDomains` 키에 JSON 배열로 저장.
- **glob 매칭**: `*.google-analytics.com` 같은 와일드카드 패턴 지원. `matchExcludeDomain(host, patterns)` 순수함수로 분리.
- **AppContext.handleTraffic**: 캡처된 트래픽의 host가 제외 패턴에 매칭되면 `insertTraffic`·broadcast 모두 skip → DB·화면 둘 다 깨끗. 중계는 ProxyEngine이 정상 수행하므로 대상 앱은 안 깨짐.
- **설정 UI**: 툴바에 ⚙️ 버튼 → 설정 Drawer에서 제외 도메인 목록 add/remove.

> 설정 저장 방식은 SQLite key-value 테이블 채택 (의존성 0, 기존 DB 재사용). JSON 파일/electron-store 대안은 의존성·IO 계층이 늘어 제외.

## #11 민감정보 마스킹

- **Exporter**에 `maskSensitiveHeaders(headers)` 순수함수 추가. 고정 민감 헤더 세트(소문자 비교):
  `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `x-csrf-token`
  → 값을 `***REDACTED***`로 치환.
- `toHar`/`toCurl`/`toMarkdown` 세 변환 함수가 요청·응답 헤더를 출력하기 직전 이 함수를 거친다.
- **내보내기는 항상 마스킹** (안전 기본값). 화면 표시는 원본 유지 — 디버깅은 그대로, 공유만 안전.
- 순수함수라 단위 테스트 용이.

## #1 필터 + 검색

- **TrafficFilterBar** 컴포넌트 (TrafficTable 위): 도메인 입력 / 메서드 멀티선택 / 상태코드 2xx·3xx·4xx·5xx 토글 / 검색어 입력 / 결과 건수 표시 / 초기화 버튼.
- **useTrafficFilter** 훅: `records`를 `useMemo`로 필터링. URL·경로 부분일치(대소문자 무시), 메서드 정확 일치, 상태코드 대역 매칭, 도메인 부분일치.
- 실시간 녹화 중에도 동작 — 필터는 라이브 업데이트되는 records 배열에 그대로 적용.
- `filterTraffic(records, filter)` 순수함수로 핵심 로직 분리 → 단위 테스트.

## 데이터 / IPC

- `RecordStore`: `settings` 테이블 + `getSetting(key)`, `setSetting(key, value)`.
- 신규 IPC 채널:
  - `settings:get-exclude-domains` → `string[]`
  - `settings:set-exclude-domains(domains: string[])` → `string[]`
- preload `api`에 `getExcludeDomains`, `setExcludeDomains` 추가.

## 타입 (shared/types.ts 추가)

```typescript
export type TrafficFilter = {
  domain: string;          // 부분일치, '' = 전체
  methods: string[];       // 빈 배열 = 전체
  statusClasses: number[]; // [2,3,4,5] 중 선택, 빈 배열 = 전체
  search: string;          // URL/경로 부분일치
};
```

## 에러 처리

- 제외 도메인 패턴이 비어있거나 공백이면 무시(저장 시 trim·필터링).
- 설정 로드 실패 시 빈 배열로 폴백(앱은 정상 동작).
- 필터는 순수 클라이언트 연산이라 실패 지점 없음.

## 테스트 전략

- **단위 (순수함수 TDD)**:
  - `maskSensitiveHeaders` — 헤더 치환, 대소문자 무시, 비민감 헤더 보존
  - `matchExcludeDomain` — glob 와일드카드, 정확 일치, 비매칭
  - `filterTraffic` — 도메인/메서드/상태/검색어 조합
- **통합 (node:sqlite)**:
  - SettingsStore CRUD (get/set/기본값)
- **회귀**: 기존 exporter 테스트 — 마스킹 적용 후 비민감 필드 보존 확인.

## 범위 밖 (이번 Phase 제외)

- 본문 텍스트 검색 (#1의 상위 옵션) — 추후
- 화면 표시 마스킹 토글 — 추후
- 사용자 정의 마스킹 패턴 — 추후
