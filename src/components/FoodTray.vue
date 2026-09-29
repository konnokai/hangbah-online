<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, Plus } from '@lucide/vue'
import { BUILTIN_FOODS, customFoodId, customFoodUrl, type CustomFood } from '@shared/game'
import { FOOD_ART } from '@/foods'
import type { Tool } from './Grill.vue'

const props = defineProps<{ code: string; customFoods: CustomFood[] }>()
const tool = defineModel<Tool>('tool', { required: true })
const emit = defineEmits<{ press: [foodId: string, e: PointerEvent]; upload: [] }>()

const customs = computed(() =>
  props.customFoods.map((c) => ({ id: customFoodId(c.id), name: c.name, url: customFoodUrl(props.code, c) })),
)

// ---------- 食材太多時的往下提示 ----------
// 捲軸藏起來了，要靠箭頭告訴使用者下面還有東西
const grid = ref<HTMLDivElement | null>(null)
const more = ref(false)

function check() {
  const g = grid.value
  if (!g) return
  more.value = g.scrollTop + g.clientHeight < g.scrollHeight - 4
}

function scrollMore() {
  const g = grid.value
  g?.scrollBy({ top: g.clientHeight * 0.7, behavior: 'smooth' })
}

let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(check)
  if (grid.value) ro.observe(grid.value)
  check()
})
onBeforeUnmount(() => ro?.disconnect())
watch(
  () => props.customFoods.length,
  () => nextTick(check),
)
</script>

<template>
  <section class="tray card" aria-label="食材盤">
    <div class="head">
      <h2>食材盤</h2>
      <div class="tools" role="radiogroup" aria-label="工具">
        <button
          class="btn btn-sm"
          :class="{ active: tool === 'tongs' }"
          role="radio"
          :aria-checked="tool === 'tongs'"
          @click="tool = 'tongs'"
        >
          🥢 夾子
        </button>
        <button
          class="btn btn-sm"
          :class="{ active: tool === 'brush' }"
          role="radio"
          :aria-checked="tool === 'brush'"
          @click="tool = 'brush'"
        >
          🖌️ 刷醬
        </button>
      </div>
    </div>
    <p class="hint">
      把食材<strong>拖到烤架上</strong>就開始烤（點一下隨機放上去，按住不動可以看大圖）。
      <template v-if="tool === 'tongs'">夾子：拖曳移動、點一下翻面、點兩下吃掉。</template>
      <template v-else>刷醬：點一下食材刷上烤肉醬，烤得剛好再吃分數更高。</template>
    </p>
    <div class="grid-wrap" :class="{ more }">
      <div ref="grid" class="grid" @scroll.passive="check">
        <button
          v-for="f in BUILTIN_FOODS"
          :key="f.id"
          class="food-btn"
          :title="f.name"
          @pointerdown.prevent="emit('press', f.id, $event)"
          @contextmenu.prevent
        >
          <span class="art"><component :is="FOOD_ART[f.id]" :d="0" :sauced="false" /></span>
          <span class="name">{{ f.name }}</span>
        </button>
        <button
          v-for="c in customs"
          :key="c.id"
          class="food-btn"
          :title="c.name"
          @pointerdown.prevent="emit('press', c.id, $event)"
          @contextmenu.prevent
        >
          <span class="art"><img :src="c.url" alt="" draggable="false" /></span>
          <span class="name">{{ c.name }}</span>
        </button>
        <button class="food-btn add" title="上傳圖片做成食材" @click="emit('upload')">
          <span class="art plus"><Plus :size="26" /></span>
          <span class="name">自訂食材</span>
        </button>
      </div>
      <button v-show="more" type="button" class="more-btn" aria-label="往下看更多食材" title="往下看更多食材" @click="scrollMore">
        <ChevronDown :size="20" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.tray {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 下緣的留白交給 .grid，捲動區和往下提示才能貼到卡片底邊 */
  padding: 14px 14px 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

h2 {
  margin: 0;
  font-size: 1rem;
}

.tools {
  display: flex;
  gap: 6px;
}

.tools .active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--gold);
}

.hint {
  margin: 8px 0 12px;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.hint strong {
  color: var(--text);
}

/* 外層決定高度時（電腦版），食材格在裡面捲動；沒限制高度時（手機版）就全部攤開 */
.grid-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  align-content: start;
  gap: 8px;
  flex: 1;
  min-height: 0;
  /* 留一點邊，按鈕的焦點外框才不會被捲動區切掉 */
  margin: -3px -3px 0;
  padding: 3px 3px 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.grid::-webkit-scrollbar {
  display: none;
}

.grid-wrap::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 56px;
  background: linear-gradient(to bottom, transparent, var(--surface));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.grid-wrap.more::after {
  opacity: 1;
}

.more-btn {
  position: absolute;
  bottom: 10px;
  left: 50%;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--gold);
  box-shadow: var(--shadow-sm);
  transform: translateX(-50%);
  animation: nudge 1.6s ease-in-out infinite;
}

.more-btn:hover {
  border-color: var(--accent);
}

@keyframes nudge {
  50% {
    transform: translate(-50%, 3px);
  }
}

.food-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  touch-action: none;
  user-select: none;
  /* 手機按住會跳出系統選單（存圖、分享），會蓋掉長按預覽 */
  -webkit-touch-callout: none;
  cursor: grab;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.food-btn:hover {
  border-color: var(--accent);
  background: var(--surface-3);
}

.art {
  display: grid;
  place-items: center;
  /* 列高要固定，不然接近正方形的圖會把列撐高，蓋到下面的名字 */
  grid-template: 100% / 100%;
  width: 54px;
  height: 40px;
  pointer-events: none;
}

.art > :deep(svg),
.art img {
  width: 100%;
  height: 100%;
}

.art img {
  object-fit: contain;
}

.plus {
  color: var(--gold);
}

.plus > :deep(svg) {
  width: 26px;
  height: 26px;
}

.add {
  cursor: pointer;
  border-style: dashed;
}

.name {
  font-size: 0.8rem;
  color: var(--muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
