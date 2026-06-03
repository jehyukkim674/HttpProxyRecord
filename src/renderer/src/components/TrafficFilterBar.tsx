import { Button, Input, Select, Space, Tag } from 'antd';
import { emptyFilter } from '../../../shared/filterTraffic';
import type { TrafficFilter } from '../../../shared/types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_CLASSES = [
  { value: 2, label: '2xx' },
  { value: 3, label: '3xx' },
  { value: 4, label: '4xx' },
  { value: 5, label: '5xx' },
];

type TrafficFilterBarProps = {
  filter: TrafficFilter;
  onChange: (filter: TrafficFilter) => void;
  total: number;
  shown: number;
};

export const TrafficFilterBar = ({ filter, onChange, total, shown }: TrafficFilterBarProps) => {
  const toggleStatus = (value: number) => {
    const next = filter.statusClasses.includes(value)
      ? filter.statusClasses.filter((statusClass) => statusClass !== value)
      : [...filter.statusClasses, value];
    onChange({ ...filter, statusClasses: next });
  };

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <Space wrap>
        <Input
          placeholder="도메인"
          allowClear
          value={filter.domain}
          onChange={(event) => onChange({ ...filter, domain: event.target.value })}
          style={{ width: 160 }}
        />
        <Select
          mode="multiple"
          placeholder="메서드"
          allowClear
          value={filter.methods}
          onChange={(methods) => onChange({ ...filter, methods })}
          options={METHODS.map((method) => ({ value: method, label: method }))}
          style={{ minWidth: 170 }}
        />
        <Space size={4}>
          {STATUS_CLASSES.map((statusClass) => (
            <Tag.CheckableTag
              key={statusClass.value}
              checked={filter.statusClasses.includes(statusClass.value)}
              onChange={() => toggleStatus(statusClass.value)}
            >
              {statusClass.label}
            </Tag.CheckableTag>
          ))}
        </Space>
        <Input.Search
          placeholder="URL/경로 검색"
          allowClear
          value={filter.search}
          onChange={(event) => onChange({ ...filter, search: event.target.value })}
          style={{ width: 220 }}
        />
        <Button size="small" onClick={() => onChange(emptyFilter())}>
          초기화
        </Button>
        <span style={{ color: '#999' }}>
          {shown}/{total}건
        </span>
      </Space>
    </div>
  );
};
