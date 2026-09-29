<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Captions, CaptionsOff, EyeOff, X } from '@lucide/vue'
import { EMOTES } from '@shared/game'
import { LIMITS } from '@shared/limits'
import type { ChatLine } from '@shared/protocol'
import type { MutedPlayer } from '@/composables/useMutedPlayers'

const props = defineProps<{ lines: ChatLine[]; you: string; muted: MutedPlayer[] }>()
const danmaku = defineModel<boolean>('danmaku', { required: true })
const emit = defineEmits<{ say: [text: string]; emote: [e: string]; mute: [pid: string, name: string]; unmute: [pid: string]; close: [] }>()

const text = ref('')
const list = ref<HTMLOListElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const showMuted = ref(false)

watch(
  () => props.lines.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
  { immediate: true },
)

watch(
  () => props.muted.length,
  (n) => {
    if (n === 0) showMuted.value = false
  },
)

function submit() {
  const t = text.value.trim()
  if (!t) return
  emit('say', t)
  text.value = ''
}

// 聊天室收起來時是 display: none，捲動沒有作用，所以打開時要再捲一次到最新
function reveal() {
  list.value?.scrollTo({ top: list.value.scrollHeight })
  // 觸控裝置一聚焦就會跳出鍵盤，把訊息擋掉，所以只在有滑鼠時自動聚焦
  if (matchMedia('(pointer: fine)').matches) input.value?.focus()
}
defineExpose({ reveal })

const time = (ts: number) => new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="chat card" aria-label="聊天">
    <header class="head">
      <h2>聊天</h2>
      <button
        type="button"
        class="btn btn-sm toggle"
        :class="{ on: danmaku }"
        :aria-pressed="danmaku"
        :title="danmaku ? '關閉彈幕' : '開啟彈幕'"
        @click="danmaku = !danmaku"
      >
        <Captions v-if="danmaku" :size="16" />
        <CaptionsOff v-else :size="16" />
        彈幕
      </button>
      <button type="button" class="btn btn-sm close" aria-label="收起聊天室" title="收起聊天室" @click="emit('close')">
        <X :size="18" />
      </button>
    </header>
    <div class="emotes">
      <button v-for="e in EMOTES" :key="e" class="emote" :aria-label="`送出 ${e}`" @click="emit('emote', e)">{{ e }}</button>
    </div>
    <ol ref="list" class="lines" aria-live="polite">
      <li v-if="!lines.length" class="empty">還沒有人說話。來打聲招呼吧！</li>
      <li v-for="(l, i) in lines" :key="`${l.ts}-${i}`">
        <span class="who" :style="{ color: l.color }">{{ l.name }}</span>
        <span class="text">{{ l.text }}</span>
        <time>{{ time(l.ts) }}</time>
        <button
          v-if="l.pid !== you"
          type="button"
          class="mute"
          :aria-label="`隱藏 ${l.name} 的訊息`"
          :title="`隱藏 ${l.name} 的訊息`"
          @click="emit('mute', l.pid, l.name)"
        >
          <EyeOff :size="14" />
        </button>
      </li>
    </ol>
    <div v-if="muted.length" class="muted-bar">
      <button type="button" class="link" :aria-expanded="showMuted" @click="showMuted = !showMuted">
        已隱藏 {{ muted.length }} 人
      </button>
      <ul v-if="showMuted" class="muted-list">
        <li v-for="m in muted" :key="m.pid">
          <span class="muted-name">{{ m.name }}</span>
          <button type="button" class="link" @click="emit('unmute', m.pid)">取消隱藏</button>
        </li>
      </ul>
    </div>
    <form class="say" @submit.prevent="submit">
      <input ref="input" v-model="text" class="input" :maxlength="LIMITS.chatMax" placeholder="說點什麼…" aria-label="聊天訊息" />
      <button class="btn btn-sm" type="submit" :disabled="!text.trim()">送出</button>
    </form>
  </section>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  padding: 12px;
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

h2 {
  flex: 1;
  margin: 0;
  font-size: 1rem;
}

.close {
  width: 30px;
  min-height: 30px;
  margin-left: 6px;
  padding: 0;
  color: var(--muted);
}

.close:hover {
  color: var(--text);
}

.toggle {
  gap: 5px;
  min-height: 30px;
  padding: 0 0.7em;
  color: var(--muted);
}

.toggle.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--gold);
}

.emotes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.emote {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 18px;
  line-height: 1;
  transition: transform 0.1s;
}

.emote:hover {
  transform: scale(1.12);
  border-color: var(--accent);
}

.lines {
  flex: 1;
  min-height: 120px;
  max-height: 240px;
  margin: 0;
  padding: 4px 2px;
  overflow: auto;
  list-style: none;
  font-size: 0.9rem;
}

.lines li {
  position: relative;
  padding: 2px 28px 2px 0;
  border-radius: 6px;
  overflow-wrap: anywhere;
}

.lines li:hover {
  background: rgb(255 255 255 / 0.03);
}

.who {
  margin-right: 6px;
  font-weight: 700;
}

time {
  margin-left: 6px;
  color: var(--faint);
  font-size: 0.75rem;
}

/* 只在滑過或用鍵盤選到時出現，平常不佔視線 */
.mute {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: var(--surface-3);
  color: var(--muted);
  opacity: 0;
}

.lines li:hover .mute,
.mute:focus-visible {
  opacity: 1;
}

.mute:hover {
  color: var(--text);
}

/* 觸控裝置沒有 hover，一直顯示 */
@media (hover: none) {
  .mute {
    opacity: 0.7;
  }
}

.empty {
  color: var(--faint);
}

.muted-bar {
  margin-top: 6px;
  font-size: 0.8rem;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.link:hover {
  color: var(--text);
}

.muted-list {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  list-style: none;
}

.muted-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}

.muted-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.say {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.say .input {
  min-height: 36px;
}
</style>
