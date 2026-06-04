import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { ipc } from '../services/ipc';
import type { UpdateCheck } from '../../../shared/types';

type MessageApi = ReturnType<typeof message.useMessage>[0];

export type AvailableUpdate = { version: string; notes?: string; canAutoInstall: boolean };

/**
 * 자동 업데이트 훅 (swagger-man updater UX 이식).
 * 시작 시 1회 자동 확인 + 수동 확인 버튼 + 업데이트 배너 상태를 제공한다.
 */
export const useUpdate = (messageApi: MessageApi) => {
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const applyResult = useCallback(
    (result: UpdateCheck, manual: boolean) => {
      if (result.kind === 'available') {
        setAvailable({ version: result.version, notes: result.notes, canAutoInstall: result.canAutoInstall });
        if (manual) void messageApi.success(`새 버전 v${result.version} 사용 가능`);
      } else if (result.kind === 'latest') {
        if (manual) void messageApi.success('최신 버전입니다');
      } else if (manual) {
        void messageApi.error(`업데이트 확인 실패: ${result.message}`);
      }
    },
    [messageApi],
  );

  // 시작 시 자동 확인 (실패는 조용히 무시 — 오프라인/개발 모드 등)
  useEffect(() => {
    ipc
      .checkUpdate()
      .then((result) => applyResult(result, false))
      .catch(() => undefined);
  }, [applyResult]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      applyResult(await ipc.checkUpdate(), true);
    } catch (error) {
      void messageApi.error(`업데이트 확인 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setChecking(false);
    }
  }, [applyResult, messageApi]);

  const install = useCallback(async () => {
    setInstalling(true);
    try {
      await ipc.installUpdate();
      // 무서명 macOS 등 자동 설치 불가 → 릴리스 페이지를 브라우저로 열었음을 안내
      if (available && !available.canAutoInstall) {
        void messageApi.info('브라우저에서 최신 버전을 내려받아 교체해 주세요');
      }
    } catch (error) {
      void messageApi.error(`설치 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstalling(false);
    }
  }, [available, messageApi]);

  const dismiss = useCallback(() => setAvailable(null), []);

  return { available, checking, installing, check, install, dismiss };
};
