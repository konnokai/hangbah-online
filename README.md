# 夯肉（hangbah-online）

多人線上烤肉小遊戲。開一個烤肉場，把連結丟給朋友，大家在同一個烤架上一起烤。

- 前端：Vue 3 + Vite + TypeScript（`src/`）
- 後端：Cloudflare Workers（`server/`）
  - 每個房間是一個 Durable Object（`BbqRoom`），用 WebSocket Hibernation API 同步、SQLite 存狀態
  - 自訂食材圖片存在 R2
- 前後端共用的遊戲規則和上限：`shared/`

## 開發

```powershell
npm install
npm run dev
```

打開 http://localhost:5173 。本機的 Durable Object、R2 都由 Vite plugin 模擬，不用登入 Cloudflare。

想快點看到燒焦、燒毀，把 `.dev.vars.example` 複製成 `.dev.vars`，調大 `HEAT_SCALE`。

| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發 |
| `npm test` | 跑測試（`@cloudflare/vitest-plugin`，跑在 Workers runtime） |
| `npm run type-check` | 型別檢查 |
| `npm run build` | 建置 |
| `npm run cf-typegen` | 改完 `wrangler.jsonc` 後重新產生 `Env` 型別 |
| `npm run icons` | 從 `assets-src/campfire.png` 重新產生 favicon、logo、分享預覽圖 |

`.npmrc` 設了 `legacy-peer-deps=true`：npm 10 的 arborist 在這組套件上會崩潰（`Cannot read properties of null (reading 'edgesOut')`）。

## 部署

```powershell
npx wrangler login
npx wrangler r2 bucket create hangbah-online-images
npm run deploy
```

## 架構重點

- **熟度不用 tick**：每個食材存「已結算熟度」和「開始加熱時間」，目前熟度用線性公式算（`shared/game.ts`）。server 和 client 用同一個公式，沒人操作時 DO 可以休眠。
- **Alarm**：設成「下一個食材燒毀的時間」和「24 小時閒置清理」中比較早的那個。所有人都離開，食材還是會照時間燒掉。
- **分享預覽**：`/r/:code` 由 Worker 用 HTMLRewriter 改寫 `<head>`，放房間專屬的 Open Graph 標籤和 Discord Components V2 `discord:component-embed`（規格：https://github.com/discord/discord-api-docs/pull/8606 ）。
- **上傳驗證**：瀏覽器先縮圖；Worker 再用 magic bytes 判斷格式、解析 header 讀寬高、限制大小，只收 PNG / JPEG / WebP。

## 版權

Logo / favicon：<a href="https://www.flaticon.com/free-icons/bbq-grill" title="BBQ grill icons">BBQ grill icons created by photo3idea_studio - Flaticon</a>。其他圖像和音效為本專案自製。
