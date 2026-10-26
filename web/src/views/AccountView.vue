<script setup lang="ts">
/**
 * 个人中心：账号信息、横向统计、未填完的政策、我的画像与资格概览、判定记录。
 *
 * 数据来源分三层，页面上分别标注清楚：
 * - 服务端：账号、判定记录、填报进度（只有「填了几项」，不含任何填写内容）
 * - 浏览器本地：政策雷达的画像草稿（用户可以随时清空，不上传）
 * - 政策库：资格概览由本地规则引擎现算，毫秒级、零 token
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { RADAR_SLOTS, scanBundles, type RadarResult, type RadarSlot } from '@domain/radar';
import { getRadarData } from '@/lib/api';
import {
  clearAllData,
  clearProgress,
  clearRecords,
  currentUser,
  fetchProgress,
  fetchRecords,
  logout,
  type JudgementRecord,
  type ProgressEntry,
} from '@/lib/auth';
import { VERDICT_META, overallTitle } from '@/lib/verdict';

const router = useRouter();

const records = ref<JudgementRecord[]>([]);
const progress = ref<ProgressEntry[]>([]);
const answers = ref<Record<string, unknown>>({});
const radar = ref<RadarResult | null>(null);
const radarError = ref('');
const loading = ref(true);
const error = ref('');
const clearing = ref(false);
const expandedId = ref<string>('');

/** 雷达页的草稿键，两边必须一致；这里只读，不会改写用户画像 */
const RADAR_DRAFT_KEY = 'radar-draft-v1';

const roleLabel = computed(() => (currentUser.value?.role === 'demo' ? '演示账号' : '普通账号'));
const initial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '?').slice(0, 1).toUpperCase());

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// ===== 统计条 =====

const stats = computed(() => {
  const list = records.value;
  const policyCount = new Set(list.map((item) => item.policyId)).size;
  const passCount = list.filter((item) => item.overall === 'pass').length;
  const totals = list.reduce(
    (acc, item) => ({
      pass: acc.pass + item.summary.pass,
      judged: acc.judged + item.summary.pass + item.summary.fail + item.summary.unknown,
    }),
    { pass: 0, judged: 0 },
  );
  const rate = totals.judged > 0 ? Math.round((totals.pass / totals.judged) * 100) : null;
  return [
    { label: '已判定', value: String(list.length), unit: '次', hint: list.length > 0 ? '最近 ' + formatAt(list[0]!.at) : '还没判定过' },
    { label: '大概率能申', value: String(passCount), unit: '份', hint: '硬性条件全部满足' },
    { label: '平均符合率', value: rate === null ? '—' : String(rate), unit: rate === null ? '' : '%', hint: rate === null ? '判定后生成' : totals.pass + ' / ' + totals.judged + ' 条条件符合' },
    { label: '涉及政策', value: String(policyCount), unit: '份', hint: '去重后' },
  ];
});

// ===== 我的画像（浏览器本地） =====

function slotValueLabel(slot: RadarSlot, value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => slot.options?.find((option) => option.value === String(item))?.label ?? String(item))
      .join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value) + (slot.unit ?? '');
  const option = slot.options?.find((item) => item.value === String(value));
  return option?.label ?? String(value);
}

const profileChips = computed(() =>
  RADAR_SLOTS.filter((slot) => !isEmpty(answers.value[slot.key])).map((slot) => ({
    key: slot.key,
    label: slot.label,
    value: slotValueLabel(slot, answers.value[slot.key]),
  })),
);

const answeredCount = computed(() => profileChips.value.length);

const radarStats = computed(() => {
  const result = radar.value;
  if (!result) return [];
  return [
    { label: '能申', value: result.summary.eligible, tone: 'text-emerald-600' },
    { label: '差一点', value: result.summary.near, tone: 'text-amber-600' },
    { label: '还缺信息', value: result.summary.incomplete, tone: 'text-muted' },
    { label: '不符合', value: result.summary.ineligible, tone: 'text-rose-600' },
  ];
});

function loadLocalAnswers(): void {
  try {
    const raw = localStorage.getItem(RADAR_DRAFT_KEY);
    answers.value = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    answers.value = {};
  }
}

async function loadRadar(): Promise<void> {
  radarError.value = '';
  radar.value = null;
  if (profileChips.value.length === 0) return;
  try {
    const data = await getRadarData();
    radar.value = scanBundles(data.policies, { ...answers.value });
  } catch (err) {
    radarError.value = err instanceof Error ? err.message : '资格概览计算失败';
  }
}

// ===== 数据加载 =====

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [recordList, progressList] = await Promise.all([fetchRecords(), fetchProgress()]);
    records.value = recordList;
    progress.value = progressList;
    loadLocalAnswers();
    await loadRadar();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await logout();
  await router.replace('/login');
}

async function handleClearRecords(): Promise<void> {
  if (clearing.value) return;
  if (!window.confirm('确定清空全部判定记录吗？清空后不可恢复。')) return;
  clearing.value = true;
  try {
    await clearRecords();
    records.value = [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : '清空失败';
  } finally {
    clearing.value = false;
  }
}

async function handleRemoveProgress(policyId: string): Promise<void> {
  try {
    await clearProgress(policyId);
    progress.value = progress.value.filter((item) => item.policyId !== policyId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '移除失败';
  }
}

async function handleClearAll(): Promise<void> {
  if (clearing.value) return;
  if (!window.confirm('确定清空账号下的全部数据吗？判定记录与填报进度都会被删除，且不可恢复。')) return;
  clearing.value = true;
  try {
    await clearAllData();
    records.value = [];
    progress.value = [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : '清空失败';
  } finally {
    clearing.value = false;
  }
}

function toggleRecord(id: string): void {
  expandedId.value = expandedId.value === id ? '' : id;
}

function verdictSegments(record: JudgementRecord): { label: string; count: number; cls: string }[] {
  return [
    { label: '符合', count: record.summary.pass, cls: 'bg-emerald-500' },
    { label: '不符合', count: record.summary.fail, cls: 'bg-rose-500' },
    { label: '待补充', count: record.summary.unknown, cls: 'bg-amber-400' },
  ];
}

function segmentWidth(record: JudgementRecord, count: number): string {
  const total = record.summary.pass + record.summary.fail + record.summary.unknown;
  if (total === 0) return '0%';
  return String(Math.round((count / total) * 100)) + '%';
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <RouterLink to="/policies" class="text-sm text-muted transition hover:text-brand-600">← 返回政策库</RouterLink>

    <!-- 账号信息 -->
    <section class="mt-4 rounded-2xl border border-line bg-surface p-6">
      <div class="flex flex-wrap items-center gap-4">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-on-brand">
          {{ initial }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold text-ink">{{ currentUser?.displayName }}</h1>
            <span
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="currentUser?.role === 'demo' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-line bg-surface-2 text-ink-2'"
              >{{ roleLabel }}</span
            >
          </div>
          <p class="mt-1 text-sm text-muted">
            @{{ currentUser?.username }}
            <span v-if="currentUser?.createdAt" class="ml-2 text-xs text-faint">注册于 {{ formatAt(currentUser.createdAt) }}</span>
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-line-2 px-4 py-2 text-sm text-ink-2 transition hover:bg-surface-2"
          @click="handleLogout"
        >
          退出登录
        </button>
      </div>
      <p class="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        账号与判定记录存在服务端：换一台电脑用同一账号登录，历史判定与填写进度都能接上。<strong class="font-medium text-ink-2">但填写的具体内容不会被保存</strong>——
        判定页只上报「填了几项」，离开页面即清空；画像草稿只存在你当前这台电脑的浏览器里。
      </p>
    </section>

    <!-- 统计条 -->
    <section class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      <div v-for="item in stats" :key="item.label" class="bg-surface px-5 py-4">
        <div class="flex items-baseline gap-1">
          <span class="font-mono text-2xl font-semibold tabular-nums text-ink">{{ item.value }}</span>
          <span v-if="item.unit" class="text-xs text-faint">{{ item.unit }}</span>
        </div>
        <div class="mt-1 text-xs font-medium text-ink-2">{{ item.label }}</div>
        <div class="mt-0.5 truncate text-[11px] text-faint" :title="item.hint">{{ item.hint }}</div>
      </div>
    </section>

    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <!-- 未完成的填报 -->
      <section class="rounded-2xl border border-line bg-surface lg:col-span-3">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-line-sub px-5 py-4">
          <div>
            <h2 class="text-base font-semibold text-ink">填到一半的政策</h2>
            <p class="mt-0.5 text-xs text-faint">只记录填了几项，不记录填了什么 · 换设备登录也能接着填</p>
          </div>
          <span v-if="progress.length > 0" class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {{ progress.length }} 份
          </span>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <div class="h-12 animate-pulse rounded-xl bg-surface-3" />
          <div class="h-12 animate-pulse rounded-xl bg-surface-3" />
        </div>

        <div v-else-if="progress.length === 0" class="px-5 py-8 text-center">
          <p class="text-sm text-muted">没有填到一半的政策</p>
          <p class="mt-1 text-xs text-faint">去政策库挑一份填起来，进度会自动接上</p>
          <RouterLink
            to="/policies"
            class="mt-4 inline-block rounded-lg border border-line-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-brand-400 hover:text-brand-700"
            >去政策库看看</RouterLink
          >
        </div>

        <ul v-else class="divide-y divide-line-sub">
          <li v-for="item in progress" :key="item.policyId" class="px-5 py-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <RouterLink
                :to="'/match/' + item.policyId"
                :title="item.policyTitle"
                class="min-w-0 flex-1 truncate text-sm font-medium text-ink transition hover:text-brand-600"
              >
                {{ item.policyTitle }}
              </RouterLink>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs tabular-nums text-muted">{{ item.filled }} / {{ item.total }}</span>
                <button
                  type="button"
                  class="rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-rose-300 hover:text-rose-600"
                  @click="handleRemoveProgress(item.policyId)"
                >
                  移除
                </button>
              </div>
            </div>
            <div class="mt-2 flex items-center gap-3">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div class="h-full rounded-full bg-brand-500" :style="{ width: Math.round((item.filled / item.total) * 100) + '%' }" />
              </div>
              <RouterLink :to="'/match/' + item.policyId" class="shrink-0 text-xs font-medium text-brand-600 transition hover:text-brand-700">
                继续填 →
              </RouterLink>
            </div>
            <p class="mt-1.5 text-[11px] text-faint">最后更新 {{ formatAt(item.updatedAt) }}</p>
          </li>
        </ul>
      </section>

      <!-- 我的画像 -->
      <section class="rounded-2xl border border-line bg-surface lg:col-span-2">
        <header class="flex items-center justify-between border-b border-line-sub px-5 py-4">
          <div>
            <h2 class="text-base font-semibold text-ink">我的画像</h2>
            <p class="mt-0.5 text-xs text-faint">存在本机浏览器，不上传</p>
          </div>
          <RouterLink to="/radar" class="text-xs font-medium text-brand-600 transition hover:text-brand-700">去更新 →</RouterLink>
        </header>

        <div v-if="answeredCount === 0" class="px-5 py-8 text-center">
          <p class="text-sm text-muted">还没填过画像</p>
          <p class="mt-1 text-xs text-faint">填一次 26 项共性信息，就能一次看到 32 份政策的分层结论</p>
          <RouterLink
            to="/radar"
            class="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-700"
            >开始做体检</RouterLink
          >
        </div>

        <div v-else class="px-5 py-4">
          <p class="text-xs text-faint">
            已填 <span class="font-mono font-medium text-ink-2">{{ answeredCount }}</span> 项
            <span class="mx-1 text-faint">/</span>
            {{ RADAR_SLOTS.length }} 项
          </p>
          <ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <li v-for="chip in profileChips.slice(0, 8)" :key="chip.key" class="min-w-0">
              <div class="truncate text-[11px] text-faint" :title="chip.label">{{ chip.label }}</div>
              <div class="mt-0.5 truncate text-xs font-medium text-ink-2" :title="chip.value">{{ chip.value }}</div>
            </li>
          </ul>
          <p v-if="answeredCount > 8" class="mt-1.5 text-[11px] text-faint">还有 {{ answeredCount - 8 }} 项已填</p>

          <!-- 资格概览 -->
          <div class="mt-4 rounded-xl bg-surface-2 p-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold text-ink-2">当前画像下的资格概览</h3>
              <span class="text-[11px] text-faint">本地规则现算</span>
            </div>
            <p v-if="radarError" class="mt-2 text-xs text-rose-600">{{ radarError }}</p>
            <div v-else-if="radar" class="mt-3 grid grid-cols-4 gap-2 text-center">
              <div v-for="cell in radarStats" :key="cell.label">
                <div class="font-mono text-lg font-semibold tabular-nums" :class="cell.tone">{{ cell.value }}</div>
                <div class="mt-0.5 text-[11px] text-muted">{{ cell.label }}</div>
              </div>
            </div>
            <p v-else class="mt-2 text-xs text-faint">正在计算…</p>
            <RouterLink
              v-if="radar"
              to="/radar"
              class="mt-3 block rounded-lg border border-line bg-surface px-3 py-1.5 text-center text-xs font-medium text-ink-2 transition hover:border-brand-400 hover:text-brand-700"
              >看 32 份政策的完整分层 →</RouterLink
            >
          </div>
        </div>
      </section>
    </div>

    <!-- 判定记录 -->
    <section class="mt-6 rounded-2xl border border-line bg-surface">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line-sub px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-ink">我的判定记录</h2>
          <p class="mt-0.5 text-xs text-faint">最多保留最近 20 条，按时间倒序 · 点一条可展开明细</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="records.length > 0"
            type="button"
            :disabled="clearing"
            class="rounded-lg border border-line-2 px-3 py-1.5 text-xs text-ink-2 transition hover:bg-surface-2 disabled:opacity-60"
            @click="handleClearRecords"
          >
            清空记录
          </button>
          <button
            type="button"
            :disabled="clearing"
            class="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            @click="handleClearAll"
          >
            清空我的数据
          </button>
        </div>
      </header>

      <p v-if="error" class="px-5 py-4 text-sm text-rose-600">{{ error }}</p>

      <div v-if="loading" class="space-y-3 p-5">
        <div class="h-16 animate-pulse rounded-xl bg-surface-3" />
        <div class="h-16 animate-pulse rounded-xl bg-surface-3" />
      </div>

      <div v-else-if="records.length === 0" class="px-5 py-10 text-center">
        <p class="text-sm text-muted">还没有判定记录</p>
        <p class="mt-1 text-xs text-faint">去政策库填一份自己的情况，判定后会自动记在这里</p>
        <RouterLink
          to="/policies"
          class="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-700"
          >去选一份政策</RouterLink
        >
      </div>

      <ul v-else class="divide-y divide-line-sub">
        <li v-for="record in records" :key="record.id">
          <button type="button" class="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-surface-2" @click="toggleRecord(record.id)">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="VERDICT_META[record.overall].dot" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink" :title="record.policyTitle">{{ record.policyTitle }}</p>
              <p class="mt-0.5 text-xs text-faint">
                {{ formatAt(record.at) }} · 符合 {{ record.summary.pass }} · 不符合 {{ record.summary.fail }} · 待补充 {{ record.summary.unknown }}
              </p>
            </div>
            <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs" :class="VERDICT_META[record.overall].badge">
              {{ overallTitle(record.overall) }}
            </span>
            <span class="shrink-0 text-xs text-faint" :class="expandedId === record.id ? 'rotate-180' : ''" style="transition: transform 0.15s">⌄</span>
          </button>

          <div v-if="expandedId === record.id" class="border-t border-line-sub bg-surface-2/60 px-5 py-4">
            <div class="flex h-1.5 overflow-hidden rounded-full bg-line">
              <div
                v-for="segment in verdictSegments(record)"
                :key="segment.label"
                class="h-full"
                :class="segment.cls"
                :style="{ width: segmentWidth(record, segment.count) }"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span v-for="segment in verdictSegments(record)" :key="segment.label" class="inline-flex items-center gap-1">
                <span class="h-1.5 w-1.5 rounded-full" :class="segment.cls" />
                {{ segment.label }} <span class="font-mono tabular-nums text-ink-2">{{ segment.count }}</span>
              </span>
              <span class="text-faint">共 {{ record.summary.pass + record.summary.fail + record.summary.unknown }} 条参与判定</span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <RouterLink
                :to="'/match/' + record.policyId"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-700"
                >重新填写判定 →</RouterLink
              >
              <span class="text-[11px] text-faint">填写内容不留存，重新打开是空白表单</span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <p class="mt-6 text-center text-xs text-faint">
      数据自查：判定记录与填报进度都可在本页清空；画像草稿只在你本机浏览器，清空后不可恢复。
    </p>
  </div>
</template>
