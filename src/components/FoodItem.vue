<script setup lang="ts">
import { computed } from 'vue'
import { BURN_WARNING, PERFECT_MAX, stageOf, type FoodDef, type Stage } from '@shared/game'
import { FOOD_ART, FOOD_ASPECT } from '@/foods'

const props = defineProps<{
  foodId: string
  food: FoodDef
  imageUrl: string | null
  x: number
  y: number
  rot: number
  /** [朝上那面, 朝下那面] 的熟度 */
  up: number
  down: number
  sauced: boolean
  holder: { name: string; color: string } | null
  lifted: boolean
  dying: 'burn' | 'eat' | null
  interactive: boolean
}>()

const art = computed(() => FOOD_ART[props.foodId] ?? null)
const aspect = computed(() => FOOD_ASPECT[props.foodId] ?? 1)
const hottest = computed(() => Math.max(props.up, props.down))

const STAGE_LABEL: Record<Stage, string> = { raw: '生', perfect: '剛好', charred: '焦了', burnt: '燒掉了' }
const title = computed(
  () => `${props.food.name}｜上面：${STAGE_LABEL[stageOf(props.up)]}，下面：${STAGE_LABEL[stageOf(props.down)]}${props.sauced ? '，有刷醬' : ''}`,
)

// 點陣圖沒辦法換顏色，用濾鏡模擬變熟變焦
const imageFilter = computed(() => {
  const d = props.up
  const sepia = Math.min(1, d / PERFECT_MAX) * 0.55
  const dark = Math.max(0, Math.min(1, (d - 0.9) / 0.6))
  return `sepia(${sepia.toFixed(2)}) saturate(${(1 + d * 0.25).toFixed(2)}) brightness(${(1 - dark * 0.8).toFixed(2)})`
})
const imageMarks = computed(() => Math.max(0, Math.min(0.85, (props.up - 0.35) / 0.75)))

const style = computed(() => ({
  left: `${props.x * 100}%`,
  top: `${props.y * 100}%`,
  width: `${props.food.width * 100}%`,
  '--rot': `${props.rot}deg`,
}))
</script>

<template>
  <div
    class="food"
    :class="{
      lifted,
      warning: !dying && hottest >= BURN_WARNING,
      burning: dying === 'burn',
      eating: dying === 'eat',
      interactive,
    }"
    :style="style"
    :title="title"
    role="img"
    :aria-label="title"
  >
    <div class="body" :style="{ aspectRatio: aspect }">
      <component :is="art" v-if="art" :d="up" :sauced="sauced" />
      <div v-else-if="imageUrl" class="custom">
        <img :src="imageUrl" alt="" draggable="false" :style="{ filter: imageFilter }" />
        <div
          class="custom-marks"
          :style="{ opacity: imageMarks, maskImage: `url(${imageUrl})`, WebkitMaskImage: `url(${imageUrl})` }"
        />
        <div
          v-if="sauced"
          class="custom-sauce"
          :style="{ maskImage: `url(${imageUrl})`, WebkitMaskImage: `url(${imageUrl})` }"
        />
      </div>
      <template v-if="dying === 'burn'">
        <span class="flame f1" /><span class="flame f2" /><span class="flame f3" />
        <span class="ash a1" /><span class="ash a2" /><span class="ash a3" />
      </template>
      <template v-else-if="!dying && hottest >= BURN_WARNING">
        <span class="smoke s1" /><span class="smoke s2" />
      </template>
    </div>
    <div v-if="!dying" class="gauge" aria-hidden="true">
      <span :class="`dot ${stageOf(up)}`" />
      <span :class="`dot ${stageOf(down)}`" />
    </div>
    <div v-if="holder" class="holder" :style="{ background: holder.color }">{{ holder.name }}</div>
  </div>
</template>

<style scoped>
.food {
  position: absolute;
  transform: translate(-50%, -50%) rotate(var(--rot));
  transition:
    left 0.12s linear,
    top 0.12s linear;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.5));
}

.food.interactive {
  cursor: grab;
}

.food.lifted {
  transition: none;
  z-index: 50;
  filter: drop-shadow(0 12px 10px rgb(0 0 0 / 0.55));
}

.food.lifted .body {
  transform: scale(1.1);
}

.body {
  position: relative;
  width: 100%;
  transition: transform 0.12s;
}

.custom {
  position: relative;
  width: 100%;
  height: 100%;
}

.custom img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.custom-marks,
.custom-sauce {
  position: absolute;
  inset: 0;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  pointer-events: none;
}

.custom-marks {
  background: repeating-linear-gradient(60deg, transparent 0 16%, #2a160b 16% 23%);
}

.custom-sauce {
  background: linear-gradient(160deg, rgb(255 255 255 / 0.28), transparent 40%), rgb(107 31 14 / 0.45);
}

/* 熟度小膠囊：左邊是朝上那面，右邊是朝下那面 */
.gauge {
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%) rotate(calc(var(--rot) * -1));
  display: flex;
  gap: 2px;
  padding: 2px 3px;
  border-radius: 99px;
  background: rgb(0 0 0 / 0.55);
  pointer-events: none;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot.raw {
  background: #f08c8c;
}
.dot.perfect {
  background: #7ee07e;
  box-shadow: 0 0 5px #7ee07e;
}
.dot.charred {
  background: #8a5a36;
}
.dot.burnt {
  background: #ff3b1f;
}

.holder {
  position: absolute;
  left: 50%;
  top: -14px;
  transform: translate(-50%, -100%) rotate(calc(var(--rot) * -1));
  padding: 1px 7px;
  border-radius: 99px;
  color: #1c0d04;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}

/* 快燒起來：抖動 + 冒黑煙 */
.warning .body {
  animation: shake 0.35s infinite;
}

@keyframes shake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(-1px, 1px);
  }
  75% {
    transform: translate(1px, -1px);
  }
}

.smoke {
  position: absolute;
  left: 40%;
  top: 10%;
  width: 40%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(40 36 34 / 0.75), transparent 70%);
  animation: smoke 1.6s ease-out infinite;
  pointer-events: none;
}

.smoke.s2 {
  left: 20%;
  animation-delay: 0.8s;
}

@keyframes smoke {
  from {
    transform: translate(0, 0) scale(0.6) rotate(calc(var(--rot) * -1));
    opacity: 0.9;
  }
  to {
    transform: translate(10%, -160%) scale(1.8) rotate(calc(var(--rot) * -1));
    opacity: 0;
  }
}

/* 燒毀：起火 → 變黑縮小 → 化成灰 */
.burning {
  pointer-events: none;
}

.burning .body > :first-child {
  animation: char 1.5s ease-in forwards;
}

@keyframes char {
  0% {
    filter: none;
  }
  35% {
    filter: brightness(0.35) saturate(0.4);
    transform: scale(1);
    opacity: 1;
  }
  100% {
    filter: brightness(0.1);
    transform: scale(0.35);
    opacity: 0;
  }
}

.flame {
  position: absolute;
  bottom: 20%;
  width: 45%;
  aspect-ratio: 0.7;
  border-radius: 50% 50% 45% 45% / 60% 60% 40% 40%;
  background: radial-gradient(ellipse at 50% 75%, #fff3b0 0%, #ffb02e 30%, #ff5a1f 60%, transparent 72%);
  mix-blend-mode: screen;
  transform-origin: 50% 100%;
  animation: flame 1.5s ease-out forwards;
  pointer-events: none;
}

.flame.f1 {
  left: 5%;
}
.flame.f2 {
  left: 30%;
  width: 55%;
  animation-delay: 0.08s;
}
.flame.f3 {
  left: 55%;
  animation-delay: 0.16s;
}

@keyframes flame {
  0% {
    transform: scaleY(0.2) rotate(calc(var(--rot) * -1));
    opacity: 0;
  }
  15% {
    transform: scaleY(1.5) rotate(calc(var(--rot) * -1));
    opacity: 1;
  }
  55% {
    transform: scaleY(1.8) translateY(-10%) rotate(calc(var(--rot) * -1));
    opacity: 0.95;
  }
  100% {
    transform: scaleY(0.6) translateY(-60%) rotate(calc(var(--rot) * -1));
    opacity: 0;
  }
}

.ash {
  position: absolute;
  left: 45%;
  top: 40%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9b938c;
  opacity: 0;
  animation: ash 1.5s ease-out 0.6s forwards;
  pointer-events: none;
}

.ash.a2 {
  left: 25%;
  --dx: -14px;
  animation-delay: 0.7s;
}
.ash.a3 {
  left: 65%;
  --dx: 12px;
  animation-delay: 0.8s;
}

@keyframes ash {
  0% {
    opacity: 0.9;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx, 4px), -46px) scale(2.4);
    background: #4a4540;
  }
}

.eating {
  pointer-events: none;
  animation: eat 0.35s ease-in forwards;
}

@keyframes eat {
  to {
    transform: translate(-50%, -80%) rotate(var(--rot)) scale(0.2);
    opacity: 0;
  }
}
</style>
