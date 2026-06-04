import type { UpdateCheck } from '../../shared/types';
import { log } from '../logger';

const RELEASES_URL = 'https://github.com/jehyukkim674/HttpProxyRecord/releases/latest';

/** x.y.z 단순 비교 — latest가 current보다 높으면 true (앞의 v 접두사 무시). */
export const isNewerVersion = (latest: string, current: string): boolean => {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [a = 0, b = 0, c = 0] = parse(latest);
  const [x = 0, y = 0, z = 0] = parse(current);
  if (a !== x) return a > x;
  if (b !== y) return b > y;
  return c > z;
};

export type UpdateInfo = { version: string; notes?: string };
export type UpdateChecker = () => Promise<UpdateInfo | null>;

/**
 * 업데이트 확인 결과를 상태(available/latest/error)로 매핑한다. (순수 — checker 주입으로 테스트 가능)
 *
 * 무서명 macOS는 electron-updater(Squirrel.Mac)가 코드 서명을 요구해 자동 설치가 불가하므로
 * canAutoInstall=false로 표시한다(설치 대신 릴리스 페이지 안내). Windows(NSIS)는 자동 설치 가능.
 */
export const resolveUpdateCheck = async (check: UpdateChecker, platform: string): Promise<UpdateCheck> => {
  try {
    const info = await check();
    if (!info) return { kind: 'latest' };
    return {
      kind: 'available',
      version: info.version,
      notes: info.notes,
      canAutoInstall: platform === 'win32',
    };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
};

/** electron-updater의 releaseNotes(string | ReleaseNoteInfo[] | null)를 평문으로 정리한다. */
const normalizeNotes = (notes: unknown): string | undefined => {
  if (!notes) return undefined;
  const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '').trim();
  if (typeof notes === 'string') return stripHtml(notes) || undefined;
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) =>
        n && typeof n === 'object' && 'note' in n ? String((n as { note?: unknown }).note ?? '') : '',
      )
      .filter(Boolean)
      .join('\n\n');
    return stripHtml(text) || undefined;
  }
  return undefined;
};

/** 자동 업데이트 확인/설치 (swagger-man updater 패턴의 Electron 이식). */
export class UpdateManager {
  /** 새 버전이 있는지 확인한다. 개발 모드에선 확인하지 않는다(latest). */
  async check(): Promise<UpdateCheck> {
    const { app } = await import('electron');
    if (!app.isPackaged) return { kind: 'latest' };
    return resolveUpdateCheck(async () => {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      if (!version || !isNewerVersion(version, app.getVersion())) return null;
      return { version, notes: normalizeNotes(result?.updateInfo?.releaseNotes) };
    }, process.platform);
  }

  /**
   * Windows: 업데이트를 내려받고 재시작하며 설치한다.
   * macOS(무서명): 자동 설치가 불가하므로 릴리스 다운로드 페이지를 연다.
   */
  async install(): Promise<void> {
    const { app, shell } = await import('electron');
    if (process.platform === 'win32' && app.isPackaged) {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = false;
      await new Promise<void>((resolve, reject) => {
        autoUpdater.once('update-downloaded', () => resolve());
        autoUpdater.once('error', (err) => reject(err instanceof Error ? err : new Error(String(err))));
        void autoUpdater.downloadUpdate();
      });
      log.info('업데이트 다운로드 완료 — 재시작 후 설치');
      setImmediate(() => autoUpdater.quitAndInstall());
      return;
    }
    log.info('무서명 빌드 — 릴리스 페이지로 안내', { platform: process.platform });
    await shell.openExternal(RELEASES_URL);
  }
}
