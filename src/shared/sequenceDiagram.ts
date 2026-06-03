import type { TrafficRecord } from './types';

const sanitize = (text: string): string => text.replace(/[;\r\n]/g, ' ');
const truncate = (text: string, max = 40): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * 세션 트래픽을 Mermaid sequenceDiagram 소스로 변환한다.
 * 클라이언트→호스트 요청과 호스트→클라이언트 응답(상태코드)을 시간순으로 그린다.
 * (mermaid.live나 마크다운에 붙여넣어 렌더)
 */
export const toMermaidSequence = (records: TrafficRecord[], limit = 50): string => {
  const slice = records.slice(0, limit);
  const hosts = [...new Set(slice.map((record) => record.host))];
  const alias = new Map<string, string>();
  hosts.forEach((host, index) => alias.set(host, `H${index + 1}`));

  const lines = ['sequenceDiagram', '  participant C as Client'];
  for (const host of hosts) lines.push(`  participant ${alias.get(host)} as ${sanitize(host)}`);
  for (const record of slice) {
    const target = alias.get(record.host) ?? 'H1';
    lines.push(`  C->>${target}: ${record.method} ${truncate(sanitize(record.path))}`);
    lines.push(`  ${target}-->>C: ${record.statusCode}`);
  }
  return lines.join('\n');
};
