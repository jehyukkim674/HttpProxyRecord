import type { BrowserWindow } from 'electron';
import type { AppContext } from './appContext';
import { EV } from '../shared/channels';
import { registerRecordingHandlers } from './ipc/recordingHandlers';
import { registerReplayInterceptionHandlers } from './ipc/replayInterceptionHandlers';
import { registerExportHandlers } from './ipc/exportHandlers';
import { registerComposerSnapshotHandlers } from './ipc/composerSnapshotHandlers';
import { registerAiHandlers } from './ipc/aiHandlers';
import { registerScriptHandlers } from './ipc/scriptHandlers';
import { registerGuideHandlers } from './ipc/guideHandlers';

/**
 * 모든 IPC 채널을 등록한다.
 * 도메인별 모듈(ipc/*Handlers)로 분리했고, 각 핸들러는 handle() 래퍼로 에러를 로깅한다.
 * Main→Renderer 푸시(트래픽/브레이크포인트)는 여기서 broadcaster로 연결한다.
 */
export const registerIpcHandlers = (context: AppContext, getWindow: () => BrowserWindow | null): void => {
  context.setBroadcaster((record) => {
    getWindow()?.webContents.send(EV.traffic, record);
  });
  context.setBreakpointBroadcaster((hit) => {
    getWindow()?.webContents.send(EV.breakpointHit, hit);
  });
  context.setScriptLogBroadcaster((entry) => {
    getWindow()?.webContents.send(EV.scriptLog, entry);
  });

  registerRecordingHandlers(context);
  registerReplayInterceptionHandlers(context);
  registerExportHandlers(context);
  registerComposerSnapshotHandlers(context);
  registerAiHandlers(context);
  registerScriptHandlers(context);
  registerGuideHandlers(context);
};
