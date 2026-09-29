import { describe, expect, it } from "vitest";
import { buildPreview, countComponents, embedBytes, rewriteRoomHtml } from "../server/preview";
import type { RoomPreview } from "../shared/protocol";
import { Client, call, createRoom } from "./helpers";

const ORIGIN = "https://bbq.test";
const ALLOWED = new Set([1, 2, 9, 10, 11, 12, 14, 17]);

function allTypes(node: unknown, out: number[] = []): number[] {
	if (Array.isArray(node)) node.forEach((n) => allTypes(n, out));
	else if (node && typeof node === "object") {
		const o = node as Record<string, unknown>;
		if (typeof o.type === "number") out.push(o.type);
		Object.values(o).forEach((v) => allTypes(v, out));
	}
	return out;
}

function buttons(node: unknown, out: Record<string, unknown>[] = []) {
	if (Array.isArray(node)) node.forEach((n) => buttons(n, out));
	else if (node && typeof node === "object") {
		const o = node as Record<string, unknown>;
		if (o.type === 2) out.push(o);
		Object.values(o).forEach((v) => buttons(v, out));
	}
	return out;
}

function assertSpec(embed: { component: Record<string, unknown> }) {
	expect(embed.component.type).toBe(17);
	expect(embedBytes(embed)).toBeLessThanOrEqual(3000);
	expect(countComponents(embed.component)).toBeLessThanOrEqual(40);
	for (const t of allTypes(embed.component)) expect(ALLOWED.has(t)).toBe(true);
	for (const b of buttons(embed.component)) {
		expect(b.style).toBe(5);
		expect(Object.keys(b).every((k) => ["type", "url", "style", "label", "emoji", "disabled"].includes(k))).toBe(true);
	}
}

const base: RoomPreview = {
	exists: true,
	code: "ABC234",
	host: "阿明",
	online: ["阿明", "小美"],
	itemsOnGrill: 12,
	top: { name: "小美", score: 120 },
};

const baseHtml = () =>
	new Response(
		`<!doctype html><html><head><title>x</title><meta property="og:title" content="default"><meta name="twitter:card" content="summary"></head><body><div id="app"></div></body></html>`,
		{ headers: { "Content-Type": "text/html", ETag: '"abc"' } },
	);

describe("Discord component embed", () => {
	it("符合規格：根是 Container、只用允許的元件、按鈕是 link style、大小在限制內", () => {
		const meta = buildPreview(base, ORIGIN);
		assertSpec(meta.embed);
		const json = JSON.stringify(meta.embed);
		expect(json).toContain("阿明的烤肉場");
		expect(json).toContain(`${ORIGIN}/r/ABC234`);
		// 使用者上傳的圖不放進站外預覽
		expect(allTypes(meta.embed.component)).not.toContain(12);
		expect(json).not.toContain("/api/img/");
	});

	it("玩家很多、名字很長時自動拿掉內容，不超過 3000 bytes", () => {
		const many = { ...base, online: Array.from({ length: 20 }, (_, i) => `超級無敵長的暱稱${i}號🍖🍖🍖`) };
		const meta = buildPreview(many, ORIGIN);
		assertSpec(meta.embed);
	});

	it("收攤的房間顯示收攤內容", () => {
		const meta = buildPreview({ ...base, exists: false }, ORIGIN);
		assertSpec(meta.embed);
		expect(meta.title).toContain("收攤");
		expect(JSON.stringify(meta.embed)).toContain("開新烤肉場");
	});

	it("暱稱是 markdown 語法時會被跳脫", () => {
		const meta = buildPreview({ ...base, host: "**[點我](https://evil.test)**" }, ORIGIN);
		const json = JSON.stringify(meta.embed);
		expect(json).not.toContain("[點我](https://evil.test)");
	});
});

describe("HTML 改寫", () => {
	it("放入 OG 標籤和 discord:component-embed，移除預設標籤", async () => {
		const res = rewriteRoomHtml(baseHtml(), buildPreview(base, ORIGIN));
		expect(res.headers.get("Cache-Control")).toBe("no-cache");
		expect(res.headers.get("ETag")).toBeNull();
		const html = await res.text();
		expect(html).toContain('<script id="discord:component-embed" type="application/json">');
		expect(html).toContain('<meta property="og:title" content="阿明的烤肉場 🔥">');
		expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og.png">`);
		expect(html).not.toContain('content="default"');
		expect(html).not.toContain('content="summary"');
		expect(html).toContain("<title>阿明的烤肉場 🔥 | 夯肉</title>");
	});

	it("惡意暱稱不會跳出 <script> 或屬性", async () => {
		const evil = `</script><img src=x onerror=alert(1)>"'`;
		const res = rewriteRoomHtml(baseHtml(), buildPreview({ ...base, host: evil, online: [evil] }, ORIGIN));
		const html = await res.text();
		expect(html).not.toContain("<img src=x");
		const script = html.match(/<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/);
		expect(script).not.toBeNull();
		// 整段 JSON 都在 script 裡，而且解析得回來
		const parsed = JSON.parse(script![1]!);
		expect(parsed.component.type).toBe(17);
		expect(JSON.stringify(parsed)).toContain("onerror");
	});
});

describe("GET /r/:room", () => {
	it("回傳帶有房間資訊的 HTML", async () => {
		const code = await createRoom("阿華");
		const c = await Client.connect(code, "阿華");
		await c.next("welcome");
		const res = await call(`/r/${code}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" } });
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("discord:component-embed");
		expect(html).toContain("阿華的烤肉場");
		expect(html).toContain("👥 **1** 人在烤");
		expect(html).toContain('content="1 人正在烤');
		c.close();
	});

	it("不存在的房號顯示收攤", async () => {
		const res = await call("/r/ZZZZZ3");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("這個烤肉場已經收攤了");
	});
});
