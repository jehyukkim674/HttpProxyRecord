import { useState } from 'react';
import { Alert, Button, Empty, Input, List, Modal, Space, Tag } from 'antd';
import { auditAgainstOpenApi, type OpenApiSpec } from '../../../shared/analysis/openapiAudit';
import type { Finding } from '../../../shared/analysis/types';
import type { TrafficRecord } from '../../../shared/types';

type Props = {
  open: boolean;
  records: TrafficRecord[];
  onClose: () => void;
  onJump: (recordId: number) => void;
};

export const OpenApiAuditModal = ({ open, records, onClose, onJump }: Props) => {
  const [specText, setSpecText] = useState('');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState('');

  const run = () => {
    setError('');
    try {
      const spec = JSON.parse(specText) as OpenApiSpec;
      setFindings(auditAgainstOpenApi(spec, records));
    } catch {
      setError('스펙 JSON을 파싱할 수 없어요.');
      setFindings(null);
    }
  };

  return (
    <Modal title="OpenAPI 대조 검증" open={open} onCancel={onClose} footer={null} width={720}>
      <Input.TextArea
        value={specText}
        onChange={(event) => setSpecText(event.target.value)}
        rows={6}
        placeholder="OpenAPI(swagger) JSON을 붙여넣으세요"
      />
      <Space style={{ marginTop: 8, marginBottom: 8 }}>
        <Button type="primary" onClick={run}>
          현재 세션과 대조
        </Button>
        {findings && <Tag color="orange">이슈 {findings.length}</Tag>}
      </Space>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 8 }} />}
      {findings &&
        (findings.length === 0 ? (
          <Empty description="스펙과 일치 — 미문서화 없음" />
        ) : (
          <List
            size="small"
            dataSource={findings}
            style={{ maxHeight: 360, overflow: 'auto' }}
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
                  <Tag color="orange">주의</Tag>
                  <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 12 }}>{finding.rule}</span>
                  <span>{finding.message}</span>
                </Space>
              </List.Item>
            )}
          />
        ))}
    </Modal>
  );
};
