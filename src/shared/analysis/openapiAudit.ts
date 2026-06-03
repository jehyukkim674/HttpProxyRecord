import type { Finding } from './types';
import type { TrafficRecord } from '../types';

export type OpenApiSpec = { paths?: Record<string, Record<string, unknown>> };

/** OpenAPI 경로(/users/{id})를 정규식으로 변환 — {param}은 한 세그먼트와 매칭. */
const pathToRegex = (specPath: string): RegExp => {
  const escaped = specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^/}]+\\\}/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
};

/**
 * 캡처 트래픽을 OpenAPI 스펙과 대조한다 (#1).
 * - 스펙에 없는 경로 → openapi.undocumented
 * - 경로는 있으나 메서드 미문서화 → openapi.method-undocumented
 * (method+path 단위로 중복 제거)
 */
export const auditAgainstOpenApi = (spec: OpenApiSpec, records: TrafficRecord[]): Finding[] => {
  const compiled = Object.entries(spec.paths ?? {}).map(([specPath, methods]) => ({
    regex: pathToRegex(specPath),
    methods: new Set(Object.keys(methods).map((method) => method.toUpperCase())),
  }));

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const path = record.path.split('?')[0];
    const method = record.method.toUpperCase();
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const match = compiled.find((entry) => entry.regex.test(path));
    if (!match) {
      findings.push({
        severity: 'warn',
        rule: 'openapi.undocumented',
        message: `스펙에 없는 엔드포인트 — ${key}`,
        recordId: record.id,
      });
    } else if (!match.methods.has(method)) {
      findings.push({
        severity: 'warn',
        rule: 'openapi.method-undocumented',
        message: `문서화되지 않은 메서드 — ${key} (문서: ${[...match.methods].join(', ')})`,
        recordId: record.id,
      });
    }
  }
  return findings;
};
