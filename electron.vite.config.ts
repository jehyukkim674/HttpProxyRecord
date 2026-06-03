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
