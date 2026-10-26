<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import type { RadarData, RadarScanItem, RadarSlot, RadarStatus } from '@/lib/api';
import { getRadarData } from '@/lib/api';
import { scanBundles } from '@domain/radar';

/**
 * 政策雷达。
 *
 * 32 份政策里一共 333 个表单字段、285 个不同的字段 key，跨政策几乎不复用。
 * 所以这里不直接问那 333 个字段，而是问 26 个「统一画像槽位」，
 * 再用规则表把每个槽位映射到每份政策自己的写法上，得出四层结论：
 *   能申 / 差一点 / 还缺信息 / 不符合。
 *
 * 两条不变量（比好看更重要）：
 * 1. 没填的信息绝不判成「不符合」—— 那等于告诉一个其实能申的人他不能申；
 * 2. 每条结论都能说清「差在哪一条」，并能点回政策页补政策特有的那几条。
 */

/**
 * 四层状态的措辞按「阶段」而不是「结论」来写：
 * 雷达只做了画像里的机械比对，不能替学校下「你能拿」的结论，
 * 所以这里说「初筛适合 / 差几项 / 信息不够 / 不符」，把「还差什么」交给卡片里的具体条目。
 */
const STATUS_META: Record<RadarStatus, { label: string; badge: string; dot: string; hint: string }> = {
  eligible: {
    label: '初筛适合',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    hint: '画像覆盖的硬性条件都过了，进政策页核对其余条款后再准备材料',
  },
  near: {
    label: '差几项',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
    hint: '再补一两项画像信息（或进政策页填特有条款）就能判断',
  },
  incomplete: {
    label: '信息不够',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    hint: '画像里还有不少信息没填，填完再判一次更准',
  },
  ineligible: {
    label: '不符',
    badge: 'bg-surface-3 text-muted border-line',
    dot: 'bg-line-2',
    hint: '有硬性条件明确不符',
  },
};

const STATUS_TABS: Array<{ key: RadarStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'eligible', label: '初筛适合' },
  { key: 'near', label: '差几项' },
  { key: 'incomplete', label: '信息不够' },
  { key: 'ineligible', label: '不符' },
];

const GROUP_ORDER = ['学业情况', '身份与阶段', '家庭情况', '品行与其他'] as const;

const DRAFT_KEY = 'radar-draft-v1';

/** 示例画像：一名大二、家庭经济困难的本科生，用来让评委/新用户一键看到分层效果 */
const DEMO_ANSWERS: Record<string, unknown> = {
  eduLevel: '本科',
  grade: 2,
  enrollYear: new Date().getFullYear() - 2,
  schoolType: '公办普通本科',
  studyForm: '全日制',
  academicRank: 5,
  compositeRank: 6,
  nationality: '中华人民共和国',
  age: 20,
  enrollmentStatus: '在籍在校',
  graduatePlan: true,
  economicDifficulty: true,
  specialGroups: ['低保'],
  ruralHukou: true,
  political: true,
  honest: true,
  lawAbiding: true,
  voluntary: true,
  excellent: true,
};

const route = useRoute();

const data = ref<RadarData | null>(null);
const loading = ref(true);
const error = ref('');
const answers = reactive<Record<string, unknown>>({});
const activeTab = ref<RadarStatus | 'all'>('all');
const openGroups = ref<Set<string>>(new Set([GROUP_ORDER[0]]));

const slots = computed<RadarSlot[]>(() => data.value?.slots ?? []);

const groupedSlots = computed(() => {
  const map = new Map<string, RadarSlot[]>();
  for (const slot of slots.value) {
    const list = map.get(slot.group) ?? [];
    list.push(slot);
    map.set(slot.group, list);
  }
  return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({ group, items: map.get(group)! }));
});

const filledCount = computed(() => Object.keys(answers).filter((key) => !isEmpty(answers[key])).length);

const result = computed(() => {
  const d = data.value;
  if (!d) return null;
  return scanBundles(d.policies, { ...answers });
});

const items = computed<RadarScanItem[]>(() => result.value?.items ?? []);

const filteredItems = computed(() =>
  activeTab.value === 'all' ? items.value : items.value.filter((item) => item.status === activeTab.value),
);

const tabCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = { all: items.value.length };
  for (const item of items.value) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
});

/** 「先填哪几项最划算」：取解锁政策数最多的前 4 个未填槽位 */
const nextSuggestions = computed(() => {
  const list = result.value?.suggestions ?? [];
  return list.filter((item) => !isAnswered(item.slot.key)).slice(0, 4);
});

/** 只算过一次「有意义的填写」才展示结论，否则右侧停留在空状态 */
const hasAnyAnswer = computed(() => filledCount.value > 0);

function isEmpty(value: unknown): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function isAnswered(key: string): boolean {
  return !isEmpty(answers[key]);
}

function slotOptions(slot: RadarSlot) {
  return slot.options ?? [];
}

function selectValue(slot: RadarSlot): string {
  const value = answers[slot.key];
  return typeof value === 'string' ? value : '';
}

function numberValue(slot: RadarSlot): string {
  const value = answers[slot.key];
  return typeof value === 'number' ? String(value) : '';
}

function boolValue(slot: RadarSlot): boolean | undefined {
  const value = answers[slot.key];
  return typeof value === 'boolean' ? value : undefined;
}

function multiValue(slot: RadarSlot): string[] {
  const value = answers[slot.key];
  return Array.isArray(value) ? (value as string[]) : [];
}

function setSlot(key: string, value: unknown) {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    delete answers[key];
    return;
  }
  answers[key] = value;
}

function onSelect(slot: RadarSlot, event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  setSlot(slot.key, raw === '' ? undefined : raw);
}

function onNumber(slot: RadarSlot, event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === '') {
    setSlot(slot.key, undefined);
    return;
  }
  const parsed = Number(raw);
  setSlot(slot.key, Number.isFinite(parsed) ? parsed : undefined);
}

function toggleBool(slot: RadarSlot, value: boolean) {
  setSlot(slot.key, boolValue(slot) === value ? undefined : value);
}

function toggleMulti(slot: RadarSlot, value: string) {
  const current = multiValue(slot);
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  // 「以上都不符合」与其他选项互斥
  if (value === 'none' && next.includes('none')) {
    setSlot(slot.key, ['none']);
    return;
  }
  setSlot(
    slot.key,
    next.filter((item) => item !== 'none'),
  );
}

function toggleGroup(group: string) {
  const next = new Set(openGroups.value);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  openGroups.value = next;
}

function groupFilled(group: string): number {
  const list = groupedSlots.value.find((entry) => entry.group === group)?.items ?? [];
  return list.filter((slot) => isAnswered(slot.key)).length;
}

function filledOf(slot: RadarSlot): boolean {
  return isAnswered(slot.key);
}

/** 结论一句话：说清「走到哪一步 / 下一步做什么」，而不是只给一个结论词 */
function itemReason(item: RadarScanItem): string {
  if (item.blockers.length > 0) {
    const first = item.blockers[0];
    return first.gap ? `硬性不符：${first.label} · ${first.gap}` : `硬性不符：${first.label}`;
  }
  if (item.status === 'eligible') {
    if (item.unknown === 0) return '画像覆盖的硬性条件已全部满足，可以开始核对材料清单';
    return `画像覆盖的硬性条件已满足，还有 ${item.unknown} 项政策特有条款要进政策页核对`;
  }
  const radarMissing = item.missing.filter((entry) => entry.kind === 'radar');
  if (radarMissing.length > 0) return `下一步补「${radarMissing[0].label}」，补上就能往下一层判断`;
  const policyMissing = item.missing.filter((entry) => entry.kind === 'policy');
  if (policyMissing.length > 0) return `下一步进政策页确认：${policyMissing[0].label}`;
  return STATUS_META[item.status].hint;
}

function itemTags(item: RadarScanItem): string[] {
  const tags: string[] = [item.category, item.level];
  if (item.year) tags.push(`${item.year} 年`);
  if (item.stageConflict) tags.push('学段不符');
  return tags.filter((tag): tag is string => Boolean(tag));
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
  } catch {
    // 隐私模式下写不进去，忽略即可
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!isEmpty(value)) answers[key] = value;
    }
  } catch {
    // 草稿损坏就别用它
  }
}

function resetAll() {
  for (const key of Object.keys(answers)) delete answers[key];
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await getRadarData();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '雷达数据加载失败';
  } finally {
    loading.value = false;
  }
}

function fillDemo() {
  resetAll();
  for (const [key, value] of Object.entries(DEMO_ANSWERS)) answers[key] = value;
}

onMounted(() => {
  loadDraft();
  // ?demo=1 直接铺一份示例画像，方便演示和截图
  if (route.query.demo === '1') fillDemo();
  void load();
});

watch(answers, saveDraft, { deep: true });
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">
    <div class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-brand-600" />
      政策雷达 · 一次画像，32 份政策分层
    </div>

    <h1 class="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
      先说说你自己，<span class="text-brand-600">再看你能申哪些</span>
    </h1>
    <p class="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">
      32 份政策里一共有 333 个表单字段、285 种不同写法，一份份填是不现实的 ——
      这里只问 26 项共性信息，用规则表把它们映射到每份政策自己的字段上，得出「初筛适合 / 差几项 / 信息不够 / 不符」。
      没填的信息不会算成「不符合」，只会标「待补充」。
    </p>

    <div v-if="loading" class="mt-8 grid gap-4 lg:grid-cols-[380px_1fr]">
      <div class="h-96 animate-pulse rounded-2xl border border-line bg-surface" />
      <div class="h-96 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>

    <div v-else-if="error" class="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 class="text-base font-semibold text-rose-800">雷达数据加载失败</h2>
      <p class="mt-1 text-sm text-rose-700">{{ error }}</p>
      <button type="button" class="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm text-on-brand" @click="load">重试</button>
    </div>

    <div v-else class="mt-8 grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <!-- 左：画像表单 -->
      <section class="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-20">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-ink">你的画像</h2>
          <span class="text-xs tabular-nums text-faint">{{ filledCount }} / {{ slots.length }} 项</span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            class="h-full rounded-full bg-brand-600 transition-all"
            :style="{ width: `${slots.length ? (filledCount / slots.length) * 100 : 0}%` }"
          />
        </div>
        <p class="mt-2 text-xs leading-relaxed text-muted">
          填多少算多少；不知道的留空，只会变成「待补充」。草稿自动存在这台电脑的浏览器里。
        </p>

        <div class="mt-4 max-h-[calc(100vh-13rem)] space-y-2 overflow-y-auto pr-1">
          <div v-for="entry in groupedSlots" :key="entry.group" class="rounded-xl border border-line">
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2.5 text-left"
              @click="toggleGroup(entry.group)"
            >
              <span class="text-sm font-medium text-ink">{{ entry.group }}</span>
              <span class="flex items-center gap-2 text-xs text-faint">
                <span class="tabular-nums">{{ groupFilled(entry.group) }}/{{ entry.items.length }}</span>
                <span class="transition" :class="openGroups.has(entry.group) ? 'rotate-180' : ''">⌄</span>
              </span>
            </button>

            <div v-if="openGroups.has(entry.group)" class="space-y-3 border-t border-line-sub px-3 py-3">
              <div v-for="slot in entry.items" :key="slot.key">
                <div class="flex items-baseline justify-between gap-2">
                  <label class="text-xs font-medium text-ink-2">
                    {{ slot.label
                    }}<span v-if="slot.optional" class="ml-1 font-normal text-faint">（选填）</span>
                  </label>
                  <span v-if="filledOf(slot)" class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">已填</span>
                </div>

                <!-- 单选 -->
                <select
                  v-if="slot.kind === 'select'"
                  class="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-2 focus:border-brand-500 focus:outline-none"
                  :value="selectValue(slot)"
                  @change="onSelect(slot, $event)"
                >
                  <option value="">请选择</option>
                  <option v-for="option in slotOptions(slot)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>

                <!-- 数字 -->
                <div v-else-if="slot.kind === 'number'" class="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    class="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-2 focus:border-brand-500 focus:outline-none"
                    :placeholder="slot.placeholder ?? '请填写数字'"
                    :value="numberValue(slot)"
                    @input="onNumber(slot, $event)"
                  />
                  <span v-if="slot.unit" class="shrink-0 text-xs text-faint">{{ slot.unit }}</span>
                </div>

                <!-- 是 / 否 -->
                <div v-else-if="slot.kind === 'boolean'" class="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    class="rounded-lg border px-3 py-1 text-xs transition"
                    :class="
                      boolValue(slot) === true
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-line bg-surface text-ink-2 hover:border-brand-300'
                    "
                    @click="toggleBool(slot, true)"
                  >
                    是
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border px-3 py-1 text-xs transition"
                    :class="
                      boolValue(slot) === false
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-line bg-surface text-ink-2 hover:border-brand-300'
                    "
                    @click="toggleBool(slot, false)"
                  >
                    否
                  </button>
                  <button v-if="filledOf(slot)" type="button" class="text-xs text-faint hover:text-ink-2" @click="toggleBool(slot, boolValue(slot) === true)">
                    清除
                  </button>
                </div>

                <!-- 多选 -->
                <div v-else-if="slot.kind === 'multiselect'" class="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    v-for="option in slotOptions(slot)"
                    :key="option.value"
                    type="button"
                    class="rounded-full border px-2.5 py-1 text-[11px] transition"
                    :class="
                      multiValue(slot).includes(option.value)
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-line bg-surface text-ink-2 hover:border-brand-300'
                    "
                    @click="toggleMulti(slot, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>

                <p v-if="slot.hint" class="mt-1 text-[11px] leading-snug text-faint">{{ slot.hint }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-line-sub pt-3">
          <button type="button" class="text-xs text-faint hover:text-rose-600" @click="resetAll">清空重填</button>
          <RouterLink to="/policies" class="text-xs text-brand-600 hover:text-brand-700">直接看政策库 →</RouterLink>
        </div>
      </section>

      <!-- 右：分层结果 -->
      <section class="space-y-4">
        <div v-if="!hasAnyAnswer" class="rounded-2xl border border-dashed border-line-2 bg-surface p-10 text-center">
          <h2 class="text-base font-semibold text-ink">还没有填任何信息</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            左边随便填几项，这里就会实时分成四层：能申、差一点、还缺信息、不符合。
            只填「学历层次」也能看到哪些政策因为学段不符被排除。
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-700"
            @click="fillDemo"
          >
            用示例画像看效果
          </button>
        </div>

        <template v-else>
          <!-- 四层统计 -->
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="status in (['eligible', 'near', 'incomplete', 'ineligible'] as RadarStatus[])"
              :key="status"
              class="rounded-2xl border bg-surface px-4 py-3"
              :class="activeTab === status ? 'border-brand-500 ring-1 ring-brand-200' : 'border-line'"
            >
              <dd class="text-2xl font-bold tabular-nums" :class="status === 'ineligible' ? 'text-faint' : 'text-ink'">
                {{ tabCounts[status] ?? 0 }}
              </dd>
              <dt class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <span class="h-1.5 w-1.5 rounded-full" :class="STATUS_META[status].dot" />
                {{ STATUS_META[status].label }}
              </dt>
            </div>
          </dl>
          <p class="text-xs leading-relaxed text-faint">
            这四层是「初筛」：只比对画像能覆盖的硬性条件，不代替学校或主管部门审核。
            点了「初筛适合」也别直接交材料 —— 进政策页把「政策特有」条款补齐、核对一遍再准备。
          </p>

          <!-- 先填哪几项 -->
          <div v-if="nextSuggestions.length > 0" class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p class="text-xs font-medium text-sky-900">再填这几项，判断会更准：</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="entry in nextSuggestions"
                :key="entry.slot.key"
                class="rounded-full border border-sky-300 bg-surface px-2.5 py-1 text-[11px] text-sky-800"
              >
                {{ entry.slot.label }} · 影响 {{ entry.unlockedPolicies }} 份
              </span>
            </div>
          </div>

          <!-- 状态筛选 -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tab in STATUS_TABS"
              :key="tab.key"
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="
                activeTab === tab.key
                  ? 'border-brand-600 bg-brand-600 text-on-brand'
                  : 'border-line bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700'
              "
              @click="activeTab = tab.key"
            >
              {{ tab.label }}（{{ tabCounts[tab.key] ?? 0 }}）
            </button>
          </div>

          <!-- 政策卡片 -->
          <div class="space-y-3">
            <article
              v-for="item in filteredItems"
              :key="item.policyId"
              class="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-2"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium" :class="STATUS_META[item.status].badge">
                      {{ STATUS_META[item.status].label }}
                    </span>
                    <span v-for="tag in itemTags(item)" :key="tag" class="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">
                      {{ tag }}
                    </span>
                  </div>
                  <h3 class="mt-2 text-sm font-semibold leading-snug text-ink">{{ item.title }}</h3>
                  <p class="mt-1 text-xs leading-relaxed text-muted">{{ itemReason(item) }}</p>
                </div>
                <RouterLink
                  :to="`/match/${item.policyId}`"
                  class="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:border-brand-400 hover:text-brand-700"
                >
                  {{ item.status === 'eligible' ? '去核对材料' : '补充判定' }} →
                </RouterLink>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-sub pt-2 text-[11px] text-faint">
                <span class="tabular-nums">
                  已核对 {{ item.pass }} 项符合<span v-if="item.fail > 0"> · {{ item.fail }} 项不符</span><span v-if="item.unknown > 0"> · {{ item.unknown }} 项待核对</span>
                </span>
                <span v-if="item.radarUnknown > 0">画像可补 {{ item.radarUnknown }} 条</span>
                <span v-if="item.policyUnknown > 0">政策特有 {{ item.policyUnknown }} 条</span>
              </div>
            </article>

            <p v-if="filteredItems.length === 0" class="rounded-2xl border border-dashed border-line-2 bg-surface p-8 text-center text-sm text-muted">
              这一层暂时没有政策。
            </p>
          </div>

          <p class="text-xs leading-relaxed text-faint">
            雷达只做「初筛」：结论来自你填的画像与政策条款的机械比对，不代表学校或主管部门的审核结果。
            真正提交前，请点进每份政策，把「政策特有」的那几条补齐再判定一次。
          </p>
        </template>
      </section>
    </div>
  </div>
</template>
