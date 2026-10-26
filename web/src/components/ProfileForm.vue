<script setup lang="ts">
import { computed } from 'vue';

import type { Profile, ProfileField } from '@/lib/api';
import { filledCount, groupFields, isEmptyValue } from '@/lib/profile';

const props = defineProps<{
  fields: ProfileField[];
  modelValue: Profile;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Profile): void;
}>();

const groups = computed(() => groupFields(props.fields));
const filled = computed(() => filledCount(props.fields, props.modelValue));
const total = computed(() => props.fields.length);

function setField(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function onText(key: string, event: Event): void {
  setField(key, (event.target as HTMLInputElement).value);
}

function onNumber(key: string, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  setField(key, raw === '' ? '' : Number(raw));
}

function onBoolean(key: string, value: boolean): void {
  // 再点一次同一个按钮表示清空，允许「我还不确定」
  setField(key, props.modelValue[key] === value ? '' : value);
}

function multiValues(key: string): string[] {
  const raw = props.modelValue[key];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function toggleMulti(key: string, option: string): void {
  const list = [...multiValues(key)];
  const index = list.indexOf(option);
  if (index >= 0) list.splice(index, 1);
  else list.push(option);
  setField(key, list);
}

function isFilled(key: string): boolean {
  return !isEmptyValue(props.modelValue[key]);
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <p class="text-sm font-medium text-ink-2">你的情况</p>
        <p class="mt-0.5 text-xs text-faint">
          只填这一份政策真正用得到的字段，不知道的可以留空 —— 留空只会标为「待补充」，不会算成「不符合」
        </p>
      </div>
      <div class="shrink-0 text-right">
        <p class="text-lg font-semibold tabular-nums text-brand-600">{{ filled }}<span class="text-sm text-faint">/{{ total }}</span></p>
        <p class="text-xs text-faint">已填写</p>
      </div>
    </div>

    <fieldset v-for="group in groups" :key="group.key" class="rounded-xl border border-line bg-surface">
      <legend class="sr-only">{{ group.title }}</legend>
      <div class="border-b border-line-sub px-4 py-3">
        <h3 class="text-sm font-semibold text-ink">{{ group.title }}</h3>
        <p class="mt-0.5 text-xs text-faint">{{ group.hint }}</p>
      </div>

      <div class="divide-y divide-line-sub">
        <div v-for="field in group.fields" :key="field.key" class="px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <label :for="`field-${field.key}`" class="text-sm font-medium text-ink-2">
              {{ field.label }}
              <span v-if="field.unit" class="ml-1 text-xs font-normal text-faint">（{{ field.unit }}）</span>
            </label>
            <span
              v-if="isFilled(field.key)"
              class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600"
              >已填</span
            >
          </div>

          <!-- 文本 -->
          <input
            v-if="field.type === 'text'"
            :id="`field-${field.key}`"
            type="text"
            class="mt-2 w-full rounded-lg border border-line-2 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            :placeholder="field.placeholder ?? '请填写'"
            :value="(modelValue[field.key] as string) ?? ''"
            @input="onText(field.key, $event)"
          />

          <!-- 数字 -->
          <div v-else-if="field.type === 'number'" class="mt-2 flex items-center gap-2">
            <input
              :id="`field-${field.key}`"
              type="number"
              class="w-full rounded-lg border border-line-2 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              :placeholder="field.placeholder ?? '请填写数字'"
              :value="modelValue[field.key] === undefined ? '' : String(modelValue[field.key] ?? '')"
              @input="onNumber(field.key, $event)"
            />
            <span v-if="field.unit" class="shrink-0 text-sm text-muted">{{ field.unit }}</span>
          </div>

          <!-- 是 / 否 -->
          <div v-else-if="field.type === 'boolean'" class="mt-2 flex gap-2">
            <button
              type="button"
              class="rounded-lg border px-4 py-1.5 text-sm transition"
              :class="
                modelValue[field.key] === true
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                  : 'border-line-2 bg-surface text-ink-2 hover:border-line-2'
              "
              @click="onBoolean(field.key, true)"
            >
              是
            </button>
            <button
              type="button"
              class="rounded-lg border px-4 py-1.5 text-sm transition"
              :class="
                modelValue[field.key] === false
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                  : 'border-line-2 bg-surface text-ink-2 hover:border-line-2'
              "
              @click="onBoolean(field.key, false)"
            >
              否
            </button>
          </div>

          <!-- 单选 -->
          <select
            v-else-if="field.type === 'select'"
            :id="`field-${field.key}`"
            class="mt-2 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            :value="(modelValue[field.key] as string) ?? ''"
            @change="onText(field.key, $event)"
          >
            <option value="">请选择</option>
            <option v-for="option in field.options ?? []" :key="option" :value="option">{{ option }}</option>
          </select>

          <!-- 多选 -->
          <div v-else-if="field.type === 'multiselect'" class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="option in field.options ?? []"
              :key="option"
              type="button"
              class="rounded-full border px-3 py-1 text-xs transition"
              :class="
                multiValues(field.key).includes(option)
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                  : 'border-line-2 bg-surface text-ink-2 hover:border-line-2'
              "
              @click="toggleMulti(field.key, option)"
            >
              {{ option }}
            </button>
          </div>

          <p v-if="field.usedBy?.length" class="mt-1.5 text-xs text-faint">
            影响 {{ field.usedBy.length }} 条判定
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>