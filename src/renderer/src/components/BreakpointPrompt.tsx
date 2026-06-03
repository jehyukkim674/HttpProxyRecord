import { useEffect, useState } from 'react';
import { Button, Modal, Space, Typography } from 'antd';
import { ipc } from '../services/ipc';

type BreakpointHit = { id: number; method: string; url: string };

/** 브레이크포인트에 걸린 요청을 순차로 보여주고 통과/차단을 받는다 (#3). */
export const BreakpointPrompt = () => {
  const [queue, setQueue] = useState<BreakpointHit[]>([]);

  useEffect(() => {
    const unsubscribe = ipc.onBreakpoint((hit) => {
      setQueue((previous) => [...previous, hit]);
    });
    return unsubscribe;
  }, []);

  const current = queue[0] ?? null;

  const resolve = (action: 'forward' | 'block') => {
    if (!current) return;
    void ipc.resolveBreakpoint(current.id, action);
    setQueue((previous) => previous.slice(1));
  };

  return (
    <Modal
      title="브레이크포인트 — 요청 일시정지"
      open={current !== null}
      closable={false}
      maskClosable={false}
      footer={
        <Space>
          <Button danger onClick={() => resolve('block')}>
            차단
          </Button>
          <Button type="primary" onClick={() => resolve('forward')}>
            통과
          </Button>
        </Space>
      }
    >
      {current && (
        <>
          <Typography.Paragraph>
            <Typography.Text strong>{current.method}</Typography.Text> 요청이 일시정지되었습니다.
          </Typography.Paragraph>
          <Typography.Text code style={{ wordBreak: 'break-all' }}>
            {current.url}
          </Typography.Text>
          {queue.length > 1 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              대기 중 {queue.length - 1}건 더
            </Typography.Paragraph>
          )}
        </>
      )}
    </Modal>
  );
};
