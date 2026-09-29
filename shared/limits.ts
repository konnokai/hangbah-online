// 前後端共用的上限。改這裡兩邊一起生效。
export const LIMITS = {
	maxPlayers: 20,
	maxItems: 200,
	maxCustomFoods: 30,
	nicknameMax: 16,
	foodNameMax: 12,
	chatMax: 200,
	chatHistory: 30,

	uploadMaxBytes: 512 * 1024,
	uploadMaxDim: 512,
	// 瀏覽器先縮到這個大小再上傳，通常只有幾十 KB
	clientResizeDim: 256,
	uploadsPerMinute: 5,

	roomIdleMs: 24 * 60 * 60 * 1000,
} as const;

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const PLAYER_ID_RE = /^[a-z0-9-]{8,40}$/;
