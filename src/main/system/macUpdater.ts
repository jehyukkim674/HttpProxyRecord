import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log } from '../logger';

const execFileAsync = promisify(execFile);

const RELEASE_BASE = 'https://github.com/jehyukkim674/HttpProxyRecord/releases/latest/download';

export type MacFile = { url: string; sha512: string };

/**
 * latest-mac.yml의 files 목록(url + sha512)을 파싱한다.
 * electron-builder가 고정 포맷으로 생성하므로 의존성 없는 focused 파서로 충분하다. (순수·테스트 가능)
 */
export const parseMacYmlFiles = (yml: string): MacFile[] => {
  const files: MacFile[] = [];
  const re = /-\s+url:\s*(\S+)\s+sha512:\s*(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(yml)) !== null) {
    files.push({ url: match[1], sha512: match[2] });
  }
  return files;
};

/** 현재 아키텍처에 맞는 zip을 고른다. arm64 → 'arm64' 포함, 그 외(x64) → 미포함. (순수) */
export const pickMacFile = (files: MacFile[], arch: string): MacFile | null => {
  if (arch === 'arm64') return files.find((f) => f.url.includes('arm64')) ?? null;
  return files.find((f) => !f.url.includes('arm64')) ?? null;
};

/** Buffer의 sha512를 base64로 — latest-mac.yml의 sha512와 같은 형식. (순수) */
export const sha512Base64 = (buf: Buffer): string => createHash('sha512').update(buf).digest('base64');

/** 앱 실행 파일 경로에서 .app 번들 루트를 구한다. (순수) */
export const bundleRootFromExe = (exePath: string): string | null => {
  const idx = exePath.indexOf('.app/');
  if (idx !== -1) return exePath.slice(0, idx + 4);
  return exePath.endsWith('.app') ? exePath : null;
};

/**
 * 현재 앱이 종료되길 기다렸다가 번들을 교체하고 재실행하는 detached 스왑 스크립트. (순수)
 *
 * 크래시 안전: 새 번들을 .new로 먼저 복사 → 기존을 .old로 원자적 rename(같은 부모 디렉터리)
 * → .new를 제자리로 rename. 마지막 단계가 실패하면 .old를 즉시 되돌려, 어느 시점에 죽어도
 * 항상 유효한 번들이 한 개는 남도록 한다(앱이 사라지는 창을 없앤다).
 */
export const buildSwapScript = (pid: number, newApp: string, bundle: string, tmpDir: string): string =>
  [
    `while kill -0 ${pid} 2>/dev/null; do sleep 0.3; done`,
    `/usr/bin/ditto "${newApp}" "${bundle}.new" || exit 1`,
    `mv "${bundle}" "${bundle}.old" || exit 1`,
    `mv "${bundle}.new" "${bundle}" || { mv "${bundle}.old" "${bundle}"; exit 1; }`,
    `rm -rf "${bundle}.old" "${tmpDir}"`,
    `open "${bundle}"`,
    '',
  ].join('\n');

/**
 * 무서명 macOS 자가 업데이트 (swagger-man/Tauri 원리의 Electron 이식).
 *
 * latest-mac.yml에서 현재 아키텍처용 zip을 받아 sha512로 검증 → ditto로 압축 해제 →
 * 앱 종료 후 .app 번들을 교체하고 재실행하는 detached 스크립트를 띄운다.
 * (앱이 직접 받은 파일은 quarantine이 붙지 않아 Gatekeeper 재차단 없음)
 *
 * 호출 측은 이 함수가 성공하면 app.quit()으로 종료해야 스왑이 진행된다.
 */
export const applyMacUpdate = async (): Promise<void> => {
  const ymlText = await fetchText(`${RELEASE_BASE}/latest-mac.yml`);
  const file = pickMacFile(parseMacYmlFiles(ymlText), process.arch);
  if (!file) throw new Error(`현재 아키텍처(${process.arch})에 맞는 macOS 빌드를 찾지 못했습니다`);

  const buf = await fetchBuffer(`${RELEASE_BASE}/${file.url}`);
  const actual = sha512Base64(buf);
  if (actual !== file.sha512) {
    throw new Error('업데이트 무결성 검증 실패 (sha512 불일치)');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-update-'));
  const zipPath = path.join(tmpDir, file.url);
  fs.writeFileSync(zipPath, buf);
  await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, tmpDir]);

  const appName = fs.readdirSync(tmpDir).find((name) => name.endsWith('.app'));
  if (!appName) throw new Error('압축 해제 결과에서 .app 번들을 찾지 못했습니다');
  const bundle = bundleRootFromExe(process.execPath);
  if (!bundle) throw new Error(`현재 앱 번들 경로를 확인하지 못했습니다: ${process.execPath}`);

  const script = buildSwapScript(process.pid, path.join(tmpDir, appName), bundle, tmpDir);
  log.info('mac 업데이트 적용 — 종료 후 번들 교체·재실행 예약', { bundle, version: file.url });
  const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' });
  child.unref();
};

const fetchText = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패(${res.status}): ${url}`);
  return res.text();
};

const fetchBuffer = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패(${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
