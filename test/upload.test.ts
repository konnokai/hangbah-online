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

	it("圖片網址格式不對就 404", async () => {
		const code = await createRoom();
		expect((await call(`/api/img/${code}/../../secret.png`)).status).toBe(404);
		expect((await call(`/api/img/${code}/${crypto.randomUUID()}.svg`)).status).toBe(404);
		expect((await call(`/api/img/${code}/${crypto.randomUUID()}.webp`)).status).toBe(404);
	});
});
