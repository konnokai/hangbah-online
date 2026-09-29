<script setup lang="ts">
import { Volume2, VolumeX } from '@lucide/vue'
import { sfx, soundSettings } from '@/audio/sfx'

function toggle() {
  sfx.unlock()
  soundSettings.muted = !soundSettings.muted
}
</script>

<template>
  <div class="sound">
    <button
      class="btn btn-sm icon"
      :aria-label="soundSettings.muted ? '開啟音效' : '關閉音效'"
      :aria-pressed="soundSettings.muted"
      :title="soundSettings.muted ? '開啟音效' : '關閉音效'"
      @click="toggle"
    >
      <VolumeX v-if="soundSettings.muted || soundSettings.volume === 0" :size="18" />
      <Volume2 v-else :size="18" />
    </button>
    <input
      v-model.number="soundSettings.volume"
      class="volume"
      type="range"
      min="0"
      max="1"
      step="0.05"
      aria-label="音量"
      :disabled="soundSettings.muted"
      @pointerdown="sfx.unlock()"
    />
  </div>
</template>

<style scoped>
.sound {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon {
  width: 36px;
  padding: 0;
}

.volume {
  width: 84px;
  accent-color: var(--accent);
}

@media (max-width: 520px) {
  .volume {
    display: none;
  }
}
</style>
