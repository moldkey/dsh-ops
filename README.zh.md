# @liangjiehappy/dsh-ops — DSH 運維工作台

[English](README.md)

跑在 DSH 裡的開發運維工作台。檢查站點的健康、SEO、GEO、代碼與安全，
並提供快照、部署、回滾，失敗自動恢復。

**16 個工具 + 1 個技能。**

## 安裝

```bash
dsh plugin --profile web add @liangjiehappy/dsh-ops
```

然後設定 API key（在 <https://dshio.org/me/> 生成）：

```bash
dsh plugin config dsh-ops --set api_key=<你的 key>
```

或設定環境變數 `DSH_OPS_KEY`。

## 工具

| 工具 | 做什麼 | 會改系統嗎 |
|---|---|---|
| `ops_status` | 所有站點摘要：總分、分類得分、最後部署、未解決問題數 | 否 |
| `ops_check` | 對單站跑 15 個檢查器，返回詳細通過/警告/失敗 | 否 |
| `ops_issues` | 未解決問題清單，按嚴重程度排序，含首次發現與出現次數 | 否 |
| `ops_snapshot` | 增量快照（sha256 對比 + 硬鏈接）| 是（只增不刪）|
| `ops_deploy` | 部署，含影響分析、自動快照、驗證失敗自動回滾 | **是** |
| `ops_rollback` | 回滾到指定快照 | **是** |
| `ops_restart` | 重啟 systemd 服務 | **是** |
| `ops_traffic` | 真實流量：今天 vs 昨天，真人/機器人/SW 分開，列出真人最常看的頁面與落地頁 | 否 |
| `ops_http` | 從伺服器側探測頁面 HTTP 狀態、大小、標題、耗時 | 否 |
| `ops_migrate_check` | 遷移驗收：同一批路徑分別打舊站與新站，逐條比狀態碼，找出「舊站有、新站沒有」的回歸 | 否 |
| `ops_read` | 讀伺服器文字檔（代碼/設定/日誌），帶行號、自動打碼密鑰 | 否 |
| `ops_service` | 服務狀態 / 重啟 / 重載 / `nginx -t`（只限授權單元） | **是**（restart/reload）|
| `ops_exec` | 只讀診斷指令目錄：`df` `du` `ps` `uptime` `wc` `grep` `nginx_test` | 否 |
| `ops_disk` | 磁盤體檢與清理：journal / nginx 緩存 / 舊快照 / 舊壓縮日誌，默認先預覽 | **是**（clean 時） |
| `ops_verify` | 狀態漂移檢查：改過的東西有沒有被回滾（導航/分層/指紋/301/統計等 9 項） | 否 |
| `ops_teardown` | 對標站點拆解分析：欄目結構、導航分組、標題層級、結構化數據、技術特徵 | 否 |

## 遷移驗收（`ops_migrate_check`）

遷機、換域名、換 CDN 之後跑一遍：同一批路徑分別打舊站和新站，逐條比狀態碼。
**不需要 API key，自帶 HTTP 探測，任何用戶裝上就能用。**

```
ops_migrate_check(
  source: "https://1.2.3.4",         // 舊站（用 IP 時配合 source_host）
  source_host: "example.com",        // 舊站的 Host 頭
  target: "https://new.example.com",
  // paths: 不傳則自動從新站 sitemap.xml 抓
  insecure: true                      // 證書還沒簽好 / 用 IP 訪問
)
```

輸出：

```
路徑                                      舊站    新站  判定
----------------------------------------------------------------
/                                      200   200  ✓
/upgrade/                              200   404  ❌ 回歸
/pricing/                              404   200  NEW

匯總: OK 6 · 回歸 4 · 新增 1 · 兩邊都缺 0
```

判定：`REGRESSION` 舊站有、新站沒有（必須修）；`NEW` 新增；`OK` 一致；`BOTH_MISSING` 兩邊都 404。

只發 GET，不登錄、不提交表單、不改任何東西。

## 檢查器（15 個）

| 類別 | 檢查器 |
|---|---|
| 部署 | `deploy_smoke` `deploy_assets` `deploy_sitemap` |
| SEO | `seo_title` `seo_desc` `seo_canonical` `seo_hreflang` `seo_structured` |
| GEO | `geo_ai_crawler` `geo_citable` |
| 代碼 | `code_language_mix` `code_package_clean` `code_secret` |
| 安全 | `sec_fail2ban` `sec_backup` |

每一個都是從真實事故裡長出來的：

- `deploy_assets` ← 一次 `rsync --delete` 刪掉 3 個靜態 JS，手機適配、反饋按鈕、PWA 提示全部失效 4 天
- `code_language_mix` ← 中文插件裡混進了 6 行荷蘭語
- `code_package_clean` ← `.bak` 備份文件被發上了 npm
- `deploy_sitemap` ← sitemap 超過 5 萬 URL 上限

## 技能

`ops-guide` —— 當使用者問站點狀態、要部署、要回滾時載入。
它說明該用哪個工具、危險操作前該確認什麼、部署影響分析怎麼讀。

## 部署的三層保護

1. **源頭完整性** —— build 目錄缺少預期子目錄時中止（說明上次構建不完整）
2. **影響分析** —— 列出所有會被刪的文件；既有源頭沒有、又不在刪除白名單的，中止部署
3. **驗證 + 回滾** —— 部署前自動快照；部署後跑 smoke 檢查；失敗自動回滾

**強烈建議先用 `dry_run: true` 跑一次看影響分析。**

## 數據來源

API：`https://deepseekbase.com/work/api/`

第三方非官方項目，與 DeepSeek 官方無關。

- 首頁：<https://deepseekbase.com/work/>
- 標準：<https://dshio.org/>
- 許可：MIT
