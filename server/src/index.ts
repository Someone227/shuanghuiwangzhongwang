import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { policiesRouter } from './routes/policies.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api', healthRouter);
app.use('/api', policiesRouter);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

app.listen(config.port, () => {
  console.log(`[server] 能申吗 API 已启动: http://127.0.0.1:${config.port}`);
  console.log(`[server] 健康检查: http://127.0.0.1:${config.port}/api/health`);
});