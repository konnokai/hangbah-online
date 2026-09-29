<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { LIMITS } from '@shared/limits'
import { resizeImage } from '@/utils/resizeImage'

const props = defineProps<{ code: string; token: string }>()
const emit = defineEmits<{ close: [] }>()

const name = ref('')
const blob = ref<Blob | null>(null)
const preview = ref('')
const error = ref('')
const busy = ref(false)

const ERRORS: Record<string, string> = {
  file_too_large: `檔案超過 ${LIMITS.uploadMaxBytes / 1024} KB`,
  image_too_big: `圖片超過 ${LIMITS.uploadMaxDim}×${LIMITS.uploadMaxDim}`,
  unsupported_image: '只支援 PNG、JPEG、WebP',
  not_in_room: '連線斷掉了，重新整理再試一次',
  too_many_custom_foods: `這個房間已經有 ${LIMITS.maxCustomFoods} 種自訂食材了`,
  upload_rate_limited: '上傳太快了，等一分鐘再試',
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  error.value = ''
  if (!file) return
  try {
    const out = await resizeImage(file)
    blob.value = out
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(out)
    if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.foodNameMax)
  } catch (err) {
    blob.value = null
    error.value = err instanceof Error ? err.message : '讀不到這張圖片'
  }
}

async function submit() {
  if (!blob.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/rooms/${props.code}/foods`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.value.type,
        'X-Upload-Token': props.token,
        'X-Food-Name': encodeURIComponent(name.value.trim()),
      },
      body: blob.value,
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      error.value = ERRORS[data.error ?? ''] ?? `上傳失敗（${res.status}）`
      return
    }
    emit('close')
  } catch {
    error.value = '網路有問題，再試一次'
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => preview.value && URL.revokeObjectURL(preview.value))
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <form class="dialog card" role="dialog" aria-modal="true" aria-labelledby="upload-title" @submit.prevent="submit">
      <h2 id="upload-title">新增自訂食材</h2>
      <p class="muted">
        上傳一張圖，房間裡的人都能拿來烤。圖片會縮到 {{ LIMITS.clientResizeDim }}px，限 PNG / JPEG / WebP。
        請只上傳你有權使用的圖片。
      </p>
      <label class="file">
        <input type="file" accept="image/png,image/jpeg,image/webp" @change="onFile" />
        <span v-if="!preview" class="pick">選擇圖片</span>
        <img v-else :src="preview" alt="預覽" />
      </label>
      <label class="field">
        <span>名稱</span>
        <input v-model="name" class="input" :maxlength="LIMITS.foodNameMax" placeholder="例如：烤蝦" required />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="!blob || !name.trim() || busy">
          {{ busy ? '上傳中…' : '放進食材盤' }}
        </button>
      </div>
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
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(3px);
}

.dialog {
  width: min(420px, 100%);
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

h2 {
  margin: 0 0 6px;
  font-size: 1.15rem;
}

.muted {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 0.88rem;
}

.file {
  display: grid;
  place-items: center;
  height: 150px;
  margin-bottom: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  cursor: pointer;
  overflow: hidden;
}

.file:hover {
  border-color: var(--accent);
}

.file input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.file:focus-within {
  outline: 2px solid var(--gold);
}

.pick {
  color: var(--gold);
  font-weight: 600;
}

.file img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.field {
  display: grid;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--muted);
}

.error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
