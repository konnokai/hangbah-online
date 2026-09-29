import { exports } from "cloudflare:workers";
import type { ServerMsg } from "../shared/protocol";

const ORIGIN = "https://bbq.test";

export const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(ORIGIN + path, init));

export async function createRoom(name = "阿明"): Promise<string> {
	const res = await call("/api/rooms", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
	if (res.status !== 201) throw new Error(`create failed ${res.status}`);
	return ((await res.json()) as { code: string }).code;
}

/** 測試用的 WebSocket 客戶端：收到的訊息都排隊，可以等特定型別。 */
export class Client {
	msgs: ServerMsg[] = [];
	private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

	private constructor(public ws: WebSocket) {
		ws.addEventListener("message", (e) => {
			const msg = JSON.parse(e.data as string) as ServerMsg;
			const i = this.waiters.findIndex((w) => w.pred(msg));
			if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
			else this.msgs.push(msg);
		});
	}

	static async connect(code: string, name: string, pid = crypto.randomUUID()): Promise<Client> {
		const res = await call(`/ws/${code}?name=${encodeURIComponent(name)}&pid=${pid}`, {
			headers: { Upgrade: "websocket" },
		});
		if (res.status !== 101 || !res.webSocket) throw new Error(`ws failed ${res.status}`);
		res.webSocket.accept();
		return new Client(res.webSocket);
	}

	send(msg: unknown) {
		this.ws.send(JSON.stringify(msg));
	}

	next<T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, timeout = 2000) {
		type M = Extract<ServerMsg, { t: T }>;
		const match = (m: ServerMsg): m is M => m.t === t && pred(m as M);
		const i = this.msgs.findIndex(match);
		if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0] as M);
		return new Promise<M>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeout);
			this.waiters.push({
				pred: match,
				resolve: (m) => {
					clearTimeout(timer);
					resolve(m as M);
				},
			});
		});
	}

	close() {
		this.ws.close();
	}
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
