<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { listPolicies } from '@/lib/api';

const steps = [
  { no: '01', title: '政策入库', desc: '原文来自教育部、全国学生资助管理中心官网，逐字存档不加工' },
  { no: '02', title: 'AI 抽条件', desc: 'DeepSeek 把上万字原文抽成结构化条件树：学历、年级、户籍、金额…' },
  { no: '03', title: '人工复核', desc: '逐条核对条款与引用，过时条款（如 2008 年的贷款额度）显式标注' },
  { no: '04', title: '填自己', desc: '表单字段由政策动态生成，只问这份政策真正用得上的信息' },
  { no: '05', title: '本地判定', desc: '运行期零 token：规则引擎在服务端本地逐条判定，可复现、可单测' },
  { no: '06', title: '回溯原文', desc: '每条结论都能点回原文章节并高亮原句，结论有据可查' },
];

const stacks = ['Vue 3', 'Vite', 'Tailwind v4', 'TypeScript', 'Express', 'DeepSeek'];

const sceneTags = [
  '国家奖学金',
  '励志奖学金',
  '助学金',
  '助学贷款',
  '勤工助学',
  '入伍资助',
  '困难认定',
  '基层就业',
  '推免保研',
  '公费师范',
  '中职资助',
  '社会救助',
];

type Totals = { policies: number; conditions: number; fields: number; materials: number };

const totals = ref<Totals | null>(null);

onMounted(async () => {
  try {
    const list = await listPolicies();
    totals.value = list.reduce<Totals>(
      (acc, p) => ({
        policies: acc.policies + 1,
        conditions: acc.conditions + p.stats.conditions,
        fields: acc.fields + p.stats.fields,
        materials: acc.materials + p.stats.materials,
      }),
      { policies: 0, conditions: 0, fields: 0, materials: 0 },
    );
  } catch {
    // 首页统计拿不到就不展示，不影响主流程
  }
});

const statItems = [
  { label: '份国家级政策', key: 'policies' as const },
  { label: '条可判定条件', key: 'conditions' as const },
  { label: '个表单字段', key: 'fields' as const },
  { label: '份申请材料', key: 'materials' as const },
];
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-16">
    <div class="max-w-3xl">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
      >
        已收录 {{ totals?.policies ?? 32 }} 份国家级政策 · 逐条判定 + 原文回溯
      </span>

      <h1 class="mt-5 text-3xl leading-snug font-semibold tracking-tight text-balance text-slate-800 sm:text-4xl">
        贴一份政策原文，
        <span class="text-brand-500">30 秒</span>
        知道自己够不够格。
      </h1>

      <p class="mt-5 text-base leading-relaxed text-slate-600">
        奖助学金、专项补贴、保研推免、人才落户 —— 政策文件动辄上万字，条件散落在正文、附件和脚注里。
        学生和普通市民最常问的其实只有一句话：<strong class="font-semibold text-slate-900">「我能申吗？」</strong>
      </p>

      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink
          to="/policies"
          class="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          开始匹配 →
        </RouterLink>
        <RouterLink
          to="/radar"
          class="rounded-lg border border-brand-300 bg-brand-50 px-6 py-3 text-sm font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-100"
        >
          政策雷达 · 横评 32 份
        </RouterLink>
        <RouterLink
          to="/calendar"
          class="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
        >
          看全年申报日历
        </RouterLink>
      </div>

      <p class="mt-3 text-xs text-slate-400">无需注册、无需 API Key，打开就能用。</p>
    </div>

    <section v-if="totals" class="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
      <div v-for="item in statItems" :key="item.key" class="bg-white px-5 py-6">
        <div class="font-mono text-2xl font-semibold tabular-nums text-slate-900">{{ totals[item.key] }}</div>
        <div class="mt-1 text-xs text-slate-500">{{ item.label }}</div>
      </div>
    </section>

    <section class="mt-6 flex flex-wrap items-center gap-2">
      <span class="mr-1 text-xs text-slate-400">覆盖场景</span>
      <span
        v-for="tag in sceneTags"
        :key="tag"
        class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
      >
        {{ tag }}
      </span>
    </section>

    <section class="mt-16">
      <h2 class="text-sm font-semibold tracking-wider text-slate-400 uppercase">六步走完一条链路</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="step in steps"
          :key="step.no"
          class="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
        >
          <div class="flex items-baseline gap-3">
            <span class="font-mono text-xs font-semibold text-brand-500">{{ step.no }}</span>
            <h3 class="text-base font-semibold text-slate-900">{{ step.title }}</h3>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ step.desc }}</p>
        </article>
      </div>
    </section>

    <section class="mt-16 rounded-2xl border border-brand-200 bg-brand-50/60 p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="max-w-2xl">
          <h2 class="text-base font-semibold text-slate-900">不确定从哪份看起？先做一次横向体检</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            32 份政策里共有 333 个表单字段、285 种写法，一份份填不现实。政策雷达只问 26 项共性信息，
            把这些字段映射到每份政策自己的写法上，一次给出「能申 / 差一点 / 还缺信息 / 不符合」四层结论。
          </p>
        </div>
        <RouterLink
          to="/radar"
          class="shrink-0 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          打开政策雷达 →
        </RouterLink>
      </div>
    </section>

    <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="max-w-2xl">
          <h2 class="text-base font-semibold text-slate-900">判定之外，还差一问：什么时候申？</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            奖助学金不是全年都能申请。把 {{ totals?.policies ?? 32 }} 份政策里的时间节点按月份摊开，
            一眼看到哪几个月该准备材料、哪几个月只剩等结果 —— 全部规则解析，可回到原文核对。
          </p>
        </div>
        <RouterLink
          to="/calendar"
          class="shrink-0 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          打开申报日历 →
        </RouterLink>
      </div>
    </section>

    <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-2xl">
          <h2 class="text-base font-semibold text-slate-900">大模型只用在「建库」这一步</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            政策解析是最难的一步，交给 DeepSeek：一次调用把原文抽成条件树，抽取请求与响应全部留档在
            <code class="rounded bg-slate-100 px-1 py-0.5 text-xs">docs/ai-log</code>，可审计、可复现。
            而每一个用户打开网页做判定时，调用的都是本地规则引擎 —— 不联网、不消耗 token、结果稳定可复现。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2 text-xs text-slate-500">
          <span v-for="stack in stacks" :key="stack" class="rounded-md bg-slate-100 px-2.5 py-1">{{ stack }}</span>
        </div>
      </div>
    </section>

  </div>
</template>
