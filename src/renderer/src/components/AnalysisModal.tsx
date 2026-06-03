import { useMemo } from 'react';
import { Empty, List, Modal, Space, Tag } from 'antd';
import { analyzeSession, summarizeFindings } from '../../../shared/analysis/sessionAnalysis';
import type { Severity } from '../../../shared/analysis/types';
import type { TrafficRecord } from '../../../shared/types';

const COLOR: Record<Severity, string> = { high: 'red', warn: 'orange', info: 'blue' };
const LABEL: Record<Severity, string> = { high: '위험', warn: '주의', info: '정보' };
const ORDER: Severity[] = ['high', 'warn', 'info'];

type Props = {
  open: boolean;
  records: TrafficRecord[];
  onClose: () => void;
  onJump: (recordId: number) => void;
};

export const AnalysisModal = ({ open, records, onClose, onJump }: Props) => {
  const findings = useMemo(() => analyzeSession(records), [records]);
  const summary = useMemo(() => summarizeFindings(findings), [findings]);
  const sorted = useMemo(
    () => [...findings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)),
    [findings],
  );

  return (
    <Modal title="세션 분석" open={open} onCancel={onClose} footer={null} width={720}>
      <Space style={{ marginBottom: 12 }}>
        <Tag color="red">위험 {summary.high}</Tag>
        <Tag color="orange">주의 {summary.warn}</Tag>
        <Tag color="blue">정보 {summary.info}</Tag>
      </Space>
      {sorted.length === 0 ? (
        <Empty description="발견된 이슈 없음" />
      ) : (
        <List
          size="small"
          dataSource={sorted}
          style={{ maxHeight: 480, overflow: 'auto' }}
          renderItem={(finding) => (
            <List.Item
              onClick={() => {
                if (finding.recordId != null) {
                  onJump(finding.recordId);
                  onClose();
                }
              }}
              style={{ cursor: finding.recordId != null ? 'pointer' : 'default' }}
            >
              <Space>
                <Tag color={COLOR[finding.severity]}>{LABEL[finding.severity]}</Tag>
                <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 12 }}>{finding.rule}</span>
                <span>{finding.message}</span>
              </Space>
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
};
