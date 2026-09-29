# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案

「夯肉」多人線上烤肉小遊戲。畫面上的名稱一律用中文「夯肉」，`hangbah` 只用在專案名、Worker 名、儲存 key。
Vue 3 + Vite 前端（`src/`），Cloudflare Workers 後端（`server/`），兩邊共用的規則與型別在 `shared/`。

## 指令

```powershell
npm run dev                 # Vite + @cloudflare/vite-plugin，DO / R2 / WebSocket 都在本機模擬
npm test                    # vitest run（跑在 workerd 裡）
npx vitest run test/room.test.ts -t "燒毀"   # 跑單一檔案 / 單一測試
npm run type-check          # vue-tsc --build，含 app / worker / test 三個 tsconfig
npm run build               # type-check + vite build
npm run cf-typegen          # 改 wrangler.jsonc 後必跑，重新產生 worker-configuration.d.ts 的 Env
npm run icons               # 從 assets-src/campfire.png 產生 public/ 的 favicon、logo、og.png
```

- `.npmrc` 設了 `legacy-peer-deps=true`：npm 10 在這組套件上會報 `Cannot read properties of null (reading 'edgesOut')`。
- 本機想加快烤熟速度：`.dev.vars` 放 `HEAT_SCALE=10`（已 gitignore，範例在 `.dev.vars.example`）。
- `npm run dev` 在大量改檔後偶爾會白畫面（瀏覽器在等舊的 dep hash）。重開 dev server，必要時刪 `node_modules/.vite`。
- `scripts/build-icons.mjs` 用 Windows 的「Microsoft JhengHei」字型畫 og.png 的中文字。

## 部署

Cloudflare Workers Builds 連 GitHub：推到 `master` 就自動部署到 https://hangbah.konnokai.me 。
Build command `npm test && npm run build`，deploy command `npx wrangler deploy`。
R2 bucket `hangbah-online-images` 要事先存在。

## 架構重點

**一個房間 = 一個 Durable Object**（`server/room.ts` 的 `BbqRoom`，`env.ROOMS.getByName(code)`）。
- 用 WebSocket Hibernation API，玩家資料（pid、暱稱、顏色、upload token）放在 `serializeAttachment`，不要放 instance 欄位，休眠後會消失。
- 所有狀態存 DO SQLite（items、players、custom_foods、chat、meta）。Server 是唯一真相，client 只送意圖（`shared/protocol.ts` 的 `ClientMsg`）。
- 房號只能由 `POST /api/rooms` 建立，DO 用 `meta.code` 判斷「存在」。沒建立過的房號一律 404，不會自動生出空房間。
- 人滿時先 accept 再送 `room_full` 並用 4003 關閉，因為瀏覽器讀不到 WebSocket 握手失敗的 HTTP 狀態碼。

**熟度是線性公式，沒有 tick**（`shared/game.ts`）。
- 每個食材存兩面已結算熟度 `acc` 和開始加熱時間 `since`；`since === null` 代表不在烤架上或被夾著。
- 改位置、翻面、夾起前都要先 `settle()`（用舊位置結算），再改欄位。順序錯了熟度會算錯。
- `heatAt(x, y)` 依位置決定火力；`HEAT_SCALE`（wrangler vars）是全域倍率，在 `welcome` 訊息裡傳給 client。
- client 用同一套公式加上 server 時鐘 offset（`useRoom` 的 `now()`）自己算熟度。

**Alarm 只有一個**，`scheduleAlarm()` 設成「下一個食材燒毀時間」和「最後一人離開 + 24 小時」中比較早的那個。每次會影響加熱的動作後都要重排。
閒置清理會刪 SQLite 資料和 R2 的 `rooms/{code}/` 前綴。
client 端（`Grill.vue`）算到燒毀門檻就先播動畫，並把 id 放進 `gone`，等 server 的 `remove` 才真正刪掉，避免食材重新出現。

**Worker 路由**（`server/index.ts`）：`wrangler.jsonc` 的 `run_worker_first` 只讓 `/api/*`、`/ws/*`、`/r/*` 進 Worker，其餘由 static assets（SPA fallback）處理。

**分享預覽**（`server/preview.ts`）：`/r/:code` 用 `env.ASSETS` 拿 `index.html`，再用 HTMLRewriter 換成房間專屬的 OG 標籤，加上 Discord Components V2 的 `<script id="discord:component-embed">`。
- Discord 只讀 server 輸出的 HTML，所以不能改成 client 端插入。
- 規格限制：根是 Container（type 17）、只能用 type 1/2/9/10/11/12/14/17、按鈕只能 style 5、JSON ≤ 3000 bytes、元件 ≤ 40。超過時 `buildPreview` 會依序砍內容。
- 刻意不放使用者上傳的圖（不把上傳內容帶到站外）。

**自訂食材上傳**：client 在 `src/utils/resizeImage.ts` 縮圖轉 WebP → `POST /api/rooms/:code/foods`，header 帶 `X-Upload-Token`（連線時 DO 發的）→ DO RPC `authorizeUpload` 檢查 token、頻率 → `server/upload.ts` 用 magic bytes 和圖片 header 判斷格式與寬高（只收 PNG/JPEG/WebP，不收 SVG）→ 存 R2 → `addCustomFood` 廣播。
滿 `maxCustomFoods` 時 `addCustomFood` 會移除最舊的一種（優先挑烤架上沒在用的），連同它的烤架食材（`remove` reason `evicted`）和 R2 圖片，再廣播 `customFoodRemoved`。
所有上限在 `shared/limits.ts`，前後端共用。

**使用統計**（`server/analytics.ts`）：寫到 Workers Analytics Engine（綁定 `ANALYTICS`），站長用 Grafana 看。
- 一律走 `track()`，欄位位置和事件表在 `docs/analytics.md`，Grafana dashboard 在 `docs/grafana-dashboard.json`。新增事件時兩份文件要一起更新。
- 不記 pid、暱稱、聊天內容、上傳檔名；自訂食材用 `foodKey()` 記成 `custom`。
- 本機和 vitest 裡寫入是空操作。測試用 `runInDurableObject` 把 DO 的 `env.ANALYTICS` 換成假 dataset（`test/analytics.test.ts`）。

**玩家身分**：pid 和暱稱都存 `localStorage`，同一個瀏覽器的所有分頁是同一個玩家（server 用不重複的 pid 算人數、在線狀態）。本機要測「兩個不同玩家」，用無痕視窗或另一個瀏覽器。

**前端**
- `src/composables/useRoom.ts`：WebSocket、自動重連、reactive 狀態、事件（`on()`）。
  - 每 5 秒送一次文字 `ping`，同時負責保持連線和量延遲（`state.latency`，顯示在房號旁邊）。server 用 `setWebSocketAutoResponse` 自動回 `pong`，不會喚醒 DO，也不計費。
- `src/components/Grill.vue`：桌面座標 0–1（比例固定 16:10，烤架範圍是 `shared/game.ts` 的 `GRILL`）、拖曳、點一下翻面、點兩下吃、門檻音效。
- `src/foods/*.vue`：內建食材是手寫 SVG，顏色用 `cookColor(palette, d)` 依熟度內插。`FOOD_ASPECT` 必須跟各元件的 viewBox 一致；顯示寬度在 `BUILTIN_FOODS.width`。
- `src/audio/sfx.ts`：Web Audio 即時合成，沒有音檔。`AudioContext` 要在使用者操作時 `sfx.unlock()`。
- 烤架外面包了 `.board`，上面疊兩層，基本上是 `pointer-events: none`，盡量不擋到拖曳：
  - 排行榜：`PlayerList`，電腦版、手機版都疊在烤架左上角，手機版縮小。名單可以捲動，所以名單那塊會吃滑鼠事件（標題列不會）。自己那列用 `position: sticky` 貼在上下緣。
  - 聊天彈幕：`Danmaku.vue`，RoomView 收到 `chat` 事件時呼叫 `push()`。每則固定飄 7 秒，軌道用字寬和時間計算。
- 聊天室（`ChatBox`）平常收起來，只剩按鈕，未讀數顯示在按鈕上。電腦版按鈕在畫面左下角，打開後浮在烤架上；手機版（≤ 960px）按鈕在標題列音效按鈕左邊，打開後蓋滿畫面。用 `v-show`，收起來時打到一半的字還在。
- 電腦版右欄只放食材盤：`.side` 用 `contain: size`，高度跟烤架那欄一樣。食材太多時在盤子裡捲動，捲軸隱藏，改用往下箭頭提示。手機版不限高度，因為食材按鈕是 `touch-action: none`（要拖曳），在上面滑不能捲動。
- 食材盤按住不動 450ms 會放大預覽（`RoomView` 的 `trayDrag.peeking`），放開不會放上烤架；預覽中拖動就照常拖曳。
- 隱藏玩家：`useMutedPlayers`，存在 `localStorage` 的 `hangbah:muted:<房號>`，只在本機生效。會過濾聊天、彈幕、表情，不影響食材和游標。
- 翻面動畫在 `FoodItem.vue`：`side` 一變就播。先凍結舊的兩面熟度，轉到側面（一半時間）才換色。
- 減少動態效果（`prefers-reduced-motion`）時，彈幕和翻面動畫都關掉。
- `RoomView.vue` 離開前會確認：路由離開用 `onBeforeRouteLeave` 加上自訂 `ConfirmDialog`；關分頁或重新整理用 `beforeunload`。About 由頁尾開成對話框（`SiteFooter.vue`），不切換路由，才不會把人帶離房間。

## 測試

- 用 `@cloudflare/vitest-plugin`（不是舊的 vitest-pool-workers），vitest 要維持 4.1.x。
- 整合測試用 `cloudflare:workers` 的 `exports.default.fetch`；WebSocket 客戶端在 `test/helpers.ts`。
- `vitest.config.ts` 把 `HEAT_SCALE` 設成 1000，並用 serviceBinding 假造 `ASSETS`，因為測試環境沒有 build 出來的 `index.html`。
- 本機 runtime 可能自己先觸發 alarm，所以不要斷言 `runDurableObjectAlarm()` 的回傳值，改等廣播訊息。

## 版權

Logo / favicon 是 Flaticon 的 campfire 圖示（photo3idea_studio），授權要求標示出處，標示文字在 `src/views/AboutView.vue`，不能移除。
其他圖像與音效為本專案自製。
