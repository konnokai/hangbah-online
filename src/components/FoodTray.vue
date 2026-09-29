<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_FOODS, customFoodId, customFoodUrl, type CustomFood } from '@shared/game'
import { LIMITS } from '@shared/limits'
import { FOOD_ART } from '@/foods'
import type { Tool } from './Grill.vue'

const props = defineProps<{ code: string; customFoods: CustomFood[] }>()
const tool = defineModel<Tool>('tool', { required: true })
const emit = defineEmits<{ press: [foodId: string, e: PointerEvent]; upload: [] }>()

const customs = computed(() =>
  props.customFoods.map((c) => ({ id: customFoodId(c.id), name: c.name, url: customFoodUrl(props.code, c) })),
)
const full = computed(() => props.customFoods.length >= LIMITS.maxCustomFoods)
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
      把食材<strong>拖到烤架上</strong>就開始烤（點一下會隨機放上去）。
      <template v-if="tool === 'tongs'">夾子：拖曳移動、點一下翻面、點兩下吃掉。</template>
      <template v-else>刷醬：點一下食材刷上烤肉醬，烤得剛好再吃分數更高。</template>
    </p>
    <div class="grid">
      <button
        v-for="f in BUILTIN_FOODS"
        :key="f.id"
        class="food-btn"
        :title="f.name"
        @pointerdown.prevent="emit('press', f.id, $event)"
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
      >
        <span class="art"><img :src="c.url" alt="" draggable="false" /></span>
        <span class="name">{{ c.name }}</span>
      </button>
      <button class="food-btn add" :disabled="full" :title="full ? '自訂食材已達上限' : '上傳圖片做成食材'" @click="emit('upload')">
        <span class="art plus" aria-hidden="true">＋</span>
        <span class="name">自訂食材</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.tray {
  padding: 14px;
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
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
  cursor: grab;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.food-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-3);
}

.food-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.art {
  display: grid;
  place-items: center;
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
  font-size: 26px;
  color: var(--gold);
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
