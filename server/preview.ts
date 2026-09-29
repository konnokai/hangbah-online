import { customFoodUrl } from "../shared/game";
import type { RoomPreview } from "../shared/protocol";

/*
 * 分享預覽卡片。
 * Discord Components V2 link preview 規格：https://github.com/discord/discord-api-docs/pull/8606
 * 寫法參考 seriaati/fixthreads 的 renderComponentEmbed.ts。
 */

const SITE_NAME = "夯肉";
const ACCENT_COLOR = 0xe8590c;
const EMBED_MAX_BYTES = 3000;
const EMBED_MAX_COMPONENTS = 40;

type Component = Record<string, unknown>;

export function escapeMarkdown(s: string) {
	return s.replace(/([\\*_~`|>#[\]()<:@-])/g, "\\$1");
}

export function escapeHtml(s: string) {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const text = (content: string): Component => ({ type: 10, content });
const separator = (divider: boolean, spacing: 1 | 2): Component => ({ type: 14, divider, spacing });
const linkButton = (label: string, url: string, emoji?: string): Component => ({
	type: 2,
	style: 5,
	label,
	url,
	...(emoji ? { emoji: { name: emoji } } : {}),
});

export function countComponents(node: unknown): number {
	if (Array.isArray(node)) return node.reduce((n: number, x) => n + countComponents(x), 0);
	if (node && typeof node === "object") {
		const obj = node as Component;
		const own = typeof obj.type === "number" ? 1 : 0;
		return own + countComponents(Object.values(obj));
	}
	return 0;
}

export const embedBytes = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload)).length;

function truncate(s: string, max: number) {
	const chars = Array.from(s);
	return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : s;
}

export interface PreviewMeta {
	title: string;
	description: string;
	url: string;
	image: string;
	embed: { component: Component };
}

export function roomTitle(p: RoomPreview) {
	return `${p.host}的烤肉場`;
}

export function buildPreview(p: RoomPreview, origin: string): PreviewMeta {
	const url = `${origin}/r/${p.code}`;
	const logo = `${origin}/logo.png`;
	const image = `${origin}/og.png`;

	if (!p.exists) {
		const component = {
			type: 17,
			accent_color: ACCENT_COLOR,
			components: [
				{
					type: 9,
					components: [text("## 🪵 這個烤肉場已經收攤了"), text("-# 炭火熄了，食材也收好了。自己開一場吧！")],
					accessory: { type: 11, media: { url: logo }, description: SITE_NAME },
				},
				separator(false, 1),
				{ type: 1, components: [linkButton("開新烤肉場", `${origin}/`, "🔥")] },
			],
		};
		return {
			title: "這個烤肉場已經收攤了",
			description: "炭火熄了。來開一場新的烤肉吧！",
			url,
			image,
			embed: { component },
		};
	}

	const title = roomTitle(p);
	const onlineCount = p.online.length;
	const stats = [
		`👥 **${onlineCount}** 人在烤`,
		`🍖 烤架上 **${p.itemsOnGrill}** 個`,
		...(p.top ? [`🏆 ${escapeMarkdown(truncate(p.top.name, 16))} **${p.top.score}** 分`] : []),
	].join(" · ");
	const who = p.online.length
		? `-# 在場：${truncate(p.online.map((n) => escapeMarkdown(n)).join("、"), 300)}`
		: "-# 現在沒人，炭火還熱著";

	const header: Component = {
		type: 9,
		components: [text(`## 🔥 ${escapeMarkdown(title)}`), text(`-# 房號 ${p.code} · ${SITE_NAME}`)],
		accessory: { type: 11, media: { url: logo }, description: SITE_NAME },
	};
	const gallery: Component | null = p.customFoods.length
		? {
				type: 12,
				items: p.customFoods.slice(0, 4).map((f) => ({
					media: { url: origin + customFoodUrl(p.code, f) },
					description: truncate(f.name, 40),
				})),
			}
		: null;
	const footer = [separator(true, 2), { type: 1, components: [linkButton("加入烤肉", url, "🔥")] }];

	// 超過 Discord 限制整個卡片會消失，所以依序拿掉比較不重要的部分
	const variants: Component[][] = [
		[header, text(stats), text(who), ...(gallery ? [separator(false, 2), gallery] : []), ...footer],
		[header, text(stats), text(who), ...footer],
		[header, text(stats), ...footer],
	];
	let component: Component = { type: 17, accent_color: ACCENT_COLOR, components: variants[variants.length - 1] };
	for (const components of variants) {
		const candidate = { type: 17, accent_color: ACCENT_COLOR, components };
		if (embedBytes({ component: candidate }) <= EMBED_MAX_BYTES && countComponents(candidate) <= EMBED_MAX_COMPONENTS) {
			component = candidate;
			break;
		}
	}

	const description =
		onlineCount > 0
			? `${onlineCount} 人正在烤，烤架上 ${p.itemsOnGrill} 個食材，快來一起烤！`
			: `烤架上 ${p.itemsOnGrill} 個食材，炭火還熱著，快來一起烤！`;
	return { title: `${title} 🔥`, description, url, image, embed: { component } };
}

/** 用 HTMLRewriter 把房間專屬的 OG 標籤和 Discord embed 放進 index.html。 */
export function rewriteRoomHtml(base: Response, meta: PreviewMeta): Response {
	const t = escapeHtml(meta.title);
	const d = escapeHtml(meta.description);
	const u = escapeHtml(meta.url);
	const img = escapeHtml(meta.image);
	// JSON 放在 <script> 裡，把 < 換掉才不會被 </script> 提早結束
	const json = JSON.stringify(meta.embed).replace(/</g, "\\u003c");
	const head = `
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:title" content="${t}">
    <meta property="og:description" content="${d}">
    <meta property="og:url" content="${u}">
    <meta property="og:image" content="${img}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${t}">
    <meta name="twitter:description" content="${d}">
    <meta name="twitter:image" content="${img}">
    <meta name="description" content="${d}">
    <script id="discord:component-embed" type="application/json">${json}</script>`;

	const rewritten = new HTMLRewriter()
		.on('meta[property^="og:"]', { element: (el) => void el.remove() })
		.on('meta[name^="twitter:"]', { element: (el) => void el.remove() })
		.on('meta[name="description"]', { element: (el) => void el.remove() })
		.on("title", { element: (el) => void el.setInnerContent(`${meta.title} | ${SITE_NAME}`) })
		.on("head", { element: (el) => void el.append(head, { html: true }) })
		.transform(base);

	const headers = new Headers(rewritten.headers);
	headers.set("Content-Type", "text/html; charset=utf-8");
	headers.set("Cache-Control", "no-cache");
	headers.delete("ETag");
	headers.delete("Content-Length");
	return new Response(rewritten.body, { status: 200, headers });
}
