<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const BODY: CookPalette = { raw: "#6a4656", perfect: "#4a2e3a", charred: "#1f1418" };
const GRAIN: CookPalette = { raw: "#a07c8c", perfect: "#7a5866", charred: "#34242b" };
const body = computed(() => cookColor(BODY, props.d));
const grain = computed(() => cookColor(GRAIN, props.d));

const SHAPE = "M28 5H90C94 5 96 7 96 11V33C96 37 94 39 90 39H28C24 39 22 37 22 33V11C22 7 24 5 28 5Z";
// 米粒位置寫死，重繪時才不會閃
const GRAINS: [number, number, number][] = [
	[30, 12, 20], [42, 20, -30], [36, 31, 60], [52, 11, -10], [58, 27, 40], [66, 17, -50],
	[72, 33, 15], [80, 12, 70], [86, 25, -20], [48, 34, -60], [90, 34, 30], [28, 24, -40],
];
</script>

<template>
	<svg
		viewBox="0 0 100 44"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path d="M1 22H24" stroke="#7a5a34" stroke-width="5.4" stroke-linecap="round" />
		<path d="M1 22H24" stroke="#d8b27a" stroke-width="3.4" stroke-linecap="round" />
		<path :d="SHAPE" :fill="body" />
		<g :clip-path="`url(#${id})`">
			<g :fill="grain">
				<ellipse
					v-for="(g, i) in GRAINS"
					:key="i"
					:cx="g[0]"
					:cy="g[1]"
					rx="2.6"
					ry="1.4"
					:transform="`rotate(${g[2]} ${g[0]} ${g[1]})`"
				/>
			</g>
			<rect x="22" y="5" width="74" height="6" fill="#fff" opacity="0.14" />
			<rect x="22" y="34" width="74" height="5" fill="#000" opacity="0.18" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="4.5" stroke-linecap="round">
				<path d="M22 50L42 -6M44 50L64 -6M66 50L86 -6M88 50L108 -6" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="44" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M32 10H80" stroke-width="3" />
					<path d="M64 32H86" stroke-width="2" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
