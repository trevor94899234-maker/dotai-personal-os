# MyGiftStyle Etsy Decision OS — Advanced Roadmap

## 一句定位

Decision OS 不是另一個 Etsy Stats Dashboard。它把多個來源的證據、AI 員工工作、owner approval 和後續量度連成一條可追溯的 decision workflow。

## 現在的工作線

`Owner export → Evidence intake → Growth Radar → Proposed decision → Owner Gate → Owner live action → Learn`

- Etsy Stats／orders／revenue／carts／buyer questions 是第一方證據。
- eRank／EverBee 是日期化的第三方 context，不代替 Etsy truth。
- Codex 可以整理、比對、起草、QA、記錄 output 和 employee status。
- Codex 不登入外部平台、不收密碼或 MFA、不 scrape、不代替 owner publish。

## AI Office 應如何接力

| 次序 | 員工 | 任務 | Output |
|---|---|---|---|
| 1 | Data Consolidation | 合併 owner exports，標示來源、日期和欄位缺口 | evidence manifest |
| 2 | Etsy Growth Radar | 去重、排序訊號、只選一個 focus | decision JSON + report |
| 3 | Excel Analyst | 比較日期範圍、cohort、baseline 和 test result | measurement table |
| 4 | Trend Research | 分析已匯出的 keyword／market evidence | evidence notes |
| 5 | Content Creator | 在 positioning approved 後才起草 copy | draft package |
| 6 | Project Manager | 維護 WIP、owner gate、期限和下一個 checkpoint | work order |

## Integration ladder

### Level 1 — Owner exports（現在使用）

- Owner 在 Etsy、eRank、EverBee 下載 CSV 或 screenshots。
- Skill 只讀本機輸入，生成結構化 JSON、Markdown report 和 agent status。
- 優點：最快、安全、可 demo；缺點：不是即時，需要人手收集。

### Level 2 — Official Etsy API read-only（下一個合理階段）

- 前提：Developer app 獲批、OAuth scope 合適、secret 只存安全 runtime。
- 先做 read-only sync；加入 rate-limit、cache、retry、audit log 和 data minimisation。
- Dashboard 只讀處理後的安全摘要，不直接接觸 OAuth token。

### Level 3 — Etsy webhooks（有正式 endpoint 後）

- 用已驗證簽名的 order events 觸發「更新 learning queue」或提醒。
- Webhook 是事件入口，不是自動商業決策；仍要補取相應資料及跑 owner gate。

### Level 4 — Write／publish（保持鎖定）

- title、tags、price、image、inventory 或 publish 先產生 diff。
- 每一批 live changes 都要 `draft → QA → explicit owner approval`。
- 初期不建議 unattended publish；失敗回滾、權限和平台政策成本高。

## 下一輪最值得做的功能

1. **Evidence Inbox**：拖入多個 owner exports，產生 source/date/schema/authority manifest。
2. **Trust Ledger**：每個 metric 顯示 first-party、third-party、estimated、stale 或 missing。
3. **Decision History**：把 proposed／approved／rejected／inconclusive 決定寫成 append-only records。
4. **Experiment Register**：記錄 control、variable、start/end、protected listings 和 success rule。
5. **Approval Packet**：批准前顯示 change diff、風險、rollback、affected listing IDs。
6. **Learning Loop**：到期後比較 baseline 與 result，禁止沒有證據便宣稱「成功」。

## 2026-08-03 · Evidence Inbox + Trust Ledger v1

已完成本機、owner-controlled v1：

- Evidence Inbox manifest：source、coverage、authority、schema validation、
  completeness、missing／invalid files、used-in-decision 狀態。
- Strict normalized Etsy stats adapter：`Listing ID`、`Listing Name`、`Views`、
  `Visits`、`Favorites`、`Orders`、`Revenue`。
- Trust Ledger：每個 metric 顯示 authority、quality、freshness、source 和限制。
- Blank／invalid／explicit zero 分開；confidence 由 first-party focus rows 動態產生。
- 舊 v1 Dashboard JSON 會安全回落 v2 historical demo，不會令畫面崩潰。
- 仍然不接 Etsy API、不登入外部平台、不執行 live Etsy action。

v1 限制：search terms、traffic sources、Share & Save 只記錄 intake 狀態，
尚未解析內容或推斷 attribution。下一個 evidence checkpoint 應使用 owner-provided
normalized Etsy first-party summary 做 read-only run。

## Codex 如何真正嵌入 OS

### 現在

Dashboard 顯示 evidence 和 output；「複製下一輪 Codex brief」把結構化任務交回 Codex，Codex 再執行 repo Skill。

### 進階

讓 Dashboard 生成一個本機 `work-order.json`，內容只包括 input paths、task type、owner limits 和 expected outputs。Codex 讀取 work order、執行 Skill、寫回 result 和 agent status。

### 不應做

- 不讓 browser UI 任意執行 shell command。
- 不把 API key、OAuth token、customer data 放入 `public/data`。
- 不把第三方 estimated sales／revenue 當成 Etsy backend facts。
- 不因為 AI confidence 高就跳過 owner approval。
