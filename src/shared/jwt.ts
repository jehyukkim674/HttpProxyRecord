export type DecodedJwt = {
  header: Record<string, unknown>;
  payload: Record<string, unknown> & { sub?: string; name?: string; exp?: number };
  expiresAt: string | null;
};

const decodeSegment = (segment: string): Record<string, unknown> | null => {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** JWT 문자열을 헤더/페이로드로 디코드한다. 서명 검증은 하지 않음(표시용). */
export const decodeJwt = (token: string): DecodedJwt | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  if (!header || !payload) return null;

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  return {
    header,
    payload,
    expiresAt: exp !== null ? new Date(exp * 1000).toISOString() : null,
  };
};

/** 헤더 맵에서 Bearer 토큰을 추출한다 (대소문자 무시). */
export const findBearerToken = (headers: Record<string, string>): string | null => {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
      return value.slice('Bearer '.length).trim();
    }
  }
  return null;
};
