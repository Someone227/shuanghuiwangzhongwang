import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      // 编辑器/工具会在源码目录旁写临时文件与临时目录，Windows 下监听它们可能报 EBUSY 并把整个 dev 进程带崩
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/.*.tmp/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
