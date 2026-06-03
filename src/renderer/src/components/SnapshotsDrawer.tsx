import { useEffect, useState } from 'react';
import { Button, Drawer, List, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';
import { DiffView } from './DiffView';
import type { Snapshot, SnapshotVerifyResult } from '../../../shared/types';

type SnapshotsDrawerProps = { open: boolean; onClose: () => void };

export const SnapshotsDrawer = ({ open, onClose }: SnapshotsDrawerProps) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [results, setResults] = useState<Record<number, SnapshotVerifyResult>>({});
  const [verifying, setVerifying] = useState<number | null>(null);

  useEffect(() => {
    if (open) void ipc.listSnapshots().then(setSnapshots);
  }, [open]);

  const verify = async (id: number) => {
    setVerifying(id);
    try {
      const result = await ipc.verifySnapshot(id);
      setResults((previous) => ({ ...previous, [id]: result }));
      if (result.passed) void message.success('스냅샷 검증 통과');
      else void message.warning('스냅샷과 응답이 달라요');
    } catch (caught) {
      void message.error(caught instanceof Error ? caught.message : '검증 실패');
    } finally {
      setVerifying(null);
    }
  };

  const remove = async (id: number) => {
    setSnapshots(await ipc.deleteSnapshot(id));
  };

  return (
    <Drawer title="스냅샷" open={open} onClose={onClose} width={520}>
      <List
        dataSource={snapshots}
        locale={{ emptyText: '저장된 스냅샷이 없어요' }}
        renderItem={(snapshot) => {
          const result = results[snapshot.id];
          return (
            <List.Item
              actions={[
                <Button
                  key="verify"
                  size="small"
                  loading={verifying === snapshot.id}
                  onClick={() => void verify(snapshot.id)}
                >
                  검증
                </Button>,
                <Button
                  key="del"
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => void remove(snapshot.id)}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {snapshot.method} {snapshot.path}{' '}
                    {result &&
                      (result.passed ? (
                        <Tag icon={<CheckCircleOutlined />} color="success">
                          통과
                        </Tag>
                      ) : (
                        <Tag icon={<CloseCircleOutlined />} color="error">
                          실패
                        </Tag>
                      ))}
                  </span>
                }
                description={
                  <>
                    <Typography.Text type="secondary">
                      {new Date(snapshot.savedAt).toLocaleString('ko-KR')}
                    </Typography.Text>
                    {result && !result.passed && (
                      <div style={{ marginTop: 8 }}>
                        {result.comparison.statusChanged && (
                          <Tag color="red">
                            {result.comparison.statusA} → {result.comparison.statusB}
                          </Tag>
                        )}
                        <DiffView diff={result.comparison.bodyDiff} />
                      </div>
                    )}
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
    </Drawer>
  );
};
