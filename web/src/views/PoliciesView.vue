<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { hitSnippet, matchScore } from '@domain/search';

import type { PolicySummary } from '@/lib/api';
import { getPolicy, listPolicies } from '@/lib/api';

/** 分类筛选的固定顺序：先高校资助，再升学就业，最后基础教育与民生兜底 */
const CATEGORY_ORDER = [
  '奖学金',
  '助学金',
  '助学贷款',
  '勤工助学',
  '入伍资助',
  '困难认定',
  '基层就业',
  '推免保研',
  '升学专项',
  '学前教育',
  '义务教育',
  '普通高中',
  '中职资助',
  '社会救助',
];

const policies = ref<PolicySummary[]>([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const activeCategory = ref('全部');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const list = await listPolicies();
    // 按分类顺序排列，同类内保持接口返回顺序，翻起来更像一本政策目录
    const rank = (c: string): number => {
      const i = CATEGORY_ORDER.indexOf(c);
      return i === -1 ? CATEGORY_ORDER.length : i;
    };
    policies.value = [...list].sort((a, b) => rank(a.category) - rank(b.category));
  } catch (err) {
    error.value = err instanceof Error ? err.message : '政策库加载失败';
  } finally {
    loading.value = false;
  }
}

const categories = computed(() => {
  const seen = new Set<string>();
  for (const p of policies.value) {
    if (p.category) seen.add(p.category);
  }
  const ordered = CATEGORY_ORDER.filter((c) => seen.has(c));
  const rest = [...seen].filter((c) => !CATEGORY_ORDER.includes(c));
  return ['全部', ...ordered, ...rest];
});

/**
 * 原文语料：用户开始搜关键词后再懒加载 32 份政策全文（约 700KB，只加载一次）。
 *
 * 为什么值得加载：搜索框要能搜到原文里的句子，而不只是标题。
 * 加载失败时静默降级 —— 只按标题、发布单位、类别、年份搜。
 */
const corpus = ref<Record<string, string> | null>(null);
const corpusLoading = ref(false);

async function ensureCorpus(): Promise<void> {
  if (corpus.value || corpusLoading.value) return;
  corpusLoading.value = true;
  try {
    const loaded = await Promise.all(policies.value.map((p) => getPolicy(p.id).catch(() => null)));
    const map: Record<string, string> = {};
    for (const policy of loaded) if (policy) map[policy.id] = policy.originalText;
    corpus.value = map;
  } finally {
    corpusLoading.value = false;
  }
}

watch(keyword, (value) => {
  if (value.trim().length >= 2) void ensureCorpus();
});

/**
 * 搜索命中结果：标题、发布单位、类别、级别、年份先匹配；
 * 都对不上再看原文（宽松匹配，漏一两个字也算）。
 */
const hits = computed<{ policy: PolicySummary; snippet: string | null }[]>(() => {
  const kw = keyword.value.trim();
  const inCategory = (policy: PolicySummary): boolean =>
    activeCategory.value === '全部' || policy.category === activeCategory.value;
  const base = policies.value.filter(inCategory);
  if (!kw) return base.map((policy) => ({ policy, snippet: null }));

  const scored: { policy: PolicySummary; snippet: string | null; score: number }[] = [];
  for (const policy of base) {
    const meta = `${policy.title} ${policy.issuer} ${policy.category} ${policy.level} ${policy.year}`;
    const metaScore = matchScore(kw, meta, 'field');
    if (metaScore > 0) {
      scored.push({ policy, snippet: null, score: metaScore + 5 });
      continue;
    }
    const text = corpus.value?.[policy.id];
    if (!text) continue;
    if (matchScore(kw, text, 'document') > 0) {
      scored.push({ policy, snippet: hitSnippet(kw, text), score: 1 });
    }
  }
  // 有关键词时按相关度排；没有关键词时保持接口里的政策目录顺序
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ policy, snippet }) => ({ policy, snippet }));
});

const filtered = computed(() => hits.value.map((hit) => hit.policy));
const snippetById = computed(() => {
  const map = new Map<string, string>();
  for (const hit of hits.value) if (hit.snippet) map.set(hit.policy.id, hit.snippet);
  return map;
});

/** 每页 8 份，32 份政策正好四页 */
const PAGE_SIZE = 8;
const currentPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const paged = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

function goPage(n: number): void {
  currentPage.value = Math.min(Math.max(1, n), totalPages.value);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 换筛选条件或搜新词时回到第一页；结果变少时把页码夹回范围内
watch([keyword, activeCategory], () => {
  currentPage.value = 1;
});
watch(totalPages, (n) => {
  if (currentPage.value > n) currentPage.value = n;
});

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-12">
    <header class="max-w-3xl">
      <span class="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        政策库 · 已收录 {{ policies.length || 32 }} 份国家级政策
      </span>
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-ink">选一份政策，看看自己够不够格</h1>
      <p class="mt-3 text-sm leading-relaxed text-ink-2">
        每份政策都已经拆成「可判定的条件树」并经过人工复核：原文段落、字段、硬性条件、材料清单全部结构化。
        你只需填自己的情况，逐条判定和原文出处立刻可见。
      </p>
    </header>

    <div v-if="loading" class="mt-10 grid gap-4 sm:grid-cols-2">
      <div v-for="i in 8" :key="i" class="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>

    <div v-else-if="error" class="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">政策库加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-on-brand" @click="load">重试</button>
    </div>

    <template v-else>
      <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in categories"
            :key="c"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
            :class="
              activeCategory === c
                ? 'border-brand-600 bg-brand-600 text-on-brand'
                : 'border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700'
            "
            @click="activeCategory = c"
          >
            {{ c }}
          </button>
        </div>
        <label class="relative block sm:w-80">
          <input
            v-model="keyword"
            type="search"
            placeholder="搜名称、发布单位、原文关键词"
            class="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm text-ink-2 placeholder:text-faint focus:border-brand-400 focus:outline-none"
          />
          <svg class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" stroke-linecap="round" />
          </svg>
        </label>
      </div>

      <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
        <span>共 {{ policies.length }} 份政策，当前筛选出 {{ filtered.length }} 份</span>
        <span v-if="snippetById.size > 0" class="text-brand-700">其中 {{ snippetById.size }} 份是原文命中</span>
        <span v-else-if="corpusLoading" class="text-muted">正在加载原文索引……</span>
        <span v-else-if="keyword.trim().length >= 2" class="text-muted">关键词可不必一字不差，漏一两个字也能搜到</span>
      </p>

      <div v-if="filtered.length === 0" class="mt-8 rounded-2xl border border-dashed border-line-2 bg-surface px-6 py-12 text-center">
        <p class="text-sm text-muted">
          {{ corpusLoading ? '正在加载原文索引，稍等一下……' : '没有匹配的政策，换个关键词或分类试试。' }}
        </p>
        <button
          type="button"
          class="mt-3 rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:border-brand-300 hover:text-brand-700"
          @click="keyword = ''; activeCategory = '全部'"
        >
          清空筛选
        </button>
      </div>

      <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
        <article
          v-for="policy in paged"
          :key="policy.id"
          class="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-brand-300 hover:shadow-sm"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              :class="
                policy.level === '国家级'
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-line bg-surface-2 text-ink-2'
              "
              >{{ policy.level }}</span
            >
            <span class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">{{ policy.category }}</span>
            <span
              v-if="policy.review?.humanReviewed"
              class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
              >人工复核</span
            >
          </div>

          <h2 class="mt-3 text-base font-semibold leading-snug text-ink">
            <RouterLink :to="`/policies/${policy.id}`" class="transition hover:text-brand-600">
              {{ policy.title }}
            </RouterLink>
          </h2>
          <p class="mt-1 text-xs text-faint">{{ policy.issuer }}</p>
          <p
            v-if="snippetById.get(policy.id)"
            class="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs leading-relaxed text-muted"
            :title="snippetById.get(policy.id)"
          >
            <span class="text-faint">原文命中：</span>{{ snippetById.get(policy.id) }}
          </p>
          <RouterLink
            :to="`/policies/${policy.id}`"
            class="mt-1.5 inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand-600"
          >
            看条件 / 材料 / 原文 →
          </RouterLink>

          <dl class="mt-4 mb-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-ink-2">{{ policy.stats.conditions }}</dd>
              <dt>条判定</dt>
            </div>
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-ink-2">{{ policy.stats.fields }}</dd>
              <dt>个字段</dt>
            </div>
            <div class="flex items-baseline gap-1">
              <dd class="font-semibold tabular-nums text-ink-2">{{ policy.stats.materials }}</dd>
              <dt>份材料</dt>
            </div>
          </dl>

          <RouterLink
            :to="`/match/${policy.id}`"
            class="mt-auto inline-flex items-center justify-center rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition group-hover:border-brand-600 group-hover:bg-brand-600 group-hover:text-on-brand"
          >
            开始匹配 →
          </RouterLink>
        </article>
      </div>
    </template>

    <nav v-if="!loading && !error && filtered.length > 0" class="mt-8 flex flex-col items-center gap-3">
      <div class="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          class="rounded-lg border px-3 py-2 text-sm transition"
          :class="
            currentPage === 1
              ? 'cursor-not-allowed border-line bg-surface text-faint'
              : 'border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700'
          "
          :disabled="currentPage === 1"
          @click="goPage(currentPage - 1)"
        >
          ← 上一页
        </button>
        <button
          v-for="n in totalPages"
          :key="n"
          type="button"
          class="h-9 w-9 rounded-lg border text-sm font-medium tabular-nums transition"
          :class="
            n === currentPage
              ? 'border-brand-600 bg-brand-600 text-on-brand'
              : 'border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700'
          "
          @click="goPage(n)"
        >
          {{ n }}
        </button>
        <button
          type="button"
          class="rounded-lg border px-3 py-2 text-sm transition"
          :class="
            currentPage === totalPages
              ? 'cursor-not-allowed border-line bg-surface text-faint'
              : 'border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700'
          "
          :disabled="currentPage === totalPages"
          @click="goPage(currentPage + 1)"
        >
          下一页 →
        </button>
      </div>
      <p class="text-xs text-faint">第 {{ currentPage }} / {{ totalPages }} 页 · 共 {{ filtered.length }} 份</p>
    </nav>

    <p class="mt-8 text-xs text-faint">
      政策原文均来自教育部、全国学生资助管理中心等官方网站；条款抽取由大模型完成，并逐条人工复核，过时条款已显式标注。
    </p>
  </div>
</template>