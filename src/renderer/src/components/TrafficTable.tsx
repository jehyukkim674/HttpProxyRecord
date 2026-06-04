import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TrafficRecord } from '../../../shared/types';

const statusColor = (statusCode: number): string => {
  if (statusCode >= 500) return 'red';
  if (statusCode >= 400) return 'orange';
  if (statusCode >= 300) return 'blue';
  return 'green';
};

const methodColor = (method: string): string => {
  const colors: Record<string, string> = {
    GET: 'blue',
    POST: 'green',
    PUT: 'orange',
    PATCH: 'gold',
    DELETE: 'red',
  };
  return colors[method] ?? 'default';
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const columns: ColumnsType<TrafficRecord> = [
  {
    title: '시각',
    dataIndex: 'timestamp',
    width: 90,
    render: (timestamp: string) => new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false }),
  },
  {
    title: '메서드',
    dataIndex: 'method',
    width: 80,
    render: (method: string) => <Tag color={methodColor(method)}>{method}</Tag>,
  },
  {
    title: '상태',
    dataIndex: 'statusCode',
    width: 70,
    render: (statusCode: number) => <Tag color={statusColor(statusCode)}>{statusCode}</Tag>,
  },
  {
    title: '호스트',
    dataIndex: 'host',
    width: 200,
    ellipsis: true,
  },
  {
    title: '경로',
    dataIndex: 'path',
    ellipsis: true,
  },
  {
    title: '크기',
    dataIndex: 'responseSize',
    width: 80,
    render: (size: number) => formatBytes(size),
  },
  {
    title: '소요',
    dataIndex: 'durationMs',
    width: 80,
    render: (durationMs: number) => `${durationMs}ms`,
  },
];

type TrafficTableProps = {
  records: TrafficRecord[];
  selectedRecordId: number | null;
  onSelect: (record: TrafficRecord) => void;
  /** 가용 영역 높이(px). 가상 스크롤 본문이 화면 밖으로 넘치지 않게 부모가 측정해 전달 */
  scrollY: number;
};

export const TrafficTable = ({ records, selectedRecordId, onSelect, scrollY }: TrafficTableProps) => {
  // 헤더(약 39px)를 뺀 본문 높이. 측정 전(0)에는 안전한 기본값.
  const bodyHeight = scrollY > 0 ? Math.max(scrollY - 39, 0) : 400;
  return (
    <Table<TrafficRecord>
      rowKey="id"
      dataSource={records}
      columns={columns}
      size="small"
      pagination={false}
      scroll={{ y: bodyHeight }}
      virtual
      onRow={(record) => {
        const selected = record.id === selectedRecordId;
        return {
          onClick: () => onSelect(record),
          style: {
            cursor: 'pointer',
            background: selected ? 'var(--app-selected)' : undefined,
            color: selected ? 'var(--app-selected-fg)' : undefined,
            boxShadow: selected ? 'inset 3px 0 0 var(--app-selected-accent)' : undefined,
          },
        };
      }}
    />
  );
};
