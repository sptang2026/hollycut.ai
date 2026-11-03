import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { qrcode } from 'vite-plugin-qrcode';
import { createKieHandler } from './server/kieProxy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '127.0.0.1', // 本机默认仅监听回环地址
    },
    plugins: [
      {
        name: 'local-kie-api',
        configureServer(server) {
          const handler = createKieHandler(() => process.env.KIE_API_KEY || env.KIE_API_KEY);
          server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] === '/api/kie') void handler(req, res);
            else next();
          });
        },
      },
      react(),
      qrcode() // 终端显示二维码
    ],
    define: {
      // 'process.env': {} // 安全起见，移除了不必要的环境变量注入
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // PWA 与服务端 API 均部署在 Vercel 根路径。
    base: '/',
  };
});
