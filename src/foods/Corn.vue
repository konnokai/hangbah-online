<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const KERNEL: CookPalette = { raw: "#f7d758", perfect: "#eaa83c", charred: "#4a2c12" };
const COB: CookPalette = { raw: "#d9ad3a", perfect: "#a86a22", charred: "#2e1c0c" };
const kernel = computed(() => cookColor(KERNEL, props.d));
const cob = computed(() => cookColor(COB, props.d));

const SHAPE = "M16 6C40 2 72 4 90 10C98 13 98 27 90 30C72 36 40 38 16 34C9 32 9 8 16 6Z";
// 中間幾排比較高，看起來才像圓柱
const ROWS: [number, number][] = [[4.6, 3.4], [10, 5], [16.4, 5.8], [23.2, 5.8], [29.6, 5], [35, 3.4]];
const KERNELS = ROWS.flatMap(([cy, h], r) => {
	const out: { x: number; y: number; h: number }[] = [];
	for (let x = 12 + (r % 2) * 3.2; x < 96; x += 6.4) out.push({ x, y: cy - h / 2, h });
	return out;
});
</script>

<template>
	<svg
		viewBox="0 0 100 40"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path d="M1 20H14" stroke="#7a5a34" stroke-width="5.4" stroke-linecap="round" />
		<path d="M1 20H14" stroke="#d8b27a" stroke-width="3.4" stroke-linecap="round" />
		<path :d="SHAPE" :fill="cob" />
		<g :clip-path="`url(#${id})`">
			<g :fill="kernel">
				<rect v-for="(k, i) in KERNELS" :key="i" :x="k.x" :y="k.y" width="5.4" :height="k.h" rx="2" />
			</g>
			<path d="M8 3H96V9C72 5 40 4 8 8Z" fill="#fff" opacity="0.18" />
			<path d="M8 31C40 36 72 34 96 28V40H8Z" fill="#000" opacity="0.16" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="4.5" stroke-linecap="round">
				<path d="M14 46L34 -6M36 46L56 -6M58 46L78 -6M80 46L100 -6" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="40" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M24 10C44 7 64 8 82 12" stroke-width="3" />
					<path d="M50 30H74" stroke-width="2" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
