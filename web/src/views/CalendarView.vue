<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { CalendarData, CalendarEvent } from '@/lib/api';
import { getCalendar } from '@/lib/api';

/**
 * 年度申报日历。
 *
 * 数据来自 buildCalendar()：把 32 份政策里的 60 个时间节点按月聚合。
 * 页面要回答的问题只有一个 ——「这一年里，哪几个月该动手准备材料」。
 */

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

const MONTH_LABEL = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

const route = useRoute();
const router = useRouter();

const data = ref<CalendarData | null>(null);
const loading = ref(true);
const error = ref('');

const today = new Date();
const currentMonth = today.getMonth() + 1;

const activeMonth = ref(currentMonth);
const activeCategory = ref('全部');
const openGroups = ref<Set<string>>(new Set());

/** 所有事件摊平，用于统计类别 */
const allEvents = computed<CalendarEvent[]>(() => {
  const d = data.value;
  if (!d) return [];
  return [...d.months.flatMap((m) => m.events), ...d.semester, ...d.process, ...d.other, ...d.history];
});

const categories = computed<string[]>(() => {
  const seen = new Set<string>();
  for (const e of allEvents.value) if (e.category) seen.add(e.category);
  const ordered = CATEGORY_ORDER.filter((c) => seen.has(c));
  const rest = [...seen].filter((c) => !CATEGORY_ORDER.includes(c));
  return ['全部', ...ordered, ...rest];
});

function matches(event: CalendarEvent): boolean {
  return activeCategory.value === '全部' || event.category === activeCategory.value;
}

/** 每个月在当前筛选下有几个节点 */
const monthCounts = computed<number[]>(() => {
  const counts = new Array<number>(12).fill(0);
  if (!data.value) return counts;
  for (const month of data.value.months) counts[month.month - 1] = month.events.filter(matches).length;
  return counts;
});

/** 筛选后全年还剩多少节点 */
const filteredTotal = computed(() => allEvents.value.filter(matches).length);

const currentEvents = computed<CalendarEvent[]>(() => {
  const d = data.value;
  if (!d) return [];
  const month = d.months[activeMonth.value - 1];
  return month ? month.events.filter(matches) : [];
});

/** 当前月是否有真实节点（不受筛选影响），决定顶部提示条 */
const currentMonthRaw = computed<CalendarEvent[]>(() => {
  const d = data.value;
  if (!d) return [];
  return d.months[currentMonth - 1]?.events ?? [];
});

const nonAnnualGroups = computed(() => {
  const d = data.value;
  if (!d) return [];
  return [
    {
      key: 'semester',
      title: '学期与招生季',
      hint: '原文只说「秋季学期」「高考录取提前批」，没有固定日期，跟着学校校历和招生批次走。',
      events: d.semester.filter(matches),
    },
    {
      key: 'process',
      title: '办理时限',
      hint: '从受理、审核到发放，按受理进度起算，不是全年的固定节点。',
      events: d.process.filter(matches),
    },
    {
      key: 'other',
      title: '其他流程节点',
      hint: '政策规定的必经环节，但原文没写具体日期，以学校通知为准。',
      events: d.other.filter(matches),
    },
    {
      key: 'history',
      title: '政策沿革',
      hint: '政策施行或调整的历史时间，不是申报节点，列出来方便判断条款新旧。',
      events: d.history.filter(matches),
    },
  ].filter((g) => g.events.length > 0);
});

function toggleGroup(key: string): void {
  const next = new Set(openGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openGroups.value = next;
}

/** 默认落在「当下或之后最近的一个申报月」，避免一进来停在空白月份 */
function pickInitialMonth(calendar: CalendarData): number {
  if (calendar.months[currentMonth - 1]?.events.length) return currentMonth;
  for (let step = 1; step <= 12; step += 1) {
    const month = ((currentMonth - 1 + step) % 12) + 1;
    if (calendar.months[month - 1]?.events.length) return month;
  }
  return currentMonth;
}

/** 「每年 10 月 31 日前」写成「10 月 31 日」；只到月的写成「10 月」 */
function deadlineLabel(event: CalendarEvent): string {
  if (event.day) return `${event.months[0]} 月 ${event.day} 日`;
  if (event.months.length > 0) return `${event.months[0]} 月`;
  return event.dateText || '时间待定';
}

/** 本月提醒：列出当月最早的几个节点 */
const monthHint = computed(() => {
  const events = currentMonthRaw.value;
  if (events.length === 0) return null;
  const names = events
    .slice(0, 3)
    .map((e) => e.label)
    .join('、');
  return { count: events.length, names };
});

/** 支持 /calendar?month=10 直接分享某个月份 */
function monthFromQuery(): number | null {
  const raw = route.query.month;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

// 切换月份时把月号写进地址栏，方便把「10 月该做什么」直接发给同学
watch(activeMonth, (month) => {
  void router.replace({ query: { ...route.query, month: String(month) } });
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const calendar = await getCalendar();
    data.value = calendar;
    activeMonth.value = monthFromQuery() ?? pickInitialMonth(calendar);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '申报日历加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-12">
    <header class="max-w-3xl">
      <span class="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        申报日历 · 把 {{ data?.stats.totalEvents || 60 }} 个时间节点排进一年
      </span>
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-ink">一年里，哪几个月该动手准备</h1>
      <p class="mt-3 text-sm leading-relaxed text-ink-2">
        奖助学金不是全年都能申。把每份政策原文里的时间约定（「每年 10 月 31 日前报送」「9 月 30 日前提出申请」）
        按月份摊开，就能提前知道几月该准备材料、几月只剩等结果。
        节点全部由规则解析得出，不调用大模型，可对照原文逐条核对。
      </p>
    </header>

    <div v-if="loading" class="mt-10 space-y-4">
      <div class="h-24 animate-pulse rounded-2xl border border-line bg-surface" />
      <div class="h-16 animate-pulse rounded-2xl border border-line bg-surface" />
      <div class="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>

    <div v-else-if="error" class="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">申报日历加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-on-brand" @click="load">重试</button>
    </div>

    <template v-else-if="data">
      <!-- 统计条 -->
      <dl class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-2xl border border-line bg-surface px-5 py-4">
          <dd class="text-2xl font-bold tabular-nums text-ink">{{ data.stats.monthsCovered }}</dd>
          <dt class="mt-1 text-xs text-muted">个集中申报月</dt>
        </div>
        <div class="rounded-2xl border border-line bg-surface px-5 py-4">
          <dd class="text-2xl font-bold tabular-nums text-ink">{{ data.stats.totalEvents }}</dd>
          <dt class="mt-1 text-xs text-muted">个时间节点</dt>
        </div>
        <div class="rounded-2xl border border-line bg-surface px-5 py-4">
          <dd class="text-2xl font-bold tabular-nums text-ink">{{ data.stats.policies }}</dd>
          <dt class="mt-1 text-xs text-muted">份政策参与排期</dt>
        </div>
        <div class="rounded-2xl border border-line bg-surface px-5 py-4">
          <dd class="text-2xl font-bold tabular-nums text-ink">{{ data.process.length }}</dd>
          <dt class="mt-1 text-xs text-muted">条按受理进度计算的时限</dt>
        </div>
      </dl>

      <!-- 本月提醒 -->
      <div v-if="monthHint" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
        <span class="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-on-brand">本月</span>
        <span class="text-sm text-amber-900">
          {{ currentMonth }} 月有 {{ monthHint.count }} 个节点：{{ monthHint.names }}{{ monthHint.count > 3 ? '等' : '' }}
        </span>
      </div>
      <div v-else class="mt-4 rounded-2xl border border-line bg-surface px-5 py-3 text-sm text-muted">
        本月（{{ currentMonth }} 月）没有集中申报窗口，适合整理材料、核对学籍信息；下一个申报月在下方的日历里。
      </div>

      <!-- 筛选 -->
      <div class="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
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
        <p class="text-xs text-faint">当前筛选出 {{ filteredTotal }} 个节点</p>
      </div>

      <!-- 12 个月 -->
      <section class="mt-6">
        <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          <button
            v-for="n in 12"
            :key="n"
            type="button"
            class="group relative flex flex-col items-center gap-1 rounded-xl border py-3 transition"
            :class="[
              n === activeMonth
                ? 'border-brand-600 bg-brand-600 text-on-brand'
                : monthCounts[n - 1] > 0
                  ? 'border-line bg-surface text-ink-2 hover:border-brand-300'
                  : 'border-line-sub bg-surface-2 text-faint hover:border-line',
              n === currentMonth && n !== activeMonth ? 'ring-2 ring-brand-200' : '',
            ]"
            @click="activeMonth = n"
          >
            <span class="text-sm font-semibold">{{ MONTH_LABEL[n - 1] }}</span>
            <span
              class="rounded-full px-2 py-0.5 text-[11px] tabular-nums"
              :class="
                n === activeMonth
                  ? 'bg-on-brand/20 text-on-brand'
                  : monthCounts[n - 1] > 0
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-surface-3 text-faint'
              "
            >
              {{ monthCounts[n - 1] || '—' }}
            </span>
            <span
              v-if="n === currentMonth"
              class="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-1.5 text-[10px] text-on-brand"
              >今</span
            >
          </button>
        </div>
      </section>

      <!-- 选中月份详情 -->
      <section class="mt-6 rounded-2xl border border-line bg-surface">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-line-sub px-5 py-4">
          <h2 class="text-base font-semibold text-ink">
            {{ activeMonth }} 月的申报节点
            <span class="ml-1 text-sm font-normal text-faint">共 {{ currentEvents.length }} 条</span>
          </h2>
          <p class="text-xs text-faint">点政策名可进入逐条判定</p>
        </header>

        <ul v-if="currentEvents.length > 0" class="divide-y divide-line-sub">
          <li v-for="event in currentEvents" :key="event.id" class="flex gap-4 px-5 py-4">
            <div class="w-16 shrink-0 pt-0.5 text-center">
              <div class="text-xs text-faint">{{ activeMonth }} 月</div>
              <div class="text-base font-semibold tabular-nums text-ink">{{ event.day ? event.day + ' 日' : '整月' }}</div>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">{{ event.category }}</span>
                <span class="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{{ event.level }}</span>
                <span class="text-xs text-faint">{{ deadlineLabel(event) }}</span>
              </div>
              <h3 class="mt-1.5 text-sm font-semibold leading-snug text-ink">{{ event.label }}</h3>
              <p class="mt-0.5 text-xs leading-relaxed text-muted">{{ event.policyTitle }}</p>
              <p v-if="event.dateText" class="mt-1 text-xs text-ink-2">原文写法：{{ event.dateText }}</p>
              <p v-if="event.note" class="mt-0.5 text-xs text-faint">{{ event.note }}</p>
              <RouterLink
                :to="`/match/${event.policyId}`"
                class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                看这份政策够不够格 →
              </RouterLink>
            </div>
          </li>
        </ul>

        <div v-else class="px-5 py-12 text-center">
          <p class="text-sm text-muted">
            {{ activeCategory === '全部' ? `${activeMonth} 月没有集中申报窗口。` : `${activeMonth} 月没有「${activeCategory}」类别的节点。` }}
          </p>
          <p class="mt-1 text-xs text-faint">可以先看看其他月份，或把筛选切回「全部」。</p>
        </div>
      </section>

      <!-- 非年度节点 -->
      <section v-if="nonAnnualGroups.length > 0" class="mt-8">
        <h2 class="text-base font-semibold text-ink">不进日历的节点</h2>
        <p class="mt-1 text-sm text-muted">这几类时间不落在固定月份，但同样影响你什么时候能拿到钱。</p>

        <div class="mt-4 space-y-3">
          <div v-for="group in nonAnnualGroups" :key="group.key" class="overflow-hidden rounded-2xl border border-line bg-surface">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-surface-2"
              @click="toggleGroup(group.key)"
            >
              <div>
                <span class="text-sm font-semibold text-ink">{{ group.title }}</span>
                <span class="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] tabular-nums text-ink-2">{{ group.events.length }}</span>
                <p class="mt-1 text-xs text-muted">{{ group.hint }}</p>
              </div>
              <svg
                class="h-4 w-4 shrink-0 text-faint transition"
                :class="openGroups.has(group.key) ? 'rotate-180' : ''"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>

            <ul v-if="openGroups.has(group.key)" class="divide-y divide-line-sub border-t border-line-sub">
              <li v-for="event in group.events" :key="event.id" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <span class="text-sm font-medium text-ink">{{ event.label }}</span>
                <span v-if="event.dateText" class="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2">{{ event.dateText }}</span>
                <span class="text-xs text-faint">{{ event.policyTitle }}</span>
                <RouterLink :to="`/match/${event.policyId}`" class="ml-auto text-xs font-medium text-brand-700 hover:text-brand-800">
                  判定 →
                </RouterLink>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <p class="mt-8 text-xs leading-relaxed text-faint">
        日历只做「时间聚合」，不代表具体某校某年的实际安排 —— 最终时间节点以学校资助中心、省级教育行政部门的当年通知为准。
        每一条都能在对应政策原文里找到出处，点击政策名即可核对。
      </p>
    </template>
  </div>
</template>
