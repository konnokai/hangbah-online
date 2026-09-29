<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { RouterLink } from 'vue-router'

// 用對話框顯示，不切換頁面，在烤肉房間裡點開也不會斷線
const AboutView = defineAsyncComponent(() => import('../views/AboutView.vue'))

const dialog = ref<HTMLDialogElement | null>(null)
const opened = ref(false)

function open() {
  opened.value = true
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

// 點到對話框外面的背景就關閉
function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) close()
}
</script>

<template>
  <footer class="footer">
    <RouterLink to="/">首頁</RouterLink>
    <span aria-hidden="true">·</span>
    <button type="button" class="link" aria-haspopup="dialog" @click="open">關於 / 版權標示</button>
  </footer>

  <dialog ref="dialog" class="about-dialog" aria-labelledby="about-dialog-title" @click="onBackdrop">
    <div class="panel">
      <header class="head">
        <h2 id="about-dialog-title">關於夯肉</h2>
        <button type="button" class="close" aria-label="關閉" @click="close">✕</button>
      </header>
      <div class="body">
        <AboutView v-if="opened" embedded />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.footer {
  margin-top: auto;
  display: flex;
  justify-content: center;
  gap: 0.6em;
  padding: 20px 16px 24px;
  color: var(--faint);
  font-size: 0.85rem;
}

.footer a,
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: inherit;
  text-decoration: none;
}

.footer a:hover,
.link:hover {
  color: var(--text);
  text-decoration: underline;
}

.about-dialog {
  width: min(720px, calc(100vw - 32px));
  max-height: min(85vh, 900px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.about-dialog::backdrop {
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(3px);
}

.panel {
  display: flex;
  flex-direction: column;
  max-height: min(85vh, 900px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.head h2 {
  margin: 0;
  font-size: 1.15rem;
}

.close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-2);
  font-size: 0.95rem;
}

.close:hover {
  background: var(--surface-3);
}

.body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
