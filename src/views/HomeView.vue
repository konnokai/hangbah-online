<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { BUILTIN_FOODS } from '@shared/game'
import { LIMITS, ROOM_CODE_RE } from '@shared/limits'
import { loadName, saveName } from '@/utils/storage'
import { sfx } from '@/audio/sfx'
import { FOOD_ART } from '@/foods'

const router = useRouter()
const name = ref(loadName())
const joinCode = ref('')
const busy = ref(false)
const error = ref('')

async function create() {
  const n = name.value.trim()
  if (!n || busy.value) return
  sfx.unlock()
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    })
    if (!res.ok) throw new Error(String(res.status))
    const { code } = (await res.json()) as { code: string }
    saveName(n)
    router.push(`/r/${code}`)
  } catch {
    error.value = '生火失敗，再試一次'
  } finally {
    busy.value = false
  }
}

function join() {
  // 也接受直接貼整個網址
  const raw = joinCode.value.trim().toUpperCase()
  const code = raw.match(/([A-Z0-9]{6})\/?$/)?.[1] ?? raw
  if (!ROOM_CODE_RE.test(code)) {
    error.value = '房號是 6 個英文或數字'
    return
  }
  if (name.value.trim()) saveName(name.value.trim())
  sfx.unlock()
  router.push(`/r/${code}`)
}

const heroFoods = ['sausage', 'corn', 'meat', 'mushroom', 'pepper'] as const
const foodNames = BUILTIN_FOODS.map((f) => f.name).join('、')
</script>

<template>
  <main class="home">
    <section class="hero">
      <img class="logo" src="/logo.png" alt="" width="112" height="112" />
      <h1>夯肉<span>線上烤肉</span></h1>
      <p class="lead">開一個烤肉場，把連結丟給朋友。大家在同一個烤架上翻肉、搶肉、比誰烤得最剛好。</p>
      <div class="skewer" aria-hidden="true">
        <span v-for="(id, i) in heroFoods" :key="id" :style="{ '--i': i }">
          <component :is="FOOD_ART[id]" :d="0.3 + i * 0.12" :sauced="i === 2" />
        </span>
      </div>
    </section>

    <section class="panel card">
      <label class="field">
        <span>你的暱稱</span>
        <input
          v-model="name"
          class="input"
          :maxlength="LIMITS.nicknameMax"
          placeholder="例如：烤肉大師阿明"
          autocomplete="nickname"
          @keydown.enter="create"
        />
      </label>
      <button class="btn btn-primary wide" :disabled="!name.trim() || busy" @click="create">
        {{ busy ? '生火中…' : '🔥 開新烤肉場' }}
      </button>

      <div class="or"><span>或是加入朋友的烤肉場</span></div>

      <form class="join" @submit.prevent="join">
        <input v-model="joinCode" class="input" placeholder="房號，例如 ABC234" aria-label="房號" autocapitalize="characters" />
        <button class="btn" type="submit" :disabled="!joinCode.trim()">加入</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>

    <section class="how">
      <div class="step card">
        <b>1. 丟上烤架</b>
        <p>把食材拖到烤架上就開始烤，放哪都可以。中間火大、邊邊火小。</p>
      </div>
      <div class="step card">
        <b>2. 記得翻面</b>
        <p>點一下翻面。兩面都烤到剛好再吃，分數最高；刷醬還有加成。</p>
      </div>
      <div class="step card">
        <b>3. 別烤過頭</b>
        <p>放著不管會焦，再久就直接燒成灰。朋友也可能先把你的肉夾走。</p>
      </div>
    </section>
    <p class="foods">今日食材：{{ foodNames }}，還可以上傳自己的圖片做成食材。</p>
  </main>
</template>

<style scoped>
.home {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 16px 0;
}

.hero {
  text-align: center;
}

.logo {
  filter: drop-shadow(0 6px 8px rgb(0 0 0 / 0.45));
}

h1 {
  margin: 8px 0 6px;
  font-size: clamp(1.9rem, 6vw, 2.8rem);
  line-height: 1.15;
  letter-spacing: 0.01em;
}

h1 span {
  display: block;
  margin-top: 4px;
  font-size: 0.55em;
  color: var(--gold);
  letter-spacing: 0.3em;
}

.lead {
  max-width: 34em;
  margin: 0 auto;
  color: var(--muted);
}

.skewer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  height: 64px;
  margin: 18px 0 8px;
}

.skewer span {
  width: 64px;
  animation: bob 2.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.18s);
}

@keyframes bob {
  50% {
    transform: translateY(-6px) rotate(-4deg);
  }
}

.panel {
  display: grid;
  gap: 12px;
  max-width: 440px;
  margin: 16px auto 0;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.field {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 0.9rem;
}

.wide {
  width: 100%;
  min-height: 48px;
  font-size: 1.05rem;
}

.or {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--faint);
  font-size: 0.85rem;
}

.or::before,
.or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.join {
  display: flex;
  gap: 8px;
}

.join .input {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}

.how {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 32px;
}

.step {
  padding: 14px 16px;
}

.step p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.foods {
  margin: 16px 0 0;
  text-align: center;
  color: var(--faint);
  font-size: 0.85rem;
}

@media (max-width: 640px) {
  .home {
    padding-top: 24px;
  }

  .how {
    grid-template-columns: 1fr;
  }

  .skewer span {
    width: 48px;
  }
}
</style>
