<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { PlayerInfo } from '@shared/protocol'
import { loadJSON, saveJSON } from '@/utils/storage'

const props = defineProps<{ players: PlayerInfo[]; you: string }>()

const sorted = computed(() =>
  [...props.players].sort((a, b) => b.score - a.score || Number(b.online) - Number(a.online)),
)
const onlineCount = computed(() => props.players.filter((p) => p.online).length)
const rankOf = (i: number, p: PlayerInfo) => (i === 0 && p.score > 0 ? '🏆' : String(i + 1))
const leader = computed(() => sorted.value[0] ?? null)

const COLLAPSE_KEY = 'hangbah:leaderboard'
const collapsed = ref(loadJSON(COLLAPSE_KEY, { collapsed: false }).collapsed === true)
watch(collapsed, (v) => saveJSON(COLLAPSE_KEY, { collapsed: v }))
</script>

<template>
  <section class="overlay" :class="{ collapsed }" aria-label="排行榜">
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
    <ol v-if="!collapsed" tabindex="0" aria-label="玩家分數">
      <li v-for="(p, i) in sorted" :key="p.pid" :class="{ offline: !p.online, me: p.pid === you }">
        <span class="rank">{{ rankOf(i, p) }}</span>
        <span class="dot" :style="{ background: p.color }" />
        <span class="name">{{ p.name }}</span>
        <span class="score">{{ p.score }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
ol {
  margin: 0;
  padding: 0;
  list-style: none;
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

.score {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--gold);
}

/* ---------- 疊在烤架左上角 ---------- */
/* 標題列不吃滑鼠事件，底下的食材照樣可以拖；只有收合按鈕和名單（要捲動）可以操作 */
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
  /* 大約五列半，露出半列讓人知道下面還有 */
  max-height: 9.6em;
  margin-top: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 0.25) transparent;
  pointer-events: auto;
}

.overlay li {
  grid-template-columns: 20px 8px 1fr auto;
  gap: 6px;
  padding: 2px 4px 2px 0;
}

.overlay li.me {
  /* 自己那列捲出去時貼在上緣或下緣，永遠看得到自己的名次。底色要不透明，才不會跟別列疊在一起 */
  position: sticky;
  top: 0;
  bottom: 0;
  background: #4b2d1d;
}

.overlay .rank {
  font-size: 0.75rem;
  color: var(--muted);
}

.overlay .dot {
  width: 8px;
  height: 8px;
}

/* 手機烤架小，排行榜縮小一點，少擋一點烤架 */
@media (max-width: 960px) {
  .overlay {
    top: 6px;
    left: 6px;
    width: 168px;
    padding: 4px 4px 4px 8px;
    font-size: 0.72rem;
  }

  .overlay.collapsed {
    max-width: 200px;
  }

  .overlay ol {
    max-height: 6.4em;
  }
}
</style>
