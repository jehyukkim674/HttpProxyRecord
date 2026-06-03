/** "{{name}}" 패턴을 vars[name]으로 치환한다. 미정의 변수는 원문 유지. */
export const substituteVariables = (text: string, vars: Record<string, string>): string =>
  text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole,
  );

/** "data.token", "items.0.id" 점/인덱스 경로로 값을 추출한다. 실패 시 null. */
export const extractByDotPath = (json: unknown, path: string): string | null => {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: unknown = json;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === null || current === undefined) return null;
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
};
