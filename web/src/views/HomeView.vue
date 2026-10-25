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

const faqs = [
  {
    q: '判定结果准吗？',
    a: '每一条判定都比对你的填写值与政策原文条款，并给出原文出处；结论只反映你填写的信息，最终是否通过仍以学校、主管部门审核为准。',
  },
  {
    q: '需要注册或填 API Key 吗？',
    a: '都不需要。大模型只在「建库」阶段用过一次，把政策原文抽成条件树；你打开网页做判定时，跑的是服务端本地规则引擎，不联网、不消耗 token。',
  },
  {
    q: '我填的家庭情况、成绩会被保存吗？',
    a: '不会。判定页的表单只存在当前页面内存里，离开或刷新就清空，浏览器本地和服务端都不留填报内容。登录后「我的判定记录」只保存政策名称和符合/待补充的数量。',
  },
  {
    q: '政策会不会已经过期？',
    a: '数据里对已知的过时条款做了显式标注（例如 2008 年办法里的贷款额度和试点省份），并在政策详情页提示现行标准；不确定的条款按「待补充」处理，不会算成「不符合」。',
  },
  {
    q: '这些政策原文是从哪来的？',
    a: '全部来自教育部、财政部、全国学生资助管理中心等官方网站的公开文件，逐字存档在仓库 data/policies/raw 目录，可逐份核对。',
  },
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
        已收录 {{ totals?.policies ?? 31 }} 份国家级政策 · 逐条判定 + 原文回溯
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

    <section class="mt-16 rounded-2xl border border-slate-200 bg-white p-6">
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

    <section class="mt-12">
      <h2 class="text-sm font-semibold tracking-wider text-slate-400 uppercase">常见问题</h2>
      <div class="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <details v-for="(item, i) in faqs" :key="item.q" class="group px-5 py-4" :open="i === 0">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-slate-800">
            {{ item.q }}
            <span class="shrink-0 text-slate-400"><span class="group-open:hidden">＋</span><span class="hidden group-open:inline">−</span></span>
          </summary>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ item.a }}</p>
        </details>
      </div>
    </section>
  </div>
</template>
