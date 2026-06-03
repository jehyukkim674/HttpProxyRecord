import { useEffect, useState } from 'react';
import { Empty, Modal, Spin } from 'antd';
import { ipc } from '../services/ipc';

type Source = { id: string; name: string; thumbnail: string };
type Props = { open: boolean; onPick: (sourceId: string) => void; onClose: () => void };

export const SourcePickerModal = ({ open, onPick, onClose }: Props) => {
  const [sources, setSources] = useState<Source[] | null>(null);

  useEffect(() => {
    if (!open) {
      setSources(null);
      return;
    }
    void ipc
      .listCaptureSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, [open]);

  return (
    <Modal title="캡처할 화면/창 선택" open={open} onCancel={onClose} footer={null} width={720}>
      {sources === null ? (
        <Spin />
      ) : sources.length === 0 ? (
        <Empty description="소스 없음 — macOS 화면 기록 권한을 확인하세요" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {sources.map((source) => (
            <div
              key={source.id}
              onClick={() => onPick(source.id)}
              style={{ cursor: 'pointer', border: '1px solid #eee', borderRadius: 6, padding: 6 }}
            >
              <img src={source.thumbnail} alt={source.name} style={{ width: '100%', borderRadius: 4 }} />
              <div
                style={{
                  fontSize: 12,
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {source.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
