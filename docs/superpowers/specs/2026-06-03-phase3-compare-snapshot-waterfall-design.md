# Phase 3 설계: 세션 비교 / 스냅샷 테스트 / 워터폴 뷰

**작성일:** 2026-06-03
**상태:** 승인됨
**대상 기능:** #25 세션 간 비교, #26 응답 스냅샷 테스트, #27 타임라인/워터폴 뷰

## 개요

회귀/비교 테스트 subsystem. 두 세션의 응답을 대조해 회귀를 찾고(#25), 골든 응답을
저장해 두었다가 재전송으로 검증하며(#26), 요청의 동시성·순서를 시각화한다(#27).
#25·#26은 공통 라인 diff 로직을 공유한다.

| 기능 | 핵심 결정 |
|------|-----------|
| #25 세션 비교 | `METHOD 경로`(쿼리 제외) 매칭, 상태코드 + 본문 라인 diff |
| #26 스냅샷 | 골든 저장 → RequestSender 재전송 → diff (Phase 2 재사용) |
| #27 워터폴 | 기존 timestamp+durationMs의 순수 시각화 (탭 토글) |

## 아키텍처

```
Shared(순수,TDD):  diffLines(LCS) + compareResponses + matchByMethodPath + buildSessionComparison
Main:              RecordStore.snapshots 테이블 + snapshot 검증(RequestSender 재전송)
Renderer:          WaterfallView(탭) + SessionCompareModal + SnapshotsDrawer
```

## Shared — 순수함수 (TDD)

- `diffLines(a: string, b: string): LineDiff[]` — LCS 기반 라인 단위 diff. 각 라인을 `same|added|removed`로 분류.
- `compareResponses(a, b): ResponseComparison` — 상태코드 변경 여부 + 본문 `diffLines`. #25·#26 공통.
- `matchByMethodPath(records): Map<string, TrafficRecord>` — 키 `${method} ${path쿼리제외}`, 첫 기록 우선.
- `buildSessionComparison(rowsA, rowsB): SessionComparisonRow[]` — 두 세션 매칭. 짝별 상태: `same`(동일) / `changed`(상태·본문 차이) / `onlyA` / `onlyB`. 키 정렬.

## #25 세션 비교

- 툴바 "세션 비교" 버튼 → `SessionCompareModal`.
- 모달에서 세션 A·B 선택(Select) → `buildSessionComparison` 결과 테이블.
- 행: 키 + 상태 배지(동일/변경/A만/B만). `changed` 행 펼치면 라인 diff(추가=초록, 삭제=빨강) 표시.
- 데이터는 각 세션의 `listTraffic`을 IPC로 받아 렌더러에서 비교(순수함수).

## #26 스냅샷 테스트

- 상세 패널(TrafficDetail)에 "스냅샷 저장" 버튼 → 현재 트래픽을 `snapshots`에 저장(method, path, statusCode, body).
- 툴바 "스냅샷" 버튼 → `SnapshotsDrawer`: 저장된 스냅샷 목록(method+path, 저장시각), 각 항목 "검증"/"삭제".
- "검증": 스냅샷의 `https?://{host}{path}`를... 단, 스냅샷에는 host가 없으므로 **저장 시 전체 URL도 보관**한다(아래 타입에 url 추가). RequestSender로 재전송 → `compareResponses(snapshot, live)` → 통과(차이 없음)/실패 + diff 표시.

## #27 워터폴 뷰

- 트래픽 영역 상단에 `테이블 | 워터폴` 탭(Segmented). 기본 테이블.
- 워터폴: 선택 세션 레코드들을 시간축에 배치. 최소 시작시각(min timestamp) 기준 각 막대의 left=시작 오프셋(ms→px 스케일), width=durationMs. 행 라벨 `METHOD path`, 막대 색=상태코드 대역.
- 순수 시각화 — 기존 records 데이터만 사용, 신규 백엔드 없음. `computeWaterfallRows(records)` 순수함수로 left/width 계산.

## 저장 / IPC

- `RecordStore`: `snapshots(id INTEGER PK, method TEXT, path TEXT, url TEXT, status_code INTEGER, body TEXT, saved_at TEXT)` + `saveSnapshot`, `listSnapshots`, `deleteSnapshot`.
- IPC:
  - `snapshot:save(record: TrafficRecord)` → Snapshot
  - `snapshot:list` → Snapshot[]
  - `snapshot:delete(id)` → Snapshot[]
  - `snapshot:verify(id)` → SnapshotVerifyResult (RequestSender 재전송 + compareResponses)

## 타입 (shared/types.ts 추가)

```typescript
export type LineDiff = { type: 'same' | 'added' | 'removed'; text: string };

export type ResponseComparison = {
  statusChanged: boolean;
  statusA: number;
  statusB: number;
  bodyDiff: LineDiff[];
};

export type SessionComparisonRow = {
  key: string;
  status: 'same' | 'changed' | 'onlyA' | 'onlyB';
  comparison: ResponseComparison | null;
};

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

## 에러 처리

- 세션 비교: 한쪽이라도 트래픽 0건이면 안내 메시지.
- 스냅샷 검증: 재전송 실패(네트워크) 시 실패로 처리하고 에러 메시지.
- 워터폴: records 0건이면 빈 상태 안내. durationMs=0은 최소 1px 너비.

## 테스트 전략

- **단위(순수)**: `diffLines`(추가/삭제/동일/혼합), `compareResponses`(상태변경·본문차이), `buildSessionComparison`(same/changed/onlyA/onlyB), `computeWaterfallRows`(오프셋/너비 스케일)
- **통합**: Snapshots store CRUD, snapshot verify(로컬 서버 재전송 후 pass/fail)
- **E2E**: 워터폴 탭 전환, 세션 2개 비교 모달, 스냅샷 저장→검증

## 범위 밖

- 단어/문자 단위 diff — 라인 단위로 충분
- 워터폴 줌/스크롤 인터랙션 — 단순 배치로 시작
- 스냅샷 자동 스케줄 검증 — 수동 검증만
