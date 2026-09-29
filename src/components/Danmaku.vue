<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

/*
 * 聊天彈幕：新訊息從右邊飄到左邊。
 * 跟 niconico 一樣每則都飄固定時間，所以長句會跑比較快。
 * 整層 pointer-events: none，不會擋到烤架操作。
 */

const props = defineProps<{ enabled: boolean }>()

export interface DanmakuLine {
  name: string
  text: string
  color: string
}

interface Bullet extends DanmakuLine {
  key: number
  top: number
  distance: number
}

const DURATION = 7000
const MAX_BULLETS = 30
// 同一條軌道上，前一則的尾巴進場後至少再隔這麼久，字才不會黏在一起
const LANE_GAP_MS = 250

const el = ref<HTMLDivElement | null>(null)
const size = reactive({ w: 0, h: 0, font: 18 })
const bullets = reactive<Bullet[]>([])
let key = 0

// 每條軌道：前一則尾巴完全進場的時間、前一則完全離開左邊的時間
let lanes: { freeAt: number; endAt: number }[] = []
let measureCtx: CanvasRenderingContext2D | null = null
let observer: ResizeObserver | null = null
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function layout() {
  if (!el.value) return
  const r = el.value.getBoundingClientRect()
  size.w = r.width
  size.h = r.height
  size.font = Math.round(Math.min(26, Math.max(14, r.width * 0.026)))
  // 下緣留一點空間，不要蓋住烤架下方的表情和分數
  const count = Math.max(3, Math.min(12, Math.floor((r.height * 0.85) / (size.font * 1.5))))
  if (lanes.length !== count) lanes = Array.from({ length: count }, (_, i) => lanes[i] ?? { freeAt: 0, endAt: 0 })
}

function textWidth(text: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx || !el.value) return text.length * size.font
  measureCtx.font = `700 ${size.font}px ${getComputedStyle(el.value).fontFamily}`
  return measureCtx.measureText(text).width
}

function pickLane(width: number, now: number) {
  const w = size.w
  // 新的這則頭部碰到左邊的時間，不能早於同軌道上一則尾巴離開的時間，不然會追撞
  const headArrives = now + (DURATION * w) / (w + width)
  const ok = lanes.findIndex((l) => l.freeAt <= now && l.endAt <= headArrives)
  if (ok >= 0) return ok
  // 全部都滿了：挑最早空出來的，寧可重疊也不要漏掉訊息
  let best = 0
  lanes.forEach((l, i) => {
    if (l.freeAt < lanes[best]!.freeAt) best = i
  })
  return best
}

function push(line: DanmakuLine) {
  if (!props.enabled || reducedMotion?.matches || !el.value) return
  if (!size.w) layout()
  // 暱稱和內容中間隔一個全形冒號，寬度要一起算
  const width = textWidth(`${line.name}：${line.text}`)
  const now = performance.now()
  const lane = pickLane(width, now)
  const speed = (size.w + width) / DURATION
  lanes[lane] = { freeAt: now + width / speed + LANE_GAP_MS, endAt: now + DURATION }
  bullets.push({ ...line, key: ++key, top: lane * size.font * 1.5 + size.font * 0.4, distance: size.w + width })
  if (bullets.length > MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS)
}

function remove(k: number) {
  const i = bullets.findIndex((b) => b.key === k)
  if (i >= 0) bullets.splice(i, 1)
}

onMounted(() => {
  layout()
  observer = new ResizeObserver(layout)
  if (el.value) observer.observe(el.value)
})
onBeforeUnmount(() => observer?.disconnect())

defineExpose({ push })
</script>

<template>
  <div ref="el" class="danmaku" aria-hidden="true" :style="{ fontSize: `${size.font}px` }">
    <span
      v-for="b in bullets"
      :key="b.key"
      class="bullet"
      :style="{ top: `${b.top}px`, '--distance': `${b.distance}px` }"
      @animationend="remove(b.key)"
    ><span class="who" :style="{ color: b.color }">{{ b.name }}：</span>{{ b.text }}</span>
  </div>
</template>

<style scoped>
.danmaku {
  position: absolute;
  inset: 0;
  z-index: 90;
  overflow: hidden;
  /* 跟烤架桌面同樣的圓角，字飄出邊界時才會一起被切掉 */
  border-radius: var(--radius);
  pointer-events: none;
}

.bullet {
  position: absolute;
  left: 100%;
  font-weight: 700;
  line-height: 1.25;
  color: #fff;
  white-space: nowrap;
  /* 深色描邊：烤架亮橘、桌面深褐都看得清楚 */
  text-shadow:
    0 0 1px #000,
    1px 1px 0 rgb(0 0 0 / 0.85),
    -1px 1px 0 rgb(0 0 0 / 0.85),
    1px -1px 0 rgb(0 0 0 / 0.85),
    -1px -1px 0 rgb(0 0 0 / 0.85);
  will-change: transform;
  animation: fly 7s linear forwards;
}

/* 暱稱用玩家顏色，跟聊天室和游標一致，一眼看出是誰說的 */
.who {
  font-weight: 800;
}

@keyframes fly {
  to {
    transform: translateX(calc(var(--distance) * -1));
  }
}

@media (prefers-reduced-motion: reduce) {
  .danmaku {
    display: none;
  }
}
</style>
