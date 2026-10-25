import cors from 'cors';
import express from 'express';

import { ensureDemoUser, DEMO_USERNAME } from './auth/users.js';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { policiesRouter } from './routes/policies.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', meRouter);
app.use('/api', policiesRouter);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// 演示账号：保证任意一台电脑部署后都能用 README 里的账号登录查验
const demo = ensureDemoUser(config.auth.demoPassword);
if (demo.created) {
  console.log(`[server] 已创建演示账号「${DEMO_USERNAME}」（密码见 README）`);
}

app.listen(config.port, () => {
  console.log(`[server] 能申吗 API 已启动: http://127.0.0.1:${config.port}`);
  console.log(`[server] 健康检查: http://127.0.0.1:${config.port}/api/health`);
  console.log('[server] 多台电脑查验：同一局域网下用「本机 IP + 前端端口」访问即可共用同一套账号');
});
