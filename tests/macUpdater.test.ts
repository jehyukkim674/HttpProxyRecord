import { describe, expect, it } from 'vitest';
import {
  bundleRootFromExe,
  buildSwapScript,
  parseMacYmlFiles,
  pickMacFile,
  sha512Base64,
} from '../src/main/system/macUpdater';

const SAMPLE_YML = `version: 0.1.1
files:
  - url: HttpProxyRecord-0.1.1-arm64-mac.zip
    sha512: AAArm64sha==
    size: 123421075
  - url: HttpProxyRecord-0.1.1-mac.zip
    sha512: BBBx64sha==
    size: 127514797
path: HttpProxyRecord-0.1.1-arm64-mac.zip
sha512: AAArm64sha==
releaseDate: '2026-06-04T00:25:25.595Z'
`;

describe('parseMacYmlFiles', () => {
  it('files의 url/sha512만 뽑고 루트 path/sha512는 제외한다', () => {
    expect(parseMacYmlFiles(SAMPLE_YML)).toEqual([
      { url: 'HttpProxyRecord-0.1.1-arm64-mac.zip', sha512: 'AAArm64sha==' },
      { url: 'HttpProxyRecord-0.1.1-mac.zip', sha512: 'BBBx64sha==' },
    ]);
  });
});

describe('pickMacFile', () => {
  const files = parseMacYmlFiles(SAMPLE_YML);
  it('arm64는 arm64 zip을 고른다', () => {
    expect(pickMacFile(files, 'arm64')?.url).toBe('HttpProxyRecord-0.1.1-arm64-mac.zip');
  });
  it('x64는 arm64가 아닌 zip을 고른다', () => {
    expect(pickMacFile(files, 'x64')?.url).toBe('HttpProxyRecord-0.1.1-mac.zip');
  });
  it('맞는 파일이 없으면 null', () => {
    expect(pickMacFile([], 'arm64')).toBeNull();
  });
});

describe('sha512Base64', () => {
  it('알려진 입력의 sha512 base64를 계산한다', () => {
    // 빈 문자열 sha512 base64 (널리 알려진 상수)
    expect(sha512Base64(Buffer.from(''))).toBe(
      'z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==',
    );
  });
});

describe('bundleRootFromExe', () => {
  it('실행 경로에서 .app 번들 루트를 추출한다', () => {
    expect(bundleRootFromExe('/Applications/HttpProxyRecord.app/Contents/MacOS/HttpProxyRecord')).toBe(
      '/Applications/HttpProxyRecord.app',
    );
  });
  it('.app이 없으면 null', () => {
    expect(bundleRootFromExe('/usr/local/bin/node')).toBeNull();
  });
});

describe('buildSwapScript', () => {
  it('종료 대기 → 교체 → 재실행 순서를 담는다', () => {
    const script = buildSwapScript(
      4242,
      '/tmp/x/HttpProxyRecord.app',
      '/Applications/HttpProxyRecord.app',
      '/tmp/x',
    );
    expect(script).toContain('kill -0 4242');
    expect(script).toContain('ditto "/tmp/x/HttpProxyRecord.app" "/Applications/HttpProxyRecord.app.new"');
    expect(script).toContain(
      'mv "/Applications/HttpProxyRecord.app.new" "/Applications/HttpProxyRecord.app"',
    );
    expect(script).toContain('open "/Applications/HttpProxyRecord.app"');
    // 교체가 종료 대기보다 뒤에 오는지
    expect(script.indexOf('kill -0')).toBeLessThan(script.indexOf('ditto'));
    expect(script.indexOf('ditto')).toBeLessThan(script.indexOf('open'));
  });

  it('크래시 안전: 기존을 .old로 옮긴 뒤 교체하고, 실패 시 롤백한다', () => {
    const script = buildSwapScript(
      4242,
      '/tmp/x/HttpProxyRecord.app',
      '/Applications/HttpProxyRecord.app',
      '/tmp/x',
    );
    // 기존 번들을 .old로 원자적 rename(같은 부모) 후 새 번들 이동
    expect(script).toContain(
      'mv "/Applications/HttpProxyRecord.app" "/Applications/HttpProxyRecord.app.old"',
    );
    // 새 번들 이동 실패 시 .old를 되돌려 항상 유효한 번들이 남게
    expect(script).toContain(
      'mv "/Applications/HttpProxyRecord.app.new" "/Applications/HttpProxyRecord.app" || { mv "/Applications/HttpProxyRecord.app.old" "/Applications/HttpProxyRecord.app"; exit 1; }',
    );
    // 기존 삭제(rm -rf bundle) 후 이동하는 위험한 순서가 아니어야 함
    expect(script).not.toContain('rm -rf "/Applications/HttpProxyRecord.app"\n');
  });
});
