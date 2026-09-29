import { LIMITS } from "./limits";

/** 內建食材。cookTime = 在烤架中心、火力 1 時，朝下那面從生烤到「剛好」上限需要的秒數。 */
export interface FoodDef {
	id: string;
	name: string;
	cookTime: number;
	points: number;
	/** 顯示寬度，單位是桌面寬度的比例 */
	width: number;
}

export const BUILTIN_FOODS: readonly FoodDef[] = [
	{ id: "meat", name: "肉片", cookTime: 35, points: 1.5, width: 0.1 },
	{ id: "sausage", name: "香腸", cookTime: 45, points: 1.4, width: 0.12 },
	{ id: "corn", name: "玉米", cookTime: 60, points: 1.2, width: 0.12 },
	{ id: "tempura", name: "甜不辣", cookTime: 30, points: 1, width: 0.085 },
	{ id: "mushroom", name: "香菇", cookTime: 25, points: 1, width: 0.066 },
	{ id: "pepper", name: "青椒", cookTime: 25, points: 1, width: 0.085 },
	{ id: "bloodcake", name: "米血", cookTime: 40, points: 1.2, width: 0.072 },
	{ id: "wing", name: "雞翅", cookTime: 55, points: 1.6, width: 0.096 },
	{ id: "toast", name: "吐司", cookTime: 20, points: 0.8, width: 0.085 },
];

export const CUSTOM_FOOD_DEFAULTS = { cookTime: 40, points: 1, width: 0.09 };

export interface CustomFood {
	id: string;
	name: string;
	ext: "png" | "jpg" | "webp";
	uploadedBy: string;
}

export const customFoodId = (id: string) => `c:${id}`;

export function customFoodUrl(code: string, food: Pick<CustomFood, "id" | "ext">) {
	return `/api/img/${code}/${food.id}.${food.ext}`;
}

/** 找食材定義。自訂食材的 id 是 `c:<uuid>`。 */
export function resolveFood(foodId: string, customs: readonly CustomFood[]): FoodDef | null {
	if (foodId.startsWith("c:")) {
		const custom = customs.find((c) => customFoodId(c.id) === foodId);
		return custom ? { id: foodId, name: custom.name, ...CUSTOM_FOOD_DEFAULTS } : null;
	}
	return BUILTIN_FOODS.find((f) => f.id === foodId) ?? null;
}

// 熟度門檻。0 = 生，PERFECT_MIN–PERFECT_MAX = 剛好，超過 BURN 就燒毀。
export const PERFECT_MIN = 0.7;
export const PERFECT_MAX = 1.0;
export const BURN = 1.5;
export const BURN_WARNING = 1.3;
// 朝上那面只吃到一點餘熱
export const UP_SIDE_FACTOR = 0.1;

export type Stage = "raw" | "perfect" | "charred" | "burnt";

export function stageOf(d: number): Stage {
	if (d < PERFECT_MIN) return "raw";
	if (d <= PERFECT_MAX) return "perfect";
	if (d < BURN) return "charred";
	return "burnt";
}

/** 桌面座標 (0–1) 裡的烤架範圍。桌面比例固定 16:10。 */
export const TABLE_ASPECT = 16 / 10;
export const GRILL = { x0: 0.12, y0: 0.1, x1: 0.88, y1: 0.9 } as const;

export function onGrill(x: number, y: number) {
	return x >= GRILL.x0 && x <= GRILL.x1 && y >= GRILL.y0 && y <= GRILL.y1;
}

/** 火力：中間 1.2、邊緣 0.5，烤架外是 0。 */
export function heatAt(x: number, y: number) {
	if (!onGrill(x, y)) return 0;
	const u = (x - (GRILL.x0 + GRILL.x1) / 2) / ((GRILL.x1 - GRILL.x0) / 2);
	const v = (y - (GRILL.y0 + GRILL.y1) / 2) / ((GRILL.y1 - GRILL.y0) / 2);
	const r2 = Math.min(1, u * u + v * v);
	return 0.5 + 0.7 * (1 - r2);
}

export interface GrillItem {
	id: string;
	foodId: string;
	x: number;
	y: number;
	rot: number;
	/** 朝下（正在烤）的是哪一面 */
	down: 0 | 1;
	/** 兩面已結算的熟度 */
	acc: [number, number];
	/** 開始在目前位置加熱的時間（ms）。不在烤架上或被夾著時是 null */
	since: number | null;
	heldBy: string | null;
	sauced: boolean;
}

/** 每秒熟度增加量，index 對應面。 */
export function ratesOf(item: GrillItem, food: FoodDef, heatScale: number): [number, number] {
	if (item.since === null) return [0, 0];
	const down = (heatAt(item.x, item.y) * heatScale) / food.cookTime;
	const up = down * UP_SIDE_FACTOR;
	return item.down === 0 ? [down, up] : [up, down];
}

export function donenessAt(item: GrillItem, food: FoodDef, now: number, heatScale: number): [number, number] {
	if (item.since === null) return [item.acc[0], item.acc[1]];
	const dt = Math.max(0, now - item.since) / 1000;
	const [r0, r1] = ratesOf(item, food, heatScale);
	return [item.acc[0] + r0 * dt, item.acc[1] + r1 * dt];
}

/** 把到 now 為止的加熱結算進 acc，並依位置決定要不要繼續加熱。會直接改 item。 */
export function settle(item: GrillItem, food: FoodDef, now: number, heatScale: number) {
	item.acc = donenessAt(item, food, now, heatScale);
	item.since = item.heldBy === null && onGrill(item.x, item.y) ? now : null;
}

/** 算出哪個時間點會有一面到達燒毀門檻。不會燒毀就回傳 null。 */
export function burnAt(item: GrillItem, food: FoodDef, heatScale: number): number | null {
	if (item.since === null) return null;
	const rates = ratesOf(item, food, heatScale);
	let best: number | null = null;
	for (const side of [0, 1] as const) {
		const rate = rates[side];
		const left = BURN - item.acc[side];
		let t: number | null = null;
		if (left <= 0) t = item.since;
		else if (rate > 0) t = item.since + (left / rate) * 1000;
		if (t !== null && (best === null || t < best)) best = t;
	}
	return best;
}

function sideScore(d: number) {
	if (d < 0.3) return -3;
	if (d < PERFECT_MIN) return 2;
	if (d <= PERFECT_MAX) return 10;
	if (d < 1.25) return 4;
	return -2;
}

/** 兩面都剛好。client 用來播「完美」音效，server 用來記統計。 */
export function isPerfect(doneness: readonly [number, number]) {
	return doneness.every((v) => stageOf(v) === "perfect");
}

export function scoreOf(doneness: [number, number], food: FoodDef, sauced: boolean) {
	const [a, b] = doneness;
	const perfectA = stageOf(a) === "perfect";
	const perfectB = stageOf(b) === "perfect";
	let score = sideScore(a) + sideScore(b);
	if (perfectA && perfectB) score += 6;
	let mult = food.points;
	if (sauced && (perfectA || perfectB)) mult *= 1.25;
	return Math.round(score * mult);
}

/** 去掉控制字元、頭尾空白，並依 code point 截斷長度。 */
export function cleanText(input: unknown, max: number): string {
	if (typeof input !== "string") return "";
	const cleaned = Array.from(input)
		.filter((ch) => !isInvisible(ch.codePointAt(0)!))
		.join("")
		.trim();
	return Array.from(cleaned).slice(0, max).join("");
}

// 控制字元、零寬字元、雙向文字控制字元，可以拿來做假暱稱或破壞排版
function isInvisible(c: number) {
	return (
		c <= 0x1f ||
		(c >= 0x7f && c <= 0x9f) ||
		(c >= 0x200b && c <= 0x200f) ||
		(c >= 0x2028 && c <= 0x202e) ||
		(c >= 0x2066 && c <= 0x2069) ||
		c === 0xfeff
	);
}

export const cleanNickname = (s: unknown) => cleanText(s, LIMITS.nicknameMax);

export const EMOTES = ["🔥", "😋", "🍖", "👍", "😂", "🥵", "🍻", "😱"] as const;

export const PLAYER_COLORS = [
	"#ff7a45", "#ffc53d", "#73d13d", "#36cfc9", "#40a9ff",
	"#9254de", "#f759ab", "#ff4d4f", "#bae637", "#ffa940",
] as const;
