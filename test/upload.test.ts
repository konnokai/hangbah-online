import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { customFoodId, customFoodUrl, type CustomFood } from "../shared/game";
import { LIMITS } from "../shared/limits";
import { sniffImage } from "../server/upload";
import { Client, call, createRoom } from "./helpers";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const bytes = (...parts: (number[] | string)[]) =>
	new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const pad = (b: Uint8Array, n = 64) => {
	const out = new Uint8Array(b.length + n);
	out.set(b);
	return out;
};

const png = (w: number, h: number) =>
	pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(w), be32(h), [8, 6, 0, 0, 0]));
const jpeg = (w: number, h: number) =>
	pad(bytes([0xff, 0xd8], [0xff, 0xe0, 0, 16], "JFIF\0", new Array(9).fill(0), [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3]));
const webpVp8x = (w: number, h: number) => pad(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1)));
const webpVp8 = (w: number, h: number) =>
	pad(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(w), le16(h)));
const webpVp8l = (w: number, h: number) => {
	const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
	return pad(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]));
};

describe("圖片格式判斷", () => {
	it("讀得出 PNG / JPEG / WebP 的寬高", () => {
		expect(sniffImage(png(300, 200))).toMatchObject({ ext: "png", width: 300, height: 200 });
		expect(sniffImage(jpeg(256, 128))).toMatchObject({ ext: "jpg", width: 256, height: 128 });
		expect(sniffImage(webpVp8x(512, 300))).toMatchObject({ ext: "webp", width: 512, height: 300 });
		expect(sniffImage(webpVp8(100, 90))).toMatchObject({ ext: "webp", width: 100, height: 90 });
		expect(sniffImage(webpVp8l(64, 48))).toMatchObject({ ext: "webp", width: 64, height: 48 });
	});

	it("SVG、GIF、亂碼都不收", () => {
		expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
		expect(sniffImage(pad(bytes("GIF89a", le16(10), le16(10))))).toBeNull();
		expect(sniffImage(new Uint8Array(100))).toBeNull();
		expect(sniffImage(bytes([0xff, 0xd8, 0x00]))).toBeNull();
	});
});

async function joinWithToken(code: string) {
	const c = await Client.connect(code, "阿明");
	const w = await c.next("welcome");
	return { c, token: w.uploadToken };
}

const upload = (code: string, token: string, body: BodyInit, name = "蝦子") =>
	call(`/api/rooms/${code}/foods`, {
		method: "POST",
		headers: { "X-Upload-Token": token, "X-Food-Name": encodeURIComponent(name), "Content-Type": "image/webp" },
		body,
	});

describe("上傳自訂食材", () => {
	it("正常圖片存進 R2、廣播給房間、讀得回來、可以放上烤架", async () => {
		const code = await createRoom();
		const { c, token } = await joinWithToken(code);
		const b = await Client.connect(code, "小美");
		await b.next("welcome");

		const img = webpVp8x(256, 256);
		const res = await upload(code, token, img, "  烤蝦  ");
		expect(res.status).toBe(201);
		const food = (await res.json()) as CustomFood;
		expect(food.name).toBe("烤蝦");
		expect((await b.next("customFood")).food.id).toBe(food.id);

		const got = await call(customFoodUrl(code, food));
		expect(got.status).toBe(200);
		expect(got.headers.get("Content-Type")).toBe("image/webp");
		expect(got.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(new Uint8Array(await got.arrayBuffer())).toEqual(img);

		b.send({ t: "spawn", foodId: customFoodId(food.id), x: 0.5, y: 0.5 });
		expect((await c.next("item", (m) => m.action === "spawn")).item.foodId).toBe(`c:${food.id}`);
		c.close();
		b.close();
	});

	it("沒有 token 或 token 錯誤就拒絕", async () => {
		const code = await createRoom();
		expect((await upload(code, "", png(10, 10))).status).toBe(403);
		expect((await upload(code, crypto.randomUUID(), png(10, 10))).status).toBe(403);
	});

	it("超過 512 KB、超過 512px、不支援的格式都拒絕", async () => {
		const code = await createRoom();
		const { c, token } = await joinWithToken(code);
		const big = new Uint8Array(LIMITS.uploadMaxBytes + 1);
		big.set(png(10, 10));
		expect((await upload(code, token, big)).status).toBe(413);
		expect((await upload(code, token, png(600, 100))).status).toBe(422);
		expect((await upload(code, token, jpeg(100, 513))).status).toBe(422);
		expect((await upload(code, token, new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
		expect((await upload(code, token, pad(bytes("GIF89a")))).status).toBe(415);
		c.close();
	});

	it("每人每分鐘最多 5 次", async () => {
		const code = await createRoom();
		const { c, token } = await joinWithToken(code);
		for (let i = 0; i < LIMITS.uploadsPerMinute; i++) {
			expect((await upload(code, token, png(10, 10))).status).toBe(201);
		}
		expect((await upload(code, token, png(10, 10))).status).toBe(429);
		c.close();
	});

	describe("滿了自動移除最舊的", () => {
		// 直接塞滿資料表；created_at 依序遞增，ids[0] 最舊
		async function fill(code: string, inUse: (i: number) => boolean = () => false) {
			const ids = Array.from({ length: LIMITS.maxCustomFoods }, () => crypto.randomUUID());
			await runInDurableObject(env.ROOMS.getByName(code), (_o, state) => {
				ids.forEach((id, i) => {
					state.storage.sql.exec(
						"INSERT INTO custom_foods (id, name, ext, uploaded_by, created_at) VALUES (?, ?, 'png', 'someone', ?)",
						id, `食材${i}`, i + 1,
					);
					if (inUse(i)) {
						state.storage.sql.exec(
							"INSERT INTO items (id, food_id, x, y, rot, down, acc0, acc1, since, held_by, sauced, created_at) VALUES (?, ?, 0.01, 0.01, 0, 0, 0, 0, NULL, NULL, 0, 0)",
							`item-${i}`, customFoodId(id),
						);
					}
				});
			});
			return ids;
		}

		const countFoods = (code: string) =>
			runInDurableObject(env.ROOMS.getByName(code), (_o, state) =>
				state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM custom_foods").one().n,
			);

		it("滿了還能上傳，移除最舊的那種，圖片也從 R2 刪掉", async () => {
			const code = await createRoom();
			const ids = await fill(code);
			const oldest = { id: ids[0]!, ext: "png" as const };
			await env.IMAGES.put(`rooms/${code}/foods/${oldest.id}.png`, png(10, 10));
			const { c, token } = await joinWithToken(code);

			const res = await upload(code, token, png(10, 10));
			expect(res.status).toBe(201);
			const food = (await res.json()) as CustomFood;
			expect((await c.next("customFoodRemoved")).id).toBe(oldest.id);
			expect((await c.next("customFood")).food.id).toBe(food.id);
			expect(await countFoods(code)).toBe(LIMITS.maxCustomFoods);
			expect((await call(customFoodUrl(code, oldest))).status).toBe(404);
			c.close();
		});

		it("最舊的那種還在烤架上，改移除沒在用的裡面最舊的", async () => {
			const code = await createRoom();
			const ids = await fill(code, (i) => i === 0);
			const { c, token } = await joinWithToken(code);

			expect((await upload(code, token, png(10, 10))).status).toBe(201);
			expect((await c.next("customFoodRemoved")).id).toBe(ids[1]);
			expect(c.msgs.some((m) => m.t === "remove")).toBe(false);
			c.close();
		});

		it("全部都在用，就移除最舊的，連它的烤架食材一起拿掉", async () => {
			const code = await createRoom();
			const ids = await fill(code, () => true);
			const { c, token } = await joinWithToken(code);

			expect((await upload(code, token, png(10, 10))).status).toBe(201);
			expect(await c.next("remove")).toMatchObject({ id: "item-0", reason: "evicted" });
			expect((await c.next("customFoodRemoved")).id).toBe(ids[0]);
			const left = await runInDurableObject(env.ROOMS.getByName(code), (_o, state) =>
				state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE food_id = ?", customFoodId(ids[0]!)).one().n,
			);
			expect(left).toBe(0);
			c.close();
		});
	});

	describe("難度", () => {
		const uploadWith = (code: string, token: string, difficulty?: string) =>
			call(`/api/rooms/${code}/foods`, {
				method: "POST",
				headers: {
					"X-Upload-Token": token,
					"X-Food-Name": encodeURIComponent("蝦子"),
					"Content-Type": "image/webp",
					...(difficulty === undefined ? {} : { "X-Food-Difficulty": difficulty }),
				},
				body: png(10, 10),
			});

		it("上傳時選的難度會存起來、廣播出去，重新連線也讀得到", async () => {
			const code = await createRoom();
			const { c, token } = await joinWithToken(code);
			const res = await uploadWith(code, token, "hard");
			expect(res.status).toBe(201);
			const food = (await res.json()) as CustomFood;
			expect(food.difficulty).toBe("hard");
			expect((await c.next("customFood")).food.difficulty).toBe("hard");

			const again = await Client.connect(code, "小美");
			const w = await again.next("welcome");
			expect(w.customFoods.find((f) => f.id === food.id)?.difficulty).toBe("hard");
			c.close();
			again.close();
		});

		it("沒帶或亂填就當普通", async () => {
			const code = await createRoom();
			const { c, token } = await joinWithToken(code);
			expect(((await (await uploadWith(code, token)).json()) as CustomFood).difficulty).toBe("normal");
			expect(((await (await uploadWith(code, token, "extreme")).json()) as CustomFood).difficulty).toBe("normal");
			c.close();
		});

		it("加難度之前建的房間會補上欄位，舊食材變成普通，重跑也不會出錯", async () => {
			const code = await createRoom();
			const id = crypto.randomUUID();
			await runInDurableObject(env.ROOMS.getByName(code), (o, state) => {
				// 還原成沒有難度欄位的舊資料表，塞一筆舊食材
				state.storage.sql.exec("ALTER TABLE custom_foods DROP COLUMN difficulty");
				state.storage.sql.exec(
					"INSERT INTO custom_foods (id, name, ext, uploaded_by, created_at) VALUES (?, '舊食材', 'png', 'someone', 1)",
					id,
				);
				const migrate = () => (o as unknown as { migrate(): void }).migrate();
				migrate();
				migrate();
			});
			const c = await Client.connect(code, "阿明");
			const w = await c.next("welcome");
			expect(w.customFoods.find((f) => f.id === id)?.difficulty).toBe("normal");
			c.close();
		});
	});

	it("圖片網址格式不對就 404", async () => {
		const code = await createRoom();
		expect((await call(`/api/img/${code}/../../secret.png`)).status).toBe(404);
		expect((await call(`/api/img/${code}/${crypto.randomUUID()}.svg`)).status).toBe(404);
		expect((await call(`/api/img/${code}/${crypto.randomUUID()}.webp`)).status).toBe(404);
	});
});
