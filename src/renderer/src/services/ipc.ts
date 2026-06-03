/**
 * 렌더러의 IPC 진입점.
 *
 * preload가 contextBridge로 노출한 `window.api`(타입: RendererApi)를 그대로 가리킨다.
 * 메서드 시그니처의 단일 소스는 preload(`src/preload/index.ts`)이므로, 채널을 추가/변경할 때
 * 이 파일은 손댈 필요가 없다. 컴포넌트는 전역 `window.api` 대신 이 `ipc`만 import 한다.
 * (preload는 렌더러 스크립트보다 먼저 실행되므로 `window.api`는 이 시점에 항상 존재한다.)
 */
export const ipc = window.api;
