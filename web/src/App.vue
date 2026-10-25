<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { currentUser, isLoggedIn, logout, restoreSession } from '@/lib/auth';

type Status = 'checking' | 'ok' | 'down';

const apiStatus = ref<Status>('checking');

const statusText: Record<Status, string> = {
  checking: '检查中…',
  ok: '后端已连接',
  down: '后端未连接',
};

const statusDot: Record<Status, string> = {
  checking: 'bg-slate-300',
  ok: 'bg-emerald-500',
  down: 'bg-red-400',
};

const initial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '?').slice(0, 1).toUpperCase());

async function handleLogout(): Promise<void> {
  await logout();
}

onMounted(async () => {
  // 用本地令牌确认登录态，避免刷新后顶栏闪一下「未登录」
  void restoreSession();
  try {
    const res = await fetch('/api/health');
    apiStatus.value = res.ok ? 'ok' : 'down';
  } catch {
    apiStatus.value = 'down';
  }
});
</script>

<template>
  <div class="min-h-full flex flex-col bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <RouterLink to="/" class="flex items-center gap-3">
          <span
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm"
            >申</span
          >
          <span class="leading-tight">
            <span class="block text-base font-semibold tracking-tight">能申吗</span>
            <span class="block text-xs text-slate-500">政策资格匹配器</span>
          </span>
        </RouterLink>

        <div class="flex items-center gap-2">
          <div
            class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="statusDot[apiStatus]" />
            {{ statusText[apiStatus] }}
          </div>

          <RouterLink
            to="/policies"
            class="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
          >
            开始匹配
          </RouterLink>

          <template v-if="isLoggedIn && currentUser">
            <RouterLink
              to="/account"
              class="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-xs text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
            >
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                {{ initial }}
              </span>
              <span class="max-w-[7rem] truncate">{{ currentUser.displayName }}</span>
            </RouterLink>
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
              @click="handleLogout"
            >
              退出
            </button>
          </template>
          <RouterLink
            v-else
            to="/login"
            class="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600"
          >
            登录 / 注册
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="border-t border-slate-200 bg-white">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 text-xs text-slate-500 sm:flex-row"
      >
        <span>能申吗 · 第九届传智杯 AI-WEB 赛道参赛作品</span>
        <span>Vue 3 · Vite · Tailwind · Express · DeepSeek</span>
      </div>
    </footer>
  </div>
</template>
