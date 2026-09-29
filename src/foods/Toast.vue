<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const CRUMB: CookPalette = { raw: "#f3e2bf", perfect: "#d99a48", charred: "#3b2616" };
const CRUST: CookPalette = { raw: "#d9a867", perfect: "#a8672a", charred: "#2e1d10" };
const HOLE: CookPalette = { raw: "#e4cc9e", perfect: "#bf8038", charred: "#2e1d10" };
const crumb = computed(() => cookColor(CRUMB, props.d));
const crust = computed(() => cookColor(CRUST, props.d));
const hole = computed(() => cookColor(HOLE, props.d));

const SHAPE =
	"M14 32C5 30 3 20 8 13C14 5 30 3 50 3C70 3 86 5 92 13C97 20 95 30 86 32V86C86 91 82 94 77 94H23C18 94 14 91 14 86Z";
const INNER =
	"M20 36C12 34 10 25 14 19C19 12 32 9.5 50 9.5C68 9.5 81 12 86 19C90 25 88 34 80 36V84C80 87 78 88.5 75 88.5H25C22 88.5 20 87 20 84Z";
const HOLES: [number, number, number][] = [[32, 30, 1.6], [62, 24, 1.3], [44, 52, 1.8], [68, 60, 1.4], [30, 72, 1.3], [56, 80, 1.6], [74, 40, 1.1]];
</script>

<template>
	<svg
		viewBox="0 0 100 97"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path :d="SHAPE" :fill="crust" />
		<g :clip-path="`url(#${id})`">
			<path :d="INNER" :fill="crumb" />
			<g :fill="hole">
				<ellipse v-for="(h, i) in HOLES" :key="i" :cx="h[0]" :cy="h[1]" :rx="h[2] * 1.4" :ry="h[2]" />
			</g>
			<ellipse cx="36" cy="20" rx="16" ry="4" transform="rotate(-8 36 20)" fill="#fff" opacity="0.26" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5.5" stroke-linecap="round">
				<path d="M-20 106L30 -8M4 106L54 -8M28 106L78 -8M52 106L102 -8M76 106L126 -8" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="97" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M22 22C32 16 46 14 60 15" stroke-width="4" />
					<path d="M70 72C71 78 70 82 66 86" stroke-width="2.6" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
