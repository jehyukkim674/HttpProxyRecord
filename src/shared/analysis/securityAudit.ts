import type { Finding } from './types';
import type { TrafficRecord } from '../types';

/** 한 응답의 보안 헤더/쿠키/CORS를 점검한다. */
export const auditSecurity = (record: TrafficRecord): Finding[] => {
  const findings: Finding[] = [];
  const headers = record.responseHeaders;
  const warn = (rule: string, message: string): void => {
    findings.push({ severity: 'warn', rule, message: `${message} — ${record.path}`, recordId: record.id });
  };

  const contentType = (headers['content-type'] ?? '').toLowerCase();
  const isHtml = contentType.includes('text/html');

  if (isHtml) {
    if (!headers['content-security-policy'])
      warn('security.csp-missing', 'Content-Security-Policy 헤더 없음');
    if (!headers['x-content-type-options']) {
      warn('security.xcto-missing', 'X-Content-Type-Options: nosniff 없음');
    }
    if (!headers['x-frame-options'] && !headers['content-security-policy']) {
      warn('security.xfo-missing', 'X-Frame-Options 없음(클릭재킹 위험)');
    }
  }
  if (record.isHttps && !headers['strict-transport-security']) {
    warn('security.hsts-missing', 'HSTS(Strict-Transport-Security) 없음');
  }

  const setCookie = headers['set-cookie'];
  if (setCookie) {
    if (!/;\s*Secure/i.test(setCookie)) warn('security.cookie-insecure', 'Set-Cookie에 Secure 플래그 없음');
    if (!/;\s*HttpOnly/i.test(setCookie))
      warn('security.cookie-no-httponly', 'Set-Cookie에 HttpOnly 플래그 없음');
  }

  if (headers['access-control-allow-origin'] === '*') {
    findings.push({
      severity: 'info',
      rule: 'security.cors-wildcard',
      message: `CORS Access-Control-Allow-Origin: * (와일드카드) — ${record.path}`,
      recordId: record.id,
    });
  }
  return findings;
};
