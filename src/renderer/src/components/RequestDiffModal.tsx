import { Empty, Modal, Tag, Typography } from 'antd';
import { compareResponses } from '../../../shared/diff';
import { DiffView } from './DiffView';
import type { TrafficRecord } from '../../../shared/types';

type RequestDiffModalProps = {
  open: boolean;
  recordA: TrafficRecord | null;
  recordB: TrafficRecord | null;
  onClose: () => void;
};

export const RequestDiffModal = ({ open, recordA, recordB, onClose }: RequestDiffModalProps) => {
  const comparison =
    recordA && recordB
      ? compareResponses(
          { statusCode: recordA.statusCode, body: recordA.responseBody ?? '' },
          { statusCode: recordB.statusCode, body: recordB.responseBody ?? '' },
        )
      : null;

  return (
    <Modal title="두 요청 비교" open={open} onCancel={onClose} width={760} footer={null}>
      {recordA && recordB && comparison ? (
        <>
          <Typography.Paragraph>
            <Tag color="blue">A</Tag> {recordA.method} {recordA.path}
            <br />
            <Tag color="orange">B</Tag> {recordB.method} {recordB.path}
          </Typography.Paragraph>
          {comparison.statusChanged && (
            <Tag color="red">
              상태코드 {comparison.statusA} → {comparison.statusB}
            </Tag>
          )}
          <Typography.Title level={5}>응답 본문 diff (A→B)</Typography.Title>
          <DiffView diff={comparison.bodyDiff} />
        </>
      ) : (
        <Empty description="비교할 요청 2개를 '비교 담기'로 선택하세요" />
      )}
    </Modal>
  );
};
