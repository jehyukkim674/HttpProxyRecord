import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger, formatLogLine } from '../src/main/logger';

describe('formatLogLine', () => {
  const now = new Date('2026-06-03T10:00:00.000Z');

  it('레벨/시각/메시지를 포맷한다', () => {
    expect(formatLogLine('info', 'hello', undefined, now)).toBe('2026-06-03T10:00:00.000Z [INFO] hello');
  });

  it('meta 객체를 JSON으로 덧붙인다', () => {
    expect(formatLogLine('warn', 'msg', { a: 1 }, now)).toBe(
      '2026-06-03T10:00:00.000Z [WARN] msg :: {"a":1}',
    );
  });

  it('Error는 스택을 덧붙인다', () => {
    const line = formatLogLine('error', 'boom', new Error('bad'), now);
    expect(line).toContain('[ERROR] boom ::');
    expect(line).toContain('bad');
  });

  it('순환 참조 meta는 안전하게 처리한다', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatLogLine('info', 'm', circular, now)).toContain('meta 직렬화 실패');
  });
});

describe('createLogger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-log-test-'));
  });
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('파일에 로그를 기록한다', () => {
    const logger = createLogger(tempDir);
    logger.info('첫 로그');
    logger.error('에러 로그', new Error('x'));
    const content = fs.readFileSync(path.join(tempDir, 'main.log'), 'utf-8');
    expect(content).toContain('[INFO] 첫 로그');
    expect(content).toContain('[ERROR] 에러 로그');
  });

  it('존재하지 않는 디렉터리도 생성한다', () => {
    const nested = path.join(tempDir, 'a', 'b');
    const logger = createLogger(nested);
    logger.info('nested');
    expect(fs.existsSync(path.join(nested, 'main.log'))).toBe(true);
  });
});
