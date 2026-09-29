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
  let disposed = false
  let emoteKey = 0

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws/${code}?name=${encodeURIComponent(name)}&pid=${pid}`
    const sock = new WebSocket(url)
    ws = sock
    sock.onmessage = (e) => {
      if (typeof e.data === 'string' && e.data !== 'pong') handle(JSON.parse(e.data) as ServerMsg)
    }
    sock.onclose = (e) => {
      if (pingTimer) clearInterval(pingTimer)
      if (disposed || ws !== sock) return
      if (e.code === 4003) {
        state.status = 'full'
        return
      }
      scheduleReconnect()
    }
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
        // 保持連線不被中間的 proxy 切斷；server 端自動回 pong，不會喚醒 DO
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
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
