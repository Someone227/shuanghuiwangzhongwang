<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import PolicyText from '@/components/PolicyText.vue';
import ProfileForm from '@/components/ProfileForm.vue';
import VerdictReport from '@/components/VerdictReport.vue';
import type { Policy as DomainPolicy } from '@domain/types';
import { buildPolicyProfile } from '@domain/radar';
import type { EvaluationResult, Policy, Profile } from '@/lib/api';
import { evaluatePolicy, getPolicy } from '@/lib/api';
import { clearProgress, clearRemoteDraft, isLoggedIn, saveProgress, saveRecord } from '@/lib/auth';
import { cleanProfile, clearAllDrafts, createEmptyProfile, filledCount } from '@/lib/profile';

/** 与 RadarView / AccountView 共用同一个草稿 key：雷达里填过的画像可以直接带进判定页 */
const RADAR_DRAFT_KEY = 'radar-draft-v1';

/** 从政策雷达画像里，把这份政策用得到的字段预先填好（用户可改） */
function inheritFromRadar(policy: Policy): { profile: Profile; count: number } {
  const base = createEmptyProfile(policy.fields);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RADAR_DRAFT_KEY);
  } catch {
    return { profile: base, count: 0 };
  }
  if (!raw) return { profile: base, count: 0 };

  try {
    const slots = JSON.parse(raw) as Record<string, unknown>;
    if (!slots || typeof slots !== 'object') return { profile: base, count: 0 };
    const { profile: mapped } = buildPolicyProfile(policy as unknown as DomainPolicy, slots);
    let count = 0;
    for (const [key, value] of Object.entries(mapped)) {
      // 只写政策里确实存在的字段，且只填空值 —— 不覆盖任何已有内容
      if (!(key in base) || value === undefined) continue;
      base[key] = value;
      count += 1;
    }
    return { profile: base, count };
  } catch {
    return { profile: base, count: 0 };
  }
}

const route = useRoute();
const policyId = computed(() => String(route.params.id ?? ''));

const policy = ref<Policy | null>(null);
const profile = ref<Profile>({});
/** 从政策雷达画像带入了几项（0 表示没填过雷达 / 这份政策用不上画像） */
const inheritedCount = ref(0);
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
  policy.value?.level === '国家级' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-surface-2 text-ink-2',
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const data = await getPolicy(policyId.value);
    policy.value = data;
    // 填报的是个人情况：不保留上一次的填写内容，但会带入「政策雷达」里已经填过的画像
    clearAllDrafts();
    if (isLoggedIn.value) void clearRemoteDraft(data.id).catch(() => undefined);
    const inherited = inheritFromRadar(data);
    profile.value = inherited.profile;
    inheritedCount.value = inherited.count;
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
  () => {
    if (result.value) stale.value = true;
    scheduleProgress();
  },
  { deep: true },
);

/**
 * 填报进度上报：只告诉服务端「填了几项」，不发送任何字段值。
 * 表单每敲一个字都会触发 watch，这里节流到最后一次输入后 1.2 秒再报，
 * 换设备登录时能接上「上次填到哪」，但服务端看不到填了什么。
 */
let progressTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProgress(): void {
  if (!isLoggedIn.value || !policy.value) return;
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    progressTimer = null;
    void flushProgress();
  }, 1200);
}

async function flushProgress(): Promise<void> {
  const current = policy.value;
  if (!current || !isLoggedIn.value) return;
  const total = current.fields.length;
  if (total === 0) return;
  const filled = filledCount(current.fields, profile.value);
  try {
    if (filled === 0) await clearProgress(current.id);
    else await saveProgress(current.id, { policyTitle: current.title, filled, total });
  } catch {
    /* 进度只是辅助信息，上报失败不影响填写与判定 */
  }
}

async function runEvaluate(): Promise<void> {
  const current = policy.value;
  if (!current) return;
  evaluating.value = true;
  evaluateError.value = '';
  try {
    const evaluated = await evaluatePolicy(current.id, cleanProfile(profile.value));
    result.value = evaluated;
    stale.value = false;
    tab.value = 'report';
    // 登录用户把这次判定记到账号下：换电脑登录后仍能在「我的」里看到
    if (isLoggedIn.value) {
      void saveRecord({
        policyId: current.id,
        policyTitle: current.title,
        overall: evaluated.overall,
        summary: evaluated.summary,
      }).catch(() => {
        /* 记录失败不影响判定结果展示 */
      });
      // 已经判完，就不再算「填到一半」
      void clearProgress(current.id).catch(() => undefined);
    }
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
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (progressTimer) clearTimeout(progressTimer);
});

async function locate(docRef: string, quote: string): Promise<void> {
  activeSectionId.value = docRef;
  activeQuote.value = quote;
  tab.value = 'original';
  await nextTick();
  // 只把右栏滚到视野内；原文面板内部的段落定位由 PolicyText 自己处理
  document.getElementById('verdict-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <RouterLink to="/policies" class="text-sm text-muted transition hover:text-brand-600">← 返回政策库</RouterLink>

    <!-- 加载中 -->
    <div v-if="loading" class="mt-8 space-y-3">
      <div class="h-8 w-2/3 animate-pulse rounded-lg bg-line" />
      <div class="h-4 w-1/2 animate-pulse rounded bg-surface-3" />
      <div class="mt-6 h-64 animate-pulse rounded-2xl bg-surface-3" />
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">政策加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-on-brand" @click="load">重试</button>
    </div>

    <template v-else-if="policy">
      <!-- 政策信息 -->
      <header class="mt-4 rounded-2xl border border-line bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="levelTone">{{ policy.level }}</span>
          <span class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">{{ policy.category }}</span>
          <span class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">{{ policy.year }} 年</span>
          <span
            v-if="policy.review?.humanReviewed"
            class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
            >已人工复核 {{ policy.review.reviewedAt }}</span
          >
          <span class="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted">
            AI 建库 · {{ policy.extraction.model ?? policy.extraction.engine }}
          </span>
        </div>

        <h1 class="mt-3 text-2xl font-bold tracking-tight text-ink">{{ policy.title }}</h1>
        <p class="mt-1.5 text-sm text-muted">
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
            <dd class="text-lg font-semibold tabular-nums text-ink">{{ item.value }}</dd>
            <dt class="text-xs text-faint">{{ item.label }}</dt>
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
            <div
              v-if="inheritedCount > 0"
              class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700"
            >
              <span class="font-medium">已从你的政策雷达画像带入 {{ inheritedCount }} 项</span>
              <span class="text-brand-700/80">可以直接改，判不准的再手动补</span>
              <RouterLink to="/radar" class="ml-auto shrink-0 underline underline-offset-2 hover:text-brand-800">
                回去改画像
              </RouterLink>
            </div>
            <ProfileForm v-model="profile" :fields="policy.fields" />

            <div class="mt-4 rounded-xl border border-line bg-surface p-4">
              <button
                type="button"
                class="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="evaluating"
                @click="runEvaluate"
              >
                {{ evaluating ? '正在判定…' : result ? '重新判定' : '开始判定' }}
              </button>
              <p class="mt-1.5 text-center text-xs text-faint">填完可以按 Ctrl + Enter 直接判定</p>
              <p v-if="evaluateError" class="mt-2 text-xs text-rose-600">{{ evaluateError }}</p>
              <p v-if="stale" class="mt-2 text-xs text-amber-600">你改动了表单，建议重新判定以刷新结论。</p>
              <p class="mt-2 text-center text-xs text-faint">填的内容只在这个页面里，离开或刷新就会清空。</p>
            </div>
          </div>
        </div>

        <!-- 右：结果 / 原文 -->
        <div id="verdict-top" class="scroll-mt-20 lg:col-span-7">
          <div class="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1">
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
              :class="tab === 'report' ? 'bg-brand-600 font-medium text-on-brand' : 'text-ink-2 hover:bg-surface-2'"
              @click="tab = 'report'"
            >
              判定结果
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
              :class="tab === 'original' ? 'bg-brand-600 font-medium text-on-brand' : 'text-ink-2 hover:bg-surface-2'"
              @click="tab = 'original'"
            >
              政策原文
            </button>
          </div>

          <template v-if="tab === 'report'">
            <VerdictReport v-if="result" :result="result" :policy="policy" @locate="locate" />
            <div v-else class="rounded-2xl border border-dashed border-line-2 bg-surface p-10 text-center">
              <p class="text-base font-medium text-ink-2">还没有判定结果</p>
              <p class="mx-auto mt-2 max-w-sm text-sm text-muted">
                左侧按政策字段填一下自己的情况，点「开始判定」，就能看到逐条结论、差在哪、以及每条对应的原文条款。
              </p>
              <p class="mt-4 text-xs text-faint">判定全部在本地完成，不上传、不调用大模型。</p>
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
