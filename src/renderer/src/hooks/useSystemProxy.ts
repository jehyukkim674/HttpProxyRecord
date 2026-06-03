import { useCallback, useState } from 'react';
import { message } from 'antd';
import { ipc } from '../services/ipc';

type MessageApi = ReturnType<typeof message.useMessage>[0];

/** 시스템 프록시 토글 + 루트 인증서 설치. enabled 상태를 소유한다. */
export const useSystemProxy = (messageApi: MessageApi) => {
  const [enabled, setEnabled] = useState(false);

  const toggle = useCallback(
    async (next: boolean) => {
      try {
        if (next) {
          await ipc.enableSystemProxy();
          setEnabled(true);
          void messageApi.success('시스템 프록시를 등록했어요');
        } else {
          await ipc.disableSystemProxy();
          setEnabled(false);
          void messageApi.info('시스템 프록시를 해제했어요');
        }
      } catch (caught) {
        void messageApi.error(caught instanceof Error ? caught.message : '시스템 프록시 설정 실패');
      }
    },
    [messageApi],
  );

  const installCert = useCallback(async () => {
    const result = await ipc.installCert();
    if (result.ok) {
      void messageApi.success(result.message);
    } else {
      void messageApi.warning(result.message);
    }
  }, [messageApi]);

  return { enabled, setEnabled, toggle, installCert };
};
