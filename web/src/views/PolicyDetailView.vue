<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { getPolicy, listPolicies } from '@/lib/api';
import type { Policy, PolicySummary } from '@/lib/api';
import { buildPolicyDetail, pickRelated } from '@domain/detail';

/**
 * 政策详情页。
 *
 * 政策库卡片只能回答「有多少条判定」，很多人点进来之前其实想先读一遍政策：
 * 条件分组是按什么逻辑、每条到底要什么、要交哪些材料、什么时候截止、原文哪一段说的。
 * 页面把判定引擎用的同一份结构化数据摊开给人看，读到哪一条都能回原文核对。
 */

const route = useRoute();
const policyId = computed(() => String(route.params.id ?? ''));
const policy = ref<Policy | null>(null);
const summaries = ref<PolicySummary[]>([]);
const loading = ref(true);
const error = ref('');

const detail = computed(() => (policy.value ? buildPolicyDetail(policy.value) : null));

/** groupId → 所属并列通道名：条件组标题旁标出「这组属于哪条通道」 */
const channelByGroup = computed(() => {
  const map = new Map<string, string>();
  for (const channel of detail.value?.channelViews ?? []) {
    for (const groupId of channel.groupIds) map.set(groupId, channel.name);
  }
  return map;
});

/** 同类政策推荐：用政策库摘要算，静态版不必为了推荐去拉 32 份全文 */
const related = computed(() => {
  if (!policy.value) return [];
  const candidates = summaries.value.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    level: s.level,
    year: s.year,
    conditions: s.stats.conditions,
    materials: s.stats.materials,
  }));
  return pickRelated(candidates, policy.value.id, 3);
});

const toc = computed(() => {
  if (!detail.value) return [];
  return [
    { id: 'conditions', label: '判定条件', count: detail.value.stats.conditions + ' 条' },
    { id: 'materials', label: '材料清单', count: detail.value.stats.materials + ' 份' },
    { id: 'deadlines', label: '时间节点', count: detail.value.stats.deadlines + ' 个' },
    { id: 'text', label: '政策原文', count: detail.value.stats.sections + ' 段' },
    { id: 'related', label: '同类政策', count: related.value.length + ' 份' },
  ];
});

async function load(id: string): Promise<void> {
  loading.value = true;
  error.value = '';
  policy.value = null;
  try {
    const [full, list] = await Promise.all([
      getPolicy(id),
      listPolicies().catch(() => [] as PolicySummary[]),
    ]);
    policy.value = full;
    summaries.value = list;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '政策加载失败';
  } finally {
    loading.value = false;
  }
}

watch(policyId, (id) => void load(id), { immediate: true });
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <RouterLink
      to="/policies"
      class="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-brand-600"
    >
      ← 返回政策库
    </RouterLink>

    <!-- 加载骨架 -->
    <div v-if="loading" class="mt-4 animate-pulse space-y-4">
      <div class="h-40 rounded-2xl bg-surface-3" />
      <div class="h-64 rounded-2xl bg-surface-3" />
    </div>

    <div
      v-else-if="error"
      class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"
    >
      这份政策没能加载出来：{{ error }}
      <RouterLink to="/policies" class="ml-2 underline">回到政策库</RouterLink>
    </div>

    <template v-else-if="policy && detail">
      <!-- 概览 -->
      <header class="mt-4 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] text-brand-700">
            {{ policy.level }}
          </span>
          <span class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">
            {{ policy.category }}
          </span>
          <span class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">
            {{ policy.year }} 年
          </span>
          <span
            v-if="policy.review?.humanReviewed"
            class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-700"
          >
            人工复核 {{ policy.review.reviewedAt }}
          </span>
          <span
            v-if="policy.extraction.engine === 'deepseek'"
            class="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] text-faint"
          >
            AI 建库 · {{ policy.extraction.model ?? 'deepseek-chat' }}
          </span>
        </div>

        <h1 class="mt-4 text-2xl leading-snug font-bold text-ink sm:text-3xl">{{ policy.title }}</h1>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>发布单位：{{ policy.issuer }}</span>
          <a
            v-if="policy.sourceUrl"
            :href="policy.sourceUrl"
            target="_blank"
            rel="noreferrer"
            class="text-brand-600 hover:underline"
          >
            官方原文 ↗
          </a>
        </div>

        <!-- 关键数字 -->
        <dl class="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <div>
            <dt class="text-[11px] text-faint">判定条件</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold text-ink">{{ detail.stats.conditions }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-faint">需填写字段</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold text-ink">{{ detail.stats.fields }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-faint">申请材料</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold text-ink">{{ detail.stats.materials }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-faint">时间节点</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold text-ink">{{ detail.stats.deadlines }}</dd>
          </div>
        </dl>

        <!-- 过时条款提示 -->
        <div v-if="detail.alertNotes.length" class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p class="text-xs font-medium text-amber-700">政策说明与过时条款提示</p>
          <ul class="mt-2 space-y-1.5">
            <li v-for="(note, i) in detail.alertNotes" :key="i" class="text-xs leading-relaxed text-amber-700">
              · {{ note }}
            </li>
          </ul>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <RouterLink
            :to="`/match/${policy.id}`"
            class="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-on-brand transition hover:bg-brand-700"
          >
            开始匹配：看看我够不够格 →
          </RouterLink>
          <a
            href="#conditions"
            class="inline-flex items-center rounded-lg border border-line-2 px-4 py-2.5 text-sm text-ink-2 transition hover:border-brand-300 hover:text-brand-700"
          >
            先读判定条件
          </a>
        </div>
      </header>

      <div class="mt-6 lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-8">
        <!-- 目录 -->
        <nav class="hidden lg:block">
          <div class="sticky top-20 space-y-1">
            <p class="px-2 pb-1 text-[11px] tracking-wide text-faint">本页目录</p>
            <a
              v-for="item in toc"
              :key="item.id"
              :href="`#${item.id}`"
              class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <span>{{ item.label }}</span>
              <span class="text-[11px] text-faint">{{ item.count }}</span>
            </a>
          </div>
        </nav>

        <div class="space-y-6">
          <!-- 判定条件 -->
          <section id="conditions" class="scroll-mt-24">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold text-ink">判定条件</h2>
              <p class="text-xs text-muted">
                共 {{ detail.stats.groups }} 个条件组 ·
                {{ detail.stats.requiredConditions }} 条硬性条件
              </p>
            </div>

            <!-- 并列通道：同一份政策里满足任一条即可 -->
            <div v-if="detail.channelViews.length" class="mt-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="text-xs font-medium tracking-wider text-brand-700">并列通道 · 满足任一即可</p>
                <p class="text-xs text-brand-700/70">{{ detail.channelViews.length }} 条路径</p>
              </div>
              <ul class="mt-3 grid gap-3 sm:grid-cols-2">
                <li
                  v-for="channel in detail.channelViews"
                  :key="channel.id"
                  class="rounded-xl border border-line bg-surface p-3.5"
                >
                  <p class="text-sm font-semibold text-ink">{{ channel.name }}</p>
                  <p v-if="channel.description" class="mt-1 text-xs leading-relaxed text-muted">
                    {{ channel.description }}
                  </p>
                  <p class="mt-2 text-[11px] text-faint">
                    {{ channel.groupNames.join('、') }} · 共 {{ channel.conditionCount }} 条条件
                  </p>
                </li>
              </ul>
              <p class="mt-3 text-xs text-brand-700/80">
                下面条件组中标有「通道」的，各自只需满足所在通道内的条件；通道以外的条件组仍需全部满足。
              </p>
            </div>

            <div class="mt-4 space-y-4">
              <article
                v-for="group in detail.groupViews"
                :key="group.id"
                class="rounded-2xl border border-line bg-surface p-5"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-semibold text-ink">{{ group.name }}</h3>
                  <span
                    v-if="channelByGroup.get(group.id)"
                    class="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700"
                  >
                    通道 · {{ channelByGroup.get(group.id) }}
                  </span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px]"
                    :class="
                      group.logic === 'all'
                        ? 'border border-line bg-surface-2 text-muted'
                        : 'border border-amber-200 bg-amber-50 text-amber-700'
                    "
                  >
                    {{ group.logic === 'all' ? '全部满足' : '任一满足' }}
                  </span>
                  <span class="text-xs text-faint">{{ group.logicText }}</span>
                </div>

                <ul class="mt-4 space-y-3">
                  <li
                    v-for="condition in group.conditions"
                    :key="condition.id"
                    class="rounded-xl border border-line-sub bg-surface-2 p-4"
                  >
                    <div class="flex items-start gap-3">
                      <span
                        class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-3 font-mono text-[11px] text-muted"
                      >
                        {{ condition.index }}
                      </span>
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-ink">
                          {{ condition.label }}
                          <span
                            v-if="condition.required"
                            class="ml-1 whitespace-nowrap rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-normal text-rose-600"
                          >
                            硬性
                          </span>
                        </p>
                        <p class="mt-1 text-xs text-muted">
                          政策要求：<span class="text-ink-2">{{ condition.requirement }}</span>
                        </p>
                        <blockquote
                          v-if="condition.quote"
                          class="mt-2 border-l-2 border-brand-200 pl-3 text-xs leading-relaxed text-ink-2"
                        >
                          {{ condition.quote }}
                        </blockquote>
                        <p class="mt-1.5 text-[11px] text-faint">
                          出处：{{ condition.sectionHeading }}
                          <a href="#text" class="ml-1 text-brand-600 hover:underline">在原文中查看 →</a>
                        </p>
                        <p v-if="condition.hint" class="mt-1.5 text-xs text-brand-600">
                          建议：{{ condition.hint }}
                        </p>
                      </div>
                    </div>
                  </li>
                </ul>

                <p v-if="group.sectionHeading" class="mt-3 text-[11px] text-faint">
                  本组依据原文：{{ group.sectionHeading }}
                </p>
              </article>
            </div>
          </section>

          <!-- 材料清单 -->
          <section id="materials" class="scroll-mt-24">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold text-ink">申请材料</h2>
              <p class="text-xs text-muted">
                共 {{ detail.stats.materials }} 份，其中必需 {{ detail.stats.requiredMaterials }} 份
              </p>
            </div>

            <div
              v-if="detail.materials.length === 0"
              class="mt-3 rounded-2xl border border-dashed border-line-2 bg-surface px-5 py-8 text-center text-sm text-muted"
            >
              这份政策原文没有单独列材料清单，按学校或主管部门要求提交即可。
            </div>

            <ul v-else class="mt-3 space-y-2">
              <li
                v-for="(material, i) in detail.materials"
                :key="i"
                class="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <div class="min-w-0">
                  <p class="text-sm text-ink">
                    {{ material.name }}
                    <span
                      class="ml-1 rounded px-1.5 py-0.5 text-[10px]"
                      :class="
                        material.required
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-surface-3 text-faint'
                      "
                    >
                      {{ material.required ? '必需' : '视情况' }}
                    </span>
                  </p>
                  <p v-if="material.note" class="mt-1 text-xs text-muted">{{ material.note }}</p>
                </div>
              </li>
            </ul>
          </section>

          <!-- 时间节点 -->
          <section id="deadlines" class="scroll-mt-24">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold text-ink">时间节点</h2>
              <p class="text-xs text-muted">共 {{ detail.stats.deadlines }} 个</p>
            </div>

            <div
              v-if="detail.deadlines.length === 0"
              class="mt-3 rounded-2xl border border-dashed border-line-2 bg-surface px-5 py-8 text-center text-sm text-muted"
            >
              原文没有写固定日期，留意学校或主管部门的当年通知。
            </div>

            <ol v-else class="mt-3 space-y-2">
              <li
                v-for="(deadline, i) in detail.deadlines"
                :key="i"
                class="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <span class="font-mono text-[11px] text-faint">{{ String(i + 1).padStart(2, '0') }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-ink">
                    {{ deadline.label }}
                    <span v-if="deadline.date" class="ml-2 text-xs text-brand-600">{{ deadline.date }}</span>
                  </p>
                  <p v-if="deadline.note" class="mt-1 text-xs text-muted">{{ deadline.note }}</p>
                </div>
              </li>
            </ol>
          </section>

          <!-- 原文 -->
          <section id="text" class="scroll-mt-24">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold text-ink">政策原文</h2>
              <p class="text-xs text-muted">
                共 {{ detail.stats.sections }} 段 · {{ detail.stats.chars.toLocaleString('zh-CN') }} 字
              </p>
            </div>

            <div class="mt-3 space-y-2">
              <details
                v-for="(section, i) in detail.sectionViews"
                :key="section.id"
                :open="i === 0"
                class="rounded-xl border border-line bg-surface px-4 py-3"
              >
                <summary class="cursor-pointer text-sm font-medium text-ink">
                  {{ section.heading }}
                  <span v-if="section.conditionCount" class="ml-2 text-[11px] font-normal text-brand-600">
                    含 {{ section.conditionCount }} 条判定条件
                  </span>
                  <span v-if="section.repaired" class="ml-1 text-[11px] font-normal text-amber-600">
                    人工补齐
                  </span>
                </summary>
                <p class="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-2">{{ section.text }}</p>
              </details>
            </div>
          </section>

          <!-- 同类政策 -->
          <section id="related" class="scroll-mt-24">
            <h2 class="text-lg font-semibold text-ink">读完这份，还可以看看</h2>
            <p class="mt-1 text-xs text-muted">按类别、材料清单重合度与年份接近程度挑选</p>

            <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <article
                v-for="item in related"
                :key="item.id"
                class="flex flex-col rounded-2xl border border-line bg-surface p-4"
              >
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                    {{ item.reason }}
                  </span>
                  <span class="text-[10px] text-faint">{{ item.year }} 年</span>
                </div>
                <RouterLink
                  :to="`/policies/${item.id}`"
                  class="mt-2 line-clamp-2 text-sm font-medium text-ink transition hover:text-brand-600"
                >
                  {{ item.title }}
                </RouterLink>
                <p class="mt-1 text-[11px] text-faint">
                  {{ item.conditions }} 条判定 · {{ item.materials }} 份材料
                </p>
                <RouterLink
                  :to="`/match/${item.id}`"
                  class="mt-3 inline-flex items-center justify-center rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs text-brand-700 transition hover:border-brand-600 hover:bg-brand-600 hover:text-on-brand"
                >
                  开始匹配 →
                </RouterLink>
              </article>
            </div>

            <RouterLink
              to="/policies"
              class="mt-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-brand-600"
            >
              浏览全部政策 →
            </RouterLink>
          </section>
        </div>
      </div>

      <p class="mt-10 rounded-xl bg-surface-2 px-4 py-3 text-[11px] leading-relaxed text-faint">
        本页条件由 DeepSeek 从政策原文抽取、逐条人工复核，判定引擎运行时零 token；
        最终是否具备资格以学校与主管部门审核为准。
      </p>
    </template>
  </div>
</template>