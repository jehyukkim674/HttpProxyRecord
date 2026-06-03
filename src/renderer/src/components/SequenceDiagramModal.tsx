import { useMemo } from 'react';
import { Button, Modal, Typography, message } from 'antd';
import { toMermaidSequence } from '../../../shared/sequenceDiagram';
import { ipc } from '../services/ipc';
import type { TrafficRecord } from '../../../shared/types';

type Props = { open: boolean; records: TrafficRecord[]; onClose: () => void };

export const SequenceDiagramModal = ({ open, records, onClose }: Props) => {
  const [messageApi, holder] = message.useMessage();
  const mermaid = useMemo(() => toMermaidSequence(records), [records]);

  const copy = async () => {
    await ipc.copyToClipboard(mermaid);
    void messageApi.success('Mermaid 소스를 복사했어요');
  };

  return (
    <Modal title="시퀀스 다이어그램 (Mermaid)" open={open} onCancel={onClose} footer={null} width={720}>
      {holder}
      <Typography.Paragraph type="secondary">
        아래 소스를 mermaid.live 또는 마크다운에 붙여넣어 렌더하세요.
      </Typography.Paragraph>
      <Button size="small" onClick={() => void copy()} style={{ marginBottom: 8 }}>
        복사
      </Button>
      <pre
        style={{
          background: '#fafafa',
          padding: 12,
          borderRadius: 4,
          maxHeight: 480,
          overflow: 'auto',
          fontSize: 12,
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {mermaid}
      </pre>
    </Modal>
  );
};
