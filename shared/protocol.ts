import type { CustomFood, GrillItem } from "./game";

export interface PlayerInfo {
	pid: string;
	name: string;
	color: string;
	score: number;
	online: boolean;
}

export interface ChatLine {
	pid: string;
	name: string;
	color: string;
	text: string;
	ts: number;
}

export type ClientMsg =
	| { t: "spawn"; foodId: string; x: number; y: number }
	| { t: "grab"; id: string }
	| { t: "drag"; id: string; x: number; y: number }
	| { t: "drop"; id: string; x: number; y: number }
	| { t: "flip"; id: string }
	| { t: "sauce"; id: string }
	| { t: "eat"; id: string }
	| { t: "cursor"; x: number; y: number }
	| { t: "chat"; text: string }
	| { t: "emote"; e: string };

export type RemoveReason = "eaten" | "burned";

export type ServerMsg =
	| {
			t: "welcome";
			now: number;
			heatScale: number;
			you: { pid: string; name: string; color: string };
			room: { code: string; host: string };
			uploadToken: string;
			players: PlayerInfo[];
			items: GrillItem[];
			customFoods: CustomFood[];
			chat: ChatLine[];
	  }
	| { t: "players"; players: PlayerInfo[] }
	| { t: "joined"; pid: string; name: string }
	| { t: "item"; item: GrillItem; by: string; action: "spawn" | "grab" | "drop" | "flip" | "sauce" | "release" }
	| { t: "drag"; id: string; x: number; y: number; by: string }
	| { t: "remove"; id: string; reason: RemoveReason; by?: string; score?: number }
	| { t: "cursor"; pid: string; x: number; y: number }
	| { t: "chat"; line: ChatLine }
	| { t: "emote"; pid: string; e: string }
	| { t: "customFood"; food: CustomFood }
	| { t: "error"; code: string; message: string };

export interface RoomPreview {
	exists: boolean;
	code: string;
	host: string;
	online: string[];
	itemsOnGrill: number;
	top: { name: string; score: number } | null;
	customFoods: Pick<CustomFood, "id" | "ext" | "name">[];
}
