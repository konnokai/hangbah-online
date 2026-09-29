import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GRILL } from "../shared/game";
import { LIMITS } from "../shared/limits";
import { Client, call, createRoom, sleep } from "./helpers";

const cx = (GRILL.x0 + GRILL.x1) / 2;
const cy = (GRILL.y0 + GRILL.y1) / 2;

describe("房間", () => {
	it("建立房間後查得到，亂打的房號查不到", async () => {
		const code = await createRoom("阿明");
		const res = await call(`/api/rooms/${code}`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ code, host: "阿明" });
		expect((await call("/api/rooms/ZZZZZZ")).status).toBe(404);
		expect((await call("/api/rooms/bad!")).status).toBe(404);
	});

	it("沒建立過的房號拒絕 WebSocket 連線", async () => {
		const res = await call(`/ws/ZZZZZ2?name=a&pid=${crypto.randomUUID()}`, { headers: { Upgrade: "websocket" } });
		expect(res.status).toBe(404);
	});

	it("暱稱或 player id 不合法就拒絕", async () => {
		const code = await createRoom();
		const noName = await call(`/ws/${code}?name=&pid=${crypto.randomUUID()}`, { headers: { Upgrade: "websocket" } });
		expect(noName.status).toBe(400);
		const badPid = await call(`/ws/${code}?name=a&pid=<script>`, { headers: { Upgrade: "websocket" } });
		expect(badPid.status).toBe(400);
	});

	it("加入後收到 welcome，其他人收到 joined", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		const wa = await a.next("welcome");
		expect(wa.room).toEqual({ code, host: "阿明" });
		expect(wa.uploadToken).toMatch(/^[0-9a-f-]{36}$/);
		expect(wa.heatScale).toBe(1000);

		const b = await Client.connect(code, "小美");
		await b.next("welcome");
		const joined = await a.next("joined");
		expect(joined.name).toBe("小美");
		const players = await a.next("players", (m) => m.players.filter((p) => p.online).length === 2);
		expect(players.players.map((p) => p.name).sort()).toEqual(["小美", "阿明"]);
		a.close();
		b.close();
	});
});

describe("烤肉動作", () => {
	it("放食材、翻面、刷醬、吃掉並算分，兩邊同步", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		const b = await Client.connect(code, "小美");
		await b.next("welcome");

		// 放在桌面上（烤架外），不會加熱
		a.send({ t: "spawn", foodId: "meat", x: 0.03, y: 0.5 });
		const spawned = await b.next("item", (m) => m.action === "spawn");
		expect(spawned.item.since).toBeNull();
		const id = spawned.item.id;

		a.send({ t: "flip", id });
		const flipped = await b.next("item", (m) => m.action === "flip");
		expect(flipped.item.down).toBe(1);

		a.send({ t: "sauce", id });
		expect((await b.next("item", (m) => m.action === "sauce")).item.sauced).toBe(true);

		b.send({ t: "eat", id });
		const removed = await a.next("remove");
		expect(removed).toMatchObject({ id, reason: "eaten" });
		expect(typeof removed.score).toBe("number");
		const players = await a.next("players", (m) => m.players.some((p) => p.name === "小美" && p.score !== 0));
		expect(players.players.find((p) => p.name === "小美")!.score).toBe(removed.score);
		a.close();
		b.close();
	});

	it("拖曳：夾起來停止加熱，放回烤架才繼續，別人不能動被夾住的食材", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		const b = await Client.connect(code, "小美");
		await b.next("welcome");

		a.send({ t: "spawn", foodId: "corn", x: 0.03, y: 0.03 });
		const id = (await a.next("item", (m) => m.action === "spawn")).item.id;

		a.send({ t: "grab", id });
		const grabbed = await b.next("item", (m) => m.action === "grab");
		expect(grabbed.item.heldBy).toBe(grabbed.by);
		expect(grabbed.item.since).toBeNull();

		// 別人夾著時，另一個人翻面、吃都不會生效
		b.send({ t: "flip", id });
		b.send({ t: "eat", id });

		a.send({ t: "drag", id, x: 0.4, y: 0.4 });
		const drag = await b.next("drag");
		expect(drag).toMatchObject({ id, x: 0.4, y: 0.4 });

		a.send({ t: "drop", id, x: cx, y: cy });
		const dropped = await b.next("item", (m) => m.action === "drop");
		expect(dropped.item.heldBy).toBeNull();
		expect(dropped.item.since).not.toBeNull();
		expect(dropped.item.down).toBe(0);
		expect(b.msgs.some((m) => m.t === "remove")).toBe(false);
		a.close();
		b.close();
	});

	it("夾著食材斷線會自動放開", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		const b = await Client.connect(code, "小美");
		await b.next("welcome");
		a.send({ t: "spawn", foodId: "toast", x: 0.03, y: 0.03 });
		const id = (await b.next("item", (m) => m.action === "spawn")).item.id;
		a.send({ t: "grab", id });
		await b.next("item", (m) => m.action === "grab");
		a.close();
		const released = await b.next("item", (m) => m.action === "release");
		expect(released.item.heldBy).toBeNull();
		b.close();
	});

	it("不合法的輸入會被忽略", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		a.send({ t: "spawn", foodId: "meat", x: 5, y: 0.5 });
		a.send({ t: "spawn", foodId: "meat", x: "0.5", y: 0.5 });
		a.send({ t: "spawn", foodId: "unicorn", x: 0.5, y: 0.5 });
		a.send({ t: "emote", e: "<b>" });
		a.ws.send("not json");
		a.send({ t: "chat", text: "  " });
		const err = await a.next("error");
		expect(err.code).toBe("bad_food");
		await sleep(50);
		expect(a.msgs.filter((m) => m.t === "item" || m.t === "emote" || m.t === "chat")).toEqual([]);
		a.close();
	});

	it("聊天會清理文字並保留歷史", async () => {
		const code = await createRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		a.send({ t: "chat", text: "  好香啊\u0000  " });
		expect((await a.next("chat")).line.text).toBe("好香啊");
		const b = await Client.connect(code, "小美");
		const wb = await b.next("welcome");
		expect(wb.chat.map((l) => l.text)).toEqual(["好香啊"]);
		a.close();
		b.close();
	});

	it("食材總數有上限", async () => {
		const code = await createRoom();
		const stub = env.ROOMS.getByName(code);
		await runInDurableObject(stub, (_obj, state) => {
			for (let i = 0; i < LIMITS.maxItems; i++) {
				state.storage.sql.exec(
					"INSERT INTO items (id, food_id, x, y, rot, down, acc0, acc1, since, held_by, sauced, created_at) VALUES (?, 'meat', 0.01, 0.01, 0, 0, 0, 0, NULL, NULL, 0, 0)",
					`fill-${i}`,
				);
			}
		});
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		a.send({ t: "spawn", foodId: "meat", x: 0.5, y: 0.5 });
		expect((await a.next("error")).code).toBe("too_many_items");
		a.close();
	});

	it("人數上限", async () => {
		const code = await createRoom();
		const clients: Client[] = [];
		clients.push(await Client.connect(code, "p0", "fixed-player-id"));
		for (let i = 1; i < LIMITS.maxPlayers; i++) clients.push(await Client.connect(code, `p${i}`));
		const extra = await Client.connect(code, "多出來的");
		expect((await extra.next("error")).code).toBe("room_full");
		expect(extra.msgs.some((m) => m.t === "welcome")).toBe(false);
		// 同一個玩家開第二個分頁不算新的人
		const again = await Client.connect(code, "p0-2", "fixed-player-id");
		again.close();
		for (const c of clients) c.close();
	});
});

describe("燒毀與 alarm", () => {
	it("放著不管會在算好的時間燒毀並廣播 burned", async () => {
		const code = await createRoom();
		const stub = env.ROOMS.getByName(code);
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		a.send({ t: "spawn", foodId: "toast", x: cx, y: cy });
		const id = (await a.next("item", (m) => m.action === "spawn")).item.id;

		// 火力 1000 倍：吐司在中心約 25ms 燒毀
		const alarmAt = await runInDurableObject(stub, (_o, state) => state.storage.getAlarm());
		expect(alarmAt).not.toBeNull();
		await sleep(60);
		// 本機 runtime 可能已經自己觸發 alarm，所以不檢查回傳值，只看有沒有收到 burned
		await runDurableObjectAlarm(stub);
		const removed = await a.next("remove");
		expect(removed).toMatchObject({ id, reason: "burned" });

		// 有人在線、沒有食材，就不需要 alarm
		const after = await runInDurableObject(stub, (_o, state) => state.storage.getAlarm());
		expect(after).toBeNull();
		a.close();
	});

	it("沒人在線時排 24 小時閒置清理，時間到就清空房間", async () => {
		const code = await createRoom();
		const stub = env.ROOMS.getByName(code);
		const alarmAt = await runInDurableObject(stub, (_o, state) => state.storage.getAlarm());
		expect(alarmAt).toBeGreaterThan(Date.now() + LIMITS.roomIdleMs - 60_000);

		await runInDurableObject(stub, (_o, state) => {
			state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'last_active'", String(Date.now() - LIMITS.roomIdleMs - 1));
		});
		await env.IMAGES.put(`rooms/${code}/foods/x.webp`, "x");
		expect(await runDurableObjectAlarm(stub)).toBe(true);
		expect((await call(`/api/rooms/${code}`)).status).toBe(404);
		expect(await env.IMAGES.get(`rooms/${code}/foods/x.webp`)).toBeNull();
	});
});
