# MyGiftStyle Etsy Decision OS - Demo Day

## 一句定位

將 Etsy、eRank、EverBee 和營運紀錄的零散證據，轉成一條有來源、有狀態、有 AI 員工分工、由店主批准的決策流程。

## 90 秒 Presentation Script｜五幕故事

### 開場 0–10 秒：先講結果

畫面：直接開啟「明日簡報版 · 五幕故事」，停留喺第一幕 `任務`。

台詞：

> 我今日想介紹嘅唔係另一個 Etsy 數據頁，而係一條由 shop evidence 去到一個 owner-approved decision 嘅工作流程。當資料、研究同過往決定分散，系統先幫我收窄成今日一個清楚嘅下一步。

### 第一幕｜任務 10–25 秒：由混亂變成下一步

停留喺 `任務`，或者按 `下一幕` 開始行五幕故事。

台詞：

> 第一幕係任務。店主唔需要先跳入好多工具，而係先知道而家發生緊乜、缺少乜，同埋下一步應該處理邊一件事。呢個畫面係整個工作流程嘅入口。

### 第二幕｜證據 25–40 秒：先相信來源，唔先相信猜測

點擊 `證據`。

台詞：

> 第二幕係 Evidence。系統唔係一見到數字就叫 AI 猜；每份資料都要睇 source、日期同 confirmation state。Missing、invalid 同 confirmed zero 會分開顯示，所以我知道係未有資料，定係真係零。

### 第三幕｜決策 40–55 秒：證據不足就安全停低

點擊 `決策`。

台詞：

> 有咗 evidence 之後，Decision control 先開始比較。如果 target、period 或 product truth 未齊，系統會停落嚟，清楚列出 blocker 同一個 safe next action。佢唔會扮有結論，亦唔會用不完整資料推我去改 listing。

### 第四幕｜草稿 55–70 秒：將方向變成可審核草稿

點擊 `草稿`。

台詞：

> 決定清楚之後，方向會變成一份可 review 嘅 Listing Brief，包括 title、tags、description 同 product claims。呢個係透明嘅 draft package，會連返證據；佢唔係自動 publish，亦唔係將商業判斷交畀 AI。

### 第五幕｜批准 70–85 秒：最後決定仍然喺店主手上

點擊 `批准`。

台詞：

> 最後由 Owner Gate 收口。AI 負責準備，店主檢查品牌語氣、產品真實性同商業判斷。即使 owner approve，都只代表可以手動處理；Dashboard 唔會連接 Etsy、修改 listing 或 publish 任何內容。

### 收尾 85–90 秒：講清楚今日展示嘅範圍

台詞：

> 所以今日展示嘅重點唔係所有 function 已經完成，而係日後每個 function 都可以沿用同一個順序：evidence → decision → draft → owner approval。今日簡報只講清楚呢條主線，之後嘅功能會沿住同一個版面繼續 develop。

## Presenter cues

- 每幕只講一個 message；先讀 `觀眾應該記得嘅重點`，再用一句補充 workflow。
- 唔需要逐個 demonstrate 所有 function；細節功能只作 supporting evidence。
- 如果被問到未完成嘅 function，直接講：`呢個係 concept prototype，current functions 會分階段完成；而家先確立 workflow 同安全邊界。`
- 全程保留 owner-controlled wording；唔好講成 AI 會自動改 listing、落廣告或者 publish。

## Demo 前檢查

- Dashboard 在本機開到，直接停喺「明日簡報版 · 五幕故事」，frame 係 MyGiftStyle 暖啡／奶油色並以 Etsy 橙作 accent。
- 五幕 `任務 / 證據 / 決策 / 草稿 / 批准` 全部可見，畫面唔出現 Historical Report 或 Prototype workspace。
- 每幕嘅 `觀眾應該記得嘅重點`、`證據先於建議` 同 `Live action 保持鎖定` 正常顯示。
- `下一幕` 可以由第一幕行到第五幕；390px 畫面冇橫向 overflow。
- 唔用假資料扮成 live Etsy 結果；所有數字、blocker 同草稿都標示為 local／概念展示狀態。
- 不展示客戶、訂單、密碼、OAuth token 或 API key。
- Git repo 保持 Private；`public/data/` 不進 Git。

## 100 字內 Portfolio 描述

我以 MyGiftStyle Etsy 店建立 Decision OS，把 owner 匯出的 Etsy、eRank 或 EverBee 證據交給個人化 AI Skills。系統分辨第一方與第三方資料、顯示證據缺口、重複 listing 風險、AI 員工狀態及 decision pipeline，再產生下一輪 Codex brief。所有 listing、價格、圖片及 publish 維持 locked，必須經 draft、QA 和 owner approval；AI 負責機械整理，我負責商業判斷。
