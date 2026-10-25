import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`缺少环境变量 ${name}，请复制 .env.example 为 .env 并填写`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    modelChat: process.env.DEEPSEEK_MODEL_CHAT ?? 'deepseek-chat',
    modelReasoner: process.env.DEEPSEEK_MODEL_REASONER ?? 'deepseek-reasoner',
  },
  databaseFile: process.env.DATABASE_FILE ?? './data/app.db',
};

/** 需要真实调用大模型时才校验 Key，避免骨架阶段启动失败 */
export function requireDeepSeekKey(): string {
  return required('DEEPSEEK_API_KEY');
}
