import { scanSecrets } from './secretScan';
import { auditSecurity } from './securityAudit';
import { analyzeCache } from './cacheAnalysis';
import type { Finding } from './types';
import type { TrafficRecord } from '../types';

export type AnalysisOptions = { slowMs: number; largeBytes: number; duplicateThreshold: number };
const DEFAULT_OPTIONS: AnalysisOptions = { slowMs: 1000, largeBytes: 1_000_000, duplicateThreshold: 5 };

/**
 * 세션 전체 분석: 레코드별(시크릿/보안/캐시) + 세션 수준(성능예산, 중복/N+1)을 합친다.
 */
export const analyzeSession = (
  records: TrafficRecord[],
  options: AnalysisOptions = DEFAULT_OPTIONS,
): Finding[] => {
  const findings: Finding[] = [];

  for (const record of records) {
    findings.push(...scanSecrets(record), ...auditSecurity(record), ...analyzeCache(record));

    if (record.durationMs > options.slowMs) {
      findings.push({
        severity: 'warn',
        rule: 'perf.slow',
        message: `느린 응답 ${record.durationMs}ms — ${record.method} ${record.path}`,
        recordId: record.id,
      });
    }
    if (record.responseSize > options.largeBytes) {
      findings.push({
        severity: 'warn',
        rule: 'perf.large',
        message: `큰 응답 ${Math.floor(record.responseSize / 1024)}KB — ${record.method} ${record.path}`,
        recordId: record.id,
      });
    }
  }

  // 중복/N+1: 동일 method+url 반복
  const counts = new Map<string, { count: number; firstId: number }>();
  for (const record of records) {
    const key = `${record.method} ${record.url}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, firstId: record.id });
  }
  for (const [key, { count, firstId }] of counts) {
    if (count >= options.duplicateThreshold) {
      findings.push({
        severity: 'warn',
        rule: 'perf.duplicate',
        message: `동일 요청 ${count}회 반복(N+1 의심) — ${key}`,
        recordId: firstId,
      });
    }
  }

  return findings;
};

/** 심각도별 개수 요약 (배지 표시용). */
export const summarizeFindings = (findings: Finding[]): Record<string, number> => {
  const summary = { high: 0, warn: 0, info: 0 } as Record<string, number>;
  for (const finding of findings) summary[finding.severity] += 1;
  return summary;
};
