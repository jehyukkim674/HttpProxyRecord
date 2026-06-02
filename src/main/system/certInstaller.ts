import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';

const execFileAsync = promisify(execFile);

/**
 * 루트 CA를 OS 신뢰 저장소에 설치한다.
 * - macOS: osascript 관리자 권한 프롬프트로 system keychain에 추가
 * - Windows: certutil 사용자 저장소 추가 (확인 다이얼로그 표시됨)
 * - 실패 시: 인증서 파일을 열어 사용자가 수동 설치하도록 안내
 */
export const installRootCa = async (certPath: string): Promise<{ ok: boolean; message: string }> => {
  try {
    if (process.platform === 'darwin') {
      const script = `do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '${certPath}'" with administrator privileges`;
      await execFileAsync('osascript', ['-e', script]);
      return { ok: true, message: '루트 인증서를 시스템 키체인에 설치했어요.' };
    }

    if (process.platform === 'win32') {
      await execFileAsync('certutil', ['-addstore', '-user', 'Root', certPath]);
      return { ok: true, message: '루트 인증서를 사용자 신뢰 저장소에 설치했어요.' };
    }

    return { ok: false, message: `지원하지 않는 플랫폼입니다: ${process.platform}` };
  } catch (error) {
    // 사용자가 암호 입력을 취소했거나 권한 부족 — 인증서 파일을 열어 수동 설치 유도
    await shell.openPath(certPath);
    return {
      ok: false,
      message: `자동 설치에 실패했어요 (${error instanceof Error ? error.message : '알 수 없는 오류'}). 인증서 파일을 열었으니 수동으로 신뢰 설정해 주세요.`,
    };
  }
};
