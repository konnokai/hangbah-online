<script setup lang="ts">
import { computed, useId } from "vue";
import { cookColor, markOpacity, type CookPalette } from "./palette";

const props = defineProps<{ d: number; sauced: boolean }>();
const id = useId();

const LEAN: CookPalette = { raw: "#e7837a", perfect: "#9a5530", charred: "#3a2216" };
const FAT: CookPalette = { raw: "#f8e4db", perfect: "#e2b47e", charred: "#5a3a22" };
const lean = computed(() => cookColor(LEAN, props.d));
const fat = computed(() => cookColor(FAT, props.d));

const SHAPE =
	"M9 31C7 17 20 7 38 8C52 9 62 5 76 8C91 11 97 25 93 40C90 55 79 66 61 65C46 64 37 69 23 64C11 60 10 45 9 31Z";
</script>

<template>
	<svg
		viewBox="0 0 100 72"
		width="100%"
		height="100%"
		preserveAspectRatio="xMidYMid meet"
		style="display: block; overflow: visible"
		aria-hidden="true"
	>
		<defs>
			<clipPath :id="id"><path :d="SHAPE" /></clipPath>
		</defs>
		<path :d="SHAPE" :fill="lean" />
		<g :clip-path="`url(#${id})`">
			<path d="M7 38C4 16 20 5 38 6C52 7 62 3 77 6C90 9 96 18 96 28" fill="none" :stroke="fat" stroke-width="13" />
			<g fill="none" :stroke="fat" stroke-linecap="round">
				<path d="M24 24C34 30 42 25 52 31C60 36 70 33 81 38" stroke-width="2.6" />
				<path d="M20 47C30 42 38 51 48 47" stroke-width="2" />
				<path d="M60 52C68 47 76 53 85 48" stroke-width="1.8" />
			</g>
			<ellipse cx="36" cy="10.5" rx="14" ry="2.4" transform="rotate(-4 36 10.5)" fill="#fff" opacity="0.4" />
			<g :opacity="markOpacity(d)" stroke="#2a160b" stroke-width="5" stroke-linecap="round">
				<path d="M-10 80L34 -8M12 80L56 -8M34 80L78 -8M56 80L100 -8M78 80L122 -8" />
			</g>
			<g v-if="sauced">
				<rect width="100" height="72" fill="#6b1f0e" opacity="0.45" />
				<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.35">
					<path d="M24 20C38 15 54 16 70 13" stroke-width="3.5" />
					<path d="M62 56C70 54 77 51 83 46" stroke-width="2.5" />
				</g>
			</g>
		</g>
		<path :d="SHAPE" fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="1.8" stroke-linejoin="round" />
	</svg>
</template>
