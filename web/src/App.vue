<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { isStaticMode } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { currentUser, isLoggedIn, logout, restoreSession } from '@/lib/auth';

type Status = 'checking' | 'ok' | 'down';

const apiStatus = ref<Status>('checking');

const statusText: Record<Status, string> = {
  checking: '检查中…',
  ok: '后端已连接',
  down: '后端未连接',
};

const statusDot: Record<Status, string> = {
  checking: 'bg-line-2',
  ok: 'bg-emerald-500',
  down: 'bg-red-400',
};

const { mode: themeMode, toggleTheme } = useTheme();

const initial = computed(() => (currentUser.value?.displayName || currentUser.value?.username || '?').slice(0, 1).toUpperCase());

const route = useRoute();
const router = useRouter();

// 首页不显示返回键；其余页面左上角常驻
const showBack = computed(() => route.path !== '/');

function goBack(): void {
  const state = window.history.state as { back?: string | null } | null;
  if (!state || typeof state.back !== 'string') {
    // 没有站内上一页（如直接从外部链接打开），回首页而不是退出站点
    void router.push('/');
    return;
  }
  router.back();
}

async function handleLogout(): Promise<void> {
  await logout();
}

onMounted(async () => {
  // 静态演示版没有后端，健康检查直接算通过
  if (isStaticMode) {
    apiStatus.value = 'ok';
    return;
  }
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
  <div class="app-shell min-h-full flex flex-col">
    <header class="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div class="flex items-center gap-3">
          <button
            v-if="showBack"
            type="button"
            title="返回上一页"
            aria-label="返回上一页"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-line-2 hover:bg-surface-2 hover:text-ink"
            @click="goBack"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
              <path
                fill-rule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </button>

          <RouterLink to="/" class="flex items-center gap-3">
            <span
              class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-base font-bold text-on-brand shadow-sm dark:from-cyan-400 dark:to-indigo-500 dark:shadow-[0_0_20px_-4px_rgba(56,189,248,0.65)]"
              >申</span
            >
            <span class="leading-tight">
              <span class="block text-base font-semibold tracking-tight">能申吗</span>
              <span class="block text-xs text-muted">政策资格匹配器</span>
            </span>
          </RouterLink>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 min-[440px]:flex"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="isStaticMode ? 'bg-emerald-500' : statusDot[apiStatus]" />
            {{ isStaticMode ? '在线演示版' : statusText[apiStatus] }}
          </div>

          <RouterLink
            to="/radar"
            class="hidden rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink-2 transition hover:border-brand-300 hover:text-brand-700 sm:inline-flex"
          >
            政策雷达
          </RouterLink>

          <RouterLink
            to="/calendar"
            class="hidden rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink-2 transition hover:border-brand-300 hover:text-brand-700 lg:inline-flex"
          >
            申报日历
          </RouterLink>

          <RouterLink
            to="/policies"
            class="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-700"
          >
            开始匹配
          </RouterLink>

          <template v-if="isLoggedIn && currentUser">
            <RouterLink
              to="/account"
              class="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-xs text-ink-2 transition hover:border-brand-300 hover:text-brand-700"
            >
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-on-brand">
                {{ initial }}
              </span>
              <span class="max-w-[7rem] truncate">{{ currentUser.displayName }}</span>
            </RouterLink>
            <button
              type="button"
              class="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted transition hover:border-rose-200 hover:text-rose-600"
              @click="handleLogout"
            >
              退出
            </button>
          </template>
          <RouterLink
            v-else-if="!isStaticMode"
            to="/login"
            class="rounded-full bg-invert dark:bg-surface-3 px-4 py-1.5 text-xs font-medium text-on-brand dark:text-ink transition hover:bg-brand-600"
          >
            登录 / 注册
          </RouterLink>

          <button
            type="button"
            :title="themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            :aria-label="themeMode === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            class="flex h-8 w-8 items-center justify-center rounded-full border border-line-2 bg-surface text-muted transition hover:border-brand-300 hover:bg-surface-2 hover:text-brand-700"
            @click="toggleTheme"
          >
            <svg
              v-if="themeMode === 'dark'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M21 12.8A8.5 8.5 0 1111.2 3a7 7 0 009.8 9.8z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="border-t border-line bg-surface">
      <div
        class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 text-xs text-muted sm:flex-row"
      >
        <span>能申吗 · 第九届传智杯 AI-WEB 赛道参赛作品</span>
        <span>Vue 3 · Vite · Tailwind · Express · DeepSeek</span>
      </div>
    </footer>
  </div>
</template>