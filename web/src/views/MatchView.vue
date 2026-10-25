<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import PolicyText from '@/components/PolicyText.vue';
import ProfileForm from '@/components/ProfileForm.vue';
import VerdictReport from '@/components/VerdictReport.vue';
import type { EvaluationResult, Policy, Profile } from '@/lib/api';
import { evaluatePolicy, getPolicy } from '@/lib/api';
import { cleanProfile, createEmptyProfile, loadDraft, saveDraft } from '@/lib/profile';

const route = useRoute();
const policyId = computed(() => String(route.params.id ?? ''));

const policy = ref<Policy | null>(null);
const profile = ref<Profile>({});
const result = ref<EvaluationResult | null>(null);
const loading = ref(true);
const error = ref('');
const evaluating = ref(false);
const evaluateError = ref('');
const stale = ref(false);
const showNotes = ref(false);
const tab = ref<'report' | 'original'>('report');
const activeSectionId = ref<string | null>(null);
const activeQuote = ref('');

const stats = computed(() => {
  const p = policy.value;
  if (!p) return [];
  return [
    { label: '判定条件', value: p.conditions.reduce((sum, group) => sum + group.conditions.length, 0) },
    { label: '需填写字段', value: p.fields.length },
    { label: '材料', value: p.materials.length },
    { label: '时间节点', value: p.deadlines.length },
  ];
});

const levelTone = computed(() =>
  policy.value?.level === '国家级' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-600',
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const data = await getPolicy(policyId.value);
    policy.value = data;
    const empty = createEmptyProfile(data.fields);
    profile.value = { ...empty, ...(loadDraft(data.id) ?? {}) };
  } catch (err) {
    error.value = err instanceof Error ? err.message : '政策加载失败';
    policy.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(policyId, load);

watch(
  profile,
  (value) => {
    if (policy.value) saveDraft(policy.value.id, value);
    if (result.value) stale.value = true;
  },
  { deep: true },
);

async function runEvaluate(): Promise<void> {
  if (!policy.value) return;
  evaluating.value = true;
  evaluateError.value = '';
  try {
    result.value = await evaluatePolicy(policy.value.id, cleanProfile(profile.value));
    stale.value = false;
    tab.value = 'report';
    await nextTick();
    document.getElementById('verdict-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    evaluateError.value = err instanceof Error ? err.message : '判定失败';
  } finally {
    evaluating.value = false;
  }
}

/** 表单很长，滚到底部才能点按钮；支持 Ctrl/Cmd + Enter 直接判定 */
function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    void runEvaluate();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

async function locate(docRef: string, quote: string): Promise<void> {
  activeSectionId.value = docRef;
  activeQuote.value = quote;
  tab.value = 'original';
  await nextTick();
  // 只把右栏滚到视野内；原文面板内部的段落定位由 PolicyText 自己处理
  document.getElementById('verdict-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const filledFromDraft = ref(false);
watch(policy, () => {
  filledFromDraft.value = !!policy.value && Object.values(profile.value).some((v) => v !== '' && v !== undefined);
});
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <RouterLink to="/policies" class="text-sm text-slate-500 transition hover:text-brand-600">← 返回政策库</RouterLink>

    <!-- 加载中 -->
    <div v-if="loading" class="mt-8 space-y-3">
      <div class="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" />
      <div class="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
      <div class="mt-6 h-64 animate-pulse rounded-2xl bg-slate-100" />
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">政策加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-white" @click="load">重试</button>
    </div>

    <template v-else-if="policy">
      <!-- 政策信息 -->
      <header class="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="levelTone">{{ policy.level }}</span>
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">{{ policy.category }}</span>
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">{{ policy.year }} 年</span>
          <span
            v-if="policy.review?.humanReviewed"
            class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
            >已人工复核 {{ policy.review.reviewedAt }}</span
          >
          <span class="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-500">
            AI 建库 · {{ policy.extraction.model ?? policy.extraction.engine }}
          </span>
        </div>

        <h1 class="mt-3 text-2xl font-bold tracking-tight text-slate-900">{{ policy.title }}</h1>
        <p class="mt-1.5 text-sm text-slate-500">
          发布单位：{{ policy.issuer }}
          <a
            v-if="policy.sourceUrl"
            :href="policy.sourceUrl"
            target="_blank"
            rel="noreferrer"
            class="ml-2 text-brand-600 hover:text-brand-700"
            >官方原文 ↗</a
          >
        </p>

        <dl class="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          <div v-for="item in stats" :key="item.label" class="flex items-baseline gap-1.5">
            <dd class="text-lg font-semibold tabular-nums text-slate-800">{{ item.value }}</dd>
            <dt class="text-xs text-slate-400">{{ item.label }}</dt>
          </div>
        </dl>

        <div v-if="policy.notes.length || policy.review?.changes.length" class="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <button type="button" class="flex w-full items-center justify-between text-left" @click="showNotes = !showNotes">
            <span class="text-sm font-medium text-amber-900">政策说明与过时条款提示</span>
            <span class="text-xs text-amber-700">{{ showNotes ? '收起' : '展开' }}</span>
          </button>
          <ul v-if="showNotes" class="mt-2 space-y-1.5">
            <li v-for="(note, index) in policy.notes" :key="index" class="text-xs leading-relaxed text-amber-900/85">
              · {{ note }}
            </li>
            <li v-for="(change, index) in policy.review?.changes ?? []" :key="`c${index}`" class="text-xs leading-relaxed text-amber-800/70">
              · 人工复核：{{ change }}
            </li>
          </ul>
        </div>
      </header>

      <div class="mt-6 grid gap-6 lg:grid-cols-12">
        <!-- 左：填表 -->
        <div class="lg:col-span-5">
          <div class="lg:sticky lg:top-20">
            <ProfileForm v-model="profile" :fields="policy.fields" />

            <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                class="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="evaluating"
                @click="runEvaluate"
              >
                {{ evaluating ? '正在判定…' : result ? '重新判定' : '开始判定' }}
              </button>
              <p class="mt-1.5 text-center text-xs text-slate-400">填完可以按 Ctrl + Enter 直接判定</p>
              <p v-if="evaluateError" class="mt-2 text-xs text-rose-600">{{ evaluateError }}</p>
              <p v-if="stale" class="mt-2 text-xs text-amber-600">你改动了表单，建议重新判定以刷新结论。</p>
              <p v-if="filledFromDraft" class="mt-2 text-xs text-slate-400">
                已从本地草稿恢复上次填写的内容（只存在你自己的浏览器里）。
              </p>
            </div>
          </div>
        </div>

        <!-- 右：结果 / 原文 -->
        <div id="verdict-top" class="scroll-mt-20 lg:col-span-7">
          <div class="mb-4 flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
              :class="tab === 'report' ? 'bg-brand-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'"
              @click="tab = 'report'"
            >
              判定结果
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
              :class="tab === 'original' ? 'bg-brand-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'"
              @click="tab = 'original'"
            >
              政策原文
            </button>
          </div>

          <template v-if="tab === 'report'">
            <VerdictReport v-if="result" :result="result" :policy="policy" @locate="locate" />
            <div v-else class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p class="text-base font-medium text-slate-700">还没有判定结果</p>
              <p class="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                左侧按政策字段填一下自己的情况，点「开始判定」，就能看到逐条结论、差在哪、以及每条对应的原文条款。
              </p>
              <p class="mt-4 text-xs text-slate-400">判定全部在本地完成，不上传、不调用大模型。</p>
            </div>
          </template>

          <PolicyText
            v-else
            :policy="policy"
            :active-section-id="activeSectionId"
            :active-quote="activeQuote"
          />
        </div>
      </div>
    </template>
  </div>
</template>
