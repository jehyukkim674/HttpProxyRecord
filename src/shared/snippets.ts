import type { TrafficRecord } from './types';

const nonHostHeaders = (headers: Record<string, string>): Array<[string, string]> =>
  Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'host');

/** Python requests 스니펫. */
export const toPythonRequests = (record: TrafficRecord): string => {
  const headers = nonHostHeaders(record.requestHeaders)
    .map(([name, value]) => `        '${name}': '${value.replace(/'/g, "\\'")}',`)
    .join('\n');
  const lines = [
    'import requests',
    '',
    `response = requests.request('${record.method}', '${record.url}',`,
    '    headers={',
    headers,
    '    },',
  ];
  if (record.requestBody) {
    lines.push(`    data=${JSON.stringify(record.requestBody)},`);
  }
  lines.push(')');
  lines.push('print(response.status_code, response.text)');
  return lines.join('\n');
};

/** JavaScript fetch 스니펫. */
export const toFetch = (record: TrafficRecord): string => {
  const headers = Object.fromEntries(nonHostHeaders(record.requestHeaders));
  const init: string[] = [
    `  method: '${record.method}',`,
    `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`,
  ];
  if (record.requestBody) {
    init.push(`  body: ${JSON.stringify(record.requestBody)},`);
  }
  return [
    `const response = await fetch('${record.url}', {`,
    ...init,
    '});',
    'console.log(response.status, await response.text());',
  ].join('\n');
};

/** Go net/http 스니펫. */
export const toGoSnippet = (record: TrafficRecord): string => {
  const bodyExpr = record.requestBody ? `strings.NewReader(${JSON.stringify(record.requestBody)})` : 'nil';
  const headerLines = nonHostHeaders(record.requestHeaders)
    .map(([name, value]) => `\treq.Header.Set(${JSON.stringify(name)}, ${JSON.stringify(value)})`)
    .join('\n');
  return [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"net/http"',
    record.requestBody ? '\t"strings"' : '',
    ')',
    '',
    'func main() {',
    `\treq, _ := http.NewRequest(${JSON.stringify(record.method)}, ${JSON.stringify(record.url)}, ${bodyExpr})`,
    headerLines,
    '\tresp, _ := http.DefaultClient.Do(req)',
    '\tfmt.Println(resp.Status)',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
};
