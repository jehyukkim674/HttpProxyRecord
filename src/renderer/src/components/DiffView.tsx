import type { CSSProperties } from 'react';
import type { LineDiff } from '../../../shared/types';

const lineStyle = (type: LineDiff['type']): CSSProperties => ({
  background: type === 'added' ? 'var(--diff-add-bg)' : type === 'removed' ? 'var(--diff-del-bg)' : undefined,
  color:
    type === 'added' ? 'var(--diff-add-fg)' : type === 'removed' ? 'var(--diff-del-fg)' : 'var(--app-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});

const prefix = (type: LineDiff['type']): string =>
  type === 'added' ? '+ ' : type === 'removed' ? '- ' : '  ';

type DiffViewProps = { diff: LineDiff[] };

export const DiffView = ({ diff }: DiffViewProps) => (
  <pre
    style={{
      background: 'var(--app-surface)',
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
