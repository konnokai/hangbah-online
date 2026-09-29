import { computed, reactive } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'

export interface MutedPlayer {
  pid: string
  name: string
}

/**
 * 在自己的瀏覽器隱藏特定玩家的聊天和表情，別人不受影響。
 * 用房號分開存，因為 pid 只在同一個房間有意義。
 * 同時記下暱稱，對方離線後名單裡還看得出是誰。
 */
export function useMutedPlayers(code: string) {
  const key = `hangbah:muted:${code}`
  const saved = loadJSON<{ list: MutedPlayer[] }>(key, { list: [] })
  const list = reactive<MutedPlayer[]>(Array.isArray(saved.list) ? saved.list.filter((p) => typeof p?.pid === 'string') : [])

  const pids = computed(() => new Set(list.map((p) => p.pid)))
  const save = () => saveJSON(key, { list })

  function mute(pid: string, name: string) {
    if (pids.value.has(pid)) return
    list.push({ pid, name })
    save()
  }

  function unmute(pid: string) {
    const i = list.findIndex((p) => p.pid === pid)
    if (i < 0) return
    list.splice(i, 1)
    save()
  }

  const isMuted = (pid: string) => pids.value.has(pid)

  return { list, pids, mute, unmute, isMuted }
}

export type MutedPlayers = ReturnType<typeof useMutedPlayers>
