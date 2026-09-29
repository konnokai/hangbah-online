import { describe, expect, it } from "vitest";
import {
	BUILTIN_FOODS,
	BURN,
	FOOD_DIFFICULTIES,
	GRILL,
	burnAt,
	cleanText,
	donenessAt,
	heatAt,
	isPerfect,
	onGrill,
	parseDifficulty,
	resolveFood,
	scoreOf,
	settle,
	stageOf,
	type GrillItem,
} from "../shared/game";

const meat = BUILTIN_FOODS.find((f) => f.id === "meat")!;
const cx = (GRILL.x0 + GRILL.x1) / 2;
const cy = (GRILL.y0 + GRILL.y1) / 2;

function item(over: Partial<GrillItem> = {}): GrillItem {
	return { id: "a", foodId: "meat", x: cx, y: cy, rot: 0, down: 0, acc: [0, 0], since: 0, heldBy: null, sauced: false, ...over };
}

describe("火力", () => {
	it("中間最大、邊緣較小、烤架外是 0", () => {
		expect(heatAt(cx, cy)).toBeCloseTo(1.2);
		expect(heatAt(GRILL.x0, cy)).toBeCloseTo(0.5);
		expect(heatAt(GRILL.x0 + 0.05, cy)).toBeLessThan(heatAt(cx, cy));
		expect(heatAt(0.02, 0.02)).toBe(0);
		expect(onGrill(0.02, 0.5)).toBe(false);
		expect(onGrill(cx, cy)).toBe(true);
	});
});

describe("熟度", () => {
	it("朝下的面烤得快，朝上的面只有餘熱", () => {
		const d = donenessAt(item(), meat, 10_000, 1);
		expect(d[0]).toBeCloseTo((1.2 * 10) / meat.cookTime);
		expect(d[1]).toBeCloseTo(d[0] * 0.1);
	});

	it("不在烤架上（since = null）就不會變熟", () => {
		expect(donenessAt(item({ since: null, acc: [0.4, 0.2] }), meat, 99_999, 1)).toEqual([0.4, 0.2]);
	});

	it("移動前先結算，移到烤架外就停止加熱", () => {
		const it1 = item();
		settle(it1, meat, 5_000, 1);
		expect(it1.acc[0]).toBeCloseTo((1.2 * 5) / meat.cookTime);
		expect(it1.since).toBe(5_000);
		// server 的順序：先用舊位置結算，再改位置、重新決定要不要加熱
		settle(it1, meat, 6_000, 1);
		it1.x = 0.02;
		settle(it1, meat, 6_000, 1);
		expect(it1.since).toBeNull();
		expect(donenessAt(it1, meat, 100_000, 1)[0]).toBeCloseTo((1.2 * 6) / meat.cookTime);
	});

	it("被夾著的時候不加熱", () => {
		const held = item({ heldBy: "p1" });
		settle(held, meat, 1_000, 1);
		expect(held.since).toBeNull();
	});

	it("燒毀時間用線性公式直接算出來", () => {
		const at = burnAt(item(), meat, 1)!;
		expect(at).toBeCloseTo(((BURN * meat.cookTime) / 1.2) * 1000);
		expect(donenessAt(item(), meat, at, 1)[0]).toBeCloseTo(BURN);
		expect(burnAt(item({ since: null }), meat, 1)).toBeNull();
		expect(burnAt(item({ acc: [BURN, 0], since: 123 }), meat, 1)).toBe(123);
	});

	it("火力倍率會讓時間等比例變短", () => {
		expect(burnAt(item(), meat, 10)!).toBeCloseTo(burnAt(item(), meat, 1)! / 10);
	});
});

describe("計分", () => {
	it("兩面剛好分數最高，刷醬有加成", () => {
		const perfect = scoreOf([0.85, 0.85], meat, false);
		expect(perfect).toBe(Math.round((10 + 10 + 6) * 1.5));
		expect(scoreOf([0.85, 0.85], meat, true)).toBeGreaterThan(perfect);
		expect(scoreOf([0.85, 0.5], meat, false)).toBeLessThan(perfect);
	});

	it("生的和焦的會扣分", () => {
		expect(scoreOf([0, 0], meat, false)).toBeLessThan(0);
		expect(scoreOf([1.4, 1.4], meat, false)).toBeLessThan(0);
	});

	it("階段判斷", () => {
		expect(stageOf(0.1)).toBe("raw");
		expect(stageOf(0.8)).toBe("perfect");
		expect(stageOf(1.2)).toBe("charred");
		expect(stageOf(1.5)).toBe("burnt");
	});

	it("完美要兩面都在剛好的範圍內，含邊界", () => {
		expect(isPerfect([0.7, 1.0])).toBe(true);
		expect(isPerfect([0.85, 0.69])).toBe(false);
		expect(isPerfect([1.01, 0.85])).toBe(false);
	});
});

describe("輸入清理", () => {
	it("去掉控制字元、零寬字元，並依字數截斷", () => {
		expect(cleanText("  阿​明\u0007 ", 16)).toBe("阿明");
		expect(cleanText("‮反轉", 16)).toBe("反轉");
		expect(cleanText("🍖🍖🍖🍖", 2)).toBe("🍖🍖");
		expect(cleanText(123, 5)).toBe("");
	});

	it("自訂食材要在房間清單裡才找得到", () => {
		const customs = [{ id: "x1", name: "蝦子", ext: "webp" as const, uploadedBy: "p", difficulty: "normal" as const }];
		expect(resolveFood("c:x1", customs)?.name).toBe("蝦子");
		expect(resolveFood("c:nope", customs)).toBeNull();
		expect(resolveFood("meat", [])?.name).toBe("肉片");
		expect(resolveFood("__proto__", [])).toBeNull();
	});

	it("自訂食材的烤熟時間和分數倍率跟著難度走", () => {
		const food = (difficulty: "easy" | "normal" | "hard") =>
			resolveFood("c:x1", [{ id: "x1", name: "蝦子", ext: "webp", uploadedBy: "p", difficulty }]);
		expect(food("easy")).toMatchObject({ cookTime: FOOD_DIFFICULTIES.easy.cookTime, points: FOOD_DIFFICULTIES.easy.points });
		expect(food("hard")).toMatchObject({ cookTime: FOOD_DIFFICULTIES.hard.cookTime, points: FOOD_DIFFICULTIES.hard.points });
		// 普通要等於加難度之前的固定值，舊食材才不會變
		expect(food("normal")).toMatchObject({ cookTime: 40, points: 1 });
		expect(food("easy")!.cookTime).toBeLessThan(food("hard")!.cookTime);
	});

	it("不認得的難度一律當普通", () => {
		expect(parseDifficulty("hard")).toBe("hard");
		expect(parseDifficulty("easy")).toBe("easy");
		for (const v of ["", "HARD", "extreme", null, undefined, 3, "__proto__"]) expect(parseDifficulty(v)).toBe("normal");
	});
});
