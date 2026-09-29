import type { CustomFood } from "../shared/game";

export interface ImageInfo {
	ext: CustomFood["ext"];
	contentType: string;
	width: number;
	height: number;
}

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const be32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const le32 = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/**
 * 只看檔案內容判斷格式和寬高，不相信副檔名或 Content-Type。
 * 只支援 PNG / JPEG / WebP；SVG 可以夾帶 script，所以一律不收。
 */
export function sniffImage(b: Uint8Array): ImageInfo | null {
	if (b.length >= 24 && be32(b, 0) === 0x89504e47 && be32(b, 4) === 0x0d0a1a0a && ascii(b, 12, 4) === "IHDR") {
		return { ext: "png", contentType: "image/png", width: be32(b, 16), height: be32(b, 20) };
	}
	if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return sniffJpeg(b);
	if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return sniffWebp(b);
	return null;
}

function sniffJpeg(b: Uint8Array): ImageInfo | null {
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1]!;
		if (marker === 0xff) {
			i++;
			continue;
		}
		// RST、TEM 沒有長度欄位
		if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
			i += 2;
			continue;
		}
		if (marker === 0xda || marker === 0xd9) return null;
		const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSof) {
			return { ext: "jpg", contentType: "image/jpeg", height: be16(b, i + 5), width: be16(b, i + 7) };
		}
		const len = be16(b, i + 2);
		if (len < 2) return null;
		i += 2 + len;
	}
	return null;
}

function sniffWebp(b: Uint8Array): ImageInfo | null {
	const chunk = ascii(b, 12, 4);
	const base = { ext: "webp" as const, contentType: "image/webp" };
	if (chunk === "VP8 ") {
		if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
		return { ...base, width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
	}
	if (chunk === "VP8L") {
		if (b[20] !== 0x2f) return null;
		const bits = le32(b, 21);
		return { ...base, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (chunk === "VP8X") {
		return { ...base, width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
	}
	return null;
}

export class TooLargeError extends Error {}

/** 邊讀邊算大小，超過上限就停，不會先把整個 body 吃進記憶體。 */
export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			throw new TooLargeError();
		}
		chunks.push(value);
	}
	const out = new Uint8Array(size);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}
