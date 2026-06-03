import type { Finding } from './types';
import type { TrafficRecord } from '../types';

const COMPRESSIBLE = ['text/', 'application/json', 'application/javascript', 'image/svg', 'application/xml'];

/**
 * 캐시/압축 효율을 점검한다.
 * 압축 추정: 저장된 본문은 디코드된 평문이고 responseSize는 전송(wire) 바이트이므로,
 * 압축 가능한 큰 본문인데 전송 크기가 본문 크기와 비슷하면 미압축으로 본다.
 */
export const analyzeCache = (record: TrafficRecord): Finding[] => {
  const findings: Finding[] = [];
  if (record.statusCode < 200 || record.statusCode >= 300) return findings;

  const contentType = (record.responseHeaders['content-type'] ?? '').toLowerCase();
  const cacheControl = record.responseHeaders['cache-control'];
  const decodedBytes = record.responseBody ? new TextEncoder().encode(record.responseBody).length : 0;

  const compressible = COMPRESSIBLE.some((type) => contentType.includes(type));
  if (compressible && decodedBytes > 50_000 && record.responseSize >= decodedBytes * 0.9) {
    findings.push({
      severity: 'warn',
      rule: 'cache.uncompressed',
      message: `미압축 추정 — ${Math.floor(decodedBytes / 1024)}KB 본문에 gzip/br 없음 — ${record.path}`,
      recordId: record.id,
    });
  }

  const staticAsset =
    contentType.startsWith('image/') ||
    contentType.includes('javascript') ||
    contentType.includes('css') ||
    contentType.includes('font');
  if (staticAsset && (!cacheControl || /no-store|max-age=0/.test(cacheControl))) {
    findings.push({
      severity: 'info',
      rule: 'cache.no-cache',
      message: `정적 자산 캐시 미설정 — ${contentType || '?'} — ${record.path}`,
      recordId: record.id,
    });
  }
  return findings;
};
