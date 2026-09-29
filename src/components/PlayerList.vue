<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { PlayerInfo } from '@shared/protocol'
import { loadJSON, saveJSON } from '@/utils/storage'

const props = withDefaults(
  defineProps<{ players: PlayerInfo[]; you: string; variant?: 'card' | 'overlay' }>(),
  { variant: 'card' },
)

const sorted = computed(() =>
  [...props.players].sort((a, b) => b.score - a.score || Number(b.online) - Number(a.online)),
)
const onlineCount = computed(() => props.players.filter((p) => p.online).length)
const rankOf = (i: number, p: PlayerInfo) => (i === 0 && p.score > 0 ? '🏆' : String(i + 1))

// 疊在烤架上時不能捲動（整塊不吃滑鼠事件），所以只列前幾名，自己排在後面就另外補一列
const OVERLAY_TOP = 5
const overlayRows = computed(() => {
  const rows = sorted.value.slice(0, OVERLAY_TOP).map((p, i) => ({ p, rank: rankOf(i, p) }))
  const mine = sorted.value.findIndex((p) => p.pid === props.you)
  if (mine >= OVERLAY_TOP) rows.push({ p: sorted.value[mine]!, rank: String(mine + 1) })
  return rows
})
const leader = computed(() => sorted.value[0] ?? null)

const COLLAPSE_KEY = 'hangbah:leaderboard'
const collapsed = ref(loadJSON(COLLAPSE_KEY, { collapsed: false }).collapsed === true)
watch(collapsed, (v) => saveJSON(COLLAPSE_KEY, { collapsed: v }))
</script>

<template>
  <section v-if="variant === 'card'" class="players card" aria-label="排行榜">
    <h2>
      排行榜 <span class="count">{{ onlineCount }} 人在線</span>
    </h2>
    <ol>
      <li v-for="(p, i) in sorted" :key="p.pid" :class="{ offline: !p.online, me: p.pid === you }">
        <span class="rank">{{ rankOf(i, p) }}</span>
        <span class="dot" :style="{ background: p.color }" />
        <span class="name">{{ p.name }}<small v-if="p.pid === you">（你）</small></span>
        <span class="score">{{ p.score }}</span>
      </li>
    </ol>
  </section>

  <section v-else class="overlay" :class="{ collapsed }" aria-label="排行榜">
    <header class="ov-head">
      <span class="ov-title">
        <template v-if="collapsed && leader && leader.score > 0">🏆 {{ leader.name }} {{ leader.score }}</template>
        <template v-else>排行榜</template>
        <span class="ov-count">{{ onlineCount }} 人在線</span>
      </span>
      <button
        type="button"
        class="ov-toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? '展開排行榜' : '收合排行榜'"
        :title="collapsed ? '展開排行榜' : '收合排行榜'"
        @click="collapsed = !collapsed"
      >
        <ChevronDown v-if="collapsed" :size="14" />
        <ChevronUp v-else :size="14" />
      </button>
    </header>
    <ol v-if="!collapsed">
      <li v-for="r in overlayRows" :key="r.p.pid" :class="{ offline: !r.p.online, me: r.p.pid === you }">
        <span class="rank">{{ r.rank }}</span>
        <span class="dot" :style="{ background: r.p.color }" />
        <span class="name">{{ r.p.name }}</span>
        <span class="score">{{ r.p.score }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.players {
  padding: 14px;
}

h2 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 8px;
  font-size: 1rem;
}

.count {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 400;
}

ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.players ol {
  max-height: 220px;
  overflow: auto;
}

li {
  display: grid;
  grid-template-columns: 26px 10px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 8px;
}

li.me {
  background: var(--accent-soft);
}

li.offline {
  opacity: 0.45;
}

.rank {
  color: var(--faint);
  font-size: 0.85rem;
  text-align: center;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name small {
  color: var(--muted);
}

.score {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--gold);
}

/* ---------- 疊在烤架上的版本 ---------- */
/* 整塊不吃滑鼠事件，底下的食材照樣可以拖；只有收合按鈕可以點 */
.overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 95;
  width: 208px;
  padding: 6px 6px 6px 10px;
  border-radius: 10px;
  background: rgb(21 16 13 / 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: var(--shadow-sm);
  font-size: 0.8rem;
  pointer-events: none;
}

.overlay.collapsed {
  width: auto;
  max-width: 260px;
}

.ov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ov-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ov-count {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 400;
}

.ov-toggle {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.08);
  color: var(--text);
  pointer-events: auto;
}

.ov-toggle:hover {
  background: rgb(255 255 255 / 0.16);
}

.overlay ol {
  margin-top: 4px;
}

.overlay li {
  grid-template-columns: 20px 8px 1fr auto;
  gap: 6px;
  padding: 2px 4px 2px 0;
}

.overlay li.me {
  background: rgb(255 122 47 / 0.22);
}

.overlay .rank {
  font-size: 0.75rem;
  color: var(--muted);
}

.overlay .dot {
  width: 8px;
  height: 8px;
}
</style>
