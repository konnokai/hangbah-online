<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const CAP: CookPalette = { raw: "#9a6440", perfect: "#6a4026", charred: "#26170e" };
const RIM: CookPalette = { raw: "#c4946a", perfect: "#8e5c36", charred: "#33200f" };
const FLESH: CookPalette = { raw: "#f3e6cf", perfect: "#dcb57c", charred: "#4a3220" };
const cap = computed(() => cookColor(CAP, props.d));
const rim = computed(() => cookColor(RIM, props.d));
const flesh = computed(() => cookColor(FLESH, props.d));

const SHAPE = "M50 5C75 4 95 24 95 50C95 76 75 95 50 95C25 95 5 76 5 50C5 24 25 6 50 5Z";
// 香菇上的十字花刀
const CUT = "M50 25C53.5 38 53.5 62 50 75C46.5 62 46.5 38 50 25Z";
const SPOTS: [number, number, number][] = [[28, 30, 2.2], [72, 28, 1.8], [24, 64, 1.6], [70, 72, 2], [40, 82, 1.4], [82, 50, 1.5]];
</script>

<template>
	<svg
		viewBox="0 0 100 100"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path :d="SHAPE" :fill="cap" />
		<g :clip-path="`url(#${id})`">
			<path :d="SHAPE" fill="none" :stroke="rim" stroke-width="10" />
			<g :fill="rim">
				<circle v-for="(s, i) in SPOTS" :key="i" :cx="s[0]" :cy="s[1]" :r="s[2]" />
			</g>
			<g :fill="flesh">
				<path :d="CUT" transform="rotate(45 50 50)" />
				<path :d="CUT" transform="rotate(-45 50 50)" />
			</g>
			<ellipse cx="34" cy="22" rx="14" ry="5" transform="rotate(-30 34 22)" fill="#fff" opacity="0.2" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5.5" stroke-linecap="round">
				<path d="M-20 110L30 -10M4 110L54 -10M28 110L78 -10M52 110L102 -10M76 110L126 -10" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="100" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M22 36C28 24 38 16 50 14" stroke-width="4" />
					<path d="M74 70C70 76 64 81 58 83" stroke-width="2.6" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
