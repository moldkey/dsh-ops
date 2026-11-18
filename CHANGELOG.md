# Changelog

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
