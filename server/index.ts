import { cleanNickname, cleanText } from "../shared/game";
import { LIMITS, ROOM_CODE_ALPHABET, ROOM_CODE_RE } from "../shared/limits";
import { track } from "./analytics";
import { buildPreview, rewriteRoomHtml } from "./preview";
import { TooLargeError, readLimited, sniffImage } from "./upload";

export { BbqRoom } from "./room";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (status: number, error: string) => json({ error }, status);

function randomCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

const room = (env: Env, code: string) => env.ROOMS.getByName(code);

async function createRoom(request: Request, env: Env) {
	let body: { name?: unknown };
	try {
		body = await request.json();
	} catch {
		return fail(400, "bad_json");
	}
	const host = cleanNickname(body.name);
	if (!host) return fail(400, "name_required");
	// 房號空間約 7 億，撞號機率很低，重試幾次就夠
	for (let i = 0; i < 5; i++) {
		const code = randomCode();
		if (await room(env, code).create(code, host)) return json({ code }, 201);
	}
	return fail(503, "try_again");
}

async function uploadFood(request: Request, env: Env, code: string) {
	const reject = (status: number, error: string) => {
		track(env.ANALYTICS, "upload_rejected", { room: code, detail: error });
		return fail(status, error);
	};

	const length = Number(request.headers.get("Content-Length") ?? "0");
	if (length > LIMITS.uploadMaxBytes) return reject(413, "file_too_large");

	const stub = room(env, code);
	const auth = await stub.authorizeUpload(request.headers.get("X-Upload-Token") ?? "");
	if (!auth.ok) return reject(auth.status, auth.error);

	let bytes: Uint8Array;
	try {
		bytes = await readLimited(request.body, LIMITS.uploadMaxBytes);
	} catch (e) {
		if (e instanceof TooLargeError) return reject(413, "file_too_large");
		throw e;
	}
	const info = sniffImage(bytes);
	if (!info) return reject(415, "unsupported_image");
	if (info.width < 1 || info.height < 1 || info.width > LIMITS.uploadMaxDim || info.height > LIMITS.uploadMaxDim) {
		return reject(422, "image_too_big");
	}

	let name = "";
	try {
		name = cleanText(decodeURIComponent(request.headers.get("X-Food-Name") ?? ""), LIMITS.foodNameMax);
	} catch {
		// 名稱編碼壞掉就用預設名稱
	}

	const id = crypto.randomUUID();
	const key = `rooms/${code}/foods/${id}.${info.ext}`;
	await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: info.contentType } });
	const food = await stub.addCustomFood(auth.pid, id, name, info.ext);
	track(env.ANALYTICS, "upload_ok", { room: code, detail: info.ext, v1: bytes.length });
	return json(food, 201);
}

async function serveImage(env: Env, code: string, file: string) {
	const obj = await env.IMAGES.get(`rooms/${code}/foods/${file}`);
	if (!obj) return new Response("not found", { status: 404 });
	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set("ETag", obj.httpEtag);
	headers.set("Cache-Control", "public, max-age=86400, immutable");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Content-Security-Policy", "default-src 'none'");
	return new Response(obj.body, { headers });
}

async function roomPage(request: Request, env: Env, code: string) {
	const url = new URL(request.url);
	const base = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
	if (!base.ok) return base;
	const preview = await room(env, code).getPreview();
	// 亂打的房號不會建立資料，但回傳的 code 要是網址上的那個
	return rewriteRoomHtml(base, buildPreview({ ...preview, code }, url.origin));
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;
		let m: RegExpMatchArray | null;

		if (path === "/api/rooms" && request.method === "POST") return createRoom(request, env);

		if ((m = path.match(/^\/api\/rooms\/([^/]+)$/)) && request.method === "GET") {
			if (!ROOM_CODE_RE.test(m[1]!)) return fail(404, "room_not_found");
			const info = await room(env, m[1]!).info();
			return info.exists ? json({ code: m[1], host: info.host }) : fail(404, "room_not_found");
		}

		if ((m = path.match(/^\/api\/rooms\/([^/]+)\/foods$/)) && request.method === "POST") {
			if (!ROOM_CODE_RE.test(m[1]!)) return fail(404, "room_not_found");
			return uploadFood(request, env, m[1]!);
		}

		if ((m = path.match(/^\/api\/img\/([^/]+)\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/)) && request.method === "GET") {
			if (!ROOM_CODE_RE.test(m[1]!)) return new Response("not found", { status: 404 });
			return serveImage(env, m[1]!, m[2]!);
		}

		if ((m = path.match(/^\/ws\/([^/]+)$/))) {
			if (request.headers.get("Upgrade") !== "websocket") return fail(426, "expected_websocket");
			if (!ROOM_CODE_RE.test(m[1]!)) return fail(404, "room_not_found");
			return room(env, m[1]!).fetch(request);
		}

		if ((m = path.match(/^\/r\/([^/]+)\/?$/)) && (request.method === "GET" || request.method === "HEAD")) {
			const code = m[1]!.toUpperCase();
			if (!ROOM_CODE_RE.test(code)) return env.ASSETS.fetch(new Request(new URL("/index.html", url)));
			return roomPage(request, env, code);
		}

		if (path.startsWith("/api/") || path.startsWith("/ws/")) return fail(404, "not_found");
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
