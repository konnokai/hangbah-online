<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  BURN,
  BURN_WARNING,
  GRILL,
  PERFECT_MAX,
  TABLE_ASPECT,
  customFoodUrl,
  donenessAt,
  heatAt,
  isPerfect,
  onGrill,
  resolveFood,
  type GrillItem,
} from '@shared/game'
import type { Room } from '@/composables/useRoom'
import { sfx } from '@/audio/sfx'
import FoodItem from './FoodItem.vue'

export type Tool = 'tongs' | 'brush'

const props = defineProps<{ room: Room; code: string; tool: Tool }>()
const { state, send, now } = props.room

const tableEl = ref<HTMLDivElement | null>(null)

// ---------- 時鐘：熟度每秒要更新好幾次 ----------
const tick = ref(0)
let raf = 0
let lastFrame = 0
function loop(t: number) {
  raf = requestAnimationFrame(loop)
  if (t - lastFrame < 66) return
  lastFrame = t
  tick.value = now()
  checkThresholds()
}

// ---------- 座標 ----------
function toTable(clientX: number, clientY: number) {
  const r = tableEl.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom,
  }
}

/** 從食材盤丟過來。丟在桌面範圍外就不算。 */
function spawnAt(foodId: string, clientX: number, clientY: number): boolean {
  if (!tableEl.value) return false
  const p = toTable(clientX, clientY)
  if (!p.inside) return false
  send({ t: 'spawn', foodId, x: p.x, y: p.y })
  return true
}

/** 手機上直接點食材盤：隨機放到烤架中間附近。 */
function spawnRandom(foodId: string) {
  const cx = (GRILL.x0 + GRILL.x1) / 2
  const cy = (GRILL.y0 + GRILL.y1) / 2
  send({ t: 'spawn', foodId, x: cx + (Math.random() - 0.5) * 0.45, y: cy + (Math.random() - 0.5) * 0.5 })
}

defineExpose({ spawnAt, spawnRandom })

// ---------- 拖曳、點擊 ----------
interface Press {
  id: string
  pointerId: number
  sx: number
  sy: number
  grabbed: boolean
  lastSent: number
}
let press: Press | null = null
const localDrag = reactive<Record<string, { x: number; y: number }>>({})
let tapTimer: ReturnType<typeof setTimeout> | null = null
let tapId: string | null = null

function onItemDown(item: GrillItem, e: PointerEvent) {
  if (e.button !== 0) return
  if (item.heldBy && item.heldBy !== state.you.pid) return
  e.preventDefault()
  sfx.unlock()
  press = { id: item.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, grabbed: false, lastSent: 0 }
}

function onWindowMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.pointerId || !tableEl.value) return
  if (!press.grabbed) {
    if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < 6) return
    press.grabbed = true
    send({ t: 'grab', id: press.id })
  }
  const p = toTable(e.clientX, e.clientY)
  localDrag[press.id] = { x: p.x, y: p.y }
  const t = performance.now()
  if (t - press.lastSent > 33) {
    press.lastSent = t
    send({ t: 'drag', id: press.id, x: p.x, y: p.y })
  }
}

function onWindowUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.pointerId) return
  const p0 = press
  press = null
  if (p0.grabbed) {
    const pos = localDrag[p0.id]
    if (pos) {
      send({ t: 'drop', id: p0.id, x: pos.x, y: pos.y })
      const item = state.items[p0.id]
      // 先放到新位置，等 server 回應時才不會閃回原位
      if (item) state.items[p0.id] = { ...item, x: pos.x, y: pos.y }
    }
    delete localDrag[p0.id]
    return
  }
  onTap(p0.id)
}

function onTap(id: string) {
  if (props.tool === 'brush') {
    send({ t: 'sauce', id })
    return
  }
  // 點一下翻面、點兩下吃掉：等一下看有沒有第二下
  if (tapTimer && tapId === id) {
    clearTimeout(tapTimer)
    tapTimer = null
    tapId = null
    send({ t: 'eat', id })
    return
  }
  if (tapTimer && tapId) {
    clearTimeout(tapTimer)
    send({ t: 'flip', id: tapId })
  }
  tapId = id
  tapTimer = setTimeout(() => {
    tapTimer = null
    tapId = null
    send({ t: 'flip', id })
  }, 240)
}

// ---------- 游標 ----------
let lastCursor = 0
function onTableMove(e: PointerEvent) {
  const t = performance.now()
  if (t - lastCursor < 50 || !tableEl.value) return
  lastCursor = t
  const p = toTable(e.clientX, e.clientY)
  send({ t: 'cursor', x: p.x, y: p.y })
}

const playersById = computed(() => Object.fromEntries(state.players.map((p) => [p.pid, p])))

const cursors = computed(() => {
  void tick.value
  const cutoff = Date.now() - 6000
  return Object.entries(state.cursors)
    .filter(([pid, c]) => pid !== state.you.pid && c.ts > cutoff && playersById.value[pid]?.online)
    .map(([pid, c]) => ({ pid, x: c.x, y: c.y, name: playersById.value[pid]!.name, color: playersById.value[pid]!.color }))
})

// ---------- 顯示用的食材清單 ----------
interface Dying {
  item: GrillItem
  d: [number, number]
  reason: 'burn' | 'eat'
}
const dying = reactive<Record<string, Dying>>({})
const floats = reactive<{ key: number; x: number; y: number; text: string; good: boolean }[]>([])
let floatKey = 0

function foodOf(item: GrillItem) {
  return resolveFood(item.foodId, state.customFoods)
}

function imageUrlOf(item: GrillItem) {
  if (!item.foodId.startsWith('c:')) return null
  const custom = state.customFoods.find((c) => `c:${c.id}` === item.foodId)
  return custom ? customFoodUrl(props.code, custom) : null
}

const view = computed(() => {
  const t = tick.value || now()
  const list = []
  for (const item of Object.values(state.items)) {
    if (dying[item.id] || gone.has(item.id)) continue
    const food = foodOf(item)
    if (!food) continue
    const d = donenessAt(item, food, t, state.heatScale)
    const mine = localDrag[item.id]
    const theirs = state.drags[item.id]
    const pos = mine ?? theirs ?? item
    const holder = item.heldBy && item.heldBy !== state.you.pid ? playersById.value[item.heldBy] : null
    list.push({
      item,
      food,
      d,
      x: pos.x,
      y: pos.y,
      lifted: !!mine || !!item.heldBy,
      holder: holder ? { name: holder.name, color: holder.color } : null,
    })
  }
  return list
})

const dyingView = computed(() =>
  Object.values(dying)
    .map((x) => ({ ...x, food: foodOf(x.item) }))
    .filter((x) => x.food),
)

// 自己先燒掉、但 server 還沒通知刪除的食材，動畫播完後要一直藏著，不然會再出現一次
const gone = reactive(new Set<string>())

function startDying(item: GrillItem, d: [number, number], reason: 'burn' | 'eat') {
  if (dying[item.id]) return
  dying[item.id] = { item, d, reason }
  setTimeout(
    () => {
      delete dying[item.id]
      if (state.items[item.id]) gone.add(item.id)
    },
    reason === 'burn' ? 1600 : 400,
  )
}

// ---------- 門檻：焦了、快燒起來、燒毀 ----------
const flags = new Map<string, { charred: boolean; warned: boolean }>()
let lastSizzle = 0

function checkThresholds() {
  const t = tick.value
  let heat = 0
  for (const item of Object.values(state.items)) {
    const food = foodOf(item)
    if (!food || dying[item.id] || gone.has(item.id)) continue
    const d = donenessAt(item, food, t, state.heatScale)
    const max = Math.max(d[0], d[1])
    const f = flags.get(item.id) ?? { charred: max > PERFECT_MAX, warned: max >= BURN_WARNING }
    if (!f.charred && max > PERFECT_MAX) {
      f.charred = true
      sfx.play('charred', 0.6)
    }
    if (!f.warned && max >= BURN_WARNING) {
      f.warned = true
      sfx.play('warn', 0.7)
    }
    flags.set(item.id, f)
    // 不等 server 的 alarm，自己算到就先燒，畫面比較即時
    if (max >= BURN) {
      startDying(item, d, 'burn')
      sfx.play('burn')
    }
    if (item.since !== null) heat += heatAt(item.x, item.y)
  }
  if (t - lastSizzle > 400) {
    lastSizzle = t
    sfx.setSizzle(heat / 6)
  }
}

let off: (() => void) | null = null

onMounted(() => {
  raf = requestAnimationFrame(loop)
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', onWindowUp)
  window.addEventListener('pointercancel', onWindowUp)
  off = props.room.on((ev) => {
    if (ev.type === 'itemAction') {
      const g = ev.mine ? 1 : 0.55
      if (ev.action === 'spawn' && onGrill(ev.item.x, ev.item.y)) sfx.play('place', g)
      if (ev.action === 'drop' && onGrill(ev.item.x, ev.item.y)) sfx.play('place', g * 0.7)
      if (ev.action === 'flip') sfx.play('flip', g)
      if (ev.action === 'sauce') sfx.play('sauce', g)
      if (ev.action === 'drop' || ev.action === 'release') {
        // 自己放下的食材，等 server 回應才清掉本機位置
        delete localDrag[ev.item.id]
      }
    } else if (ev.type === 'removed') {
      const food = foodOf(ev.item)
      const d: [number, number] = food ? donenessAt(ev.item, food, now(), state.heatScale) : [0, 0]
      flags.delete(ev.item.id)
      const alreadyBurnt = gone.delete(ev.item.id)
      if (ev.reason === 'burned') {
        if (alreadyBurnt) return
        if (!dying[ev.item.id]) sfx.play('burn', 0.8)
        startDying(ev.item, d, 'burn')
      } else {
        startDying(ev.item, d, 'eat')
        const g = ev.mine ? 1 : 0.5
        sfx.play('eat', g)
        const perfect = isPerfect(d)
        if (perfect) sfx.play('perfect', g)
        const score = ev.score ?? 0
        const who = ev.by ? playersById.value[ev.by]?.name : ''
        const key = ++floatKey
        floats.push({
          key,
          x: ev.item.x,
          y: ev.item.y,
          text: `${ev.mine ? '' : `${who} `}${score >= 0 ? '+' : ''}${score}${perfect ? ' 完美！' : ''}`,
          good: score > 0,
        })
        setTimeout(() => {
          const i = floats.findIndex((f) => f.key === key)
          if (i >= 0) floats.splice(i, 1)
        }, 1300)
      }
    }
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', onWindowUp)
  window.removeEventListener('pointercancel', onWindowUp)
  if (tapTimer) clearTimeout(tapTimer)
  off?.()
  sfx.setSizzle(0)
})

// ---------- 烤架外觀：用固定亂數種子產生炭塊，每次畫面都一樣 ----------
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}
const coals = (() => {
  const rnd = seeded(42)
  const list: { points: string; hot: number }[] = []
  for (let i = 0; i < 260; i++) {
    const cx = rnd() * 100
    const cy = rnd() * 62.5
    const r = 1.2 + rnd() * 1.8
    const n = 5 + Math.floor(rnd() * 3)
    const pts: string[] = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.5
      const rr = r * (0.7 + rnd() * 0.4)
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr * 0.8).toFixed(2)}`)
    }
    const dist = Math.hypot((cx - 50) / 50, (cy - 31.25) / 31.25)
    list.push({ points: pts.join(' '), hot: Math.max(0, 1 - dist) })
  }
  return list
})()

const grillStyle = {
  left: `${GRILL.x0 * 100}%`,
  top: `${GRILL.y0 * 100}%`,
  width: `${(GRILL.x1 - GRILL.x0) * 100}%`,
  height: `${(GRILL.y1 - GRILL.y0) * 100}%`,
}

const emoteSpots = computed(() =>
  state.emotes.map((em, i) => {
    const c = em.pid === state.you.pid ? null : state.cursors[em.pid]
    return { ...em, x: c ? c.x : 0.5 + ((i % 5) - 2) * 0.06, y: c ? c.y : 0.9 }
  }),
)
</script>

<template>
  <div
    ref="tableEl"
    class="table"
    :style="{ aspectRatio: TABLE_ASPECT }"
    :class="{ brush: tool === 'brush' }"
    @pointermove="onTableMove"
  >
    <div class="grill" :style="grillStyle" aria-hidden="true">
      <svg class="bed" viewBox="0 0 100 62.5" preserveAspectRatio="none">
        <defs>
          <radialGradient id="grill-heat" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="#ffb347" />
            <stop offset="35%" stop-color="#ff6a1a" />
            <stop offset="70%" stop-color="#9c2a0c" />
            <stop offset="100%" stop-color="#2a0e06" />
          </radialGradient>
        </defs>
        <rect width="100" height="62.5" fill="url(#grill-heat)" />
        <polygon
          v-for="(c, i) in coals"
          :key="i"
          :points="c.points"
          :fill="`rgb(${40 + c.hot * 60}, ${24 + c.hot * 14}, ${20})`"
          :fill-opacity="0.55 + (1 - c.hot) * 0.4"
          :stroke="`rgba(255, ${120 + c.hot * 90}, 40, ${0.3 + c.hot * 0.6})`"
          stroke-width="0.3"
        />
      </svg>
      <div class="glow" />
      <div class="wires" />
    </div>

    <FoodItem
      v-for="v in view"
      :key="v.item.id"
      :food-id="v.item.foodId"
      :food="v.food"
      :image-url="imageUrlOf(v.item)"
      :x="v.x"
      :y="v.y"
      :rot="v.item.rot"
      :up="v.d[v.item.down === 0 ? 1 : 0]"
      :down="v.d[v.item.down]"
      :sauced="v.item.sauced"
      :holder="v.holder"
      :lifted="v.lifted"
      :dying="null"
      :interactive="!v.holder"
      @pointerdown="onItemDown(v.item, $event)"
    />
    <FoodItem
      v-for="x in dyingView"
      :key="`dying-${x.item.id}`"
      :food-id="x.item.foodId"
      :food="x.food!"
      :image-url="imageUrlOf(x.item)"
      :x="x.item.x"
      :y="x.item.y"
      :rot="x.item.rot"
      :up="x.d[x.item.down === 0 ? 1 : 0]"
      :down="x.d[x.item.down]"
      :sauced="x.item.sauced"
      :holder="null"
      :lifted="false"
      :dying="x.reason"
      :interactive="false"
    />

    <div
      v-for="f in floats"
      :key="f.key"
      class="float"
      :class="{ bad: !f.good }"
      :style="{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }"
    >
      {{ f.text }}
    </div>

    <div v-for="c in cursors" :key="c.pid" class="cursor" :style="{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M3 3l7 18 2.6-7.4L20 11z" :fill="c.color" stroke="#1c0d04" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
      <span :style="{ background: c.color }">{{ c.name }}</span>
    </div>

    <div
      v-for="em in emoteSpots"
      :key="em.key"
      class="emote"
      :style="{ left: `${em.x * 100}%`, top: `${em.y * 100}%` }"
    >
      {{ em.e }}
    </div>
  </div>
</template>

<style scoped>
.table {
  position: relative;
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background:
    repeating-linear-gradient(90deg, rgb(0 0 0 / 0.18) 0 2px, transparent 2px 12.5%),
    repeating-linear-gradient(90deg, transparent 0 3%, rgb(255 255 255 / 0.025) 3% 3.4%, transparent 3.4% 7%),
    linear-gradient(180deg, #6b4428, #58361f);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.05),
    var(--shadow-md);
}

.table.brush {
  cursor: cell;
}

.grill {
  position: absolute;
  border-radius: 14px;
  overflow: hidden;
  background: #1a1411;
  box-shadow:
    0 0 0 5px #2b2522,
    0 0 0 7px #121010,
    0 10px 26px rgb(0 0 0 / 0.6),
    0 0 60px rgb(255 100 30 / 0.25);
}

.bed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, rgb(255 170 60 / 0.45), transparent 60%);
  mix-blend-mode: screen;
  animation: flicker 2.8s ease-in-out infinite;
}

@keyframes flicker {
  0%,
  100% {
    opacity: 0.55;
  }
  30% {
    opacity: 0.9;
  }
  55% {
    opacity: 0.65;
  }
  80% {
    opacity: 1;
  }
}

.wires {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 32.8%, #8c8680 33%, #4c4744 33.6%, transparent 33.8%),
    linear-gradient(90deg, transparent 66.2%, #8c8680 66.4%, #4c4744 67%, transparent 67.2%),
    repeating-linear-gradient(180deg, transparent 0 3.4%, #a19b95 3.4% 3.8%, #55504c 3.8% 4.3%, transparent 4.3% 5.6%);
  opacity: 0.9;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.6));
}

.float {
  position: absolute;
  transform: translate(-50%, -50%);
  font-weight: 800;
  font-size: clamp(13px, 1.6vw, 18px);
  color: var(--gold);
  text-shadow: 0 2px 4px rgb(0 0 0 / 0.8);
  white-space: nowrap;
  pointer-events: none;
  animation: float 1.3s ease-out forwards;
  z-index: 60;
}

.float.bad {
  color: #ff8a80;
}

@keyframes float {
  from {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
  to {
    transform: translate(-50%, -260%);
    opacity: 0;
  }
}

.cursor {
  position: absolute;
  pointer-events: none;
  transition:
    left 0.08s linear,
    top 0.08s linear;
  z-index: 70;
}

.cursor span {
  position: absolute;
  left: 16px;
  top: 18px;
  padding: 0 6px;
  border-radius: 99px;
  color: #1c0d04;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.emote {
  position: absolute;
  font-size: clamp(24px, 3.4vw, 40px);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: emote 2.2s ease-out forwards;
  z-index: 80;
}

@keyframes emote {
  0% {
    transform: translate(-50%, -30%) scale(0.4);
    opacity: 0;
  }
  15% {
    transform: translate(-50%, -80%) scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -260%) scale(1);
    opacity: 0;
  }
}
</style>
