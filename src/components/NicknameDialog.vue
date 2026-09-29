<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LIMITS } from '@shared/limits'

defineProps<{ host: string }>()
const emit = defineEmits<{ submit: [name: string] }>()

const name = ref('')
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())

function submit() {
  const n = name.value.trim()
  if (n) emit('submit', n)
}
</script>

<template>
  <div class="backdrop">
    <form class="dialog card" role="dialog" aria-modal="true" aria-labelledby="nick-title" @submit.prevent="submit">
      <img src="/logo.png" alt="" width="72" height="72" />
      <h2 id="nick-title">{{ host }}邀請你來烤肉！</h2>
      <p>先取個暱稱，大家才知道是誰在搶肉。</p>
      <input
        ref="input"
        v-model="name"
        class="input"
        :maxlength="LIMITS.nicknameMax"
        placeholder="你的暱稱"
        aria-label="暱稱"
        autocomplete="nickname"
        required
      />
      <button class="btn btn-primary" type="submit" :disabled="!name.trim()">🔥 進去烤肉</button>
    </form>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.65);
  backdrop-filter: blur(4px);
}

.dialog {
  display: grid;
  justify-items: center;
  gap: 10px;
  width: min(380px, 100%);
  padding: 24px 22px;
  text-align: center;
  box-shadow: var(--shadow-lg);
}

h2 {
  margin: 0;
  font-size: 1.2rem;
}

p {
  margin: 0 0 4px;
  color: var(--muted);
}

.dialog .btn {
  width: 100%;
}
</style>
