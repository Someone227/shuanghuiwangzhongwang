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
  auth: {
    /**
     * 演示账号密码：公开写在 README 里，供评委 / 老师在不同电脑上登录查验。
     * 首次启动时若演示账号不存在会自动创建（之后改这里不会覆盖已有密码）。
     */
    demoPassword: process.env.DEMO_ACCOUNT_PASSWORD ?? 'NengShenMa2026',
  },
  databaseFile: process.env.DATABASE_FILE ?? './data/app.db',
};

/** 需要真实调用大模型时才校验 Key，避免骨架阶段启动失败 */
export function requireDeepSeekKey(): string {
  return required('DEEPSEEK_API_KEY');
}
