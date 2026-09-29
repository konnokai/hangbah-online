import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { GRILL } from "../shared/game";
import { LIMITS, ROOM_CODE_ALPHABET } from "../shared/limits";
import { foodKey, track } from "../server/analytics";
import { Client, call, createRoom, sleep } from "./helpers";

const cx = (GRILL.x0 + GRILL.x1) / 2;
const cy = (GRILL.y0 + GRILL.y1) / 2;

// 本機的 Analytics Engine 寫入是空操作，測試改用會記下資料點的假 dataset
function spy() {
	const points: AnalyticsEngineDataPoint[] = [];
	const ds = {
		points,
		writeDataPoint(p?: AnalyticsEngineDataPoint) {
			if (p) points.push(p);
		},
	};
	return ds;
}
type Spy = ReturnType<typeof spy>;
const events = (s: Spy) => s.points.map((p) => p.blobs![0]);
const find = (s: Spy, event: string) => s.points.find((p) => p.blobs![0] === event);

async function waitFor(s: Spy, event: string) {
	for (let i = 0; i < 40 && !find(s, event); i++) await sleep(25);
	return find(s, event);
}

function randomCode() {
	return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join("");
}

/** 先把 DO 的 ANALYTICS 換成假的，再建房，room_created 才記得到。 */
async function spiedRoom() {
	const code = randomCode();
	const stub = env.ROOMS.getByName(code);
	const s = spy();
	await runInDurableObject(stub, (obj) => {
		(obj as unknown as { env: Env }).env.ANALYTICS = s;
	});
	expect(await stub.create(code, "阿明")).toBe(true);
	return { code, stub, s };
}

describe("track()", () => {
	it("欄位位置固定：index 和 blob1 是事件，blob2 食材、blob3 細節、blob4 房號", () => {
		const s = spy();
		track(s, "food_eaten", { room: "ABC234", food: "meat", v1: 30, v2: 1 });
		track(s, "room_created");
		expect(s.points).toEqual([
			{ indexes: ["food_eaten"], blobs: ["food_eaten", "meat", "", "ABC234"], doubles: [30, 1, 0] },
			{ indexes: ["room_created"], blobs: ["room_created", "", "", ""], doubles: [0, 0, 0] },
		]);
	});

	it("寫入失敗或沒有綁定都不會丟例外", () => {
		const broken = {
			writeDataPoint() {
				throw new Error("boom");
			},
		};
		expect(() => track(broken, "chat_sent")).not.toThrow();
		expect(() => track(undefined, "chat_sent")).not.toThrow();
	});

	it("自訂食材只記 custom", () => {
		expect(foodKey("meat")).toBe("meat");
		expect(foodKey("c:3f2b8a9e-0000-4000-8000-000000000000")).toBe("custom");
	});
});

describe("房間事件", () => {
	it("一場烤肉的事件依序寫出，不含暱稱和玩家代號", async () => {
		const { code, s } = await spiedRoom();
		const pid = crypto.randomUUID();
		const a = await Client.connect(code, "阿明", pid);
		await a.next("welcome");

		a.send({ t: "spawn", foodId: "meat", x: 0.03, y: 0.5 });
		const id = (await a.next("item", (m) => m.action === "spawn")).item.id;
		a.send({ t: "sauce", id });
		await a.next("item", (m) => m.action === "sauce");
		a.send({ t: "eat", id });
		const removed = await a.next("remove");
		a.send({ t: "chat", text: "好香" });
		await a.next("chat");
		a.send({ t: "emote", e: "🔥" });
		await a.next("emote");
		a.close();
		await waitFor(s, "player_left");

		expect(events(s)).toEqual([
			"room_created",
			"player_joined",
			"food_spawned",
			"food_sauced",
			"food_eaten",
			"chat_sent",
			"emote_sent",
			"player_left",
		]);
		expect(find(s, "player_joined")).toMatchObject({ blobs: ["player_joined", "", "new", code], doubles: [1, 0, 0] });
		expect(find(s, "food_spawned")!.doubles).toEqual([0, 0, 0]);
		expect(find(s, "food_eaten")).toMatchObject({ blobs: ["food_eaten", "meat", "", code], doubles: [removed.score, 0, 1] });
		expect(find(s, "chat_sent")!.doubles![0]).toBe(2);
		expect(find(s, "emote_sent")!.blobs![2]).toBe("🔥");
		expect(find(s, "player_left")!.doubles![0]).toBe(0);
		for (const p of s.points) {
			expect(p.blobs![3]).toBe(code);
			expect(JSON.stringify(p)).not.toMatch(/阿明|好香/);
			expect(JSON.stringify(p)).not.toContain(pid);
		}
	});

	it("同一個玩家開第二個分頁不算新的進房，重連算回訪", async () => {
		const { code, s } = await spiedRoom();
		const pid = crypto.randomUUID();
		const a = await Client.connect(code, "阿明", pid);
		await a.next("welcome");
		const tab2 = await Client.connect(code, "阿明", pid);
		await tab2.next("welcome");
		tab2.close();
		a.close();
		await waitFor(s, "player_left");
		const b = await Client.connect(code, "阿明", pid);
		await b.next("welcome");
		b.close();

		const joins = s.points.filter((p) => p.blobs![0] === "player_joined").map((p) => p.blobs![2]);
		expect(joins).toEqual(["new", "return"]);
	});

	it("燒毀記下食材和觸發方式", async () => {
		const { code, stub, s } = await spiedRoom();
		const a = await Client.connect(code, "阿明");
		await a.next("welcome");
		a.send({ t: "spawn", foodId: "toast", x: cx, y: cy });
		await a.next("item", (m) => m.action === "spawn");
		await sleep(60);
		await runDurableObjectAlarm(stub);
		await a.next("remove");
		const burned = await waitFor(s, "food_burned");
		expect(burned!.blobs![1]).toBe("toast");
		expect(["alarm", "lazy"]).toContain(burned!.blobs![2]);
		expect(find(s, "food_spawned")!.doubles![0]).toBe(1);
		a.close();
	});

	it("閒置清理前記下房間存活時間和人數", async () => {
		const { code, stub, s } = await spiedRoom();
		await runInDurableObject(stub, (_o, state) => {
			state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'last_active'", String(Date.now() - LIMITS.roomIdleMs - 1));
		});
		await runDurableObjectAlarm(stub);
		expect((await call(`/api/rooms/${code}`)).status).toBe(404);
		const wiped = find(s, "room_wiped");
		expect(wiped!.blobs![3]).toBe(code);
		expect(wiped!.doubles![0]).toBeGreaterThanOrEqual(0);
		expect(wiped!.doubles!.slice(1)).toEqual([0, 0]);
	});
});

describe("上傳事件", () => {
	const original = env.ANALYTICS;
	afterEach(() => {
		env.ANALYTICS = original;
	});

	it("被拒絕時記下錯誤碼", async () => {
		const s = spy();
		env.ANALYTICS = s;
		const code = await createRoom();
		const res = await call(`/api/rooms/${code}/foods`, { method: "POST", body: new Uint8Array([1, 2, 3]) });
		expect(res.status).toBe(403);
		expect(find(s, "upload_rejected")).toMatchObject({ blobs: ["upload_rejected", "", "not_in_room", code] });
	});
});
