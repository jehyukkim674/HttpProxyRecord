import type { Finding } from './types';
import type { TrafficRecord } from '../types';

type Pattern = { rule: string; label: string; re: RegExp };

// 흔한 시크릿 패턴. 외부 공유/내보내기 전에 노출된 자격증명을 알아채기 위함.
const PATTERNS: Pattern[] = [
  { rule: 'secret.aws-access-key', label: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  {
    rule: 'secret.private-key',
    label: '개인 키(PEM)',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { rule: 'secret.jwt', label: 'JWT', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { rule: 'secret.slack-token', label: 'Slack 토큰', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { rule: 'secret.google-api-key', label: 'Google API 키', re: /AIza[0-9A-Za-z_-]{35}/ },
  { rule: 'secret.github-token', label: 'GitHub 토큰', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
];

const collectStrings = (record: TrafficRecord): Array<{ where: string; text: string }> => {
  const parts: Array<{ where: string; text: string }> = [];
  for (const [key, value] of Object.entries(record.requestHeaders)) {
    parts.push({ where: `요청 헤더 ${key}`, text: value });
  }
  for (const [key, value] of Object.entries(record.responseHeaders)) {
    parts.push({ where: `응답 헤더 ${key}`, text: value });
  }
  if (record.requestBody) parts.push({ where: '요청 본문', text: record.requestBody });
  if (record.responseBody) parts.push({ where: '응답 본문', text: record.responseBody });
  return parts;
};

/** 한 트래픽에서 노출된 시크릿을 찾는다. (rule+위치) 단위로 중복 제거. */
export const scanSecrets = (record: TrafficRecord): Finding[] => {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const { where, text } of collectStrings(record)) {
    for (const pattern of PATTERNS) {
      const key = `${pattern.rule}@${where}`;
      if (pattern.re.test(text) && !seen.has(key)) {
        seen.add(key);
        findings.push({
          severity: 'high',
          rule: pattern.rule,
          message: `${pattern.label} 노출 — ${where}`,
          recordId: record.id,
        });
      }
    }
  }
  return findings;
};
