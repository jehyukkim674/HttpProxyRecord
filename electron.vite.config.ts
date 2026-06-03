import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // 단일 거대 청크(antd+react 합산 ~2.5MB)를 벤더별로 분리한다.
          // 앱 코드만 바뀌어도 벤더 청크는 캐시 재사용되고, 초기 로드는 병렬로 받는다.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // CodeMirror 계열은 정적 청크로 묶지 않는다 — 동적 import(ScriptEditor)와 함께
            // 지연 로드되어 초기 번들에서 빠지도록 Rollup 기본 코드분할에 맡긴다.
            if (
              /[\\/]node_modules[\\/](@codemirror|@lezer|@uiw|codemirror|crelt|style-mod|w3c-keyname)[\\/]/.test(
                id,
              )
            ) {
              return undefined;
            }
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/.test(id)) {
              return 'react-vendor';
            }
            if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/.test(id)) {
              return 'antd-vendor';
            }
            return 'vendor';
          },
        },
      },
    },
  },
});
