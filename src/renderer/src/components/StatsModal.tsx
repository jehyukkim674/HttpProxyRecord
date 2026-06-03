import { useMemo } from 'react';
import { Empty, Modal, Statistic, Table, Row, Col } from 'antd';
import { computeStats } from '../../../shared/stats';
import type { TrafficRecord } from '../../../shared/types';

type StatsModalProps = {
  open: boolean;
  records: TrafficRecord[];
  onClose: () => void;
};

export const StatsModal = ({ open, records, onClose }: StatsModalProps) => {
  const stats = useMemo(() => computeStats(records), [records]);

  return (
    <Modal title="통계 대시보드" open={open} onCancel={onClose} width={720} footer={null}>
      {stats.totalCount === 0 ? (
        <Empty description="표시할 트래픽이 없어요" />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title="총 요청" value={stats.totalCount} suffix="건" />
            </Col>
            <Col span={8}>
              <Statistic title="평균 응답시간" value={stats.avgDurationMs} suffix="ms" />
            </Col>
            <Col span={8}>
              <Statistic
                title="에러율"
                value={(stats.errorRate * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: stats.errorRate > 0.1 ? '#cf1322' : undefined }}
              />
            </Col>
          </Row>
          <Table
            title={() => '도메인별 요청 수'}
            rowKey="host"
            size="small"
            pagination={false}
            dataSource={stats.byDomain}
            columns={[
              { title: '호스트', dataIndex: 'host' },
              { title: '건수', dataIndex: 'count', width: 100 },
            ]}
            style={{ marginBottom: 16 }}
          />
          <Table
            title={() => '느린 요청 Top 5'}
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={stats.slowest}
            columns={[
              { title: '메서드', dataIndex: 'method', width: 80 },
              { title: '경로', dataIndex: 'path', ellipsis: true },
              { title: '소요', dataIndex: 'durationMs', width: 90, render: (ms: number) => `${ms}ms` },
            ]}
          />
        </>
      )}
    </Modal>
  );
};
