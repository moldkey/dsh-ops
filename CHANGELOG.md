## 0.5.16

- ops_read 明确 project 必填，跨机项目走 SSH
- ops_doctor 对跨机项目在远端检查目录
- 服务端同步修复：remote_json 回退识别、SQLite Row 兼容、缺失 slug 返回 400

## 0.5.15

- 工具层无功能变更；配合服务端修复发布（ops_restart 恢复、oracleluck JSON-LD 守卫）

## 0.5.14

- ops_check 对 skip 状态显示 –，不再误显示 ✗

## 0.5.13

- ops_service 支持 stop / disable / enable（需服务端 ops_ext 同步支持）
- 流量输出在真人 UV 后显示访客 / 单页 / 多页

## 0.5.11

- 修复 ops_exec 参数合并：path/pattern 等未传时会覆盖 args 里的同名字段，content/old/new 也能透传

## 0.5.10

- README 增加右侧面板说明：标签位置、自动打开、看不到面板的排查、权限、工具调用顺序
- README 增加问题反馈途径：面板内反馈框、站点反馈按钮、插件页入口
- 面板「体检」改为显示进度与汇总（总分/通过/警告/失败），不再直接吐原始证据 JSON
- 面板公共信息区新增「平台站点」：deepseekbase/dshio/baovoo/mj7/mfgabc/cadpop/deepseeks/oracleluck，带状态点，点击直达
- 面板注册改为 slots.inject，修复 rc.5 下右侧栏不显示

# Changelog

## 0.5.3 — 2026-11-19

### 修复

- 恢复被截断的 `lib/index.js`（0.5.2 包内文件不完整，安装后无法激活）。
- 0.5.2 的文档更新（21 工具、BAOVOO 章节、徽章链接）保留。


## 0.5.2 — 2026-11-19

### 文档

- README（中/英）更新为 21 个工具，新增「发布到 BAOVOO 托管」章节与更新记录。
- 徽章链接改为正确的插件页 `liangjiehappy-dsh-ops`（原链接指向了同名他人插件）。


## 0.5.0 — 2026-11-19

### 新增工具

- **ops_backup**：备份项目所在服务器的数据库。自动探测可用的 `pg_dump` 版本，导出结构到 `/root/ops/backups/db` 并 gzip，保留最近 7 份，返回文件路径与体积。
- **ops_migrate_check**：迁移验收。把同一批路径分别打到「旧站」和「新站」，逐条比对状态码，找出「旧站有、新站没有」的回归。迁机、换域名、换 CDN 后应跑一遍；只发 GET，只读。不传 paths 时自动从新站 `sitemap.xml` 抓取路径。

### 新增文件

- `lib/migrate.js`：迁移比对实现
- `example-migrate.mjs`：迁移验收示例脚本

### 保持不变

- 全部既有 19 个工具不变（含 `publish_hosted`：把站点发布到 BAOVOO 托管子域，如 `alice.baovoo.com`）
- 兼容 DSH >= 0.2.0-rc.2，DSHIO/T 10 静态检查通过

### 升级

```bash
dsh plugin --profile <name> add @liangjiehappy/dsh-ops@0.5.0
```