/** host(포트 포함 가능)가 제외 패턴(glob) 중 하나라도 매칭하는지 판단한다. */
export const matchExcludeDomain = (host: string, patterns: string[]): boolean => {
  const hostname = host.split(':')[0].toLowerCase();
  return patterns.some((pattern) => {
    const trimmed = pattern.trim().toLowerCase();
    if (trimmed.length === 0) return false;
    const regexSource = '^' + trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    return new RegExp(regexSource).test(hostname);
  });
};
