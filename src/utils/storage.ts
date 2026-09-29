// 無痕模式或封鎖網站資料時，storage 可能直接丟例外
function safeGet(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key)
  } catch {
    return null
  }
}

function safeSet(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value)
  } catch {
    // 存不了就算了，下次再問一次暱稱
  }
}

const NAME_KEY = 'hangbah:name'
const PID_KEY = 'hangbah:pid'

export const loadName = () => safeGet(() => localStorage, NAME_KEY) ?? ''
export const saveName = (name: string) => safeSet(() => localStorage, NAME_KEY, name)

/**
 * 玩家 id 存在 localStorage：同一個瀏覽器開幾個分頁都算同一個人，排行榜不會重複。
 * 換瀏覽器、無痕視窗或清掉網站資料才會變成新玩家。
 */
export function playerId(): string {
  // 舊版存在 sessionStorage，先沿用這個分頁原本的 id，正在玩的人重新整理後分數才不會不見
  let pid = safeGet(() => localStorage, PID_KEY) ?? safeGet(() => sessionStorage, PID_KEY)
  if (!pid) pid = crypto.randomUUID()
  safeSet(() => localStorage, PID_KEY, pid)
  return pid
}

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(() => localStorage, key)
  if (!raw) return fallback
  try {
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

export const saveJSON = (key: string, value: unknown) => safeSet(() => localStorage, key, JSON.stringify(value))
