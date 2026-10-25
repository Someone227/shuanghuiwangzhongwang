<script setup lang="ts">
import { onMounted, ref } from 'vue';

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

onMounted(async () => {
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
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
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

        <div
          class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="statusDot[apiStatus]" />
          {{ statusText[apiStatus] }}
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
