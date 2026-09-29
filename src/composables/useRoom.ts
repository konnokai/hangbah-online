import { reactive, onScopeDispose } from 'vue'
import type { CustomFood, GrillItem } from '@shared/game'
import type { ChatLine, ClientMsg, PlayerInfo, RemoveReason, ServerMsg } from '@shared/protocol'
import { playerId } from '@/utils/storage'

export type RoomStatus = 'connecting' | 'open' | 'reconnecting' | 'full' | 'gone'

export interface FloatingEmote {
  key: number
  pid: string
  e: string
}

export type RoomEvent =
  | { type: 'itemAction'; item: GrillItem; by: string; action: string; mine: boolean }
  | { type: 'removed'; item: GrillItem; reason: RemoveReason; by?: string; score?: number; mine: boolean }
  | { type: 'joined'; name: string }
  | { type: 'chat'; line: ChatLine; mine: boolean }
  | { type: 'error'; code: string; message: string }

export function useRoom(code: string, name: string) {
  const pid = playerId()
  const state = reactive({
    status: 'connecting' as RoomStatus,
    you: { pid, name, color: '#ff7a45' },
    host: '',
    heatScale: 1,
    uploadToken: '',
    players: [] as PlayerInfo[],
    items: {} as Record<string, GrillItem>,
    customFoods: [] as CustomFood[],
    chat: [] as ChatLine[],
    cursors: {} as Record<string, { x: number; y: number; ts: number }>,
    drags: {} as Record<string, { x: number; y: number }>,
    emotes: [] as FloatingEmote[],
    /** 到 server 的來回時間（毫秒），還沒量到或斷線時是 null */
    latency: null as number | null,
  })

  // server 時間 - 本機時間，熟度要用 server 的時鐘算
  let offset = 0
  const now = () => Date.now() + offset

  const listeners = new Set<(e: RoomEvent) => void>()
  const emit = (e: RoomEvent) => listeners.forEach((fn) => fn(e))
  const on = (fn: (e: RoomEvent) => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  let ws: WebSocket | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pingSentAt: number | null = null
  let disposed = false
  let emoteKey = 0

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws/${code}?name=${encodeURIComponent(name)}&pid=${pid}`
    const sock = new WebSocket(url)
    ws = sock
    sock.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      if (e.data === 'pong') {
        if (pingSentAt !== null) state.latency = Math.round(performance.now() - pingSentAt)
        pingSentAt = null
        return
      }
      handle(JSON.parse(e.data) as ServerMsg)
    }
    sock.onclose = (e) => {
      if (ws !== sock) return
      if (pingTimer) clearInterval(pingTimer)
      pingSentAt = null
      state.latency = null
      if (disposed) return
      if (e.code === 4003) {
        state.status = 'full'
        return
      }
      scheduleReconnect()
    }
  }

  // ping 同時負責兩件事：保持連線不被中間的 proxy 切斷、量延遲。
  // server 用 setWebSocketAutoResponse 自動回 pong，不會喚醒 DO，也不計費，所以可以量得勤一點
  const PING_MS = 5_000
  function ping() {
    if (ws?.readyState !== WebSocket.OPEN) return
    // 上一個 pong 還沒回來就先不送，不然會對到錯的 pong；卡太久還是要送，當作保持連線
    if (pingSentAt !== null && performance.now() - pingSentAt < 20_000) return
    pingSentAt = performance.now()
    ws.send('ping')
  }

  async function scheduleReconnect() {
    state.status = 'reconnecting'
    // 房間可能在斷線期間被清掉了，先確認還在不在
    try {
      const res = await fetch(`/api/rooms/${code}`)
      if (res.status === 404) {
        state.status = 'gone'
        return
      }
    } catch {
      // 網路斷了，照常重試
    }
    const delay = Math.min(10_000, 800 * 2 ** retry++)
    retryTimer = setTimeout(connect, delay)
  }

  function handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
        offset = msg.now - Date.now()
        retry = 0
        state.status = 'open'
        state.you = msg.you
        state.host = msg.room.host
        state.heatScale = msg.heatScale
        state.uploadToken = msg.uploadToken
        state.players = msg.players
        state.items = Object.fromEntries(msg.items.map((i) => [i.id, i]))
        state.customFoods = msg.customFoods
        state.chat = msg.chat
        state.drags = {}
        if (pingTimer) clearInterval(pingTimer)
        pingSentAt = null
        ping()
        pingTimer = setInterval(ping, PING_MS)
        break
      case 'players':
        state.players = msg.players
        break
      case 'joined':
        emit({ type: 'joined', name: msg.name })
        break
      case 'item':
        state.items[msg.item.id] = msg.item
        if (msg.item.heldBy === null || msg.item.heldBy !== msg.by) delete state.drags[msg.item.id]
        emit({ type: 'itemAction', item: msg.item, by: msg.by, action: msg.action, mine: msg.by === state.you.pid })
        break
      case 'drag':
        state.drags[msg.id] = { x: msg.x, y: msg.y }
        break
      case 'remove': {
        const item = state.items[msg.id]
        delete state.items[msg.id]
        delete state.drags[msg.id]
        if (item) {
          emit({ type: 'removed', item, reason: msg.reason, by: msg.by, score: msg.score, mine: msg.by === state.you.pid })
        }
        break
      }
      case 'cursor':
        state.cursors[msg.pid] = { x: msg.x, y: msg.y, ts: Date.now() }
        break
      case 'chat':
        state.chat.push(msg.line)
        if (state.chat.length > 60) state.chat.splice(0, state.chat.length - 60)
        emit({ type: 'chat', line: msg.line, mine: msg.line.pid === state.you.pid })
        break
      case 'emote': {
        const key = ++emoteKey
        state.emotes.push({ key, pid: msg.pid, e: msg.e })
        setTimeout(() => {
          const i = state.emotes.findIndex((x) => x.key === key)
          if (i >= 0) state.emotes.splice(i, 1)
        }, 2200)
        break
      }
      case 'customFood':
        if (!state.customFoods.some((f) => f.id === msg.food.id)) state.customFoods.push(msg.food)
        break
      case 'customFoodRemoved':
        state.customFoods = state.customFoods.filter((f) => f.id !== msg.id)
        break
      case 'error':
        if (msg.code === 'room_full') state.status = 'full'
        emit({ type: 'error', code: msg.code, message: msg.message })
        break
    }
  }

  function send(msg: ClientMsg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function dispose() {
    disposed = true
    if (retryTimer) clearTimeout(retryTimer)
    if (pingTimer) clearInterval(pingTimer)
    ws?.close()
  }

  connect()
  onScopeDispose(dispose)

  return { state, send, now, on, dispose }
}

export type Room = ReturnType<typeof useRoom>
