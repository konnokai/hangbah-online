<script setup lang="ts">
import { nextTick, ref } from 'vue'

defineProps<{ title: string; message: string; confirmText: string; cancelText: string }>()

const dialog = ref<HTMLDialogElement | null>(null)
let resolver: ((ok: boolean) => void) | null = null

/** 打開對話框，等使用者選擇。true = 確定。 */
async function ask(): Promise<boolean> {
  // 上一次還沒回答就又被叫出來，舊的當作取消
  resolver?.(false)
  await nextTick()
  dialog.value?.showModal()
  return new Promise((resolve) => (resolver = resolve))
}

function answer(ok: boolean) {
  const r = resolver
  resolver = null
  dialog.value?.close()
  r?.(ok)
}

// Esc 或點外面都算取消
function onClose() {
  if (resolver) answer(false)
}

function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) answer(false)
}

defineExpose({ ask })
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    @close="onClose"
    @click="onBackdrop"
  >
    <div class="panel">
      <h2 id="confirm-title">{{ title }}</h2>
      <p id="confirm-message">{{ message }}</p>
      <div class="actions">
        <!-- 預設焦點放在取消，誤按 Enter 不會離開 -->
        <button type="button" class="btn" autofocus @click="answer(false)">{{ cancelText }}</button>
        <button type="button" class="btn btn-primary" @click="answer(true)">{{ confirmText }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm {
  width: min(380px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}

.confirm::backdrop {
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(3px);
}

.panel {
  padding: 20px;
}

h2 {
  margin: 0 0 6px;
  font-size: 1.1rem;
}

p {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
