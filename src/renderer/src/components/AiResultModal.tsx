import { Modal, Spin, Typography } from 'antd';

type AiResultModalProps = {
  open: boolean;
  title: string;
  loading: boolean;
  text: string;
  onClose: () => void;
};

/** AI 결과(설명/이상탐지/테스트/검색)를 텍스트로 표시하는 공용 모달. */
export const AiResultModal = ({ open, title, loading, text, onClose }: AiResultModalProps) => (
  <Modal title={title} open={open} onCancel={onClose} footer={null} width={680}>
    {loading ? (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="Claude가 분석 중…" />
      </div>
    ) : (
      <Typography.Paragraph
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 480, overflow: 'auto' }}
      >
        {text}
      </Typography.Paragraph>
    )}
  </Modal>
);
