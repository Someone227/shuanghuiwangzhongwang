<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import type { Policy } from '@/lib/api';

const props = defineProps<{
  policy: Policy;
  activeSectionId: string | null;
  activeQuote: string;
}>();

/** 原文面板自己管滚动：命中段落滚动到面板顶部附近，不改动整页滚动位置 */
const scroller = ref<HTMLElement | null>(null);

watch(
  () => props.activeSectionId,
  async (sectionId) => {
    if (!sectionId) return;
    await nextTick();
    const container = scroller.value;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`#orig-${sectionId}`);
    if (!target) return;
    container.scrollTo({ top: Math.max(target.offsetTop - container.offsetTop - 16, 0), behavior: 'smooth' });
  },
);

interface Segment {
  kind: 'gap' | 'section';
  id?: string;
  heading?: string;
  text: string;
}

/**
 * 按段落字符偏移把原文切成「段落 + 段落间过渡文本」两类片段。
 * 偏移在建库阶段已校验过（数据契约测试保证 slice 与段落文本一致），前端只负责渲染。
 */
const segments = computed<Segment[]>(() => {
  const { originalText, sections } = props.policy;
  const located = sections
    .filter((section) => typeof section.start === 'number' && typeof section.end === 'number')
    .slice()
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  const out: Segment[] = [];
  let cursor = 0;
  for (const section of located) {
    const start = section.start ?? 0;
    const end = section.end ?? start;
    if (start > cursor) out.push({ kind: 'gap', text: originalText.slice(cursor, start) });
    out.push({ kind: 'section', id: section.id, heading: section.heading, text: originalText.slice(start, end) });
    cursor = Math.max(cursor, end);
  }
  if (cursor < originalText.length) out.push({ kind: 'gap', text: originalText.slice(cursor) });
  return out;
});

interface Part {
  text: string;
  hit: boolean;
}

/** 在当前段落里把命中的原文句标黄，其余保持原样 */
function partsOf(text: string): Part[] {
  const quote = props.activeQuote.trim();
  if (!quote) return [{ text, hit: false }];
  const index = text.indexOf(quote);
  if (index < 0) return [{ text, hit: false }];
  const before = text.slice(0, index);
  const after = text.slice(index + quote.length);
  const parts: Part[] = [];
  if (before) parts.push({ text: before, hit: false });
  parts.push({ text: quote, hit: true });
  if (after) parts.push({ text: after, hit: false });
  return parts;
}

function isActive(sectionId?: string): boolean {
  return sectionId !== undefined && sectionId === props.activeSectionId;
}
</script>

<template>
  <div class="rounded-xl border border-line bg-surface">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-line-sub px-4 py-3">
      <div>
        <h3 class="text-sm font-semibold text-ink">政策原文</h3>
        <p class="mt-0.5 text-xs text-faint">
          共 {{ policy.sections.length }} 段 · 判定命中的段落会高亮，原句标黄
        </p>
      </div>
      <a
        v-if="policy.sourceUrl"
        :href="policy.sourceUrl"
        target="_blank"
        rel="noreferrer"
        class="text-xs text-brand-600 hover:text-brand-700"
        >官方原文 ↗</a
      >
    </header>

    <div ref="scroller" class="max-h-[80vh] overflow-y-auto px-4 py-3">
      <template v-for="(segment, index) in segments" :key="index">
        <p v-if="segment.kind === 'gap'" class="whitespace-pre-wrap text-xs leading-relaxed text-faint">
          {{ segment.text }}
        </p>

        <section
          v-else
          :id="`orig-${segment.id}`"
          class="my-2 scroll-mt-24 rounded-lg border p-3 transition"
          :class="isActive(segment.id) ? 'border-brand-300 bg-brand-50/60' : 'border-transparent'"
        >
          <h4 class="text-xs font-semibold text-muted">{{ segment.heading }}</h4>
          <p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
            <template v-for="(part, partIndex) in partsOf(segment.text)" :key="partIndex">
              <mark v-if="part.hit" class="rounded bg-amber-200/80 px-0.5 text-ink">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
