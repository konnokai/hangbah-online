# 使用統計

事件寫到 Workers Analytics Engine 的 `hangbah_events` dataset（`wrangler.jsonc` 的 `ANALYTICS` 綁定）。
所有寫入都走 `server/analytics.ts` 的 `track()`。

- 不記 pid、暱稱、聊天內容、上傳檔名。自訂食材一律記成 `custom`。
- 資料保留 3 個月。免費方案每天可寫 10 萬筆。
- 本機 `npm run dev` 和 vitest 裡寫入是空操作，看不到資料。測試用假 dataset 檢查寫了什麼（`test/analytics.test.ts`）。

## 欄位

每筆資料點的位置固定：

| 欄位 | 內容 |
|---|---|
| `index1`、`blob1` | 事件名稱 |
| `blob2` | 食材 id（`meat`、`corn`…，自訂食材是 `custom`） |
| `blob3` | 細節，依事件而定 |
| `blob4` | 房號 |
| `double1`–`double3` | 數值，依事件而定 |

| 事件 | 什麼時候 | blob3 | double1 | double2 | double3 |
|---|---|---|---|---|---|
| `room_created` | 開房成功 | | | | |
| `player_joined` | 玩家進房（同一個玩家多開分頁不算） | `new`／`return` | 進房後在線人數 | | |
| `player_left` | 玩家最後一個分頁離開 | | 離開後在線人數 | | |
| `room_full` | 人滿被擋 | | | | |
| `food_spawned` | 放食材 | | 在烤架上 1，桌面 0 | | |
| `food_eaten` | 吃掉 | | 分數 | 完美 1／0 | 有刷醬 1／0 |
| `food_burned` | 燒毀 | `alarm`（時間到）／`lazy`（有人動到才發現） | | | |
| `food_sauced` | 刷醬 | | | | |
| `chat_sent` | 聊天 | | 字數 | | |
| `emote_sent` | 表情 | emoji | | | |
| `upload_ok` | 上傳成功 | 副檔名 | bytes | | |
| `upload_rejected` | 上傳被拒 | 錯誤碼 | | | |
| `room_wiped` | 閒置 24 小時清掉 | | 存活毫秒 | 玩家總數 | 自訂食材數 |

## 查詢

Analytics Engine 會抽樣，**計數一律用 `SUM(_sample_interval)`**，不要用 `COUNT()`。
平均值要加權：`SUM(double1 * _sample_interval) / SUM(_sample_interval)`。

SQL API：`POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql`，
header `Authorization: Bearer <token>`，token 權限要有 `Account Analytics: Read`。

```sql
-- 最近 30 天每天各事件次數
SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS event,
       SUM(_sample_interval) AS n
FROM hangbah_events
WHERE timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day, event
ORDER BY day

-- 各食材 放／吃／燒
SELECT blob2 AS food,
       sumIf(_sample_interval, blob1 = 'food_spawned') AS spawned,
       sumIf(_sample_interval, blob1 = 'food_eaten') AS eaten,
       sumIf(_sample_interval, blob1 = 'food_burned') AS burned
FROM hangbah_events
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob2 != ''
GROUP BY food
ORDER BY spawned DESC

-- 完美率和平均分數
SELECT SUM(_sample_interval * double2) / SUM(_sample_interval) AS perfect_rate,
       SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_score
FROM hangbah_events
WHERE blob1 = 'food_eaten' AND timestamp > NOW() - INTERVAL '7' DAY
```

## Grafana

1. Cloudflare 建 API token，權限 `Account Analytics: Read`。
2. Grafana 安裝 Altinity plugin for ClickHouse（`vertamedia-clickhouse-datasource`）。
3. 新增 datasource：URL 填上面的 SQL API 網址，auth 選項全部關掉，加自訂 header `Authorization`，值 `Bearer <token>`。
4. Dashboards → New → Import，上傳 `docs/grafana-dashboard.json`，選剛才的 datasource。

注意事項（依 plugin 原始碼整理，還沒對真的 WAE 跑過）：

- plugin 預設用 GET 送查詢，WAE 文件只寫了 POST。面板出現錯誤的話，到 datasource 設定打開「Use POST method」。
- plugin 會自己在查詢後面加 ` FORMAT JSON`，查詢裡不要再寫 `FORMAT`。
- dashboard 的每個查詢都設定 DateTime 欄位是 `timestamp`、型別 `DATETIME`，Date 欄位留空。`$timeSeries` 和 `$timeFilter` 展開後只用到 `intDiv`、`toUInt32`、`toDateTime`，WAE 都支援。
- 時間序列面板的第一欄要是 `$timeSeries AS t`。要分組的欄位取別名 `label`，並寫 `GROUP BY label, t`。plugin 靠 GROUP BY 的名字找分組欄位，寫 `GROUP BY blob1` 會對不上。
## 已知限制

- 在線人數是各房間自己的值，全站同時在線峰值算不出來。能看的是每房峰值（`MAX(double1)`）和活躍房間數（`count(DISTINCT blob4)`）。
- 免費方案超過每天 10 萬筆時會怎樣，官方文件沒寫清楚。`track()` 出錯會被吞掉，不影響遊戲。
