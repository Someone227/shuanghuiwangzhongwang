<script setup lang="ts">
import { computed } from 'vue';

import type { EvaluationResult, Policy } from '@/lib/api';
import { VERDICT_META, overallTitle, overallTone } from '@/lib/verdict';

const props = defineProps<{
  result: EvaluationResult;
  policy: Policy;
}>();

const emit = defineEmits<{
  (e: 'locate', docRef: string, quote: string): void;
}>();

const summary = computed(() => props.result.summary);
const meta = computed(() => VERDICT_META[props.result.overall]);

/** 结论印章的描边颜色跟着结论走 */
const sealTone = computed(() => {
  const v = props.result.overall;
  if (v === 'pass') return 'text-emerald-700';
  if (v === 'fail') return 'text-rose-700';
  if (v === 'warn') return 'text-ink-2';
  return 'text-amber-700';
});

/** 并列通道：满足任一条即可（老数据可能没有这个字段，兜底成空数组） */
const channels = computed(() => props.result.channels ?? []);

/** groupId → 所属通道名，用来在条件组标题旁标出「这组属于哪条通道」 */
const channelByGroup = computed(() => {
  const map = new Map<string, string>();
  for (const channel of channels.value) {
    for (const groupId of channel.groupIds) map.set(groupId, channel.name);
  }
  return map;
});

/** 走「任一通道」的政策，在结论下方提示一句，避免用户以为每组都要满足 */
const channelHint = computed(() => {
  if (!channels.value.length) return '';
  return `这份政策有 ${channels.value.length} 条并列通道，满足其中任意一条即可。`;
});

const stats = computed(() => [
  { key: 'pass', label: '符合', value: summary.value.pass, tone: 'text-emerald-600' },
  { key: 'fail', label: '不符合', value: summary.value.fail, tone: 'text-rose-600' },
  { key: 'unknown', label: '待补充', value: summary.value.unknown, tone: 'text-amber-600' },
  { key: 'warn', label: '建议项', value: summary.value.warn, tone: 'text-muted' },
]);

/** 引擎返回的是原始值（布尔/数字/数组），展示成用户能读懂的中文 */
function formatActual(value: unknown): string {
  if (value === true) return '是';
  if (value === false) return '否';
  if (Array.isArray(value)) return value.length ? value.join('、') : '（空）';
  if (value === null || value === undefined) return '';
  return String(value);
}

function scrollTo(conditionId: string, docRef: string, quote: string): void {
  emit('locate', docRef, quote);
  void conditionId;
}
</script>

<template>
  <div class="space-y-5">
    <!-- 结论 -->
    <section class="rounded-2xl border p-5" :class="overallTone(result.overall)">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-medium tracking-wider opacity-70">判定结论</p>
          <h2 class="mt-1 text-2xl font-bold">{{ overallTitle(result.overall) }}</h2>
        </div>
        <span class="verdict-seal shrink-0" :class="sealTone">{{ meta.label }}</span>
      </div>
      <p class="mt-3 text-sm leading-relaxed opacity-90">{{ result.headline }}</p>

      <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div v-for="item in stats" :key="item.key" class="rounded-lg bg-surface/70 px-3 py-2">
          <dt class="text-xs text-muted">{{ item.label }}</dt>
          <dd class="text-xl font-semibold tabular-nums" :class="item.tone">{{ item.value }}</dd>
        </div>
      </dl>
      <p v-if="channelHint" class="mt-3 rounded-lg bg-surface/60 px-3 py-2 text-xs opacity-90">
        {{ channelHint }}
      </p>
      <p class="mt-3 text-xs opacity-70">
        共 {{ summary.requiredTotal }} 项参与结论计算；「待补充」的条件填上之后再判定一次，结论会更明确。
      </p>
    </section>

    <!-- 逐条判定 -->
    <section class="space-y-3">
      <h3 class="text-sm font-semibold tracking-wider text-faint uppercase">逐条判定</h3>

      <!-- 并列通道：先把「哪几条路能走通」摊开，再列出每组条件 -->
      <div v-if="channels.length" class="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
        <p class="text-xs font-medium tracking-wider text-brand-700">并列通道 · 满足任一即可</p>
        <ul class="mt-2 grid gap-2 sm:grid-cols-2">
          <li
            v-for="channel in channels"
            :key="channel.id"
            class="rounded-lg border border-line bg-surface px-3 py-2.5"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 text-sm font-semibold text-ink">{{ channel.name }}</p>
              <span
                class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
                :class="VERDICT_META[channel.verdict].badge"
              >
                {{ VERDICT_META[channel.verdict].label }}
              </span>
            </div>
            <p v-if="channel.description" class="mt-1 text-xs leading-relaxed text-muted">
              {{ channel.description }}
            </p>
          </li>
        </ul>
      </div>

      <article
        v-for="group in result.groups"
        :key="group.groupId"
        class="overflow-hidden rounded-xl border border-line bg-surface"
      >
        <header class="flex items-center justify-between gap-3 border-b border-line-sub bg-surface-2/60 px-4 py-2.5">
          <div class="min-w-0">
            <h4 class="truncate text-sm font-semibold text-ink">{{ group.name }}</h4>
            <p class="mt-0.5 text-xs text-faint">
              <span v-if="channelByGroup.get(group.groupId)" class="text-brand-600">
                通道「{{ channelByGroup.get(group.groupId) }}」·
              </span>
              {{ group.logic === 'any' ? '满足其中任意一条即可' : '需同时满足组内全部条件' }}
            </p>
          </div>
          <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs" :class="VERDICT_META[group.verdict].badge">
            {{ VERDICT_META[group.verdict].label }}
          </span>
        </header>

        <ul class="divide-y divide-line-sub">
          <li v-for="item in group.conditionResults" :key="item.conditionId" class="px-4 py-3">
            <div class="flex items-start gap-2.5">
              <span
                class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                :class="VERDICT_META[item.verdict].dot"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-medium text-ink">{{ item.label }}</p>
                  <span class="rounded-full border px-1.5 py-0.5 text-[11px]" :class="VERDICT_META[item.verdict].badge">
                    {{ VERDICT_META[item.verdict].label }}
                  </span>
                </div>

                <p class="mt-1 text-sm text-ink-2">{{ item.reason }}</p>
                <p class="mt-0.5 text-xs text-faint">
                  政策要求：{{ item.expected }}<span v-if="formatActual(item.actual)"> · 你的情况：{{ formatActual(item.actual) }}</span>
                </p>

                <p v-if="item.gap" class="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ item.gap }}</p>
                <p v-if="item.hint" class="mt-1 text-xs text-brand-600">建议：{{ item.hint }}</p>

                <blockquote class="mt-2 border-l-2 border-line pl-2 text-xs leading-relaxed text-muted">
                  {{ item.quote }}
                </blockquote>

                <button
                  type="button"
                  class="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                  @click="scrollTo(item.conditionId, item.docRef, item.quote)"
                >
                  在原文中查看 →
                </button>
              </div>
            </div>
          </li>
        </ul>
      </article>
    </section>

    <!-- 材料清单 -->
    <section v-if="policy.materials.length" class="rounded-xl border border-line bg-surface p-4">
      <h3 class="text-sm font-semibold text-ink">材料清单</h3>
      <p v-if="result.missingMaterials.length" class="mt-1 text-xs text-rose-600">
        以下材料与未满足的条件相关，先确认这些：{{ result.missingMaterials.join('、') }}
      </p>
      <ul class="mt-3 space-y-2">
        <li v-for="material in policy.materials" :key="material.name" class="flex items-start gap-2 text-sm">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
          <div>
            <span class="text-ink-2">{{ material.name }}</span>
            <span v-if="material.required" class="ml-1 rounded bg-rose-50 px-1 text-[11px] text-rose-600">必交</span>
            <p v-if="material.note" class="mt-0.5 text-xs text-faint">{{ material.note }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- 时间节点 -->
    <section v-if="policy.deadlines.length" class="rounded-xl border border-line bg-surface p-4">
      <h3 class="text-sm font-semibold text-ink">时间节点</h3>
      <ol class="mt-3 space-y-2">
        <li v-for="deadline in policy.deadlines" :key="deadline.label" class="flex items-start gap-2 text-sm">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
          <div>
            <span class="text-ink-2">{{ deadline.label }}</span>
            <span v-if="deadline.date" class="ml-1 text-xs text-faint">{{ deadline.date }}</span>
            <p v-if="deadline.note" class="mt-0.5 text-xs text-faint">{{ deadline.note }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- 下一步 -->
    <section v-if="result.nextSteps.length" class="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
      <h3 class="text-sm font-semibold text-brand-900">接下来做什么</h3>
      <ul class="mt-2 space-y-1.5">
        <li v-for="(step, index) in result.nextSteps" :key="index" class="flex items-start gap-2 text-sm text-brand-900/80">
          <span class="mt-0.5 text-xs font-semibold text-brand-500">{{ index + 1 }}</span>
          <span>{{ step }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
