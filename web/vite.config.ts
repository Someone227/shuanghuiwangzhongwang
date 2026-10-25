import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * 把 server/ 里的领域模型（纯 TS、无 node 依赖）借给前端用。
 *
 * 静态部署（GitHub Pages）时判定引擎直接在浏览器里跑，不需要后端 —— 这样任何人打开
 * 网页都能用，评委不必装环境、也不用配 API Key。
 *
 * server 按 NodeNext 风格写 `./types.js`，浏览器打包器需要把它映射回 `.ts`。
 */
function nodenextToBundler(): Plugin {
  return {
    name: 'nodenext-to-bundler',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('.js')) return null;
      if (!/[\\/]server[\\/]src[\\/]domain[\\/]/.test(importer)) return null;
      const candidate = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
      return fs.existsSync(candidate) ? candidate : null;
    },
  };
}

/** 部署路径归一化：GitHub Pages 项目页形如 /<repo>/，保证前后都带斜杠 */
function normalizeBase(raw: string | undefined): string {
  if (!raw) return '/';
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig(({ mode }) => {
  // .env.pages 里配置 GitHub Pages 专用的 base / 静态模式开关，
  // 避免和「后端服务器部署」的默认构建混在一起。
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: normalizeBase(env.VITE_BASE),
    plugins: [vue(), tailwindcss(), nodenextToBundler()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@domain': fileURLToPath(new URL('../server/src/domain', import.meta.url)),
      },
    },
    server: {
      // 监听 0.0.0.0：同一局域网的其他电脑可以用 http://<本机IP>:5173 打开
      // （只写 127.0.0.1 时，别的电脑访问会 ERR_CONNECTION_REFUSED）
      host: true,
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
  };
});
