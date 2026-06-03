# 캡처 가이드 빌더 설계 (Screenshot → Annotated Manual)

> 상태: 승인됨 (2026-06-04). v1에 블러 포함, 즉시 구현.

## 개요

화면/창을 캡처해 번호 네모박스 + 설명(+민감정보 블러)으로 주석을 달고, 여러 스텝을
모아 **HTML 가이드 문서**로 내보내는 기능. swagger-man처럼 "잘 만든 도구"를 지향하되,
캡처→주석→매뉴얼 흐름은 새로 설계.

## 흐름

```
[캡처 추가] → 창/화면 선택(desktopCapturer 썸네일 목록)
  → 렌더러 getUserMedia(chromeMediaSourceId) 1프레임 → 캔버스 → PNG dataURL
  → 스텝 추가
편집 → 이미지 위 드래그로 네모박스 생성(자동 번호) → 설명 입력, 박스/블러 토글, 이동
[HTML 내보내기] → 각 스텝 캔버스 평탄화(이미지+박스 테두리+번호, 블러영역 실제 블러)
  → buildGuideHtml(순수) → 자체완결 HTML 파일 저장
```

## 데이터 모델 (shared/types)

```ts
export type GuideBox = {
  id: string; x: number; y: number; w: number; h: number; // 0~1 비율 좌표(해상도 독립)
  number: number; description: string; kind: 'box' | 'blur';
};
export type GuideStep = { id: string; imageDataUrl: string; boxes: GuideBox[]; caption?: string };
export type Guide = { id: number; title: string; steps: GuideStep[]; createdAt: string };
export type GuideSummary = { id: number; title: string; createdAt: string; stepCount: number };
```

좌표는 0~1 비율로 저장(평탄화·표시 시 실제 픽셀로 환산) → 해상도 독립.

## 저장 (RecordStore)

```sql
CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
);
```
- `data` = JSON.stringify({ steps }) (이미지 base64 포함).
- `saveGuide({id?, title, steps})`(upsert) / `listGuides()→GuideSummary[]` / `getGuide(id)→Guide|null` / `deleteGuide(id)`.

## 순수 로직 (테스트 대상)

`src/shared/guide.ts`:
- `nextBoxNumber(boxes): number` — max+1 (삭제 후에도 안전).
- `buildGuideHtml(title, steps): string` — steps = [{imageDataUrl(평탄화), boxes:[{number,description}]}].
  자체완결 HTML: 제목 + 각 스텝(이미지 + ①②③ 설명 ol). 이미지는 dataURL 임베드.

## 아키텍처

- **Main**: `capture:list-sources` → `desktopCapturer.getSources({types:['screen','window'], thumbnailSize})` → [{id,name,thumbnail(dataURL)}]. guide IPC는 RecordStore 위임. `guide:export-html(title, html)` → dialog.showSaveDialog + writeFile.
- **Renderer 캡처**: 소스 선택 → `navigator.mediaDevices.getUserMedia({video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:id}}})` → `<video>` 1프레임 → canvas drawImage → toDataURL('image/png'). 스트림 트랙 즉시 stop.
- **에디터**: 이미지 위 절대배치 div 오버레이. 드래그로 박스 생성, 번호 뱃지, 우측 설명 패널. 블러 박스는 `backdrop-filter: blur(6px)` 미리보기.
- **평탄화/내보내기**: 캔버스에 이미지 → 각 박스(테두리+번호 원), 블러 박스는 해당 영역만 `ctx.filter='blur'`로 다시 그림 → toDataURL. flattenedSteps로 `buildGuideHtml` → `guide:export-html`.

## IPC (shared/channels)

`capture:list-sources` · `guide:list` · `guide:get` · `guide:save` · `guide:delete` · `guide:export-html`

## 컴포넌트 (renderer)

- `useGuides` 훅 — list/get/save/delete + captureSource(id)→dataURL + listSources.
- `SourcePickerModal` — desktopCapturer 썸네일 그리드 선택.
- `GuideBuilderDrawer` — 좌(가이드/스텝 목록) 중(박스 에디터) 우(설명 패널), 캡처추가·내보내기.
- 팔레트 커맨드 "가이드 만들기".

## 안전/주의

- macOS 화면기록 권한 1회. getUserMedia 실패 시 graceful 에러 안내.
- 블러는 평탄화 시 실제 픽셀 블러 → 토큰/PII 가림(프록시 툴에 유용).
- base64 이미지가 커질 수 있음 — 실사용 범위(수십 스텝) 가정.

## 테스트

- 순수: `nextBoxNumber`, `buildGuideHtml`(스텝/번호목록/이미지 임베드 구조).
- RecordStore guides CRUD(인메모리 임시 DB).
- 캡처/캔버스 합성은 시각 검증(스모크 — 권한 필요로 자동화 한계).

## 태스크 (6)

1. 타입 + RecordStore guides CRUD (+테스트)
2. `buildGuideHtml` + `nextBoxNumber` (+테스트)
3. Main: capture:list-sources + guide 핸들러 + export-html + AppContext
4. 채널 + preload
5. 렌더러: useGuides + SourcePickerModal + GuideBuilderDrawer + 팔레트
6. 게이트 + 커밋 + 메모리
