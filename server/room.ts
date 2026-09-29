import { DurableObject } from "cloudflare:workers";
import {
	BURN,
	EMOTES,
	PLAYER_COLORS,
	burnAt,
	cleanNickname,
	cleanText,
	donenessAt,
	isPerfect,
	onGrill,
	resolveFood,
	scoreOf,
	settle,
	type CustomFood,
	type FoodDef,
	type GrillItem,
} from "../shared/game";
import { LIMITS, PLAYER_ID_RE } from "../shared/limits";
import type { ChatLine, ClientMsg, PlayerInfo, RoomPreview, ServerMsg } from "../shared/protocol";
import { foodKey, track, type AnalyticsEvent, type AnalyticsFields } from "./analytics";

interface Attachment {
	pid: string;
	name: string;
	color: string;
	token: string;
}

interface ItemRow extends Record<string, SqlStorageValue> {
	id: string;
	food_id: string;
	x: number;
	y: number;
	rot: number;
	down: number;
	acc0: number;
	acc1: number;
	since: number | null;
	held_by: string | null;
	sauced: number;
}

type Bucket = { tokens: number; last: number };

// 每種訊息的限流：每秒補充幾個、最多存幾個
const RATE: Record<string, [number, number]> = {
	cursor: [25, 25],
	drag: [40, 40],
	chat: [1, 3],
	emote: [2, 4],
	action: [15, 20],
};

export type UploadAuth = { ok: true; pid: string } | { ok: false; status: number; error: string };

export class BbqRoom extends DurableObject<Env> {
	private sql: SqlStorage;
	// 休眠醒來會清空，限流重新計算可以接受
	private buckets = new WeakMap<WebSocket, Map<string, Bucket>>();
	// 同一條連線可能先後觸發 webSocketError 和 webSocketClose，離開只算一次
	private departed = new WeakSet<WebSocket>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		ctx.blockConcurrencyWhile(async () => this.migrate());
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	private migrate() {
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS players (
				pid TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
				score INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS items (
				id TEXT PRIMARY KEY, food_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
				rot REAL NOT NULL, down INTEGER NOT NULL, acc0 REAL NOT NULL, acc1 REAL NOT NULL,
				since INTEGER, held_by TEXT, sauced INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS custom_foods (
				id TEXT PRIMARY KEY, name TEXT NOT NULL, ext TEXT NOT NULL,
				uploaded_by TEXT NOT NULL, created_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS uploads (pid TEXT NOT NULL, ts INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS chat (
				id INTEGER PRIMARY KEY AUTOINCREMENT, pid TEXT NOT NULL, name TEXT NOT NULL,
				color TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL
			);
		`);
	}

	private get heatScale() {
		const n = Number(this.env.HEAT_SCALE);
		return Number.isFinite(n) && n > 0 ? n : 1;
	}

	// ---------- meta ----------

	private meta(k: string): string | null {
		const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
		return row ? row.v : null;
	}

	private setMeta(k: string, v: string) {
		this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v);
	}

	private get exists() {
		return this.meta("code") !== null;
	}

	private track(event: AnalyticsEvent, f: AnalyticsFields = {}) {
		track(this.env.ANALYTICS, event, { room: this.meta("code") ?? "", ...f });
	}

	// ---------- RPC（Worker 呼叫） ----------

	/** 建立房間。房號已被用過就回傳 false，讓呼叫端換一個。 */
	async create(code: string, host: string): Promise<boolean> {
		if (this.exists) return false;
		this.setMeta("code", code);
		this.setMeta("host", cleanNickname(host) || "神秘烤肉人");
		this.setMeta("created_at", String(Date.now()));
		this.setMeta("last_active", String(Date.now()));
		await this.scheduleAlarm();
		this.track("room_created");
		return true;
	}

	async info(): Promise<{ exists: boolean; host: string }> {
		return { exists: this.exists, host: this.meta("host") ?? "" };
	}

	async getPreview(): Promise<RoomPreview> {
		const code = this.meta("code") ?? "";
		if (!code) return { exists: false, code, host: "", online: [], itemsOnGrill: 0, top: null };
		const online = [...new Set(this.attachments().map((a) => a.name))];
		const items = this.loadItems().filter((i) => onGrill(i.x, i.y)).length;
		const top = this.sql
			.exec<{ name: string; score: number }>("SELECT name, score FROM players WHERE score > 0 ORDER BY score DESC LIMIT 1")
			.toArray()[0];
		return { exists: true, code, host: this.meta("host") ?? "", online, itemsOnGrill: items, top: top ?? null };
	}

	/** 上傳前檢查：token 要屬於目前在線的連線、沒超過頻率和數量上限。 */
	async authorizeUpload(token: string): Promise<UploadAuth> {
		if (!this.exists) return { ok: false, status: 404, error: "room_not_found" };
		const att = this.attachments().find((a) => a.token === token);
		if (!token || !att) return { ok: false, status: 403, error: "not_in_room" };
		const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM custom_foods").one().n;
		if (count >= LIMITS.maxCustomFoods) return { ok: false, status: 409, error: "too_many_custom_foods" };
		const since = Date.now() - 60_000;
		this.sql.exec("DELETE FROM uploads WHERE ts < ?", since);
		const recent = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM uploads WHERE pid = ?", att.pid).one().n;
		if (recent >= LIMITS.uploadsPerMinute) return { ok: false, status: 429, error: "upload_rate_limited" };
		this.sql.exec("INSERT INTO uploads (pid, ts) VALUES (?, ?)", att.pid, Date.now());
		return { ok: true, pid: att.pid };
	}

	async addCustomFood(pid: string, id: string, rawName: string, ext: CustomFood["ext"]): Promise<CustomFood | null> {
		const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM custom_foods").one().n;
		if (count >= LIMITS.maxCustomFoods) return null;
		const name = cleanText(rawName, LIMITS.foodNameMax) || "神秘食材";
		this.sql.exec(
			"INSERT INTO custom_foods (id, name, ext, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)",
			id, name, ext, pid, Date.now(),
		);
		const food: CustomFood = { id, name, ext, uploadedBy: pid };
		this.broadcast({ t: "customFood", food });
		return food;
	}

	// ---------- WebSocket ----------

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
		if (!this.exists) return new Response("room not found", { status: 404 });

		const url = new URL(request.url);
		const pid = url.searchParams.get("pid") ?? "";
		const name = cleanNickname(url.searchParams.get("name"));
		if (!PLAYER_ID_RE.test(pid) || !name) return new Response("bad player", { status: 400 });

		const onlinePids = new Set(this.attachments().map((a) => a.pid));
		if (!onlinePids.has(pid) && onlinePids.size >= LIMITS.maxPlayers) {
			// 瀏覽器拿不到 WebSocket 握手失敗的 HTTP 狀態碼，所以先接起來、講完原因再掛斷
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
			server.accept();
			this.send(server, { t: "error", code: "room_full", message: `這場烤肉已經 ${LIMITS.maxPlayers} 個人了` });
			server.close(4003, "room_full");
			this.track("room_full");
			return new Response(null, { status: 101, webSocket: client });
		}

		const { color, isNew } = this.upsertPlayer(pid, name);
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
		const att: Attachment = { pid, name, color, token: crypto.randomUUID() };
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(att);

		this.setMeta("last_active", String(Date.now()));
		this.send(server, {
			t: "welcome",
			now: Date.now(),
			heatScale: this.heatScale,
			you: { pid, name, color },
			room: { code: this.meta("code") ?? "", host: this.meta("host") ?? "" },
			uploadToken: att.token,
			players: this.players(),
			items: this.loadItems(),
			customFoods: this.customFoods(),
			chat: this.chatHistory(),
		});
		if (!onlinePids.has(pid)) {
			this.broadcast({ t: "joined", pid, name }, server);
			this.track("player_joined", { detail: isNew ? "new" : "return", v1: onlinePids.size + 1 });
		}
		this.broadcast({ t: "players", players: this.players() });
		// 有人在線時不需要閒置清理，只留燒毀用的 alarm
		await this.scheduleAlarm();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const att = ws.deserializeAttachment() as Attachment | null;
		if (!att || typeof raw !== "string" || raw.length > 2048) return;
		let msg: ClientMsg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;
		const kind = msg.t === "cursor" || msg.t === "drag" || msg.t === "chat" || msg.t === "emote" ? msg.t : "action";
		if (!this.take(ws, kind)) {
			if (kind === "chat") this.send(ws, { t: "error", code: "rate_limited", message: "講太快了，喝口飲料再說" });
			return;
		}
		await this.handle(ws, att, msg);
	}

	async webSocketClose(ws: WebSocket) {
		await this.onDisconnect(ws);
	}

	async webSocketError(ws: WebSocket) {
		await this.onDisconnect(ws);
	}

	private async onDisconnect(ws: WebSocket) {
		const att = ws.deserializeAttachment() as Attachment | null;
		if (!att) return;
		const others = this.sockets(ws).map((s) => (s.deserializeAttachment() as Attachment).pid);
		const stillOnline = others.includes(att.pid);
		if (!stillOnline && !this.departed.has(ws)) {
			this.departed.add(ws);
			this.track("player_left", { v1: new Set(others).size });
		}
		if (!stillOnline) {
			// 夾著食材斷線的話放回原位，不然會永遠卡住
			const now = Date.now();
			for (const item of this.loadItems().filter((i) => i.heldBy === att.pid)) {
				item.heldBy = null;
				const food = this.food(item.foodId);
				if (food) settle(item, food, now, this.heatScale);
				this.saveItem(item);
				this.broadcast({ t: "item", item, by: att.pid, action: "release" }, ws);
			}
		}
		this.setMeta("last_active", String(Date.now()));
		this.broadcast({ t: "players", players: this.players(ws) }, ws);
		await this.scheduleAlarm(ws);
	}

	private async handle(ws: WebSocket, att: Attachment, msg: ClientMsg) {
		const now = Date.now();
		switch (msg.t) {
			case "cursor": {
				if (!isCoord(msg.x) || !isCoord(msg.y)) return;
				this.broadcast({ t: "cursor", pid: att.pid, x: msg.x, y: msg.y }, ws);
				return;
			}
			case "drag": {
				if (!isCoord(msg.x) || !isCoord(msg.y)) return;
				const item = this.loadItem(msg.id);
				if (!item || item.heldBy !== att.pid) return;
				this.broadcast({ t: "drag", id: item.id, x: msg.x, y: msg.y, by: att.pid }, ws);
				return;
			}
			case "chat": {
				const text = cleanText(msg.text, LIMITS.chatMax);
				if (!text) return;
				const line: ChatLine = { pid: att.pid, name: att.name, color: att.color, text, ts: now };
				this.sql.exec(
					"INSERT INTO chat (pid, name, color, text, ts) VALUES (?, ?, ?, ?, ?)",
					line.pid, line.name, line.color, line.text, line.ts,
				);
				this.sql.exec(
					"DELETE FROM chat WHERE id NOT IN (SELECT id FROM chat ORDER BY id DESC LIMIT ?)",
					LIMITS.chatHistory,
				);
				this.broadcast({ t: "chat", line });
				this.track("chat_sent", { v1: Array.from(text).length });
				return;
			}
			case "emote": {
				if (!(EMOTES as readonly string[]).includes(msg.e)) return;
				this.broadcast({ t: "emote", pid: att.pid, e: msg.e });
				this.track("emote_sent", { detail: msg.e });
				return;
			}
			case "spawn": {
				if (!isCoord(msg.x) || !isCoord(msg.y) || typeof msg.foodId !== "string") return;
				const food = this.food(msg.foodId);
				if (!food) return this.send(ws, { t: "error", code: "bad_food", message: "沒有這種食材" });
				const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM items").one().n;
				if (count >= LIMITS.maxItems) {
					return this.send(ws, { t: "error", code: "too_many_items", message: "烤架上東西太多了，先吃一點吧" });
				}
				const item: GrillItem = {
					id: crypto.randomUUID(),
					foodId: food.id,
					x: msg.x,
					y: msg.y,
					rot: Math.round((Math.random() * 50 - 25) * 10) / 10,
					down: 0,
					acc: [0, 0],
					since: onGrill(msg.x, msg.y) ? now : null,
					heldBy: null,
					sauced: false,
				};
				this.saveItem(item, now);
				this.broadcast({ t: "item", item, by: att.pid, action: "spawn" });
				this.track("food_spawned", { food: foodKey(food.id), v1: item.since === null ? 0 : 1 });
				await this.scheduleAlarm();
				return;
			}
			case "grab":
			case "drop":
			case "flip":
			case "sauce":
			case "eat": {
				if (typeof msg.id !== "string") return;
				const item = this.loadItem(msg.id);
				if (!item) return;
				const food = this.food(item.foodId);
				if (!food) return;
				// 別人夾著的東西不能動
				if (item.heldBy !== null && item.heldBy !== att.pid) return;
				const d = donenessAt(item, food, now, this.heatScale);
				// alarm 還沒跑到但其實已經燒掉了，當作燒毀處理
				if (Math.max(d[0], d[1]) >= BURN) {
					this.burn([item], "lazy");
					await this.scheduleAlarm();
					return;
				}

				if (msg.t === "eat") {
					const score = scoreOf(d, food, item.sauced);
					this.sql.exec("DELETE FROM items WHERE id = ?", item.id);
					this.sql.exec("UPDATE players SET score = score + ? WHERE pid = ?", score, att.pid);
					this.broadcast({ t: "remove", id: item.id, reason: "eaten", by: att.pid, score });
					this.broadcast({ t: "players", players: this.players() });
					this.track("food_eaten", {
						food: foodKey(food.id),
						v1: score,
						v2: isPerfect(d) ? 1 : 0,
						v3: item.sauced ? 1 : 0,
					});
					await this.scheduleAlarm();
					return;
				}
				if (msg.t === "grab") {
					if (item.heldBy === att.pid) return;
					item.heldBy = att.pid;
					settle(item, food, now, this.heatScale);
				} else if (msg.t === "drop") {
					if (item.heldBy !== att.pid || !isCoord(msg.x) || !isCoord(msg.y)) return;
					settle(item, food, now, this.heatScale);
					item.heldBy = null;
					item.x = msg.x;
					item.y = msg.y;
					item.since = onGrill(item.x, item.y) ? now : null;
				} else if (msg.t === "flip") {
					settle(item, food, now, this.heatScale);
					item.down = item.down === 0 ? 1 : 0;
				} else {
					if (item.sauced) return;
					item.sauced = true;
				}
				this.saveItem(item);
				this.broadcast({ t: "item", item, by: att.pid, action: msg.t });
				if (msg.t === "sauce") this.track("food_sauced", { food: foodKey(food.id) });
				await this.scheduleAlarm();
				return;
			}
		}
	}

	// ---------- Alarm：燒毀和閒置清理 ----------

	async alarm() {
		const now = Date.now();
		const due: GrillItem[] = [];
		for (const item of this.loadItems()) {
			const food = this.food(item.foodId);
			const at = food ? burnAt(item, food, this.heatScale) : null;
			// 留一點誤差，避免 alarm 提早幾毫秒醒來又要再排一次
			if (at !== null && at <= now + 50) due.push(item);
		}
		if (due.length) this.burn(due, "alarm");

		if (this.sockets().length === 0) {
			const lastActive = Number(this.meta("last_active") ?? 0);
			if (now >= lastActive + LIMITS.roomIdleMs) {
				await this.wipe();
				return;
			}
		}
		await this.scheduleAlarm();
	}

	/** lazy：有人動到才發現已經燒掉；alarm：到時間自己燒掉。 */
	private burn(items: GrillItem[], via: "lazy" | "alarm") {
		for (const item of items) {
			this.sql.exec("DELETE FROM items WHERE id = ?", item.id);
			this.broadcast({ t: "remove", id: item.id, reason: "burned" });
			this.track("food_burned", { food: foodKey(item.foodId), detail: via });
		}
	}

	/** alarm 設成「下一個食材燒毀」和「閒置清理」中比較早的時間。 */
	private async scheduleAlarm(closing?: WebSocket) {
		if (!this.exists) return;
		let next: number | null = null;
		for (const item of this.loadItems()) {
			const food = this.food(item.foodId);
			const at = food ? burnAt(item, food, this.heatScale) : null;
			if (at !== null && (next === null || at < next)) next = at;
		}
		if (this.sockets(closing).length === 0) {
			const idleAt = Number(this.meta("last_active") ?? Date.now()) + LIMITS.roomIdleMs;
			if (next === null || idleAt < next) next = idleAt;
		}
		if (next === null) await this.ctx.storage.deleteAlarm();
		else await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 10));
	}

	private async wipe() {
		const code = this.meta("code");
		if (code) {
			// 資料要刪了，先記下這個房間的一生
			const count = (table: string) => this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).one().n;
			this.track("room_wiped", {
				v1: Date.now() - Number(this.meta("created_at") ?? Date.now()),
				v2: count("players"),
				v3: count("custom_foods"),
			});
			let cursor: string | undefined;
			do {
				const page = await this.env.IMAGES.list({ prefix: `rooms/${code}/`, cursor });
				if (page.objects.length) await this.env.IMAGES.delete(page.objects.map((o) => o.key));
				cursor = page.truncated ? page.cursor : undefined;
			} while (cursor);
		}
		for (const table of ["meta", "players", "items", "custom_foods", "uploads", "chat"]) {
			this.sql.exec(`DELETE FROM ${table}`);
		}
		await this.ctx.storage.deleteAlarm();
	}

	// ---------- 資料存取 ----------

	private food(foodId: string): FoodDef | null {
		return resolveFood(foodId, this.customFoods());
	}

	private customFoods(): CustomFood[] {
		return this.sql
			.exec<{ id: string; name: string; ext: string; uploaded_by: string }>(
				"SELECT id, name, ext, uploaded_by FROM custom_foods ORDER BY created_at",
			)
			.toArray()
			.map((r) => ({ id: r.id, name: r.name, ext: r.ext as CustomFood["ext"], uploadedBy: r.uploaded_by }));
	}

	private loadItems(): GrillItem[] {
		return this.sql.exec<ItemRow>("SELECT * FROM items ORDER BY created_at").toArray().map(rowToItem);
	}

	private loadItem(id: string): GrillItem | null {
		const row = this.sql.exec<ItemRow>("SELECT * FROM items WHERE id = ?", id).toArray()[0];
		return row ? rowToItem(row) : null;
	}

	private saveItem(item: GrillItem, createdAt?: number) {
		this.sql.exec(
			`INSERT INTO items (id, food_id, x, y, rot, down, acc0, acc1, since, held_by, sauced, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET x = excluded.x, y = excluded.y, down = excluded.down,
			   acc0 = excluded.acc0, acc1 = excluded.acc1, since = excluded.since,
			   held_by = excluded.held_by, sauced = excluded.sauced`,
			item.id, item.foodId, item.x, item.y, item.rot, item.down, item.acc[0], item.acc[1],
			item.since, item.heldBy, item.sauced ? 1 : 0, createdAt ?? Date.now(),
		);
	}

	private upsertPlayer(pid: string, name: string): { color: string; isNew: boolean } {
		const existing = this.sql.exec<{ color: string }>("SELECT color FROM players WHERE pid = ?", pid).toArray()[0];
		if (existing) {
			this.sql.exec("UPDATE players SET name = ? WHERE pid = ?", name, pid);
			return { color: existing.color, isNew: false };
		}
		const n = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM players").one().n;
		const color = PLAYER_COLORS[n % PLAYER_COLORS.length]!;
		this.sql.exec(
			"INSERT INTO players (pid, name, color, score, joined_at) VALUES (?, ?, ?, 0, ?)",
			pid, name, color, Date.now(),
		);
		return { color, isNew: true };
	}

	private players(closing?: WebSocket): PlayerInfo[] {
		const online = new Set(this.sockets(closing).map((s) => (s.deserializeAttachment() as Attachment).pid));
		return this.sql
			.exec<{ pid: string; name: string; color: string; score: number }>(
				"SELECT pid, name, color, score FROM players ORDER BY score DESC, joined_at LIMIT 50",
			)
			.toArray()
			.map((p) => ({ ...p, online: online.has(p.pid) }));
	}

	private chatHistory(): ChatLine[] {
		return this.sql
			.exec<ChatLine & Record<string, SqlStorageValue>>("SELECT pid, name, color, text, ts FROM chat ORDER BY id")
			.toArray()
			.map((r) => ({ pid: r.pid, name: r.name, color: r.color, text: r.text, ts: r.ts }));
	}

	// ---------- 連線工具 ----------

	/** 目前開著的連線。closing 是正在關閉的那條，要排除掉。 */
	private sockets(closing?: WebSocket): WebSocket[] {
		return this.ctx.getWebSockets().filter((s) => s !== closing && s.readyState === WebSocket.OPEN);
	}

	private attachments(): Attachment[] {
		return this.sockets()
			.map((s) => s.deserializeAttachment() as Attachment | null)
			.filter((a): a is Attachment => a !== null);
	}

	private send(ws: WebSocket, msg: ServerMsg) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// 連線剛好斷掉，close 事件會處理
		}
	}

	private broadcast(msg: ServerMsg, except?: WebSocket) {
		const data = JSON.stringify(msg);
		for (const ws of this.sockets(except)) {
			try {
				ws.send(data);
			} catch {
				// 同上
			}
		}
	}

	private take(ws: WebSocket, kind: string): boolean {
		const [rate, burst] = RATE[kind] ?? RATE.action!;
		let map = this.buckets.get(ws);
		if (!map) this.buckets.set(ws, (map = new Map()));
		const now = Date.now();
		const b = map.get(kind) ?? { tokens: burst, last: now };
		b.tokens = Math.min(burst, b.tokens + ((now - b.last) / 1000) * rate);
		b.last = now;
		map.set(kind, b);
		if (b.tokens < 1) return false;
		b.tokens -= 1;
		return true;
	}
}

function isCoord(n: unknown): n is number {
	return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

function rowToItem(r: ItemRow): GrillItem {
	return {
		id: r.id,
		foodId: r.food_id,
		x: r.x,
		y: r.y,
		rot: r.rot,
		down: r.down === 1 ? 1 : 0,
		acc: [r.acc0, r.acc1],
		since: r.since,
		heldBy: r.held_by,
		sauced: r.sauced === 1,
	};
}
