<script setup lang="ts">
/**
 * 个人中心：展示当前账号信息与最近的判定记录。
 * 数据全部来自服务端，换一台电脑登录看到的是同一份。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { clearRecords, currentUser, fetchRecords, logout, type JudgementRecord } from '@/lib/auth';
import { VERDICT_META, overallTitle } from '@/lib/verdict';

const router = useRouter();

const records = ref<JudgementRecord[]>([]);
const loading = ref(true);
const error = ref('');
const clearing = ref(false);

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

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    records.value = await fetchRecords();
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

async function handleClear(): Promise<void> {
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

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <RouterLink to="/policies" class="text-sm text-slate-500 transition hover:text-brand-600">← 返回政策库</RouterLink>

    <!-- 账号信息 -->
    <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div class="flex flex-wrap items-center gap-4">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
          {{ initial }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold text-slate-900">{{ currentUser?.displayName }}</h1>
            <span
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="currentUser?.role === 'demo' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'"
              >{{ roleLabel }}</span
            >
          </div>
          <p class="mt-1 text-sm text-slate-500">
            @{{ currentUser?.username }}
            <span v-if="currentUser?.createdAt" class="ml-2 text-xs text-slate-400">注册于 {{ formatAt(currentUser.createdAt) }}</span>
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          @click="handleLogout"
        >
          退出登录
        </button>
      </div>
      <p class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
        账号与填写进度都存在服务端：换一台电脑用同一账号登录，草稿和判定记录会自动同步过来。
      </p>
    </section>

    <!-- 判定记录 -->
    <section class="mt-6 rounded-2xl border border-slate-200 bg-white">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 class="text-base font-semibold text-slate-900">我的判定记录</h2>
          <p class="mt-0.5 text-xs text-slate-400">最多保留最近 20 条，按时间倒序</p>
        </div>
        <button
          v-if="records.length > 0"
          type="button"
          :disabled="clearing"
          class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          @click="handleClear"
        >
          清空记录
        </button>
      </header>

      <div v-if="loading" class="space-y-3 p-6">
        <div class="h-16 animate-pulse rounded-xl bg-slate-100" />
        <div class="h-16 animate-pulse rounded-xl bg-slate-100" />
      </div>

      <p v-else-if="error" class="p-6 text-sm text-rose-600">{{ error }}</p>

      <div v-else-if="records.length === 0" class="p-8 text-center">
        <p class="text-sm text-slate-500">还没有判定记录</p>
        <p class="mt-1 text-xs text-slate-400">去政策库填一份自己的情况，判定后会自动记在这里</p>
        <RouterLink
          to="/policies"
          class="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >去选一份政策</RouterLink
        >
      </div>

      <ul v-else class="divide-y divide-slate-100">
        <li v-for="record in records" :key="record.id" class="flex flex-wrap items-center gap-3 px-6 py-4">
          <span class="h-2 w-2 rounded-full" :class="VERDICT_META[record.overall].dot" />
          <div class="min-w-0 flex-1">
            <RouterLink :to="`/match/${record.policyId}`" class="block truncate text-sm font-medium text-slate-800 transition hover:text-brand-600">
              {{ record.policyTitle }}
            </RouterLink>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ formatAt(record.at) }} · 符合 {{ record.summary.pass }} · 不符合 {{ record.summary.fail }} · 待补充
              {{ record.summary.unknown }}
            </p>
          </div>
          <span class="rounded-full border px-2 py-0.5 text-xs" :class="VERDICT_META[record.overall].badge">
            {{ overallTitle(record.overall) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
