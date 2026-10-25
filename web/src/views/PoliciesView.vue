<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import type { PolicySummary } from '@/lib/api';
import { listPolicies } from '@/lib/api';

const policies = ref<PolicySummary[]>([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const activeCategory = ref('全部');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    policies.value = await listPolicies();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '政策库加载失败';
  } finally {
    loading.value = false;
  }
}

const categories = computed(() => {
  const seen: string[] = [];
  for (const p of policies.value) {
    if (p.category && !seen.includes(p.category)) seen.push(p.category);
  }
  return ['全部', ...seen];
});

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return policies.value.filter((p) => {
    if (activeCategory.value !== '全部' && p.category !== activeCategory.value) return false;
    if (!kw) return true;
    return `${p.title} ${p.issuer} ${p.category}`.toLowerCase().includes(kw);
  });
});

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-12">
    <header class="max-w-3xl">
      <span class="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        政策库 · 已收录 {{ policies.length || 12 }} 份国家级政策
      </span>
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-900">选一份政策，看看自己够不够格</h1>
      <p class="mt-3 text-sm leading-relaxed text-slate-600">
        每份政策都已经拆成「可判定的条件树」并经过人工复核：原文段落、字段、硬性条件、材料清单全部结构化。
        你只需填自己的情况，逐条判定和原文出处立刻可见。
      </p>
    </header>

    <div v-if="loading" class="mt-10 grid gap-4 sm:grid-cols-2">
      <div v-for="i in 4" :key="i" class="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>

    <div v-else-if="error" class="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">政策库加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-white" @click="load">重试</button>
    </div>

    <template v-else>
      <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in categories"
            :key="c"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
            :class="
              activeCategory === c
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
            "
            @click="activeCategory = c"
          >
            {{ c }}
          </button>
        </div>
        <label class="relative block sm:w-64">
          <input
            v-model="keyword"
            type="search"
            placeholder="搜政策名称、发布单位"
            class="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
          />
          <svg class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" stroke-linecap="round" />
          </svg>
        </label>
      </div>

      <p class="mt-3 text-xs text-slate-400">
        共 {{ policies.length }} 份政策，当前筛选出 {{ filtered.length }} 份
      </p>

      <div v-if="filtered.length === 0" class="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p class="text-sm text-slate-500">没有匹配的政策，换个关键词或分类试试。</p>
        <button
          type="button"
          class="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700"
          @click="keyword = ''; activeCategory = '全部'"
        >
          清空筛选
        </button>
      </div>

      <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
        <article
          v-for="policy in filtered"
          :key="policy.id"
          class="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              :class="
                policy.level === '国家级'
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              "
              >{{ policy.level }}</span
            >
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">{{ policy.category }}</span>
            <span
              v-if="policy.review?.humanReviewed"
              class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
              >人工复核</span
            >
          </div>

          <h2 class="mt-3 text-base font-semibold leading-snug text-slate-900">{{ policy.title }}</h2>
          <p class="mt-1 text-xs text-slate-400">{{ policy.issuer }}</p>

          <dl class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-slate-700">{{ policy.stats.conditions }}</dd>
              <dt>条判定</dt>
            </div>
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-slate-700">{{ policy.stats.fields }}</dd>
              <dt>个字段</dt>
            </div>
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-slate-700">{{ policy.stats.materials }}</dd>
              <dt>份材料</dt>
            </div>
          </dl>

          <RouterLink
            :to="`/match/${policy.id}`"
            class="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-brand-600"
          >
            开始匹配 →
          </RouterLink>
        </article>
      </div>
    </template>

    <p class="mt-8 text-xs text-slate-400">
      政策原文均来自教育部、全国学生资助管理中心等官方网站；条款抽取由大模型完成，并逐条人工复核，过时条款已显式标注。
    </p>

    <div v-if="!loading && !error && filtered.length" class="mt-10 flex items-center gap-3 text-xs text-slate-300">
      <span class="h-px flex-1 bg-slate-200" />
      <span>没有更多了 · 共 {{ filtered.length }} 份</span>
      <span class="h-px flex-1 bg-slate-200" />
    </div>
  </div>
</template>
