import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 기본 환경은 node (프록시/sqlite/순수함수 테스트). 렌더러 훅 테스트는 파일 상단
    // `// @vitest-environment happy-dom` 주석으로 개별 opt-in 한다.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/renderer/src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // 로직 레이어(shared/hooks/services/main)만 측정한다. 아래는 의도적으로 제외:
      // - 부트스트랩/진입점: Electron·React 기동 코드라 단위 테스트 대상이 아님
      // - 프레젠테이션 컴포넌트(.tsx): 이 프로젝트는 컴포넌트를 얇게 두고 로직은 hooks로 뺀다
      // - 타입/상수 선언, window.api 참조 등 실행 로직이 없는 파일
      exclude: [
        'src/**/*.d.ts',
        'src/shared/types.ts',
        'src/shared/channels.ts',
        'src/main/index.ts',
        'src/preload/**',
        'src/renderer/src/main.tsx',
        'src/renderer/src/App.tsx',
        'src/renderer/src/services/ipc.ts',
        'src/renderer/src/components/**',
        // IPC 채널 등록 와이어링 + Electron 수명주기 오케스트레이터(통합 영역).
        // 핸들러가 호출하는 로직 자체는 각 도메인 모듈 테스트로 커버된다.
        'src/main/appContext.ts',
        'src/main/ipcHandlers.ts',
        'src/main/ipc/*Handlers.ts',
      ],
      reporter: ['text-summary', 'text'],
      // lines/statements/functions는 90% 이상 유지. branches는 모든 에러 분기까지
      // 강제하면 과도하므로 현재 달성치(~72%)를 회귀 방지선으로 둔다.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 70 },
    },
  },
});
