import type { TrafficRecord } from './types';

/** 캡처 트래픽을 k6 부하테스트 스크립트로 변환한다 (#29). */
export const toK6Script = (records: TrafficRecord[]): string => {
  const lines = [
    "import http from 'k6/http';",
    "import { sleep } from 'k6';",
    '',
    'export default function () {',
  ];
  for (const record of records) {
    const method = record.method.toLowerCase();
    if (record.requestBody && (method === 'post' || method === 'put' || method === 'patch')) {
      lines.push(`  http.${method}('${record.url}', ${JSON.stringify(record.requestBody)});`);
    } else if (method === 'get' || method === 'delete' || method === 'head') {
      lines.push(`  http.${method}('${record.url}');`);
    } else {
      lines.push(`  http.request('${record.method}', '${record.url}');`);
    }
  }
  lines.push('  sleep(1);');
  lines.push('}');
  return lines.join('\n');
};
