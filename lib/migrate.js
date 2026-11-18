/**
 * 通用「站点迁移验收」引擎 —— 与具体站点无关，任何迁机/换域名/换 CDN 都能用。
 *
 * 做什么：把同一批路径分别打到「旧站」和「新站」，逐条比状态码、大小、标题，
 *         找出「旧站有、新站没有」的回归（这是迁机最容易漏的东西）。
 *
 * 安全：只发 GET，不登录、不提交表单、不改任何东西。
 */
import http from "node:http";
import https from "node:https";

const UA = "Mozilla/5.0 (compatible; DSH-MigrateCheck/1.0)";

function request(urlStr, { hostHeader, insecure, timeoutMs = 10000, maxRedirects = 3 } = {}) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return resolve({ error: "URL 非法: " + urlStr }); }
    const mod = url.protocol === "https:" ? https : http;
    const started = Date.now();
    const opts = {
      method: "GET",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Encoding": "identity",
        ...(hostHeader ? { Host: hostHeader } : {}),
      },
      timeout: timeoutMs,
      ...(url.protocol === "https:" ? { rejectUnauthorized: !insecure, servername: hostHeader || undefined } : {}),
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (chunks.length < 64) chunks.push(c);     // 只留前 ~64 块用于取标题
      });
      res.on("end", () => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        if (status >= 300 && status < 400 && loc && maxRedirects > 0) {
          let next;
          try { next = new URL(loc, urlStr).toString(); } catch { next = null; }
          if (next) {
            return request(next, { hostHeader, insecure, timeoutMs, maxRedirects: maxRedirects - 1 })
              .then((r) => resolve({ ...r, redirects: (r.redirects || 0) + 1, finalUrl: r.finalUrl || next }));
          }
        }
        const body = Buffer.concat(chunks).toString("utf8");
        const m = body.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
        resolve({
          status,
          bytes: size,
          ms: Date.now() - started,
          title: m ? m[1].replace(/\s+/g, " ").trim() : "",
          finalUrl: urlStr,
          redirects: 0,
          server: res.headers.server || "",
        });
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ error: "超时 " + timeoutMs + "ms" }); });
    req.on("error", (e) => resolve({ error: String(e && e.message || e).slice(0, 120) }));
    req.end();
  });
}

const ok = (s) => s >= 200 && s < 400;

export function classify(src, tgt) {
  const s = src && !src.error ? src.status : 0;
  const t = tgt && !tgt.error ? tgt.status : 0;
  if (!s && !t) return "BOTH_ERROR";
  if (!s) return "SOURCE_ERROR";
  if (ok(s) && ok(t)) return "OK";
  if (ok(s) && !ok(t)) return "REGRESSION";
  if (!ok(s) && ok(t)) return "NEW";
  return "BOTH_MISSING";
}

export async function probe(base, path, opts = {}) {
  const u = String(base).replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
  return request(u, opts);
}

export async function collectPaths(base, opts = {}) {
  const limit = opts.limit || 200;
  const out = new Set(["/"]);
  for (const p of opts.seedPaths || []) out.add(p);
  for (const name of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const r = await request(String(base).replace(/\/+$/, "") + name, opts);
    if (r && !r.error && ok(r.status)) {
      const r2 = await new Promise((resolve) => {
        const u = new URL(String(base).replace(/\/+$/, "") + name);
        const mod = u.protocol === "https:" ? https : http;
        let buf = "";
        const req = mod.request({
          hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname, method: "GET", timeout: 15000,
          headers: { "User-Agent": UA, ...(opts.hostHeader ? { Host: opts.hostHeader } : {}) },
          ...(u.protocol === "https:" ? { rejectUnauthorized: !opts.insecure } : {}),
        }, (res) => { res.on("data", (c) => { buf += c.toString("utf8"); }); res.on("end", () => resolve(buf)); });
        req.on("timeout", () => { req.destroy(); resolve(""); });
        req.on("error", () => resolve(""));
        req.end();
      });
      const locs = [...r2.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      for (const l of locs) {
        try {
          const u2 = new URL(l);
          out.add(u2.pathname + (u2.search || ""));
        } catch {}
        if (out.size >= limit) break;
      }
      if (out.size > 1) break;
    }
  }
  return [...out].slice(0, limit);
}

export async function migrateCheck(opts) {
  const {
    source, target, sourceHost, targetHost,
    paths, seedPaths, insecure = false, maxPaths = 50, concurrency = 5, timeoutMs = 10000,
  } = opts;

  const list = (paths && paths.length ? paths : await collectPaths(target, { hostHeader: targetHost, insecure, limit: maxPaths, seedPaths }));
  const slice = list.slice(0, maxPaths);

  const rows = [];
  let i = 0;
  async function worker() {
    while (i < slice.length) {
      const p = slice[i++];
      const [s, t] = await Promise.all([
        probe(source, p, { hostHeader: sourceHost, insecure, timeoutMs }),
        probe(target, p, { hostHeader: targetHost, insecure, timeoutMs }),
      ]);
      rows.push({ path: p, source: s, target: t, verdict: classify(s, t) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, worker));
  rows.sort((a, b) => a.path.localeCompare(b.path));

  const summary = {};
  for (const r of rows) summary[r.verdict] = (summary[r.verdict] || 0) + 1;
  return { rows, summary, checked_at: new Date().toISOString() };
}

export function renderReport(res, opts = {}) {
  const lines = [];
  lines.push("迁移验收：" + (opts.source || "旧站") + "  →  " + (opts.target || "新站"));
  lines.push("检查时间: " + res.checked_at + "    路径数: " + res.rows.length);
  lines.push("");
  lines.push("路径".padEnd(36) + "旧站".padStart(6) + "新站".padStart(6) + "  判定");
  lines.push("-".repeat(64));
  for (const r of res.rows) {
    const sv = r.source && !r.source.error ? String(r.source.status) : "ERR";
    const tv = r.target && !r.target.error ? String(r.target.status) : "ERR";
    const mark = r.verdict === "REGRESSION" ? "❌ 回归" : r.verdict === "OK" ? "✓" : r.verdict;
    lines.push(String(r.path).slice(0, 35).padEnd(36) + sv.padStart(6) + tv.padStart(6) + "  " + mark);
  }
  lines.push("");
  const s = res.summary;
  lines.push("汇总: OK " + (s.OK || 0) + " · 回归 " + (s.REGRESSION || 0) +
    " · 新增 " + (s.NEW || 0) + " · 两边都缺 " + (s.BOTH_MISSING || 0));
  const bad = res.rows.filter((r) => r.verdict === "REGRESSION");
  if (bad.length) {
    lines.push("");
    lines.push("需要修复（旧站有、新站没有）：");
    for (const r of bad) {
      const p = r.path;
      lines.push("  · " + p + "  (" + r.source.status + " → " + r.target.status + ")");
    }
  }
  return lines.join("\n");
}
