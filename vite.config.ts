import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { qrcode } from 'vite-plugin-qrcode';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: true, // 开启局域网访问
    },
    plugins: [
      react(),
      basicSsl(), // 自动生成自签名证书
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
    // 相对路径：兼容 Vercel 根路径 与 GitHub Pages 子路径部署
    base: './',
  };
});
