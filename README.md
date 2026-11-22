[![DSHIO/T 10](https://dshio.org/badge/std.svg)](https://dshio.org/10/) [![deepseekbase](https://deepseekbase.com/badge/liangjiehappy-dsh-ops.svg)](https://deepseekbase.com/plugins/liangjiehappy-dsh-ops/)
# @liangjiehappy/dsh-ops — DSH Ops Workbench

[中文说明](README.zh.md)

A dev/ops workbench for DSH-managed sites. It checks health, SEO, GEO, code
and security, and does snapshot / deploy / rollback with automatic recovery.

**21 tools + 1 skill. Includes BAOVOO hosting publish (`ops_publish_hosted`) and migration acceptance checks.**

## Install

```bash
dsh plugin --profile web add @liangjiehappy/dsh-ops
```

Then set your API key (get one at <https://dshio.org/me/>):

```bash
dsh plugin config dsh-ops --set api_key=<your-key>
```

Or set the environment variable `DSH_OPS_KEY`.

## Tools

| Tool | What it does | Mutates |
|---|---|---|
| `ops_status` | Summary of all sites: score, per-category score, last deploy, open issues | no |
| `ops_check` | Run 15 checkers on one site, return detailed pass/warn/fail | no |
| `ops_issues` | Open issues, sorted by severity, with first-seen and count | no |
| `ops_snapshot` | Incremental snapshot (sha256 diff + hard links) | yes (add only) |
| `ops_deploy` | Deploy with impact analysis, auto-snapshot, auto-rollback | **yes** |
| `ops_rollback` | Restore to a snapshot | **yes** |
| `ops_restart` | Restart a systemd service | **yes** |
| `ops_traffic` | Real traffic: today vs yesterday, humans vs bots vs service worker, top pages and landing pages | no |
| `ops_http` | Probe page status, size, title and latency from the server | no |
| `ops_migrate_check` | Migration acceptance: hit the same paths on old and new host, diff status codes, surface "exists on old, missing on new" regressions | no |
| `ops_read` | Read a server text file (code/config/log) with line numbers and secret redaction | no |
| `ops_service` | Service status / restart / reload / `nginx -t` (authorised units only) | **yes** (restart/reload) |
| `ops_exec` | Read-only diagnostics: `df` `du` `ps` `uptime` `wc` `grep` `nginx_test` | no |
| `ops_disk` | Disk status / cleanup (journal, nginx cache, old snapshots, old rotated logs); dry-run by default | **yes** (on clean) |

## Publish to BAOVOO hosting (`ops_publish_hosted`)

Ship a finished static site to `<name>.baovoo.com` with SSL and a subdomain:

```
ops_publish_hosted(
  name: "alice",              // subdomain prefix → alice.baovoo.com
  src: "/var/www/mysite"      // directory to publish
)
```

Requires the project to be linked to BAOVOO hosting. No site yet? Start at
<https://baovoo.com/>; plugins and verdicts live at
<https://deepseekbase.com/plugins/>.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). 0.5.0 adds `ops_backup` and
`ops_migrate_check`, and keeps `ops_publish_hosted` (BAOVOO hosting publish).

## Migration acceptance (`ops_migrate_check`)

After moving a site to a new host, changing domains or switching CDN: hit the same
paths on old and new host and diff the status codes. **No API key needed — it probes
over plain HTTP, so any user can run it right after install.**

```
ops_migrate_check(
  source: "https://1.2.3.4",         // old host (IP works with source_host)
  source_host: "example.com",        // Host header for the old host
  target: "https://new.example.com",
  // paths: omitted => discovered from the new host's sitemap.xml
  insecure: true                      // cert not ready / accessing by IP
)
```

Verdicts: `REGRESSION` exists on old, missing on new (must fix); `NEW`; `OK`; `BOTH_MISSING`.
GET only — no login, no form posts, no writes.

## Checkers (15)

| Category | Checkers |
|---|---|
| deploy | `deploy_smoke` `deploy_assets` `deploy_sitemap` |
| seo | `seo_title` `seo_desc` `seo_canonical` `seo_hreflang` `seo_structured` |
| geo | `geo_ai_crawler` `geo_citable` |
| code | `code_language_mix` `code_package_clean` `code_secret` |
| security | `sec_fail2ban` `sec_backup` |

## Skill

`ops-guide` — loaded when the user asks about site status, deployment or
rollback. It explains which tool to use, what to check before a risky
operation, and how to read the deploy impact analysis.

## Deploy safety — three layers

The `ops_deploy` tool was built in response to a real incident: an
`rsync --delete` removed 3 static JS files and broke mobile layout, the
feedback button and the PWA prompt for 4 days.

1. **Source completeness** — if the build directory is missing expected
   subdirectories, deploy aborts (source is older than target).
2. **Impact analysis** — the tool lists every file that would be deleted.
   Files not in the source *and* not on the delete whitelist abort the deploy.
3. **Verify + rollback** — a snapshot is taken before deploy; smoke checks run
   after; any failure triggers automatic rollback.

Always run `ops_deploy` with `dry_run: true` first.

## Data source

API: `https://deepseekbase.com/work/api/`

Third-party project. Not affiliated with DeepSeek.

- Homepage: <https://deepseekbase.com/work/>
- Standards: <https://dshio.org/>
- License: MIT
## 装完之后先看什么

1. 跑一次体检：`ops_status` 看你管的所有站点
2. 有问题的站：`ops_issues` 看清单，`ops_check` 复查
3. 要改站点：先 `ops_snapshot`，再 `ops_deploy`（dry-run 看影响）
4. 工具集合（2,268 个工具，一条命令）：<https://deepseekbase.com/bundles/>
5. 标准引用：DSHIO/T 10 插件标准 · DSHIO/T 21 测试条件 · DSHIO/T 32 认证规则

## Side panels

Installing this plugin adds two tabs to the DSH right sidebar:

| Tab | What it does |
|---|---|
| **DSH-OPS** | Site overview and actions: site count, healthy / needs attention, open issues, last check; after sign-in shows account, role and your sites; per-site actions: open, check, snapshot, deploy |
| **DSH-DEV** | Plugin development: scaffold, static checks, four-stage sandbox results |

DSH-OPS opens automatically about 1.5 s after install.

**Panel missing?**

1. Make sure the plugin is 0.5.9 or newer (0.5.8 and earlier do not render on rc.5)
2. Open the right-sidebar tab list and pick DSH-OPS
3. Still missing: restart DSH (a page refresh is not enough)

**Permissions:** owner / admin can check, snapshot and deploy; operator can only check.

## Recommended workflow

    1. ops_status            scores and open issues for every site
    2. ops_issues            issue list for one site
    3. ops_check             re-check to confirm
    4. ops_snapshot          snapshot before deploying
    5. ops_deploy(dry_run=1) review impact first
    6. ops_deploy            deploy
    7. ops_check             verify after deploy

Use `ops_rollback` with the snapshot from step 4 if a deploy fails. Every action is written to the audit log.

## Feedback

Three ways to report a problem or request a feature; all land in the same feedback store:

1. **In the panel**: the "问题反馈" box at the bottom of the DSH-OPS panel (at least 10 characters)
2. **On the website**: the "问题反馈" button at the bottom-right of any page on deepseekbase.com
3. **On the plugin page**: the feedback entry on plugin detail pages at https://deepseekbase.com/plugins/

Feedback is stored in the deepseekbase feedback store and visible to the workbench at /work/feedback/.
