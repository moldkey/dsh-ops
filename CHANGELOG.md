# Changelog

## 0.5.1 — 2026-11-19

### 修复

- 修复 0.5.0 发布包中 `lib/index.js` 被截断导致插件无法激活的问题（`failed to import: SyntaxError: Unexpected end of input`）。
- 0.5.0 的其余变更不变。

## 0.5.0 — 2026-11-19

### 新增工具

- **ops_backup**：备份项目所在服务器的数据库（pg_dump → `/root/ops/backups/db`，保留最近 7 份）。
- **ops_migrate_check**：迁移验收，同一批路径分别打旧站与新站，逐条比对状态码。

### 新增文件

- `lib/migrate.js`、`example-migrate.mjs`

### 保持不变

- 既有 19 个工具不变（含 `publish_hosted`：发布到 BAOVOO 托管子域）。
