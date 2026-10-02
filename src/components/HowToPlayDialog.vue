<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'

const dialog = ref<HTMLDialogElement | null>(null)

// 勾了「不再顯示」就記在這個瀏覽器，之後進房都不跳；玩法在「關於」頁也有
const HIDE_KEY = 'hangbah:howto'
const neverAgain = ref(false)

async function open() {
  if (loadJSON(HIDE_KEY, { hide: false }).hide) return
  await nextTick()
  if (dialog.value && !dialog.value.open) dialog.value.showModal()
}

// 按鈕、Esc、點外面關掉都會走到這裡，勾選要在每一種關法都生效
function onClose() {
  if (neverAgain.value) saveJSON(HIDE_KEY, { hide: true })
}

const close = () => dialog.value?.close()

// 點對話框外面的暗色背景也能關
function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) close()
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="howto" aria-labelledby="howto-title" @click="onBackdrop" @close="onClose">
    <div class="panel">
      <h2 id="howto-title">怎麼烤</h2>
      <ol class="steps">
        <li>
          <b>拿食材</b>
          <!-- 中文換行會變成空白，句子要寫在同一行 -->
          <p>點右下角的食材按鈕打開食材盤，把食材拖到烤架上，或點一下隨機放上去。按住不動可以看大圖和要烤幾秒。</p>
        </li>
        <li>
          <b>翻面</b>
          <p>
            點一下翻面。烤架中間火最大，邊邊火小。食材下面兩個小圓點是兩面的熟度：<span class="dots"><i class="dot raw" />生</span>
            <span class="dots"><i class="dot perfect" />剛好</span>
            <span class="dots"><i class="dot charred" />焦了</span>
          </p>
        </li>
        <li>
          <b>吃掉</b>
          <p>點兩下吃掉，吃的人拿分數。兩面都剛好分數最高。<span class="on-mouse">在食材上按<strong>右鍵</strong>可以刷烤肉醬，</span><span class="on-touch">在食材盤切到「刷醬」再點食材可以刷烤肉醬，</span>至少一面剛好時分數再多 25%。</p>
        </li>
        <li>
          <b>別烤過頭</b>
          <p>焦了還能吃，但分數很低。再放下去就會燒成灰，直接消失。</p>
        </li>
      </ol>

      <h3>其他</h3>
      <ul class="notes">
        <li>拖曳可以移動食材。別人正在夾的食材拿不到。</li>
        <li>聊天室在左下角，新訊息會變成彈幕從烤架上飄過。</li>
        <li>食材盤最後一格可以上傳圖片，做成大家都能烤的自訂食材。</li>
        <li>按「邀請朋友」把連結傳給朋友，朋友打開就能一起烤。</li>
      </ul>

      <div class="actions">
        <label class="never">
          <input v-model="neverAgain" type="checkbox" />
          不再顯示
        </label>
        <button type="button" class="btn btn-primary" autofocus @click="close">開始烤肉</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.howto {
  width: min(460px, calc(var(--vw) - 32px));
  max-height: calc(var(--vh) - 32px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.howto::backdrop {
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(3px);
}

.panel {
  padding: 20px;
}

h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
}

h3 {
  margin: 18px 0 6px;
  font-size: 0.95rem;
}

.steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  position: relative;
  padding-left: 32px;
  counter-increment: step;
}

.steps li::before {
  content: counter(step);
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--gold);
  font-size: 0.8rem;
  font-weight: 700;
}

.steps b {
  display: block;
  line-height: 22px;
}

p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

strong {
  color: var(--text);
}

.dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
  color: var(--text);
  white-space: nowrap;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 顏色跟烤架下方的圖例一樣 */
.dot.raw {
  background: #f08c8c;
}
.dot.perfect {
  background: #7ee07e;
}
.dot.charred {
  background: #8a5a36;
}

.notes {
  margin: 0;
  padding-left: 1.2em;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
}

.never {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  color: var(--muted);
  font-size: 0.9rem;
  cursor: pointer;
}

.never input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}

/* 畫面轉橫時很矮，轉過的區塊用手指捲動方向不一定對，所以改成橫向排、字小一點，不用捲就看得完 */
html.rotated .howto {
  width: min(780px, calc(var(--vw) - 24px));
  max-height: calc(var(--vh) - 16px);
}

html.rotated .panel {
  padding: 12px 18px;
}

html.rotated h2 {
  margin-bottom: 6px;
  font-size: 1.05rem;
}

html.rotated h3 {
  margin: 10px 0 2px;
}

html.rotated .steps {
  grid-template-columns: 1fr 1fr;
  gap: 6px 20px;
}

html.rotated p,
html.rotated .notes {
  font-size: 0.8rem;
  line-height: 1.5;
}

html.rotated .notes {
  columns: 2;
  column-gap: 32px;
}

html.rotated .actions {
  margin-top: 8px;
}

/* 刷醬的方式跟著裝置變，條件要跟 FoodTray 一致：有滑鼠才用右鍵 */
.on-mouse {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .on-touch {
    display: none;
  }

  .on-mouse {
    display: inline;
  }
}
</style>
