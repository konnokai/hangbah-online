<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const BODY: CookPalette = { raw: "#3fa34d", perfect: "#2f7a35", charred: "#1f2a17" };
const GROOVE: CookPalette = { raw: "#2a7a36", perfect: "#1f5626", charred: "#121a0e" };
const STEM: CookPalette = { raw: "#8aaa48", perfect: "#6e8a38", charred: "#3a4420" };
const body = computed(() => cookColor(BODY, props.d));
const groove = computed(() => cookColor(GROOVE, props.d));
const stem = computed(() => cookColor(STEM, props.d));
// 青椒表皮是一塊塊起泡焦黑，不是整片變色
const blister = computed(() => Math.min(0.75, Math.max(0, (props.d - 0.3) / 0.7) * 0.75));

const SHAPE =
	"M50 12C58 3 84 2 92 18C98 30 94 42 90 48C96 58 98 74 88 84C80 94 60 96 50 88C40 96 20 94 12 84C2 74 4 58 10 48C6 42 2 30 8 18C16 2 42 3 50 12Z";
const CALYX =
	"M50 38C53 38 55 42 58 42C62 43 62 47 61 50C62 53 61 57 57 58C55 60 53 62 50 62C47 62 45 60 43 58C39 57 38 53 39 50C38 47 38 43 42 42C45 42 47 38 50 38Z";
const BLISTERS: [number, number, number, number][] = [
	[28, 24, 6, 3], [74, 26, 5, 2.6], [78, 70, 6, 3], [26, 72, 5, 2.6], [68, 44, 3.4, 2], [36, 60, 3.6, 2],
];
</script>

<template>
	<svg
		viewBox="0 0 100 98"
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
			<g fill="none" :stroke="groove" stroke-width="3" stroke-linecap="round">
				<path d="M50 40C49 30 50 22 50 13M60 50C70 49 80 49 89 49M50 60C51 70 50 78 50 87M40 50C30 49 20 48 11 48" />
			</g>
			<g fill="#1c1a0e" :opacity="blister">
				<ellipse v-for="(b, i) in BLISTERS" :key="i" :cx="b[0]" :cy="b[1]" :rx="b[2]" :ry="b[3]" />
			</g>
			<path d="M16 32C18 22 26 14 36 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.3" />
			<path d="M64 12C72 10 80 13 84 18" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.24" />
			<path :d="CALYX" :fill="stem" stroke="#000" stroke-opacity="0.25" stroke-width="1.4" />
			<circle cx="50" cy="50" r="4.6" :fill="stem" stroke="#000" stroke-opacity="0.3" stroke-width="1.4" />
			<circle cx="49" cy="49" r="2" fill="#e6efc4" opacity="0.7" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5.5" stroke-linecap="round">
				<path d="M-20 110L30 -10M4 110L54 -10M28 110L78 -10M52 110L102 -10M76 110L126 -10" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="98" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M18 34C20 24 28 16 38 14" stroke-width="4" />
					<path d="M82 66C82 74 78 80 72 84" stroke-width="2.6" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
