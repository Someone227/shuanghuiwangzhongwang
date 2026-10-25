<script setup lang="ts">
/**
 * 登录 / 注册页。
 *
 * 演示账号（demo / NengShenMa2026）公开写在这里和 README 里，
 * 老师在任何一台电脑上打开网站都能直接登录查验。
 */
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { login, register } from '@/lib/auth';

const route = useRoute();
const router = useRouter();

const DEMO_ACCOUNT = { username: 'demo', password: 'NengShenMa2026' };

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const displayName = ref('');
const error = ref('');
const submitting = ref(false);

const isRegister = computed(() => mode.value === 'register');
const submitLabel = computed(() => (isRegister.value ? '注册并登录' : '登录'));

function switchMode(next: 'login' | 'register'): void {
  mode.value = next;
  error.value = '';
}

function fillDemo(): void {
  mode.value = 'login';
  username.value = DEMO_ACCOUNT.username;
  password.value = DEMO_ACCOUNT.password;
  error.value = '';
}

async function submit(): Promise<void> {
  if (submitting.value) return;
  error.value = '';
  const name = username.value.trim();
  if (!name || !password.value) {
    error.value = '请填写账号和密码';
    return;
  }
  if (isRegister.value && password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  submitting.value = true;
  try {
    if (isRegister.value) {
      await register({ username: name, password: password.value, displayName: displayName.value.trim() || undefined });
    } else {
      await login(name, password.value);
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/policies';
    await router.replace(redirect);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败，请重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-12">
    <div class="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
          :class="!isRegister ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg px-3 py-1.5 text-sm transition"
          :class="isRegister ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">账号</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="3–20 位字母、数字或下划线"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label v-if="isRegister" class="block">
          <span class="text-sm font-medium text-slate-700">昵称<span class="ml-1 text-xs font-normal text-slate-400">可选</span></span>
          <input
            v-model="displayName"
            type="text"
            placeholder="例如：张同学"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">密码</span>
          <input
            v-model="password"
            type="password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            placeholder="至少 6 位"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label v-if="isRegister" class="block">
          <span class="text-sm font-medium text-slate-700">确认密码</span>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="再输入一次"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {{ submitting ? '处理中…' : submitLabel }}
        </button>
      </form>

      <div class="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span>演示账号 <span class="font-mono text-slate-500">{{ DEMO_ACCOUNT.username }}</span> / <span class="font-mono text-slate-500">{{ DEMO_ACCOUNT.password }}</span></span>
        <button type="button" class="text-brand-600 transition hover:underline" @click="fillDemo">一键填入</button>
      </div>

      <p class="mt-3 text-center text-xs text-slate-400">
        <RouterLink to="/policies" class="transition hover:text-brand-600">不登录，先去逛逛政策库 →</RouterLink>
      </p>
    </div>
  </div>
</template>
