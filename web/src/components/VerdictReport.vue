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

const stats = computed(() => [
  { key: 'pass', label: '符合', value: summary.value.pass, tone: 'text-emerald-600' },
  { key: 'fail', label: '不符合', value: summary.value.fail, tone: 'text-rose-600' },
  { key: 'unknown', label: '需确认', value: summary.value.unknown, tone: 'text-amber-600' },
  { key: 'warn', label: '建议项', value: summary.value.warn, tone: 'text-slate-500' },
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
        <span class="shrink-0 rounded-full border bg-white/70 px-3 py-1 text-xs font-medium" :class="meta.badge">
          {{ meta.label }}
        </span>
      </div>
      <p class="mt-3 text-sm leading-relaxed opacity-90">{{ result.headline }}</p>

      <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div v-for="item in stats" :key="item.key" class="rounded-lg bg-white/70 px-3 py-2">
          <dt class="text-xs text-slate-500">{{ item.label }}</dt>
          <dd class="text-xl font-semibold tabular-nums" :class="item.tone">{{ item.value }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-xs opacity-70">
        共 {{ summary.requiredTotal }} 项参与结论计算；「需人工确认」的条件不影响你继续准备材料，但需要线下核实。
      </p>
    </section>

    <!-- 逐条判定 -->
    <section class="space-y-3">
      <h3 class="text-sm font-semibold tracking-wider text-slate-400 uppercase">逐条判定</h3>

      <article
        v-for="group in result.groups"
        :key="group.groupId"
        class="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        <header class="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <div class="min-w-0">
            <h4 class="truncate text-sm font-semibold text-slate-800">{{ group.name }}</h4>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ group.logic === 'any' ? '满足其中任意一条即可' : '需同时满足组内全部条件' }}
            </p>
          </div>
          <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs" :class="VERDICT_META[group.verdict].badge">
            {{ VERDICT_META[group.verdict].label }}
          </span>
        </header>

        <ul class="divide-y divide-slate-50">
          <li v-for="item in group.conditionResults" :key="item.conditionId" class="px-4 py-3">
            <div class="flex items-start gap-2.5">
              <span
                class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                :class="VERDICT_META[item.verdict].dot"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-medium text-slate-800">{{ item.label }}</p>
                  <span class="rounded-full border px-1.5 py-0.5 text-[11px]" :class="VERDICT_META[item.verdict].badge">
                    {{ VERDICT_META[item.verdict].label }}
                  </span>
                </div>

                <p class="mt-1 text-sm text-slate-600">{{ item.reason }}</p>
                <p class="mt-0.5 text-xs text-slate-400">
                  政策要求：{{ item.expected }}<span v-if="formatActual(item.actual)"> · 你的情况：{{ formatActual(item.actual) }}</span>
                </p>

                <p v-if="item.gap" class="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">{{ item.gap }}</p>
                <p v-if="item.hint" class="mt-1 text-xs text-brand-600">建议：{{ item.hint }}</p>

                <blockquote class="mt-2 border-l-2 border-slate-200 pl-2 text-xs leading-relaxed text-slate-500">
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
    <section v-if="policy.materials.length" class="rounded-xl border border-slate-200 bg-white p-4">
      <h3 class="text-sm font-semibold text-slate-800">材料清单</h3>
      <p v-if="result.missingMaterials.length" class="mt-1 text-xs text-rose-600">
        以下材料与未满足的条件相关，先确认这些：{{ result.missingMaterials.join('、') }}
      </p>
      <ul class="mt-3 space-y-2">
        <li v-for="material in policy.materials" :key="material.name" class="flex items-start gap-2 text-sm">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
          <div>
            <span class="text-slate-700">{{ material.name }}</span>
            <span v-if="material.required" class="ml-1 rounded bg-rose-50 px-1 text-[11px] text-rose-600">必交</span>
            <p v-if="material.note" class="mt-0.5 text-xs text-slate-400">{{ material.note }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- 时间节点 -->
    <section v-if="policy.deadlines.length" class="rounded-xl border border-slate-200 bg-white p-4">
      <h3 class="text-sm font-semibold text-slate-800">时间节点</h3>
      <ol class="mt-3 space-y-2">
        <li v-for="deadline in policy.deadlines" :key="deadline.label" class="flex items-start gap-2 text-sm">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
          <div>
            <span class="text-slate-700">{{ deadline.label }}</span>
            <span v-if="deadline.date" class="ml-1 text-xs text-slate-400">{{ deadline.date }}</span>
            <p v-if="deadline.note" class="mt-0.5 text-xs text-slate-400">{{ deadline.note }}</p>
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
