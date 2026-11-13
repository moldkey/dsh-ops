/**
 * DSH 運維工作台 —— 主入口
 *
 * 按 DSH 官方插件标准编写：
 *   · ESM，export const name / inject / apply
 *   · ctx.tools.register(({...}))
 *   · ctx.skills.register({...})
 *
 * 工具（15 個）：
 *   ops_doctor       环境体检
 *   ops_status       所有站点状态摘要
 *   ops_check        跑检查器
 *   ops_issues       未解决问题
 *   ops_snapshot     打快照
 *   ops_deploy       部署（含影响分析）
 *   ops_rollback     回滚
 *   ops_restart      重启服务
 *   ops_traffic      真实流量（今天 vs 昨天）
 *   ops_http         页面 HTTP 探测
 *   ops_read         读服务器文件
 *   ops_service      服务状态/重启
 *   ops_exec         只读诊断命令
 *   ops_disk         磁盘体检与清理
 *   ops_verify       状态漂移检查
 *   ops_teardown     对标站点拆解分析
 *
 * 技能（1 個）：
 *   ops-guide        工作台使用指南
 *
 * 数据来自工作台后端 https://deepseekbase.com/work/api/
 * 认证用 dshio API key（https://dshio.org/me/ 生成）
 */

import { ALL_SKILLS } from "./skills.js";

const BASE = "https://deepseekbase.com/work/api";
const TIMEOUT_MS = 60000;   // 部署可能要几十秒

export const name = "dsh-ops";
export const inject = ["tools", "skills"];

const TEXT_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
  },
  render: (_args, value) => [
    { type: "text", text: (value && value.text) || "" },
  ],
};

/**
 * 调工作台 API。
 * 认证优先用 config.api_key，其次环境变量 DSH_OPS_KEY。
 */
/**
 * 网络 / IP 健康诊断。
 *
 * 用户看到 "fetch failed" 时最需要的不是错误码，是「我该怎么办」。
 * 这里用一个对照组主机区分三种情况：
 *   · 本机完全没网
 *   · 本机能上网，但连不上我们的服务（很可能 IP 被封）
 *   · 服务本身挂了
 */
const CONTROL_HOSTS = ["https://api.deepseek.com", "https://registry.npmjs.org"];

async function _probe(url, timeoutMs) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, {
      method: "HEAD",
      signal: ac ? ac.signal : undefined,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; dsh-ops-netcheck/1.0)" },
    });
    return { ok: true, status: r.status };
  } catch (e) {
    return {
      ok: false,
      code: (e && e.cause && (e.cause.code || e.cause.message)) || e.name || "UNKNOWN",
    };
  } finally {
    if (t) clearTimeout(t);
  }
}

async function diagnoseNetwork(base, failedCode) {
  let controlOk = false;
  let controlHost = "";
  for (const h of CONTROL_HOSTS) {
    const p = await _probe(h, 6000);
    if (p.ok) { controlOk = true; controlHost = h; break; }
  }
  const target = await _probe(base + "/health", 6000);

  const lines = [];
  lines.push("  本机网络:  " + (controlOk ? "正常（" + controlHost + " 可达）" : "不通"));
  lines.push("  目标服务:  " + (target.ok ? "可达（HTTP " + target.status + "）"
                                        : "连不上（" + (target.code || "超时") + "）"));
  lines.push("  失败代码:  " + (failedCode || "UNKNOWN"));

  if (!controlOk) {
    return {
      title: "本机网络不通",
      lines,
      actions: [
        "检查这台机器能不能上网（浏览器打开任意网站试试）",
        "检查代理 / VPN / 防火墙",
        "公司或校园网环境可能需要配 HTTP 代理",
      ],
    };
  }
  if (target.ok) {
    return {
      title: "现在网络已恢复",
      lines,
      actions: ["刚才的失败可能是瞬时抖动，重试一次"],
    };
  }
  return {
    title: "本机 IP 很可能被服务器防火墙封了",
    lines,
    actions: [
      "这不是插件的问题，也不是你操作错了。",
      "常见原因：短时间内重复请求，触发服务器 fail2ban 或限流规则。",
      "解决办法：",
      "  1. 等 10–60 分钟，多数规则会自动过期",
      "  2. 或换一个网络（手机热点）立即恢复",
      "  3. 或联系管理员把出口 IP 加白",
      "查自己出口 IP：浏览器打开 https://myip.ipip.net",
    ],
  };
}

function renderDiagnosis(d) {
  const out = [d.title, "=".repeat(52)];
  for (const l of d.lines) out.push(l);
  out.push("");
  for (const a of d.actions) out.push(a);
  return out.join("\n");
}

async function api(path, opts = {}, cfg = {}, signal) {
  const key =
    (cfg && cfg.api_key) ||
    (typeof process !== "undefined" && process.env && process.env.DSH_OPS_KEY) ||
    "";
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = "Bearer " + key;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const base = (cfg && cfg.base) ? String(cfg.base).replace(/\/+$/, "") : BASE;
    const res = await fetch(base + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    const raw = await res.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw: raw.slice(0, 800) };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        error:
          "API key 无效或缺失。\n" +
          "去 https://dshio.org/me/ 生成 key，然后：\n" +
          "  dsh plugin config dsh-ops --set api_key=<你的 key>",
      };
    }
    if (!res.ok) {
      return { error: `HTTP ${res.status}: ${(data && (data.error || data.detail)) || raw.slice(0, 200)}` };
    }
    return { data };
  } catch (e) {
    if (e.name === "AbortError") {
      return { error: "工作台超时（" + Math.round(TIMEOUT_MS / 1000) + " 秒）。部署可能仍在后台执行，稍后用 ops_status 查看。" };
    }
    // 不再只报 "fetch failed" —— 跑一次诊断，给出可操作的结论
    const code = (e && e.cause && (e.cause.code || e.cause.message)) || e.name || "UNKNOWN";
    const base = (cfg && cfg.base) ? String(cfg.base).replace(/\/+$/, "") : BASE;
    let diag = null;
    try { diag = await diagnoseNetwork(base, code); } catch { diag = null; }
    return {
      error: diag ? renderDiagnosis(diag)
                  : "无法连到工作台：" + String(e.message || e).slice(0, 160),
      netError: code,
    };
  } finally {
    clearTimeout(timer);
  }
}


function fmtBytes(n) {
  const x = Number(n || 0);
  if (!x) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = x;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + " " + u[i];
}

export function apply(ctx, config) {
  // 取配置。
  //
  // Cordis 把 cordis.patch.yml 里 entry 的 config 作为 apply 的第二个参数传入。
  // 不要读 ctx.config —— Cordis 没有这个属性；也不要把 "config" 写进 inject，
  // 那会被当成「等别的插件提供的服务」，entry 会永远卡在 pending。
  //
  // 优先级：apply 的 config 参数 > 环境变量 DSH_OPS_KEY > 空
  const cfg = (config && typeof config === "object") ? Object.assign({}, config) : {};
  if (!cfg.api_key && typeof process !== "undefined" &&
      process.env && process.env.DSH_OPS_KEY) {
    cfg.api_key = process.env.DSH_OPS_KEY;
  }

  // ═══════════════════════════════════════════════════════════════
  //  0. ops_doctor —— 环境体检（装完先跑这个）
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_doctor",
    description:
      "检查运行环境是否就绪：Python / rsync / systemd / curl / tar 等系统工具是否装了、" +
      "数据库和表结构是否正常、每个站点的目录是否可写。" +
      "装完插件后应该先跑这个；用户说「跑不起来」「报错」「缺什么」时也应该先跑这个。" +
      "只读，不改任何东西。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const r = await api("/doctor", {}, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      if (d.text) return { text: d.text };
      return { text: JSON.stringify(d, null, 2) };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  1. ops_status —— 所有站点状态摘要
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_status",
      description:
        "查看运维工作台管理的所有站点的当前状态：总分、分类得分、最近部署时间、未解决问题数。" +
        "当用户问「站现在怎么样」「有没有挂」「体检一下」时使用。只读，不改任何东西。",
      parameters: {},
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const r = await api("/status", {}, cfg, exec && exec.signal);
        if (r.error) return { text: r.error };
        const d = r.data || {};
        const lines = [];
        if (d.checked_at) lines.push("检查时间: " + d.checked_at);
        lines.push("");
        for (const p of d.projects || []) {
          const mark = p.score >= 90 ? "✓" : p.score >= 70 ? "⚠" : "✗";
          lines.push(
            `${String(p.slug || "").padEnd(22)} ${String(p.product_type || "web").padEnd(6)} ` +
            `${String(p.score).padStart(3)} 分  ${mark}`
          );
          if (p.by_category) {
            const cats = Object.entries(p.by_category)
              .map(([k, v]) => `${k} ${v}`)
              .join("  ·  ");
            if (cats) lines.push("  · " + cats);
          }
          if (p.last_deploy) {
            lines.push("  · 最后部署 " + p.last_deploy);
          }
          if (p.open_issues) {
            lines.push("  · " + p.open_issues + " 个未解决问题");
          }
          lines.push("");
        }
        if (!d.projects || !d.projects.length) {
          lines.push("工作台还没有注册任何项目。");
        }
        return { text: lines.join("\n") };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  2. ops_check —— 跑检查器
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_check",
      description:
        "对某个站点跑检查器（15 个），返回通过/警告/失败的详细结果。" +
        "当用户说「检查一下 XX 站」「SEO 有问题吗」「静态资源有没有缺」时使用。" +
        "只读，不改任何东西。不传 checker 就跑全部。",
      parameters: {
        project: {
          type: "string",
          required: true,
          description: "项目 slug，如 oracleluck / deepseekbase / dshio",
        },
        checker: {
          type: "string",
          description:
            "只跑指定检查器。可选：deploy_smoke / deploy_assets / deploy_sitemap / " +
            "seo_title / seo_desc / seo_canonical / seo_hreflang / seo_structured / " +
            "geo_ai_crawler / geo_citable / code_language_mix / code_package_clean / " +
            "code_secret / sec_fail2ban / sec_backup",
        },
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const q = args.checker ? "?checker=" + encodeURIComponent(args.checker) : "";
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/check" + q,
          { method: "POST", body: {} },
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        const lines = [];
        lines.push(`项目: ${d.project || args.project}`);
        lines.push(`总分: ${d.score}  通过 ${d.passed}  警告 ${d.warned}  失败 ${d.failed}  错误 ${d.errored}`);
        lines.push("");
        for (const c of d.results || []) {
          const mark = c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : c.status === "error" ? "!" : "✗";
          lines.push(`  ${mark} ${String(c.checker_id).padEnd(22)} ${String(c.score).padStart(5)} 分`);
          if (c.issues && c.issues.length) {
            for (const i of c.issues.slice(0, 5)) {
              lines.push(`      [${i.level}] ${i.title}`);
              if (i.fix_hint) lines.push(`        修: ${i.fix_hint}`);
            }
          }
        }
        return { text: lines.join("\n") };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  3. ops_issues —— 未解决问题
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_issues",
      description:
        "列出某个站点未解决的问题，按严重程度排序，含首次发现时间和出现次数。" +
        "当用户问「还有什么没修」「问题清单」「反复出现的问题」时使用。只读。",
      parameters: {
        project: { type: "string", required: true, description: "项目 slug" },
        level: {
          type: "string",
          description: "只列指定级别：info / warn / critical",
        },
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const q = args.level ? "?level=" + encodeURIComponent(args.level) : "";
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/issues" + q,
          {},
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        const items = d.issues || [];
        if (!items.length) return { text: "没有未解决的问题。" };
        const lines = [`未解决问题: ${items.length} 个`, ""];
        const mark = { critical: "✗", warn: "⚠", info: "·" };
        for (const i of items) {
          lines.push(`${mark[i.level] || "·"} [${i.level}] ${i.title}`);
          if (i.fix_hint) lines.push("    修: " + i.fix_hint);
          lines.push(`    首次 ${i.first_seen} · 出现 ${i.seen_count} 次`);
        }
        return { text: lines.join("\n") };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  4. ops_snapshot —— 打快照
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_snapshot",
      description:
        "给某个站点当前状态打一份增量快照（只存变化的文件，未变的硬链接）。" +
        "部署前、改配置前应该先打。当用户说「先备份一下」「打个快照」时使用。" +
        "只增不删，安全。",
      parameters: {
        project: { type: "string", required: true, description: "项目 slug" },
        label: { type: "string", description: "快照标签，如 before-seo-change" },
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/snapshot",
          { method: "POST", body: { label: args.label || "" } },
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        return {
          text:
            `快照完成\n` +
            `  id: ${d.snapshot_id}\n` +
            `  文件: ${d.files}（新增 ${d.new} / 变化 ${d.changed} / 未变 ${d.linked}）\n` +
            `  大小: ${(d.size_bytes / 1048576).toFixed(1)} MB\n` +
            `  耗时: ${d.duration_sec} 秒`,
        };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  5. ops_deploy —— 部署（含影响分析）
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_deploy",
      description:
        "部署某个站点到生产。内置三层保护：部署前影响分析（会删除哪些文件）、" +
        "自动快照、部署后验证，验证失败自动回滚。" +
        "当用户说「部署」「上线」「发布」时使用。" +
        "强烈建议先用 dry_run=true 看影响分析。",
      parameters: {
        project: { type: "string", required: true, description: "项目 slug" },
        dry_run: {
          type: "boolean",
          description: "true 只看影响分析不执行。强烈建议先跑一次。",
        },
        render: {
          type: "boolean",
          description: "是否重新生成页面，默认 true。只同步不渲染时设 false。",
        },
        force: {
          type: "boolean",
          description:
            "强制部署，跳过「删除白名单」保护。只有确认被删文件无害时才用。",
        },
      },
      output: TEXT_OUTPUT,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/deploy",
          {
            method: "POST",
            body: {
              dry_run: !!args.dry_run,
              render: args.render !== false,
              force: !!args.force,
            },
          },
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        return { text: d.output || JSON.stringify(d, null, 2) };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  6. ops_rollback —— 回滚
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_rollback",
      description:
        "把某个站点回滚到指定快照。不传 snapshot_id 就用最近一个快照。" +
        "当部署后发现问题、或用户说「回滚」「退回上一个版本」时使用。" +
        "回滚也会删除快照里没有的文件，建议先 dry_run=true 看影响。",
      parameters: {
        project: { type: "string", required: true, description: "项目 slug" },
        snapshot_id: {
          type: "number",
          description: "要回滚到的快照 id。不传则用最近一个。",
        },
        dry_run: {
          type: "boolean",
          description: "true 只看影响分析不执行。",
        },
      },
      output: TEXT_OUTPUT,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/rollback",
          {
            method: "POST",
            body: {
              snapshot_id: args.snapshot_id || null,
              dry_run: !!args.dry_run,
            },
          },
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        return { text: d.output || JSON.stringify(d, null, 2) };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  7. ops_restart —— 重启服务
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
      name: "ops_restart",
      description:
        "重启某个站点的服务（如 Django CMS）。改了模板或配置要生效时用。" +
        "当用户说「重启」「改完不生效」时使用。重启期间会有几秒 502。",
      parameters: {
        project: { type: "string", required: true, description: "项目 slug" },
        service: {
          type: "string",
          description: "服务名，如 oracleluck-cms。不传则用项目默认服务。",
        },
      },
      output: TEXT_OUTPUT,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const r = await api(
          "/projects/" + encodeURIComponent(args.project) + "/restart",
          { method: "POST", body: { service: args.service || "" } },
          cfg,
          exec && exec.signal
        );
        if (r.error) return { text: r.error };
        const d = r.data || {};
        return { text: d.output || JSON.stringify(d, null, 2) };
      },
  });

  // ═══════════════════════════════════════════════════════════════
  //  7. ops_traffic —— 真实流量（今天 vs 昨天，只看真人）
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_traffic",
    description:
      "查某个站点的真实流量：今天 vs 昨天，区分真人 / 机器人 / Service Worker，" +
      "列出真人访问最多的页面和落地页。当用户问「今天流量怎么样」「真人在看什么」时使用。只读。",
    parameters: {
      project: { type: "string", required: true, description: "项目 slug" },
      top: { type: "number", description: "列几个页面，默认 10" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const q = args.top ? "?top=" + encodeURIComponent(String(args.top)) : "";
      const r = await api("/projects/" + encodeURIComponent(args.project) + "/traffic" + q, {}, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = [];
      lines.push("站点: " + (d.domain || d.project) + "   生成于 " + (d.generated_at || ""));
      lines.push("日志: " + (d.log || ""));
      lines.push("");
      const pack = (label, x) => {
        if (!x) return;
        lines.push("── " + label + " ──");
        lines.push("  请求 " + x.requests + "  |  机器人 " + x.bot + "  |  SW " + x.sw);
        lines.push("  真人请求 " + x.human_requests + "  |  真人 PV " + x.human_pv + "  |  真人 UV " + x.human_uv);
        const st = x.status || {};
        lines.push("  状态 " + Object.entries(st).map(([k, v]) => k + "=" + v).join("  "));
        if (x.top_pages && x.top_pages.length) {
          lines.push("  真人最常看:");
          for (const [p, pv, uv] of x.top_pages) lines.push("    " + String(pv).padStart(5) + " PV  " + String(uv).padStart(4) + " UV  " + p);
        }
        if (x.landing && x.landing.length) {
          lines.push("  落地页:");
          for (const [p, n] of x.landing) lines.push("    " + String(n).padStart(4) + " 人  " + p);
        }
        lines.push("  最后一条日志: " + (x.last || "-"));
        lines.push("");
      };
      pack("今天（截至生成时刻，约 " + d.elapsed_hours + " 小时）", d.today);
      pack("昨天（全天）", d.yesterday);
      if (d.notes) for (const n of d.notes) lines.push("· " + n);
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  8. ops_http —— 探测页面状态
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_http",
    description:
      "从服务器侧探测页面 HTTP 状态、大小、标题和耗时。当用户问「页面是不是 404 了」「这个链接通不通」时使用。只读。" +
      "最多 5 个 URL，多个用换行或逗号分隔；只能探本站域名或白名单主机。",
    parameters: {
      project: { type: "string", required: true, description: "项目 slug" },
      urls: { type: "string", required: true, description: "URL，多个用换行或逗号分隔" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const urls = String(args.urls || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
      const r = await api("/projects/" + encodeURIComponent(args.project) + "/http",
        { method: "POST", body: { urls } }, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = ["探测时间: " + (d.checked_at || ""), ""];
      for (const x of d.results || []) {
        if (x.error) { lines.push("✗ " + x.url + "  —— " + x.error); continue; }
        const ok = x.status >= 200 && x.status < 400;
        lines.push((ok ? "✓ " : "✗ ") + String(x.status).padEnd(4) + String(x.ms || 0).padStart(6) + "ms  " +
          String(x.bytes || 0).padStart(8) + "B  " + x.url);
        if (x.title) lines.push("      " + x.title);
      }
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  9. ops_read —— 读服务器文件
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_read",
    description:
      "读服务器上的文本文件（代码 / 配置 / 日志），带行号，自动打码密钥。当用户问「这个文件现在写的是什么」时使用。只读。" +
      "只能读项目允许的目录（站点根目录、/root/ops、/var/log/nginx）。",
    parameters: {
      project: { type: "string", required: true, description: "项目 slug" },
      path: { type: "string", required: true, description: "服务器绝对路径" },
      lines: { type: "number", description: "读多少行，默认 200（上限 500）" },
      offset: { type: "number", description: "从第几行开始，默认 1" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const q = "?path=" + encodeURIComponent(String(args.path || "")) +
        (args.lines ? "&lines=" + encodeURIComponent(String(args.lines)) : "") +
        (args.offset ? "&offset=" + encodeURIComponent(String(args.offset)) : "");
      const r = await api("/projects/" + encodeURIComponent(args.project) + "/read" + q, {}, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const head = d.path + "  (" + (d.size || 0) + " B, 显示 " + d.shown + " 行" +
        (d.truncated ? "，文件较大已截断" : "") + ")";
      const body = (d.lines || []).map((x) => String(x.n).padStart(5) + "| " + x.text).join("\n");
      return { text: head + "\n\n" + body };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  10. ops_service —— 服务状态 / 重启
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_service",
    description:
      "查服务状态，或重启/重载项目授权的 systemd 单元（如 nginx），也可跑 nginx -t。当用户说「重启一下服务」「nginx 配置对不对」时使用。" +
      "动作：status / restart / reload / nginx_test。只能操作项目 config.units 里列出的服务。",
    parameters: {
      project: { type: "string", required: true, description: "项目 slug" },
      action: { type: "string", required: true, description: "status / restart / reload / nginx_test" },
      unit: { type: "string", description: "systemd 单元名，nginx_test 时可不填" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const r = await api("/projects/" + encodeURIComponent(args.project) + "/service",
        { method: "POST", body: { action: args.action, unit: args.unit } }, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = ["动作: " + d.action + (d.unit ? "  单元: " + d.unit : ""), ""];
      if (d.out) lines.push(String(d.out).trim());
      if (d.err) lines.push("stderr: " + String(d.err).trim());
      if (d.after) lines.push("之后状态: " + d.after);
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  11. ops_exec —— 只读命令目录
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_exec",
    description:
      "跑一条只读诊断命令：df / du / ps / uptime / wc / grep / nginx_test。" +
      "当用户问「磁盘满了吗」「这文件多大」「日志里有没有这个错误」时使用。只读，不接受任意 shell 字符串。" +
      "grep 需要 pattern + path；du/wc 需要 path。",
    parameters: {
      project: { type: "string", required: true, description: "项目 slug" },
      op: { type: "string", required: true, description: "df / du / ps / uptime / wc / grep / nginx_test" },
      path: { type: "string", description: "du / wc / grep 的目标路径（必须在允许目录内）" },
      pattern: { type: "string", description: "grep 的扩展正则" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const r = await api("/projects/" + encodeURIComponent(args.project) + "/exec",
        { method: "POST", body: { op: args.op, args: { path: args.path, pattern: args.pattern } } },
        cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = ["$ " + (d.op || args.op), ""];
      if (d.out) lines.push(String(d.out).trim());
      if (d.err) lines.push("stderr: " + String(d.err).trim());
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  12. ops_disk —— 磁盘体检与清理
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_disk",
    description:
      "查磁盘占用，或清理可再生产物（journal / nginx 缓存 / 旧快照 / 旧压缩日志）。" +
      "当用户说「磁盘满了」「清理一下服务器」时使用。清理默认只预览（dry_run=true），确认后传 dry_run=false。",
    parameters: {
      action: { type: "string", description: "status（默认）或 clean" },
      dry_run: { type: "boolean", description: "clean 时是否只预览，默认 true" },
      keep_snapshots: { type: "number", description: "每个项目保留几个快照，默认 3" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const action = String(args.action || "status").toLowerCase();
      if (action === "clean") {
        const r = await api("/system/clean",
          { method: "POST", body: {
            actions: ["journal", "nginx_cache", "snapshots", "old_logs"],
            dry_run: args.dry_run !== false,
            keep_snapshots: args.keep_snapshots || 3,
          } }, cfg, exec && exec.signal);
        if (r.error) return { text: r.error };
        const d = r.data || {};
        const lines = [d.dry_run ? "（预览，未执行）" : "已执行", ""];
        for (const a of d.actions || []) {
          if (a.dry_run) lines.push("  " + a.action.padEnd(14) + " 预计释放 " + fmtBytes(a.would_free));
          else lines.push("  " + a.action.padEnd(14) + " " + JSON.stringify(a.removed != null ? { removed: a.removed } : { ok: true }));
        }
        lines.push("");
        if (d.dry_run) lines.push("预计释放: " + fmtBytes(d.estimated_free) + "（确认后传 dry_run=false 执行）");
        else lines.push("实际释放: " + fmtBytes(d.freed) + "，当前磁盘 " + d.percent_after + "%");
        return { text: lines.join("\n") };
      }
      const r = await api("/system/disk", {}, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const fs = d.fs || {};
      const lines = [];
      lines.push("磁盘: " + fmtBytes(fs.used) + " / " + fmtBytes(fs.total) +
        "（" + fs.percent + "%），剩余 " + fmtBytes(fs.free));
      lines.push("检查时间: " + (d.checked_at || ""));
      if (d.journal) lines.push("journal: " + d.journal);
      lines.push("");
      lines.push("目录占用:");
      for (const x of d.dirs || []) {
        lines.push("  " + String(x.path).padEnd(28) + (x.bytes == null ? "（测量超时）" : fmtBytes(x.bytes)));
      }
      if ((d.snapshots || []).length) {
        lines.push("");
        lines.push("快照:");
        for (const s of d.snapshots) lines.push("  " + String(s.project).padEnd(10) + s.count + " 个");
      }
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  13. ops_verify —— 状态漂移检查
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_verify",
    description:
      "检查「我们改过的东西有没有被回滚/覆盖」：MJ7 导航、内容分层、指纹、测试页 v3、zh-tw 301、BAOVOO 页面、统计 JSON、fail2ban 白名单、deploy render 配置。" +
      "每 10 分钟自动跑一次；改动前后都应该看一眼。只读，不改任何东西。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const r = await api("/system/state", {}, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = [];
      const age = d.age_seconds != null ? d.age_seconds : 0;
      lines.push((d.ok ? "✓ 全部通过" : "✗ 有 " + d.failed + " 项失败") +
        " · " + (d.results || []).length + " 项 · 检查于 " + (d.checked_at || "?") +
        "（" + Math.round(age / 60) + " 分钟前）" +
        (d.stale ? "  ⚠ 结果已过期，检查器可能没在跑" : ""));
      lines.push("");
      for (const x of d.results || []) {
        lines.push((x.ok ? "  ✓ " : "  ✗ ") + x.name + "  —  " + (x.detail || ""));
      }
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  14. ops_teardown —— 对标站点拆解分析
  // ═══════════════════════════════════════════════════════════════
  ctx.tools.register({
    name: "ops_teardown",
    description:
      "对一个公开站点做拆解分析：栏目结构、导航分组、标题层级、结构化数据类型、技术特征、页面体量。" +
      "只看结构不搬内容；单域名、最多 20 页。当用户说「拆解一下这个站」「对标分析」时使用。",
    parameters: {
      url: { type: "string", required: true, description: "要拆解的公开 URL" },
      max_pages: { type: "number", description: "最多分析几个页面（默认 1，上限 20）" },
      follow_nav: { type: "boolean", description: "是否顺着导航继续看子页（默认 false）" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const r = await api("/analyze/site", {
        method: "POST",
        body: { url: args.url, max_pages: args.max_pages || 1, follow_nav: !!args.follow_nav },
      }, cfg, exec && exec.signal);
      if (r.error) return { text: r.error };
      const d = r.data || {};
      const lines = [];
      lines.push("站点: " + (d.final_url || d.url) + "  (" + d.status + ")");
      lines.push("标题: " + (d.title || "-"));
      if (d.desc) lines.push("描述: " + d.desc);
      lines.push("");
      const st = d.stats || {};
      lines.push("体量: HTML " + st.html_kb + "KB · 正文 " + st.text_chars + " 字 · 链接 " +
        st.links + "（内链 " + st.internal_links + "）· 图片 " + st.images + " · h2 " + st.h2 + " / h3 " + st.h3);
      if ((d.tech || []).length) lines.push("技术特征: " + d.tech.join("、"));
      if ((d.jsonld_types || []).length) lines.push("结构化数据: " + d.jsonld_types.join("、"));
      lines.push("");
      if ((d.outline || []).length) {
        lines.push("标题结构:");
        for (const x of d.outline.slice(0, 15)) lines.push("  " + x.level + "  " + x.text);
      }
      if ((d.nav_groups || []).length) {
        lines.push("");
        lines.push("导航分组:");
        for (const g of d.nav_groups) {
          lines.push("  [" + g.tag + "] " + g.count + " 项: " +
            g.items.map((i) => i.label).slice(0, 10).join(" / "));
        }
      }
      if ((d.crawled || []).length) {
        lines.push("");
        lines.push("子页:");
        for (const p of d.crawled.slice(0, 20)) {
          lines.push("  " + p.status + "  " + (p.title || "").slice(0, 40) + "  " + p.url);
        }
      }
      return { text: lines.join("\n") };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  //  技能注册
  // ═══════════════════════════════════════════════════════════════
  if (ctx.skills && typeof ctx.skills.register === "function") {
    for (const sk of ALL_SKILLS) {
      try {
        ctx.skills.register({
          name: sk.name,
          description: sk.description,
          content: sk.content,
          source: "runtime",
          whenToUse: sk.whenToUse,
          metadata: {
            source: "dsh-ops",
            layer: "bundled",
            version: "0.1.0",
            lang: "zh-Hans",
            homepage: "https://deepseekbase.com/work/",
          },
        });
      } catch (e) {
        // 技能注册失败不影响工具使用
      }
    }
  }
}
