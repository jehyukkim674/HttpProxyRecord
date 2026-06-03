import type { CSSProperties } from 'react';
import type { LineDiff } from '../../../shared/types';

const lineStyle = (type: LineDiff['type']): CSSProperties => ({
  background: type === 'added' ? '#f6ffed' : type === 'removed' ? '#fff1f0' : undefined,
  color: type === 'added' ? '#237804' : type === 'removed' ? '#a8071a' : '#333',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});

const prefix = (type: LineDiff['type']): string =>
  type === 'added' ? '+ ' : type === 'removed' ? '- ' : '  ';

type DiffViewProps = { diff: LineDiff[] };

export const DiffView = ({ diff }: DiffViewProps) => (
  <pre
    style={{
      background: '#fafafa',
      padding: 8,
      borderRadius: 4,
      fontSize: 12,
      maxHeight: 300,
      overflow: 'auto',
      margin: 0,
    }}
  >
    {diff.map((line, index) => (
      <div key={index} style={lineStyle(line.type)}>
        {prefix(line.type)}
        {line.text}
      </div>
    ))}
  </pre>
);
