# 레이아웃 리사이즈 · 대용량 본문 · 값 표기 · 다크 선택 강조 설계

작성일: 2026-06-04

## 배경

메인 화면(`App.tsx`)에서 다음 문제가 보고됨:

1. **화면 아래 잘림** — 트래픽 테이블 본문이 창 하단을 넘어 잘림.
2. **좌우 패널 폭 고정** — 세션목록·상세 패널 폭을 조절할 수 없음.
3. **헤더 값 잘림** — 상세 패널 헤더 값이 ellipsis로 잘려 긴 값(토큰·etag 등)을 못 읽음.
4. **대용량 본문 프리징** — 10MB+ 응답 본문에서 렌더러가 멈춤.
5. **다크모드 선택 강조 약함** — 선택된 항목 색상이 배경과 거의 구분 안 됨.

참고: `~/Dev/swagger-man`의 `ResponsePaneView.swift`는 본문 1MB 초과 시 `prefix(1_000_000) + "...(truncated)"`로 잘라 렌더해 프리징을 회피한다. 본 설계는 같은 전략을 채택하되 임계치를 올리고 "전체 보기" 탈출구를 둔다.

## 범위

`src/renderer/` 한정. main/preload/IPC 변경 없음.

## 설계

### ① 화면 잘림 수정 — `TrafficTable`

- 현재 `scroll={{ y: 'calc(100vh - 160px)' }}`(`TrafficTable.tsx:87`)는 툴바 줄바꿈·업데이트 배너로 상단 높이가 바뀌면 가정이 깨져 본문이 창 밖으로 넘침.
- 부모 컨테이너 높이를 `ResizeObserver`로 측정하는 훅 `useElementHeight(ref): number`를 신설.
- `App.tsx`의 테이블 래퍼(`flex:1, overflow:auto`)에 ref를 달고, 측정 높이를 `TrafficTable`에 prop으로 전달 → `scroll={{ y: measuredHeight }}` (숫자).
- 가상 테이블이 항상 가용 영역에 정확히 맞고, 배너/줄바꿈과 무관해짐.

### ② 좌우 리사이즈 — antd `Splitter`

- `App.tsx`의 콘텐츠 행(`<div style={{display:'flex', flex:1 ...}}>`)을 antd `<Splitter>`로 교체. 3패널: 세션목록 / 가운데(테이블+필터) / 상세.
- 각 `Splitter.Panel`에 `min`/`max` 클램프(예: 세션목록 200~480, 상세 320~720).
- `onResizeEnd`(또는 `onResize`)에서 폭을 `localStorage`에 저장: `hpr.layout.sidebarW`, `hpr.layout.detailW`. 마운트 시 복원, 없으면 기본값(300 / 480).
- `SessionSidebar.tsx:37`의 고정 `width:300`, `App.tsx:326`의 상세 `width:480` 제거 → 폭은 Splitter가 제어.
- 가운데 패널은 가변(나머지 차지).

### ③ 값 표기 — `TrafficDetail` 헤더 테이블

- 값 컬럼 `{ title: '값', dataIndex: 'value', ellipsis: true }`(`TrafficDetail.tsx:60,92`)에서 `ellipsis` 제거.
- `render`로 `style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}` 줄바꿈 표시 + 값 옆 작은 복사 버튼(antd `Typography.Text copyable` 또는 `CopyOutlined`).
- 패널을 넓히면 더 잘 읽힘(②와 시너지).

### ④ 대용량 본문 — `BodyViewer`

- 순수 함수 `bodyRenderPolicy(byteLength, forceFull): { mode: 'normal' | 'truncated', renderLength: number }`를 분리(테스트 대상).
- 임계치 `RENDER_LIMIT = 2 * 1024 * 1024` (2MB).
- 본문 길이 > 임계치 && !forceFull 일 때:
  - JSON 트리/Pretty 자동 파싱 **비활성**(파싱·stringify 비용 회피), 모드 강제 `raw`.
  - 경고 배지: `"{N} MB — 일부만 표시"`.
  - Raw `<pre>`는 앞 `RENDER_LIMIT`바이트만 + `\n…(잘림)`.
  - 버튼: **[전체 보기]**(`forceFull=true`로 재렌더) / **[원본 저장]**(파일 저장; 기존 export/save 경로 재사용 가능하면 그것, 아니면 Blob 다운로드).
- 임계치 이하: 기존 동작 그대로.

### ⑤ 다크모드 선택 강조 — `index.css` + `ConfigProvider`

요건: 선택 표기가 **충분히 또렷**해야 하고, 동시에 그 위의 **글씨가 잘 보여야** 함(배경만 진하게 해서 텍스트가 묻히면 안 됨).

- 다크 `--app-selected: #111a2c`(`index.css:60`)는 배경 `#141414`과 거의 동일 → 또렷한 파랑 틴트로 상향(예: `#15395b`/`#1a3a5c` 계열). 너무 밝히면 흰 글씨가 묻히므로, 선택 배경 위 텍스트가 WCAG AA(대비 ≥ 4.5:1) 충족하는 톤으로 선정.
- 보조 식별: 선택 행 좌측 강조 보더(`box-shadow: inset 2px 0 0 #1668dc` 또는 left border)로 배경색에만 의존하지 않게.
- 선택 행 텍스트 색을 명시(`color: var(--app-text)` 유지/강화)해, 배경이 진해져도 가독 유지. 필요 시 선택 행 전용 `--app-selected-text` 변수 추가.
- antd `Select`/리스트 드롭다운 선택 항목도 또렷하도록 `ConfigProvider` 다크 토큰 `controlItemBgActive`(및 hover) 보정. 라이트는 현행 유지.
- 검증: 선택/비선택 대비 눈으로 확실히 구분 + 선택 행 글씨 또렷 확인.

## 검증

- ①②③⑤: 앱 실행 수동 확인(`make dev`). 창 리사이즈·배너 표시·툴바 줄바꿈 상태에서 잘림 없는지, 드래그로 폭 조절·재시작 후 유지, 긴 헤더 값 가독, 다크 선택 행이 또렷하게 구분되고 그 위 글씨도 잘 보이는지.
- ④: `bodyRenderPolicy` 경계값 단위테스트(임계치 직하/직상/forceFull). 2MB+ 합성 본문으로 프리징 없는지 수동 확인.

## 비범위 (YAGNI)

- 본문 가상 스크롤 전체 렌더(②의 전체보기로 갈음).
- 패널 폭 settings(메인) 영속화 — localStorage로 충분.
- 상하 분할 리사이즈.
