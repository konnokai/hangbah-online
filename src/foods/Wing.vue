<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const SKIN: CookPalette = { raw: "#f2d0b5", perfect: "#d08a3e", charred: "#3e2412" };
const PORE: CookPalette = { raw: "#e2b394", perfect: "#a8662a", charred: "#2a180c" };
const skin = computed(() => cookColor(SKIN, props.d));
const pore = computed(() => cookColor(PORE, props.d));

const SHAPE =
	"M14 17C28 11 44 17 58 15C64 14 70 11 78 8C86 5 94 3 97 5C98 8 92 12 86 16C80 20 74 25 71 31C69 40 64 46 56 48C44 51 28 47 16 49C8 50 3 42 3 33C3 25 7 20 14 17Z";
const PORES: [number, number][] = [
	[12, 28], [18, 38], [28, 24], [34, 36], [44, 26], [50, 38], [58, 26], [24, 44], [42, 44], [62, 38], [80, 12], [88, 8],
];
</script>

<template>
	<svg
		viewBox="0 0 100 56"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path :d="SHAPE" :fill="skin" />
		<g :clip-path="`url(#${id})`">
			<path d="M2 40C18 48 40 44 54 44C62 44 68 38 72 28L100 20V64H2Z" :fill="pore" opacity="0.45" />
			<path d="M62 16C67 23 68 32 66 40" fill="none" :stroke="pore" stroke-width="2.2" stroke-linecap="round" />
			<g :fill="pore">
				<circle v-for="(p, i) in PORES" :key="i" :cx="p[0]" :cy="p[1]" r="1.2" />
			</g>
			<path d="M14 23C26 18 40 22 54 21" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity="0.3" />
			<path d="M76 11C82 8 88 6 93 6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.26" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5" stroke-linecap="round">
				<path d="M0 62L26 -6M22 62L48 -6M44 62L70 -6M66 62L92 -6M88 62L114 -6" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="56" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M16 22C28 17 42 21 56 20C64 19 72 12 80 9" stroke-width="3.2" />
					<path d="M34 46C42 46 50 45 58 44" stroke-width="2.2" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
