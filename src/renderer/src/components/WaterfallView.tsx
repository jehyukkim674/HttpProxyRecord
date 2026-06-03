import { useMemo } from 'react';
import { Empty } from 'antd';
import { computeWaterfallRows } from '../../../shared/waterfall';
import type { TrafficRecord } from '../../../shared/types';

const barColor = (statusCode: number): string => {
  if (statusCode >= 500) return '#ff4d4f';
  if (statusCode >= 400) return '#fa8c16';
  if (statusCode >= 300) return '#1677ff';
  return '#52c41a';
};

type WaterfallViewProps = { records: TrafficRecord[] };

export const WaterfallView = ({ records }: WaterfallViewProps) => {
  const rows = useMemo(() => computeWaterfallRows(records), [records]);
  const maxEnd = useMemo(() => Math.max(1, ...rows.map((row) => row.leftMs + row.widthMs)), [rows]);

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="표시할 트래픽이 없어요" />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div
            style={{
              width: 260,
              flexShrink: 0,
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.label}
          </div>
          <div style={{ flex: 1, position: 'relative', height: 18, background: '#fafafa', borderRadius: 2 }}>
            <div
              title={`${row.leftMs}ms 시작 · ${row.widthMs}ms`}
              style={{
                position: 'absolute',
                left: `${(row.leftMs / maxEnd) * 100}%`,
                width: `${Math.max((row.widthMs / maxEnd) * 100, 0.5)}%`,
                height: '100%',
                background: barColor(row.statusCode),
                borderRadius: 2,
              }}
            />
          </div>
          <div style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: 12, color: '#999' }}>
            {row.widthMs}ms
          </div>
        </div>
      ))}
    </div>
  );
};
