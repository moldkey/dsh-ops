window.__ModuleLoader__.load({ id: `@liangjiehappy/dsh-ops-panel`, factory: require => {
  var module = { exports: {} }, exports = module.exports;
  const React = require("react");
  const h = React.createElement;
  const ID = "@liangjiehappy/dsh-ops-panel/panel";
  const KIND = "ops-panel";
  const PUB = "https://deepseekbase.com/work/api/public/summary";
  const API = "https://deepseekbase.com/work/api";
  const TOKEN_KEY = "dsh_ops_token";
  const S = {
    sec: { marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #eef2f7" },
    h: { fontSize: "12px", letterSpacing: ".04em", color: "#94a3b8", textTransform: "uppercase", margin: "0 0 6px" },
    row: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px" },
    btn: { padding: "5px 10px", margin: "4px 6px 0 0", border: "1px solid #dbe2ea", borderRadius: "7px", background: "#f8fafc", color: "#94a3b8", fontSize: "12px", cursor: "not-allowed" },
    btnOn: { padding: "5px 10px", margin: "4px 6px 0 0", border: "1px solid #2563eb", borderRadius: "7px", background: "#2563eb", color: "#fff", fontSize: "12px", cursor: "pointer" },
    tip: { marginTop: "8px", fontSize: "12px", color: "#b45309" },
    code: { fontFamily: "ui-monospace,monospace", fontSize: "18px", letterSpacing: ".18em", fontWeight: 700, color: "#0f172a" },
    sel: { width: "100%", padding: "6px 8px", border: "1px solid #dbe2ea", borderRadius: "8px", fontSize: "13px" },
    out: { marginTop: "8px", padding: "8px", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: "8px", fontSize: "12px", whiteSpace: "pre-wrap", color: "#475569", maxHeight: "120px", overflow: "auto" }
  };
  const row = (k, v, c) => h("div", { key: k, style: S.row }, h("span", { style: { color: "#475569" } }, k), h("span", { style: { fontWeight: 600, color: c || "#0f172a" } }, v));

  function useLogin() {
    const [me, setMe] = React.useState(null);
    const [code, setCode] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState("");
    const timer = React.useRef(null);
    const fetchMe = React.useCallback(async () => {
      const tk = localStorage.getItem(TOKEN_KEY);
      if (!tk) { setMe(null); return; }
      try {
        const r = await fetch(API + "/me", { headers: { Authorization: "Bearer " + tk } });
        if (r.ok) setMe(await r.json()); else { localStorage.removeItem(TOKEN_KEY); setMe(null); }
      } catch (e) { setMsg("账号接口不可达"); }
    }, []);
    React.useEffect(() => { fetchMe(); return () => clearTimeout(timer.current); }, [fetchMe]);
    const start = async () => {
      setBusy(true); setMsg("");
      try {
        const r = await fetch(API + "/device/code", { method: "POST" });
        const d = await r.json();
        setCode(d);
        const poll = async () => {
          try {
            const tr = await fetch(API + "/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_code: d.device_code }) });
            if (tr.ok) {
              const tk = await tr.json();
              if (tk.access_token) { localStorage.setItem(TOKEN_KEY, tk.access_token); setCode(null); setBusy(false); fetchMe(); return; }
            }
            timer.current = setTimeout(poll, 5000);
          } catch (e) { timer.current = setTimeout(poll, 5000); }
        };
        timer.current = setTimeout(poll, 5000);
      } catch (e) { setBusy(false); setMsg("无法发起登录"); }
    };
    const logout = () => { localStorage.removeItem(TOKEN_KEY); setMe(null); setMsg("已退出"); };
    return { me, code, busy, msg, start, logout };
  }

  const RANK = { viewer: 0, operator: 1, admin: 2, owner: 3 };

  function Body() {
    const { me, code, busy, msg, start, logout } = useLogin();
    const [d, setD] = React.useState(null);
    const [err, setErr] = React.useState("");
    const [sites, setSites] = React.useState([]);
    const [sel, setSel] = React.useState("");
    const [act, setAct] = React.useState({ busy: "", out: "", err: "" });
    const [fb, setFb] = React.useState("");
    const [fbMsg, setFbMsg] = React.useState("");
    const [fbBusy, setFbBusy] = React.useState(false);
    const submitFb = async () => {
      setFbBusy(true);
      try {
        const r = await fetch("https://deepseekbase.com/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: "deepseekbase", type: "问题", page: "dsh-panel:ops", message: fb.trim(), contact: "" }) });
        const j = await r.json();
        if (j && j.ok) { setFbMsg("已收到，谢谢"); setFb(""); } else setFbMsg("提交失败：" + ((j && (j.error || j.message)) || r.status));
      } catch (e) { setFbMsg("提交失败：" + ((e && e.message) || e)); }
      setFbBusy(false);
    };

    const load = React.useCallback(async () => {
      try {
        const ctl = new AbortController(); const tid = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(PUB + "?t=" + Date.now(), { cache: "no-store", signal: ctl.signal });
        clearTimeout(tid); setD(await r.json()); setErr("");
      } catch (e) { setErr(e && e.name === "AbortError" ? "网络超时，稍后自动重试（已保留上次数据）" : String((e && e.message) || e)); }
    }, []);
    React.useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

    React.useEffect(() => {
      if (!me) { setSites([]); return; }
      const tk = localStorage.getItem(TOKEN_KEY);
      fetch(API + "/panel/sites", { headers: { Authorization: "Bearer " + tk } })
        .then(r => r.json()).then(j => { if (j && j.sites) { setSites(j.sites); setSel(j.sites[0] ? j.sites[0].slug : ""); } })
        .catch(() => {});
    }, [me]);

    const doAct = async (action) => {
      if (!sel) return;
      setAct({ busy: action, out: "", err: "" });
      try {
        const tk = localStorage.getItem(TOKEN_KEY);
        const r = await fetch(API + "/panel/" + encodeURIComponent(sel) + "/" + action, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: "{}" });
        const j = await r.json();
        if (r.ok) setAct({ busy: "", out: (j.output || j.status || JSON.stringify(j)).slice(0, 800), err: "" });
        else setAct({ busy: "", out: "", err: (j.error || ("HTTP " + r.status)) + (j.role ? "（角色 " + j.role + "）" : "") });
      } catch (e) { setAct({ busy: "", out: "", err: String((e && e.message) || e) }); }
    };

    const rank = me ? (RANK[me.role] == null ? 0 : RANK[me.role]) : -1;
    const canCheck = rank >= RANK.operator;
    const canSnap = rank >= RANK.admin;

    return h("div", { style: { padding: "12px 14px", font: "13px/1.6 system-ui,sans-serif", color: "#334155", height: "100%", maxHeight: "calc(100vh - 140px)", boxSizing: "border-box", overflowY: "auto", overflowX: "hidden" } },
      h("div", { style: { fontWeight: 700, fontSize: "14px", color: "#0f172a" } }, "DSH-OPS · 运维工作台"),
      h("div", { style: S.sec }, h("div", { style: S.h }, "公共信息"),
        !d ? h("div", { style: { color: "#94a3b8" } }, "加载中…") : h("div", null,
          row("已检查站点", d.sites_total), row("正常", d.sites_ok, "#059669"),
          row("需关注", d.sites_attention, d.sites_attention ? "#d97706" : "#059669"),
          row("未解决问题", d.issues_open, d.issues_open ? "#d97706" : "#059669"),
          row("最后检查", d.last_checked_at || "-"))),
      err ? h("div", { style: { color: "#dc2626" } }, "取数失败：" + err) : null,

      h("div", { style: S.sec }, h("div", { style: S.h }, "用户信息"),
        me ? h("div", null, row("账号", me.account), row("角色", me.role, me.role === "owner" ? "#059669" : "#0f172a"),
          ...(me.stats ? [row("我的站点", me.stats.sites_total), row("今日已检查", me.stats.checked_today), row("待处理问题", me.stats.issues_open, me.stats.issues_open ? "#d97706" : "#059669")] : []),
          h("button", { style: { ...S.btnOn, background: "#fff", color: "#2563eb" }, onClick: logout }, "退出登录"))
          : (code ? h("div", null, h("div", { style: { fontSize: "13px", color: "#475569" } }, "在浏览器里输入这个码授权："),
              h("div", { style: S.code }, code.user_code),
              h("button", { style: S.btnOn, onClick: () => window.open(code.verification_uri_complete, "_blank") }, "打开授权页"),
              h("div", { style: S.tip }, "必须填注册邮箱（否则只能只读）；授权后每 5 秒自动登录"))
            : h("div", null, h("div", { style: S.row }, h("span", null, "登录状态"), h("span", { style: { color: "#b45309", fontWeight: 600 } }, "未登录")),
              h("button", { style: S.btnOn, disabled: busy, onClick: start }, busy ? "获取设备码…" : "登录（设备码）"),
              h("div", { style: S.tip }, "登录后可见站点、配额与报告；邮箱必须是注册邮箱，否则只能是只读"))),
        msg ? h("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "4px" } }, msg) : null),

      h("div", { style: S.sec }, h("div", { style: S.h }, "操作" + (me ? "" : "（登录后可用）")),
        me ? h("select", { value: sel, onChange: e => setSel(e.target.value), style: S.sel }, sites.map(s => h("option", { key: s.slug, value: s.slug }, s.name + "（" + s.slug + "）"))) : null,
        h("div", null,
          h("button", { style: S.btnOn, onClick: () => { const t = sites.find(x => x.slug === sel); if (t && t.domain) window.open("https://" + t.domain + "/", "_blank"); } }, "打开站点"),
          h("button", { disabled: !canCheck || !!act.busy, onClick: () => doAct("check"), style: canCheck ? S.btnOn : S.btn }, act.busy === "check" ? "体检中…" : "体检"),
          h("button", { disabled: !canSnap || !!act.busy, onClick: () => doAct("snapshot"), style: canSnap ? S.btnOn : S.btn }, act.busy === "snapshot" ? "快照中…" : "快照"),
          h("button", { disabled: true, style: S.btn }, "部署（待开通）")),
        h("div", { style: S.tip }, !me ? "登录后可用" : (canSnap ? "owner/admin 可快照；operator 仅体检" : (canCheck ? "operator：可体检，不可快照" : "viewer：只读"))) ,
        act.err ? h("div", { style: { color: "#dc2626", marginTop: "6px", fontSize: "12px" } }, act.err) : null,
        act.out ? h("div", { style: S.out }, act.out) : null),

      h("div", { style: S.sec }, h("div", { style: S.h }, "BAOVOO · 托管"),
        h("div", { style: { fontSize: "12px", color: "#64748b", marginBottom: "6px" } }, "建站、托管实例、续费与到期在 BAOVOO 控制台；面板只做入口与状态。"),
        h("div", null,
          h("button", { style: S.btnOn, onClick: () => window.open("https://baovoo.com/", "_blank") }, "打开托管控制台"),
          h("button", { style: S.btnOn, onClick: () => window.open("https://baovoo.com/dsh-plugin-hosting/", "_blank") }, "建站 / 选套餐"),
          h("button", { style: S.btnOn, onClick: () => window.open("https://baovoo.com/trial/", "_blank") }, "申请试用"))),
      h("div", { style: S.sec }, h("div", { style: S.h }, "问题反馈"),
        h("textarea", { value: fb, onChange: e => setFb(e.target.value), rows: 3, placeholder: "遇到问题、或希望加什么功能（至少 10 个字）", style: { width: "100%", boxSizing: "border-box", padding: "8px", border: "1px solid #dbe2ea", borderRadius: "8px", font: "13px/1.5 system-ui,sans-serif", resize: "vertical" } }),
        h("div", null, h("button", { disabled: fb.trim().length < 10 || fbBusy, onClick: submitFb, style: fb.trim().length < 10 || fbBusy ? S.btn : S.btnOn }, fbBusy ? "提交中…" : "提交")),
        h("div", { style: { marginTop: "4px", fontSize: "11.5px", color: "#94a3b8", textAlign: "right" } }, fb.trim().length + " 字" + (fb.trim().length < 10 ? "（至少 10 字）" : "")),
        fbMsg ? h("div", { style: { marginTop: "6px", fontSize: "12px", color: fbMsg.indexOf("已收到") === 0 ? "#059669" : "#dc2626" } }, fbMsg) : null),
      h("div", { style: { marginTop: "10px", fontSize: "12px", color: "#94a3b8" } }, d ? "更新于 " + d.updated_at + "（每 60 秒刷新）" : "每 60 秒刷新"),
      d && d.updated_at && (Date.now() - new Date(String(d.updated_at).replace(" ", "T")).getTime() > 30 * 60 * 1000)
        ? h("div", { style: { marginTop: "4px", fontSize: "12px", color: "#b45309" } }, "⚠ 数据可能过期（超过 30 分钟未更新）") : null);
  }

  function apply(ctx) {
    try { const t = setTimeout(() => { try { ctx.sidebarRight.openTab(KIND) } catch (e) {} }, 1500); if (ctx.effect) ctx.effect(() => () => clearTimeout(t), "panel: auto open"); } catch (e) {}
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => "DSH-OPS" }), "panel: tab type");
    ctx.effect(() => ctx.slots.register({ name: "sidebar.right.pane.tab", key: ID }, Body), "panel: body");
  }
  exports.apply = apply;
  exports.inject = ["slots", "sidebarRight", "sidebarRightTabs"];
  return module.exports;
}});
