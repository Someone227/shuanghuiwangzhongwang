<script setup lang="ts">
const steps = [
  { no: '01', title: '贴政策', desc: '粘贴政策原文，支持正文 + 附件条款一起入库' },
  { no: '02', title: 'AI 抽条件', desc: '自动抽取成结构化条件树：学历、年级、成绩、户籍、时间…' },
  { no: '03', title: '填自己', desc: '一张表单写清个人情况，字段随政策动态变化' },
  { no: '04', title: '逐条判定', desc: '每条给出「符合 / 不符合（差在哪）/ 需人工确认」' },
  { no: '05', title: '回溯原文', desc: '每条判定都能点回政策原文的对应条款' },
  { no: '06', title: '出结果', desc: '材料清单 + 时间轴提醒，不再漏材料、错过截止日' },
];
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-16">
    <div class="max-w-3xl">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
      >
        项目骨架已就绪 · 正在开发核心功能
      </span>

      <h1 class="mt-5 text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">
        贴一份政策原文，
        <span class="text-brand-600">30 秒</span>
        知道自己够不够格。
      </h1>

      <p class="mt-5 text-base leading-relaxed text-slate-600">
        奖助学金、专项补贴、保研推免、人才落户 —— 政策文件动辄上万字，条件散落在正文、附件和脚注里。
        学生和普通市民最常问的其实只有一句话：<strong class="font-semibold text-slate-900">「我能申吗？」</strong>
      </p>

      <div class="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled
          class="cursor-not-allowed rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white opacity-60"
        >
          开始匹配（开发中）
        </button>
        <button
          type="button"
          disabled
          class="cursor-not-allowed rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-500"
        >
          看一份示例政策
        </button>
      </div>
    </div>

    <section class="mt-16">
      <h2 class="text-sm font-semibold tracking-wider text-slate-400 uppercase">六步走完一条链路</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="step in steps"
          :key="step.no"
          class="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
        >
          <div class="flex items-baseline gap-3">
            <span class="text-xs font-mono font-semibold text-brand-500">{{ step.no }}</span>
            <h3 class="text-base font-semibold text-slate-900">{{ step.title }}</h3>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ step.desc }}</p>
        </article>
      </div>
    </section>

    <section class="mt-16 rounded-2xl border border-slate-200 bg-white p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-slate-900">当前阶段</h2>
          <p class="mt-1 text-sm text-slate-600">
            骨架 / 依赖 / 前后端联调链路已通；下一步：数据模型 → 政策抽取 → 逐条判定。
          </p>
        </div>
        <div class="flex gap-2 text-xs text-slate-500">
          <span class="rounded-md bg-slate-100 px-2.5 py-1">vue-router</span>
          <span class="rounded-md bg-slate-100 px-2.5 py-1">pinia</span>
          <span class="rounded-md bg-slate-100 px-2.5 py-1">tailwind v4</span>
        </div>
      </div>
    </section>
  </div>
</template>
