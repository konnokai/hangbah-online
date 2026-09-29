<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const SKIN: CookPalette = { raw: "#e46a6a", perfect: "#b8322e", charred: "#3d1512" };
const SHINE: CookPalette = { raw: "#f5a39c", perfect: "#e0645a", charred: "#6a2a22" };
const FAT: CookPalette = { raw: "#f7cfc6", perfect: "#e8977c", charred: "#5a2a1c" };
const TIE: CookPalette = { raw: "#c24e4e", perfect: "#8a2420", charred: "#2a0f0c" };
const skin = computed(() => cookColor(SKIN, props.d));
const shine = computed(() => cookColor(SHINE, props.d));
const fat = computed(() => cookColor(FAT, props.d));
const tie = computed(() => cookColor(TIE, props.d));

const SHAPE = "M18 4H82C90 4 95 10 95 17C95 24 90 30 82 30H18C10 30 5 24 5 17C5 10 10 4 18 4Z";
// 肥肉丁的位置固定，才不會每次重繪都跳動
const SPECKS: [number, number, number][] = [
	[20, 20, 1.6], [31, 13, 1.3], [40, 23, 1.8], [52, 15, 1.4],
	[61, 23, 1.5], [70, 12, 1.2], [79, 21, 1.7], [88, 15, 1.2], [13, 13, 1.1],
];
</script>

<template>
	<svg
		viewBox="0 0 100 34"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<g :fill="tie" stroke="#000" stroke-opacity="0.38" stroke-width="1.4">
			<ellipse cx="3.2" cy="17" rx="2.6" ry="3.2" />
			<ellipse cx="96.8" cy="17" rx="2.6" ry="3.2" />
		</g>
		<path :d="SHAPE" :fill="skin" />
		<g :clip-path="`url(#${id})`">
			<g :fill="fat">
				<ellipse v-for="(s, i) in SPECKS" :key="i" :cx="s[0]" :cy="s[1]" :rx="s[2]" :ry="s[2] * 0.8" />
			</g>
			<path d="M4 29C30 33 70 33 96 29V36H4Z" fill="#000" opacity="0.14" />
			<path d="M16 9.5H80" :stroke="shine" stroke-width="4" stroke-linecap="round" />
			<path d="M20 9H50" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.4" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="4.5" stroke-linecap="round">
				<path d="M8 40L28 -6M30 40L50 -6M52 40L72 -6M74 40L94 -6" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="34" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M22 10C40 8 60 8 76 10" stroke-width="3" />
					<path d="M60 25H80" stroke-width="2" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
