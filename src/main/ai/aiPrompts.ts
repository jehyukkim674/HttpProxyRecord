import { maskSensitiveHeaders } from '../export/exporter';
import type { TrafficRecord } from '../../shared/types';

const MAX_BODY = 2000;

const truncate = (text: string | null): string =>
  text === null ? '(없음)' : text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…(생략)` : text;

/** 트래픽 1건을 AI 입력용 텍스트로 요약한다 (민감 헤더 마스킹). 순수함수. */
export const summarizeRecordForAI = (record: TrafficRecord): string => {
  const headers = maskSensitiveHeaders(record.requestHeaders);
  return [
    `${record.method} ${record.url}`,
    `상태: ${record.statusCode}, 소요: ${record.durationMs}ms`,
    `요청 헤더: ${JSON.stringify(headers)}`,
    `요청 바디: ${truncate(record.requestBody)}`,
    `응답 바디: ${truncate(record.responseBody)}`,
  ].join('\n');
};

/** 여러 트래픽을 목록 텍스트로 요약 (이상 탐지/자연어 검색용). */
export const summarizeRecordsForAI = (records: TrafficRecord[]): string =>
  records
    .map(
      (record) =>
        `#${record.id} ${record.method} ${record.path} → ${record.statusCode} (${record.durationMs}ms)`,
    )
    .join('\n');
