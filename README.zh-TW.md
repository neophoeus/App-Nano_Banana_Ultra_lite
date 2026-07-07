# Nano Banana Ultra _lite_ (繁體中文)

[English](README.md) | [繁體中文](README.zh-TW.md)

Nano Banana Ultra _lite_ 是 [App-Nano_Banana_Ultra](https://github.com/neophoeus/App-Nano_Banana_Ultra) 的瀏覽器前端輕量版。

它保留了 Gemini 影像生成、參考圖、風格控制、草圖與編輯器入口，以及瀏覽器端工作區保存這些核心前端流程，同時移除了不適合 Lite 邊界的較重型 Ultra 能力。

_lite_ 版預期在 Google AI Studio 中執行。Gemini API 會由 AI Studio 環境自動提供；_lite_ 不支援手動在瀏覽器輸入 API key，也不提供獨立本機 key 流程。

在 AI Studio 中，_lite_ 會使用 blocking Gemini 影像生成請求，不開啟瀏覽器 live-progress stream。當 final response 內含可見 thought 文字或 thought image 時，_lite_ 會從最後 payload 擷取；hidden thought signature 只作為 continuity metadata 保存，不當成可見思考顯示。

## Lite 範圍

- 以 React + Vite 為基礎的純前端瀏覽器版
- 保留提示詞生成、模型/比例/尺寸/風格控制
- 保留參考圖、草圖優先流程與輕量編輯器入口
- 以瀏覽器本地保存目前工作區狀態
- 保留多語系介面與主題切換

## Lite 已移除項目

- queued batch 工作流
- shared snapshot / shared restore 管線
- Gemini 影像生成 live-progress 串流；Lite 只從 blocking final response 讀取 thought artifacts
- 不適合前端輕量版的 backend-only 或長任務 orchestration

## 與 Ultra 的關係

如果你需要完整產品面、更重型的還原流程，或更完整的工程測試基礎，請使用上游完整版本：

- 上游 repo：<https://github.com/neophoeus/App-Nano_Banana_Ultra>
- 本機或手動 API key 使用情境：請改用完整版 Ultra

如果你要的是較簡單、較容易維護、以瀏覽器前端為主的體驗，就使用 _lite_。

## 版本

目前 Lite 版本：`v1.7.1`

版本紀錄請見 [CHANGELOG.md](CHANGELOG.md)。

## 目前 Lite 功能

### 創作

- 支援文字生圖，並保留模型、比例、尺寸與風格控制
- 可在同一個瀏覽器工作區中使用參考圖引導 prompt
- 保留提示工具與草圖優先入口，適合前期構想整理

### 延伸

- 以選取為中心的接續與分支流程，可在目前與較早 turn 之間切換延伸
- 保留輕量 editor 入口，引導做影像細修與畫面重構
- 直接顯示 stage source 與版本脈絡，避免下一輪失去來源

### 檢視

- 可重用目前結果的文字、prompt 脈絡與來源導向歷史
- 當結果有提供時，仍可檢視 grounding、provenance 與相關資訊面板
- 保留可比較鄰近變體的工作區流程，方便決定下一輪方向

### 保存

- 以瀏覽器本地保存工作區狀態，重新整理後仍可回到目前進度
- 保留多語系介面與主題切換
- 相較完整 Ultra，維持更小、更單純的前端維護面
