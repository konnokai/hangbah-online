<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const BODY: CookPalette = { raw: "#f0d7a8", perfect: "#d39a52", charred: "#4a2e17" };
const PIT: CookPalette = { raw: "#dcb882", perfect: "#a96c32", charred: "#2e1c0e" };
const body = computed(() => cookColor(BODY, props.d));
const pit = computed(() => cookColor(PIT, props.d));

const SHAPE =
	"M14 8C34 5 66 5 86 8C94 9 96 16 96 28C96 40 94 47 86 48C66 51 34 51 14 48C6 47 4 40 4 28C4 16 6 9 14 8Z";
const PITS: [number, number, number][] = [
	[20, 38, 1.6], [34, 16, 1.2], [47, 40, 1.4], [62, 14, 1.5], [74, 36, 1.2], [86, 22, 1.3], [12, 22, 1.1],
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
		<path :d="SHAPE" :fill="body" />
		<g :clip-path="`url(#${id})`">
			<path d="M2 44C30 50 70 50 98 44V56H2Z" :fill="pit" opacity="0.55" />
			<g fill="none" :stroke="pit" stroke-width="2.2" stroke-linecap="round">
				<path d="M26 20L32 32M46 20L52 32M66 20L72 32" />
			</g>
			<g :fill="pit">
				<circle v-for="(p, i) in PITS" :key="i" :cx="p[0]" :cy="p[1]" :r="p[2]" />
			</g>
			<ellipse cx="30" cy="12.5" rx="16" ry="3" fill="#fff" opacity="0.28" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5" stroke-linecap="round">
				<path d="M4 62L30 -6M26 62L52 -6M48 62L74 -6M70 62L96 -6" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="56" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M18 14C36 11 56 11 74 13" stroke-width="3.2" />
					<path d="M58 42C66 42 74 41 82 39" stroke-width="2.2" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
