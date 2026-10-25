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
  <div class="mx-auto max-w-5xl px-6 py-10">
    <div class="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
      <!-- 左侧：为什么需要账号 + 演示账号 -->
      <section class="order-2 lg:order-1">
        <p class="text-xs font-semibold tracking-[0.2em] text-brand-600">账号</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          一个账号，<br class="hidden sm:block" />多台电脑都能登录
        </h1>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          账号与个人数据都存在服务端：在学校机房填到一半，回宿舍换台电脑登录，草稿和判定记录还在。
          老师查验时不用注册，直接用下面的演示账号登录即可。
        </p>

        <div class="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-amber-900">演示账号（老师查验用）</h2>
            <span class="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-700">公开</span>
          </div>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
              <dt class="text-xs text-slate-500">账号</dt>
              <dd class="font-mono font-semibold text-slate-900">{{ DEMO_ACCOUNT.username }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
              <dt class="text-xs text-slate-500">密码</dt>
              <dd class="font-mono font-semibold text-slate-900">{{ DEMO_ACCOUNT.password }}</dd>
            </div>
          </dl>
          <button
            type="button"
            class="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
            @click="fillDemo"
          >
            一键填入演示账号
          </button>
          <p class="mt-3 text-xs leading-relaxed text-amber-800/80">
            这是公开的演示账号，多台电脑可同时登录，请勿用它填写真实隐私信息。
          </p>
        </div>
      </section>

      <!-- 右侧：登录 / 注册表单 -->
      <section class="order-1 lg:order-2">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

          <p class="mt-4 text-center text-xs text-slate-400">
            <RouterLink to="/policies" class="transition hover:text-brand-600">不登录，先去逛逛政策库 →</RouterLink>
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
