import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

/** 로그 한 줄을 포맷한다 (순수함수, 테스트 가능). */
export const formatLogLine = (
  level: LogLevel,
  message: string,
  meta: unknown,
  now: Date = new Date(),
): string => {
  const base = `${now.toISOString()} [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) return base;
  if (meta instanceof Error) return `${base} :: ${meta.stack ?? meta.message}`;
  try {
    return `${base} :: ${JSON.stringify(meta)}`;
  } catch {
    return `${base} :: [meta 직렬화 실패]`;
  }
};

const consoleSink = (level: LogLevel, line: string): void => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

/** 콘솔에만 기록하는 로거 (initLogger 호출 전 기본값). */
const createConsoleLogger = (): Logger => ({
  info: (message, meta) => consoleSink('info', formatLogLine('info', message, meta)),
  warn: (message, meta) => consoleSink('warn', formatLogLine('warn', message, meta)),
  error: (message, meta) => consoleSink('error', formatLogLine('error', message, meta)),
});

/** 파일(logDir/main.log) + 콘솔에 기록하는 로거. 파일 쓰기 실패는 무시(콘솔은 유지). */
export const createLogger = (logDir: string): Logger => {
  const logFile = path.join(logDir, 'main.log');
  const write = (level: LogLevel, message: string, meta: unknown): void => {
    const line = formatLogLine(level, message, meta);
    consoleSink(level, line);
    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, `${line}\n`);
    } catch {
      // 파일 로깅 실패는 치명적이지 않다 — 콘솔 출력은 이미 됨
    }
  };
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
};

let current: Logger = createConsoleLogger();

/** 앱 기동 시 userData 로그 디렉터리로 로거를 초기화한다. */
export const initLogger = (logDir: string): void => {
  current = createLogger(logDir);
};

/** 전역 로거 — 모든 모듈이 이걸 통해 기록한다. */
export const log: Logger = {
  info: (message, meta) => current.info(message, meta),
  warn: (message, meta) => current.warn(message, meta),
  error: (message, meta) => current.error(message, meta),
};
