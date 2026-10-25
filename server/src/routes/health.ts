import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'neng-shen-ma-api',
    version: '0.1.0',
    time: new Date().toISOString(),
  });
});
