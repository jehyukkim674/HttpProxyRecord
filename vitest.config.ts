import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 기본 환경은 node (프록시/sqlite/순수함수 테스트). 렌더러 훅 테스트는 파일 상단
    // `// @vitest-environment happy-dom` 주석으로 개별 opt-in 한다.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/renderer/src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
