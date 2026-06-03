import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { log } from '../logger';

/**
 * ipcMain.handle 래퍼 — 핸들러에서 throw/reject되면 로깅 후 렌더러로 전달한다.
 * (렌더러는 메시지를 사용자에게 표시하고, main은 진단 로그를 남긴다)
 */
export const handle = <Args extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R,
): void => {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      log.error(`IPC '${channel}' 처리 실패`, error);
      throw error;
    }
  });
};
