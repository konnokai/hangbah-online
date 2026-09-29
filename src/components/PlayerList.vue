<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerInfo } from '@shared/protocol'

const props = defineProps<{ players: PlayerInfo[]; you: string }>()

const sorted = computed(() =>
  [...props.players].sort((a, b) => b.score - a.score || Number(b.online) - Number(a.online)),
)
const onlineCount = computed(() => props.players.filter((p) => p.online).length)
</script>

<template>
  <section class="players card" aria-label="排行榜">
    <h2>
      排行榜 <span class="count">{{ onlineCount }} 人在線</span>
    </h2>
    <ol>
      <li v-for="(p, i) in sorted" :key="p.pid" :class="{ offline: !p.online, me: p.pid === you }">
        <span class="rank">{{ i === 0 && p.score > 0 ? '🏆' : i + 1 }}</span>
        <span class="dot" :style="{ background: p.color }" />
        <span class="name">{{ p.name }}<small v-if="p.pid === you">（你）</small></span>
        <span class="score">{{ p.score }}</span>
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
</style>
