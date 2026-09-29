export interface CookPalette {
	raw: string;
	perfect: string;
	charred: string;
}

const BURNT = "#1a120d";

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
	const n = parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	const k = Math.min(1, Math.max(0, t));
	const c = ca.map((v, i) => Math.round(v + ((cb[i] ?? 0) - v) * k));
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function cookColor(p: CookPalette, d: number): string {
	if (!(d > 0)) return mix(p.raw, p.raw, 0);
	if (d <= 0.85) return mix(p.raw, p.perfect, d / 0.85);
	if (d <= 1.25) return mix(p.perfect, p.charred, (d - 0.85) / 0.4);
	return mix(p.charred, BURNT, (d - 1.25) / 0.25);
}

export function markOpacity(d: number): number {
	if (d <= 0.35) return 0;
	return Math.min(0.85, ((d - 0.35) / (1.1 - 0.35)) * 0.85);
}
