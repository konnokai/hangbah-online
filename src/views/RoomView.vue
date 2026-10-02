<script setup lang="ts">
import { computed, effectScope, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ArrowDownRight, Drumstick, Link, MessageCircle } from '@lucide/vue'
import { BUILTIN_FOODS, FOOD_DIFFICULTIES, PERFECT_MIN, customFoodUrl, resolveFood } from '@shared/game'
import { ROOM_CODE_RE } from '@shared/limits'
import { useRoom, type Room } from '@/composables/useRoom'
import { useMutedPlayers } from '@/composables/useMutedPlayers'
import { localRect, toLocal, useRotated } from '@/composables/useRotated'
import { loadJSON, loadName, saveJSON, saveName } from '@/utils/storage'
import { sfx } from '@/audio/sfx'
import { FOOD_ART } from '@/foods'
import Grill, { type Tool } from '@/components/Grill.vue'
import FoodTray from '@/components/FoodTray.vue'
import PlayerList from '@/components/PlayerList.vue'
import ChatBox from '@/components/ChatBox.vue'
import SoundControl from '@/components/SoundControl.vue'
import NicknameDialog from '@/components/NicknameDialog.vue'
import UploadFoodDialog from '@/components/UploadFoodDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Danmaku from '@/components/Danmaku.vue'
import HowToPlayDialog from '@/components/HowToPlayDialog.vue'

const route = useRoute()
const router = useRouter()
const code = String(route.params.code ?? '').toUpperCase()

type Phase = 'loading' | 'gone' | 'nickname' | 'room'
const phase = ref<Phase>('loading')
const host = ref('')
const room = shallowRef<Room | null>(null)
const scope = effectScope()
const grill = ref<InstanceType<typeof Grill> | null>(null)
const tool = ref<Tool>('tongs')
const showUpload = ref(false)

// 直拿的手機進房後整個畫面轉橫；輸入暱稱要打字，先不轉
useRotated(computed(() => phase.value === 'room'))

const title = computed(() => (host.value ? `${host.value}的烤肉場` : '烤肉場'))

const latency = computed(() => room.value?.state.latency ?? null)
const latencyLevel = computed(() => {
  const ms = latency.value ?? 0
  return ms < 100 ? 'good' : ms < 250 ? 'fair' : 'poor'
})

// ---------- 聊天：隱藏名單、彈幕 ----------
const muted = useMutedPlayers(code)
const danmaku = ref<InstanceType<typeof Danmaku> | null>(null)
const DANMAKU_KEY = 'hangbah:danmaku'
const danmakuOn = ref(loadJSON(DANMAKU_KEY, { on: true }).on !== false)
watch(danmakuOn, (on) => saveJSON(DANMAKU_KEY, { on }))
const visibleChat = computed(() => room.value?.state.chat.filter((l) => !muted.isMuted(l.pid)) ?? [])

// ---------- 聊天室收合 ----------
// 收成左下角的圓鈕。平常收起來，彈幕照樣會飄。
const chatOpen = ref(false)
const unread = ref(0)
const chatBox = ref<InstanceType<typeof ChatBox> | null>(null)
const chatFab = ref<HTMLButtonElement | null>(null)
const unreadLabel = computed(() => (unread.value > 99 ? '99+' : String(unread.value)))

watch(chatOpen, async (open) => {
  if (!open) return
  unread.value = 0
  await nextTick()
  chatBox.value?.reveal()
})

async function closeChat() {
  chatOpen.value = false
  // 焦點還給圓鈕，鍵盤使用者才不會迷路
  await nextTick()
  chatFab.value?.focus()
}

// ---------- 食材盤收合 ----------
// 平常收起來，烤架才能佔滿畫面。拖食材、上傳食材都不會收起來，只有點到食材盤外面才收。
const foodOpen = ref(false)
const foodDock = ref<HTMLDivElement | null>(null)
const foodFab = ref<HTMLButtonElement | null>(null)
// 食材盤平常收起來，新玩家看到空烤架不知道從哪拿東西，要指給他看
const grillEmpty = computed(() => !!room.value && Object.keys(room.value.state.items).length === 0)

function onOutsidePointer(e: PointerEvent) {
  // 上傳對話框是從食材盤打開的，在裡面操作不算點到外面
  if (!foodOpen.value || showUpload.value) return
  const t = e.target as Element | null
  if (!t || foodDock.value?.contains(t)) return
  // 開關按鈕自己會切換，這裡不能先收起來，不然會變成收起又馬上打開
  if (t.closest('[aria-controls="food-dock"], [role="dialog"], dialog')) return
  foodOpen.value = false
}
// 用 capture：烤架的 pointerdown 會 preventDefault，但不會擋掉這裡
onMounted(() => document.addEventListener('pointerdown', onOutsidePointer, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer, true))

// 盤子跟聊天室一樣固定在畫面上、底邊離視窗 16px，上緣對齊烤架那區的頂端。
// 上面可能多一條斷線提示，頁面也可能捲動，所以打開時量一次，開著時跟著捲動和縮放重量
const layoutEl = ref<HTMLDivElement | null>(null)
const dockTop = ref(16)
function measureDock() {
  const top = layoutEl.value ? localRect(layoutEl.value).top : 16
  dockTop.value = Math.max(16, Math.round(top))
}
watch(foodOpen, (open) => {
  if (open) {
    measureDock()
    window.addEventListener('scroll', measureDock, { passive: true })
    window.addEventListener('resize', measureDock)
  } else {
    window.removeEventListener('scroll', measureDock)
    window.removeEventListener('resize', measureDock)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', measureDock)
  window.removeEventListener('resize', measureDock)
})

async function closeFood() {
  foodOpen.value = false
  await nextTick()
  foodFab.value?.focus()
}

// ---------- 提示訊息 ----------
const toasts = reactive<{ key: number; text: string }[]>([])
let toastKey = 0
function toast(text: string) {
  const key = ++toastKey
  toasts.push({ key, text })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.key === key)
    if (i >= 0) toasts.splice(i, 1)
  }, 2600)
}

onMounted(async () => {
  if (code !== route.params.code) router.replace(`/r/${code}`)
  if (!ROOM_CODE_RE.test(code)) {
    phase.value = 'gone'
    return
  }
  try {
    const res = await fetch(`/api/rooms/${code}`)
    if (res.status === 404) {
      phase.value = 'gone'
      return
    }
    host.value = ((await res.json()) as { host: string }).host
  } catch {
    // 查不到就先進房，WebSocket 會自己重試
  }
  document.title = `${title.value} | 夯肉`
  const saved = loadName()
  if (saved) join(saved)
  else phase.value = 'nickname'
})

function join(name: string) {
  saveName(name)
  // 這裡通常是點擊事件觸發的，可以順便啟動音效
  sfx.unlock()
  const r = scope.run(() => useRoom(code, name))!
  r.on((ev) => {
    if (ev.type === 'joined') {
      sfx.play('join')
      toast(`${ev.name} 來烤肉了`)
    } else if (ev.type === 'chat') {
      if (muted.isMuted(ev.line.pid)) return
      if (!ev.mine) sfx.play('chat')
      if (!ev.mine && !chatOpen.value) unread.value++
      // 只有連線後收到的新訊息會飄，進房時載入的歷史不飄
      danmaku.value?.push({ name: ev.line.name, text: ev.line.text, color: ev.line.color })
    } else if (ev.type === 'error' && ev.code !== 'room_full') {
      toast(ev.message)
    }
  })
  room.value = r
  phase.value = 'room'
  // 每次進房都說明一次玩法：食材盤平常收著，不講的話新玩家不知道從哪開始
  howTo.value?.open()
}

const howTo = ref<InstanceType<typeof HowToPlayDialog> | null>(null)

onBeforeUnmount(() => scope.stop())

// ---------- 離開房間前先確認 ----------
// 首頁連結、左上角 logo、瀏覽器上一頁都會經過這裡
const leaveDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
function inPlayableRoom() {
  const status = room.value?.state.status
  // 房間已經收攤或人滿，本來就玩不了，直接走
  return phase.value === 'room' && status !== 'gone' && status !== 'full'
}

onBeforeRouteLeave(async () => {
  if (!inPlayableRoom()) return true
  return (await leaveDialog.value?.ask()) ?? true
})

// 關分頁、重新整理、在網址列打別的網址不會經過 Vue Router，只能用瀏覽器內建的提示。
// 提示文字由瀏覽器決定；使用者還沒在頁面上點過任何東西時，瀏覽器也不會跳出來。
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!inPlayableRoom()) return
  e.preventDefault()
  // 舊版 Chrome / Safari 要設定 returnValue 才會跳提示
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// 第一次點擊時啟動音效（瀏覽器規定）
const unlock = () => sfx.unlock()
onMounted(() => window.addEventListener('pointerdown', unlock, { once: true }))
onBeforeUnmount(() => window.removeEventListener('pointerdown', unlock))

// ---------- 分享 ----------
async function share() {
  const url = `${location.origin}/r/${code}`
  const coarse = matchMedia('(pointer: coarse)').matches
  if (coarse && navigator.share) {
    try {
      await navigator.share({ title: title.value, text: `來 ${title.value} 一起烤肉！`, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast('已複製連結，貼給朋友就能加入')
  } catch {
    window.prompt('複製這個連結給朋友：', url)
  }
}

// ---------- 從食材盤拖出來 ----------
const trayDrag = reactive({ active: false, foodId: '', x: 0, y: 0, sx: 0, sy: 0, moved: false, peeking: false, pointerId: -1 })

// 按住不動一段時間就放大預覽，看清楚別人上傳了什麼。放開只收起預覽，不放上烤架；預覽中拖動就照常拖曳
const PEEK_MS = 450
let peekTimer: ReturnType<typeof setTimeout> | undefined

function onTrayPress(foodId: string, e: PointerEvent) {
  sfx.unlock()
  Object.assign(trayDrag, { active: true, foodId, ...toLocal(e.clientX, e.clientY), sx: e.clientX, sy: e.clientY, moved: false, peeking: false, pointerId: e.pointerId })
  clearTimeout(peekTimer)
  peekTimer = setTimeout(() => {
    if (trayDrag.active && !trayDrag.moved) trayDrag.peeking = true
  }, PEEK_MS)
  window.addEventListener('pointermove', onTrayMove)
  window.addEventListener('pointerup', onTrayUp)
  window.addEventListener('pointercancel', onTrayCancel)
}

function onTrayMove(e: PointerEvent) {
  if (e.pointerId !== trayDrag.pointerId) return
  // 拖曳中的食材圖在 #app 裡面定位，畫面轉過時要換成版面座標
  Object.assign(trayDrag, toLocal(e.clientX, e.clientY))
  if (!trayDrag.moved && Math.hypot(e.clientX - trayDrag.sx, e.clientY - trayDrag.sy) > 6) {
    trayDrag.moved = true
    trayDrag.peeking = false
    clearTimeout(peekTimer)
  }
}

function endTray() {
  trayDrag.active = false
  trayDrag.peeking = false
  clearTimeout(peekTimer)
  window.removeEventListener('pointermove', onTrayMove)
  window.removeEventListener('pointerup', onTrayUp)
  window.removeEventListener('pointercancel', onTrayCancel)
}

function onTrayUp(e: PointerEvent) {
  if (e.pointerId !== trayDrag.pointerId) return
  const { foodId, moved, peeking } = trayDrag
  endTray()
  if (peeking || !grill.value) return
  // 食材盤蓋在烤架上，放回盤子上面代表不要了，不能放到盤子底下看不到的烤架
  if (moved && isOverFoodDock(e.clientX, e.clientY)) return
  if (moved) grill.value.spawnAt(foodId, e.clientX, e.clientY)
  else grill.value.spawnRandom(foodId)
}

function isOverFoodDock(x: number, y: number) {
  const r = foodDock.value?.getBoundingClientRect()
  return !!r && r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

const onTrayCancel = () => endTray()
onBeforeUnmount(endTray)

const ghostImage = computed(() => {
  if (!trayDrag.foodId.startsWith('c:') || !room.value) return null
  const c = room.value.state.customFoods.find((f) => `c:${f.id}` === trayDrag.foodId)
  return c ? customFoodUrl(code, c) : null
})
const trayFoodName = computed(() => {
  const id = trayDrag.foodId
  if (!id.startsWith('c:')) return BUILTIN_FOODS.find((b) => b.id === id)?.name ?? ''
  return room.value?.state.customFoods.find((f) => `c:${f.id}` === id)?.name ?? ''
})
// 預覽順便告訴玩家要烤多久、分數幾倍。秒數是烤架中間（火力 1）烤到「剛好」的區間
const trayFoodStats = computed(() => {
  const r = room.value
  if (!r) return ''
  const food = resolveFood(trayDrag.foodId, r.state.customFoods)
  if (!food) return ''
  const s = (t: number) => Math.round(t / r.state.heatScale)
  const custom = r.state.customFoods.find((f) => `c:${f.id}` === trayDrag.foodId)
  const level = custom ? `${FOOD_DIFFICULTIES[custom.difficulty].label}・` : ''
  return `${level}中間烤 ${s(food.cookTime * PERFECT_MIN)}–${s(food.cookTime)} 秒剛好・分數 ×${food.points}`
})
const ghostWidth = computed(() => {
  const f = BUILTIN_FOODS.find((b) => b.id === trayDrag.foodId)
  return f ? Math.round(f.width * 900) : 70
})
</script>

<template>
  <main class="room-page">
    <div v-if="phase === 'loading'" class="center">
      <p class="muted">生火中…</p>
    </div>

    <div v-else-if="phase === 'gone'" class="center gone card">
      <div class="big" aria-hidden="true">🪵</div>
      <h1>這個烤肉場已經收攤了</h1>
      <p class="muted">房號 <code>{{ code }}</code> 不存在，或是超過 24 小時沒人所以收掉了。</p>
      <RouterLink to="/" class="btn btn-primary">🔥 開新烤肉場</RouterLink>
    </div>

    <NicknameDialog v-else-if="phase === 'nickname'" :host="host || '朋友'" @submit="join" />

    <template v-else-if="room">
      <header class="bar">
        <RouterLink to="/" class="brand" aria-label="回首頁">
          <img src="/logo.png" alt="" width="36" height="36" />
        </RouterLink>
        <div class="title">
          <h1>{{ title }}</h1>
          <div class="meta">
            <span class="code">房號 <code>{{ code }}</code></span>
            <span v-if="latency !== null" class="latency" :class="latencyLevel" title="伺服器延遲">
              <i class="latency-dot" aria-hidden="true" /><span class="sr-only">伺服器延遲</span>{{ latency }} ms
            </span>
          </div>
        </div>
        <div class="actions">
          <SoundControl />
          <button class="btn btn-sm btn-primary" @click="share"><Link :size="16" />邀請朋友</button>
        </div>
      </header>

      <div v-if="room.state.status === 'reconnecting'" class="banner">連線中斷，正在重新連線…</div>
      <div v-else-if="room.state.status === 'full'" class="banner danger">這場烤肉人滿了，晚點再來或自己開一場吧。</div>
      <div v-else-if="room.state.status === 'gone'" class="banner danger">
        這個烤肉場已經收攤了。<RouterLink to="/">開新烤肉場</RouterLink>
      </div>

      <div ref="layoutEl" class="layout">
        <div class="stage">
          <div class="board">
            <Grill ref="grill" :room="room" :code="code" :tool="tool" :muted-pids="muted.pids.value" />
            <PlayerList :players="room.state.players" :you="room.state.you.pid" />
            <Danmaku ref="danmaku" :enabled="danmakuOn" />
            <p v-if="grillEmpty && !foodOpen" class="empty-hint">
              <span>烤架還空著，點右下角的 <Drumstick :size="16" class="hint-icon" /> 拿食材來烤<ArrowDownRight :size="18" class="hint-arrow" /></span>
            </p>
          </div>
          <p class="legend" aria-hidden="true">
            <span><i class="dot raw" />生</span>
            <span><i class="dot perfect" />剛好</span>
            <span><i class="dot charred" />焦了</span>
            <span class="muted">食材下方的小圓點：左邊是朝上那面，右邊是朝下那面。烤架中間火最大。</span>
          </p>
        </div>
        <!-- 不是對話框：打開時烤架照樣能操作，食材要拖到烤架上 -->
        <Transition name="food-pop">
          <div
            v-show="foodOpen"
            id="food-dock"
            ref="foodDock"
            class="food-dock"
            :style="{ '--dock-top': `${dockTop}px` }"
            @keydown.esc="closeFood"
          >
            <FoodTray
              v-model:tool="tool"
              class="tray-panel"
              :code="code"
              :custom-foods="room.state.customFoods"
              @press="onTrayPress"
              @upload="showUpload = true"
              @close="closeFood"
            />
          </div>
        </Transition>
      </div>

      <button
        v-show="!chatOpen"
        ref="chatFab"
        type="button"
        class="chat-fab"
        :aria-label="unread ? `開啟聊天室，${unread} 則未讀` : '開啟聊天室'"
        :aria-expanded="chatOpen"
        aria-controls="chat-dock"
        title="聊天室"
        @click="chatOpen = true"
      >
        <MessageCircle :size="24" />
        <span v-if="unread" class="unread" aria-hidden="true">{{ unreadLabel }}</span>
      </button>

      <button
        v-show="!foodOpen"
        ref="foodFab"
        type="button"
        class="food-fab"
        aria-label="開啟食材盤"
        :aria-expanded="foodOpen"
        aria-controls="food-dock"
        title="食材盤"
        @click="foodOpen = true"
      >
        <Drumstick :size="24" />
      </button>

      <!-- 用 v-show 不用 v-if：收起來再打開時，打到一半的字和捲動位置都還在 -->
      <Transition name="chat-pop">
        <div v-show="chatOpen" id="chat-dock" class="chat-dock" @click.self="closeChat" @keydown.esc="closeChat">
          <ChatBox
            ref="chatBox"
            v-model:danmaku="danmakuOn"
            class="chat-panel"
            :lines="visibleChat"
            :you="room.state.you.pid"
            :muted="muted.list"
            @say="(text) => room?.send({ t: 'chat', text })"
            @emote="(e) => room?.send({ t: 'emote', e })"
            @mute="(pid, name) => muted.mute(pid, name)"
            @unmute="(pid) => muted.unmute(pid)"
            @close="closeChat"
          />
        </div>
      </Transition>

      <UploadFoodDialog v-if="showUpload" :code="code" :token="room.state.uploadToken" @close="showUpload = false" />
    </template>

    <div
      v-if="trayDrag.active && trayDrag.moved"
      class="ghost"
      :style="{ left: `${trayDrag.x}px`, top: `${trayDrag.y}px`, width: `${ghostWidth}px` }"
      aria-hidden="true"
    >
      <component :is="FOOD_ART[trayDrag.foodId]" v-if="FOOD_ART[trayDrag.foodId]" :d="0" :sauced="false" />
      <img v-else-if="ghostImage" :src="ghostImage" alt="" />
    </div>

    <div v-if="trayDrag.active && trayDrag.peeking" class="peek" aria-hidden="true">
      <div class="peek-card">
        <div class="peek-art">
          <component :is="FOOD_ART[trayDrag.foodId]" v-if="FOOD_ART[trayDrag.foodId]" :d="0" :sauced="false" />
          <img v-else-if="ghostImage" :src="ghostImage" alt="" />
        </div>
        <p class="peek-name">{{ trayFoodName }}</p>
        <p v-if="trayFoodStats" class="peek-stats">{{ trayFoodStats }}</p>
      </div>
    </div>

    <HowToPlayDialog ref="howTo" />

    <ConfirmDialog
      ref="leaveDialog"
      title="要離開烤肉場嗎？"
      message="離開後烤架上的東西還會繼續烤。之後用同一個連結可以再回來。"
      confirm-text="離開"
      cancel-text="繼續烤肉"
    />

    <div class="toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.key" class="toast">{{ t.text }}</div>
    </div>
  </main>
</template>

<style scoped>
.room-page {
  width: 100%;
  margin: 0 auto;
  padding: 12px 16px 0;
}

.center {
  display: grid;
  place-items: center;
  min-height: calc(var(--vh) * 0.6);
  text-align: center;
}

.gone {
  max-width: 460px;
  margin: calc(var(--vh) * 0.1) auto 0;
  padding: 32px 24px;
  min-height: 0;
  gap: 10px;
}

.gone h1 {
  margin: 0;
  font-size: 1.4rem;
}

.big {
  font-size: 48px;
}

.muted {
  color: var(--muted);
}

code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--gold);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  letter-spacing: 0.08em;
}

.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.brand img {
  display: block;
}

.title {
  flex: 1;
  min-width: 0;
}

.title h1 {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 窄螢幕放不下時，延遲換到下一行，靠左對齊 */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 10px;
}

.code {
  color: var(--muted);
  font-size: 0.8rem;
}

.latency {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.latency-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}

.latency.fair .latency-dot {
  background: var(--gold);
}

.latency.poor .latency-dot {
  background: var(--danger);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.banner {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--gold);
  font-size: 0.9rem;
}

.banner.danger {
  background: rgb(255 97 89 / 0.14);
  color: #ffb0aa;
}

.layout {
  position: relative;
}

/*
 * 烤架盡量佔滿畫面：寬度不超過「視窗高度扣掉標題列、說明列」再乘上 16:10 的比例，
 * 這樣不用捲動就看得到整個烤架。太矮的視窗至少留 320px，不然食材小到點不到。
 */
.stage {
  width: min(100%, max(320px, calc((var(--vh) - 140px) * 1.6)));
  margin: 0 auto;
}

/*
 * 畫面轉橫時整頁不能捲動（main.css），標題列、說明列、頁尾都壓扁，烤架用剩下的高度。
 * 124px 是這些東西加起來的高度，改了它們的大小要跟著改。手機太矮時寧可烤架小一點，不設最小寬度
 */
html.rotated .room-page {
  padding-top: 8px;
}

html.rotated .bar {
  margin-bottom: 8px;
}

html.rotated .stage {
  width: min(100%, calc((var(--vh) - 124px) * 1.6));
}

html.rotated .legend {
  margin-top: 6px;
}

/* 說明那句會換成兩行，玩法說明裡也講過了 */
html.rotated .legend .muted {
  display: none;
}

/* 排行榜和彈幕疊在烤架上，所以烤架外面要多包一層定位用的容器 */
.board {
  position: relative;
}

/*
 * 食材盤平常收起來，打開時從右下角彈出來蓋在烤架上。上緣對齊烤架那區，底邊跟聊天室一樣離視窗 16px，
 * 食材多了就在盤子裡捲動。排行榜在烤架左上角，聊天室收在畫面左下角，彼此不重疊。
 */
.food-dock {
  position: fixed;
  top: var(--dock-top, 16px);
  right: 16px;
  bottom: 16px;
  z-index: 140;
  display: flex;
  width: min(340px, calc(var(--vw) * 0.45));
}

.tray-panel {
  flex: 1;
  min-width: 0;
  box-shadow: var(--shadow-lg);
}

/* 指向右下角的食材按鈕，不擋烤架操作 */
.empty-hint {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 1;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: rgb(0 0 0 / 0.6);
  color: var(--text);
  font-size: 0.9rem;
  pointer-events: none;
}

.empty-hint > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hint-icon {
  color: var(--gold);
}

.hint-arrow {
  margin-left: 2px;
  color: var(--gold);
}

/* 跟聊天室一樣從按鈕的位置彈出來，聊天室在左下、食材盤在右下 */
.food-pop-enter-active,
.food-pop-leave-active {
  transform-origin: right bottom;
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.food-pop-enter-from,
.food-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

/* 聊天室浮在畫面上，不佔版面，打開時會蓋住烤架左下角 */
.chat-fab,
.food-fab {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 150;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-3);
  box-shadow: var(--shadow-md);
  transition: border-color 0.15s, color 0.15s;
}

.chat-fab:hover,
.food-fab:hover {
  border-color: var(--accent);
  color: var(--gold);
}

/* 跟聊天室的圓鈕左右對稱，打開時被食材盤蓋住的位置，所以打開就藏起來 */
.food-fab {
  right: 16px;
  left: auto;
  color: var(--gold);
}

.unread {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #1c0d04;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}

.chat-dock {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 150;
  display: flex;
  width: 340px;
  height: min(480px, calc(var(--vh) - 32px));
}

.chat-panel {
  flex: 1;
  min-width: 0;
  box-shadow: var(--shadow-lg);
}

.chat-panel :deep(.lines) {
  max-height: none;
}

.chat-pop-enter-active,
.chat-pop-leave-active {
  transform-origin: left bottom;
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.chat-pop-enter-from,
.chat-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 10px 2px 0;
  font-size: 0.8rem;
  color: var(--text);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.raw {
  background: #f08c8c;
}
.dot.perfect {
  background: #7ee07e;
}
.dot.charred {
  background: #8a5a36;
}

.ghost {
  position: fixed;
  z-index: 300;
  transform: translate(-50%, -50%) scale(1.1);
  pointer-events: none;
  filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.5));
}

.ghost img {
  width: 100%;
}

/* 預覽只負責看，不吃滑鼠事件，放開的 pointerup 才會照常傳到 window */
.peek {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.55);
  pointer-events: none;
  animation: peek-in 0.15s ease-out;
}

.peek-card {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

/* 上傳的圖最長邊是 256px，放到 300px 左右還算清楚 */
.peek-art {
  display: grid;
  place-items: center;
  width: min(300px, calc(var(--vw) * 0.7));
  aspect-ratio: 1;
}

.peek-art > :deep(svg),
.peek-art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.peek-name {
  max-width: min(300px, calc(var(--vw) * 0.7));
  margin: 0;
  font-weight: 700;
  text-align: center;
  overflow-wrap: anywhere;
}

.peek-stats {
  max-width: min(300px, calc(var(--vw) * 0.7));
  margin: -6px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

@keyframes peek-in {
  from {
    opacity: 0;
  }
}

.toasts {
  position: fixed;
  left: 50%;
  bottom: 20px;
  z-index: 400;
  display: grid;
  gap: 6px;
  transform: translateX(-50%);
  pointer-events: none;
}

.toast {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-3);
  box-shadow: var(--shadow-md);
  font-size: 0.9rem;
  white-space: nowrap;
  animation: toast-in 0.2s ease-out;
}

@keyframes toast-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
}

@container app (max-width: 520px) {
  .room-page {
    padding: 8px 10px 0;
  }

  .title h1 {
    font-size: 1rem;
  }

  .btn-primary {
    padding: 0 0.7em;
  }
}
</style>
