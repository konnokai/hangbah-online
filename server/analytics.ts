// 站長用的使用統計，寫到 Workers Analytics Engine，用 Grafana 查。
// 欄位對照與查詢範例在 docs/analytics.md。不寫 pid、暱稱、聊天內容和上傳檔名。

export type AnalyticsEvent =
	| "room_created"
	| "player_joined"
	| "player_left"
	| "room_full"
	| "food_spawned"
	| "food_eaten"
	| "food_burned"
	| "food_sauced"
	| "chat_sent"
	| "emote_sent"
	| "upload_ok"
	| "upload_rejected"
	| "room_wiped";

export interface AnalyticsFields {
	room?: string;
	food?: string;
	detail?: string;
	v1?: number;
	v2?: number;
	v3?: number;
}

/** 自訂食材的 id 是上傳時產生的 UUID，統計只記 custom，不把上傳內容帶出房間。 */
export function foodKey(foodId: string): string {
	return foodId.startsWith("c:") ? "custom" : foodId;
}

export function track(ds: AnalyticsEngineDataset | undefined, event: AnalyticsEvent, f: AnalyticsFields = {}) {
	if (!ds) return;
	try {
		// 欄位位置固定：blob1 事件、blob2 食材、blob3 細節、blob4 房號；double1–3 依事件而定
		ds.writeDataPoint({
			indexes: [event],
			blobs: [event, f.food ?? "", f.detail ?? "", f.room ?? ""],
			doubles: [f.v1 ?? 0, f.v2 ?? 0, f.v3 ?? 0],
		});
	} catch {
		// 統計寫不進去不能影響遊戲
	}
}
