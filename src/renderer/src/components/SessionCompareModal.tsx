import { useEffect, useMemo, useState } from 'react';
import { Modal, Select, Space, Table, Tag } from 'antd';
import { buildSessionComparison } from '../../../shared/sessionCompare';
import { ipc } from '../services/ipc';
import { DiffView } from './DiffView';
import type { Session, SessionComparisonRow, TrafficRecord } from '../../../shared/types';

const STATUS_TAG: Record<SessionComparisonRow['status'], { color: string; label: string }> = {
  same: { color: 'default', label: '동일' },
  changed: { color: 'red', label: '변경' },
  onlyA: { color: 'blue', label: 'A만' },
  onlyB: { color: 'orange', label: 'B만' },
};

type SessionCompareModalProps = {
  open: boolean;
  sessions: Session[];
  onClose: () => void;
};

export const SessionCompareModal = ({ open, sessions, onClose }: SessionCompareModalProps) => {
  const [idA, setIdA] = useState<number | null>(null);
  const [idB, setIdB] = useState<number | null>(null);
  const [rowsA, setRowsA] = useState<TrafficRecord[]>([]);
  const [rowsB, setRowsB] = useState<TrafficRecord[]>([]);

  useEffect(() => {
    if (idA === null) return;
    void ipc.getSessionTraffic(idA).then(setRowsA);
  }, [idA]);
  useEffect(() => {
    if (idB === null) return;
    void ipc.getSessionTraffic(idB).then(setRowsB);
  }, [idB]);

  const comparison = useMemo(() => buildSessionComparison(rowsA, rowsB), [rowsA, rowsB]);

  const options = sessions.map((session) => ({
    value: session.id,
    label: `${session.name} (${session.recordCount}건)`,
  }));

  return (
    <Modal title="세션 비교" open={open} onCancel={onClose} width={860} footer={null}>
      <Space style={{ marginBottom: 12 }}>
        <Select
          placeholder="세션 A"
          options={options}
          value={idA ?? undefined}
          onChange={setIdA}
          style={{ width: 300 }}
        />
        <Select
          placeholder="세션 B"
          options={options}
          value={idB ?? undefined}
          onChange={setIdB}
          style={{ width: 300 }}
        />
      </Space>
      {idA !== null && idB !== null && (
        <Table<SessionComparisonRow>
          rowKey="key"
          size="small"
          dataSource={comparison}
          pagination={false}
          scroll={{ y: 400 }}
          expandable={{
            rowExpandable: (row) => row.status === 'changed',
            expandedRowRender: (row) => (row.comparison ? <DiffView diff={row.comparison.bodyDiff} /> : null),
          }}
          columns={[
            { title: '요청', dataIndex: 'key' },
            {
              title: '상태',
              dataIndex: 'status',
              width: 100,
              render: (status: SessionComparisonRow['status']) => (
                <Tag color={STATUS_TAG[status].color}>{STATUS_TAG[status].label}</Tag>
              ),
            },
            {
              title: '상태코드',
              width: 120,
              render: (_, row) =>
                row.comparison
                  ? row.comparison.statusChanged
                    ? `${row.comparison.statusA} → ${row.comparison.statusB}`
                    : row.comparison.statusA
                  : '-',
            },
          ]}
        />
      )}
    </Modal>
  );
};
