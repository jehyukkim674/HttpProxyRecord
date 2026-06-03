export type Cookie = { name: string; value: string };
export type SetCookie = { name: string; value: string; attributes: string[] };

/** "a=1; b=2" 형태의 Cookie 헤더를 파싱한다. */
export const parseCookieHeader = (header: string | undefined): Cookie[] => {
  if (!header) return [];
  return header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return { name: part, value: '' };
      return { name: part.slice(0, eq), value: part.slice(eq + 1) };
    });
};

/** Set-Cookie 헤더 한 줄을 이름/값/속성으로 분리한다. */
export const parseSetCookie = (header: string): SetCookie => {
  const segments = header.split(';').map((part) => part.trim());
  const [pair, ...attributes] = segments;
  const eq = pair.indexOf('=');
  return {
    name: eq === -1 ? pair : pair.slice(0, eq),
    value: eq === -1 ? '' : pair.slice(eq + 1),
    attributes,
  };
};
