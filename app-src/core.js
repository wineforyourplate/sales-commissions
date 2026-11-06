/* ── Sales commissions: the core ─────────────────────────────────────────────
   One app for everyone in the space. Who you are in Lemma decides what you see:
     Manager = the space's Admins and Editors (see everything, add people, set the plan)
     Finance = members with the FINANCE role (approve deals, mark payouts)
     Sales   = every other member (log your own deals, see your own commission)
   Reads the space through LemmaClient; Lemma injects the space as window.__LEMMA_CONFIG__. */
var CM = (function () {
  var CFG = window.__LEMMA_CONFIG__ || {};
  var TABLES = ["deals", "commissions", "commission_rules", "products", "settings", "invites", "seen"];
  var ACCESS_VERSION = 1;
  var api = { CFG: CFG, client: null, me: null, member: null, roles: [], actions: [], members: [], state: null, team: "none", tally: { seed: "tally", email: "" }, org: null };

  /* ── small helpers ── */
  api.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  api.settings = function () { return (api.state && api.state.settings[0]) || {}; };
  api.money = function (n) {
    var s = api.settings(), sym = s.currency_symbol || "₹", loc = s.locale || "en-IN";
    var v = Math.round(Number(n) || 0);
    try { return (v < 0 ? "-" : "") + sym + Math.abs(v).toLocaleString(loc); } catch (e) { return sym + Math.abs(v); }
  };
  api.pct = function (r) { return (Math.round((Number(r) || 0) * 100) / 100) + "%"; };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  api.day = function (s) { if (!s) return ""; var d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? "" : d.getDate() + " " + MON[d.getMonth()]; };
  api.today = function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  api.thisMonth = function () { return api.today().slice(0, 7); };
  api.monthName = function (ym, withYear) { if (!ym) return ""; var p = ym.split("-"); return MONTH[Number(p[1]) - 1] + (withYear ? " " + p[0] : ""); };
  api.first = function (name) { return String(name || "").trim().split(/\s+/)[0]; };
  api.initials = function (n) { return String(n || "?").trim().split(/\s+/).map(function (p) { return p.charAt(0); }).slice(0, 2).join("").toUpperCase(); };
  var HUES = ["#2F6F5E", "#3B5BA9", "#8A4B9C", "#B4563A", "#456B8C", "#6B7A2F", "#9C4061", "#2E7D8C"];
  api.av = function (name, cls) { var h = 0; String(name).split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return '<span class="av ' + (cls || "") + '" style="background:' + HUES[h % HUES.length] + '" aria-hidden="true">' + api.esc(api.initials(name)) + "</span>"; };
  api.same = function (a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); };
  api.payLabel = { paid_in_full: "Paid in full", part_paid: "Part paid", not_paid: "Not paid yet" };
  api.sum = function (arr, f) { return arr.reduce(function (s, x) { return s + (Number(f(x)) || 0); }, 0); };
  api.plural = function (n, w, many) { return n + " " + (n === 1 ? w : (many || w + "s")); };
  api.errText = function (e) {
    var m = e && (e.body && (e.body.message || e.body.detail)) || (e && e.message) || "";
    if (typeof m !== "string") m = JSON.stringify(m);
    return m.replace(/^.*ValueError:\s*/s, "").slice(0, 240) || "try again";
  };

  var P = { // 24px line icons
    deals: "M4 6h16M4 12h16M4 18h10", plus: "M12 5v14M5 12h14", rules: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
    check: "M5 12l5 5 9-10", users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8",
    pay: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", setup: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
    back: "M15 18l-6-6 6-6", help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
    home: "M4 11l8-7 8 7M6 9.5V20h12V9.5", person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1", chev: "M6 9l6 6 6-6",
    copy: "M9 9h11v11H9zM5 15V4h11"
  };
  api.ico = function (k, size) { return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + P[k] + '"/></svg>'; };
  /* the mark in the browser tab and the sidebar: a white "%" on green */
  api.MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0B7A4B"/><circle cx="11" cy="11" r="3.4" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="21" cy="21" r="3.4" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M22.5 8.5l-13 15" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

  /* ── Tally: drawn the way Lemma draws every teammate, from the teammate's id ── */
  var TONES = ["#5a3fd4", "#11743c", "#8a6400", "#c22f15", "#d97757"];
  function hashSeed(v) { var h = 2166136261; for (var i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function makeRandom(seed) { var s = seed; return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function genes(seed) {
    var r = makeRandom(hashSeed(seed));
    return { tone: Math.floor(r() * 5), form: Math.floor(r() * 8), crest: Math.floor(r() * 4), eyeSpacing: 12 + Math.floor(r() * 6), eyeY: 48 + Math.floor(r() * 8), eyeR: 8 + Math.floor(r() * 3) };
  }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  api.beingSvg = function (seed) {
    var g = genes(seed), tone = TONES[g.tone], B = window.BEING_SHAPES;
    var form = B.FORMS[g.form] || B.FORMS[0], clip = "lm-being-" + g.tone + g.form + g.crest + g.eyeSpacing + g.eyeY;
    var paint = function (m) { return String(m || "").split("currentColor").join(tone).split("var(--identity-shade)").join("#000000"); };
    var cx = [50 - g.eyeSpacing, 50 + g.eyeSpacing];
    var eyes = cx.map(function (x) { return '<ellipse cx="' + x + '" cy="' + g.eyeY + '" rx="' + g.eyeR + '" ry="' + round3(g.eyeR * 1.12) + '" fill="#fdfcf8"/>'; }).join("") +
      cx.map(function (x) { return '<circle cx="' + x + '" cy="' + g.eyeY + '" r="' + round3(g.eyeR * 0.46) + '" fill="#2b2924"/>'; }).join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 104 104"><defs><clipPath id="' + clip + '"><path d="' + form + '"/></clipPath></defs>' +
      '<g fill="' + tone + '">' + paint(B.CRESTS[g.crest]) + '</g><path d="' + form + '" fill="' + tone + '"/><g clip-path="url(#' + clip + ')">' + (B.FORM_DEPTH[g.form] || "") + "</g>" +
      '<path d="' + form + '" fill="none" stroke="#000000" stroke-opacity=".14" stroke-width="1.5"/>' + eyes + "</svg>";
  };
  api.tallyFace = function (cls) { return '<span class="tally ' + (cls || "") + '" aria-hidden="true">' + api.beingSvg(api.tally.seed) + "</span>"; };

  /* ── how a commission is worked out (same rules as the price_deal / approve_deal functions) ── */
  api.pickRule = function (rules, email, product) {
    var live = rules.filter(function (r) { return r.active !== false; });
    var order = [["salesperson", email], ["product", product], ["everyone", null]];
    for (var i = 0; i < order.length; i++) {
      for (var j = 0; j < live.length; j++) {
        var r = live[j];
        if (r.applies_to !== order[i][0]) continue;
        if (order[i][1] !== null && !api.same(r.match, order[i][1])) continue;
        return r;
      }
    }
    return null;
  };
  api.workOut = function (rules, email, product, base, soldThisMonth) {
    var rule = api.pickRule(rules, email, product);
    if (!rule) return { amount: 0, rate: 0, label: "No rule", parts: [] };
    var rate = Number(rule.rate) || 0, amount = base * rate / 100, parts = [{ rate: rate, on: base, label: rule.label }];
    rules.filter(function (r) { return r.applies_to === "monthly_bonus" && r.active !== false; })
      .sort(function (a, b) { return (a.threshold || 0) - (b.threshold || 0); })
      .forEach(function (b) {
        var t = Number(b.threshold) || 0, above = Math.max(0, (soldThisMonth + base) - Math.max(t, soldThisMonth));
        if (above > 0) { amount += above * (Number(b.rate) || 0) / 100; parts.push({ rate: Number(b.rate) || 0, on: above, label: b.label, bonus: true, threshold: t }); }
      });
    return { amount: Math.round(amount * 100) / 100, rate: base ? amount / base * 100 : rate, label: rule.label, parts: parts };
  };
  api.soldThisMonth = function (email, month) {
    return api.state.commissions.filter(function (c) { return api.same(c.rep_email, email) && c.month === (month || api.thisMonth()); })
      .reduce(function (s, c) { return s + (Number(c.base) || 0); }, 0);
  };
  /* "10% × ₹2,60,000 = ₹26,000": the line people see everywhere */
  api.cline = function (parts, total, ruleLabel) {
    if (!parts || !parts.length) return '<span class="muted">Nothing in the plan covers this yet</span>';
    var bits = parts.map(function (p, i) { return (i ? '<span class="op">+</span>' : "") + api.pct(p.rate) + ' <span class="op">×</span> ' + api.money(p.on); }).join(" ");
    return '<span class="cline">' + bits + ' <span class="op">=</span> <span class="res money">' + api.money(total) + "</span>" + (ruleLabel ? ' <span class="rule">' + api.esc(ruleLabel) + "</span>" : "") + "</span>";
  };

  /* ── loading ── */
  function flat(r) { var src = r && r.data ? r.data : r; var o = {}; for (var k in src) o[k] = src[k]; o.id = (r && r.id != null) ? r.id : src.id; return o; }
  function items(resp) { return ((resp && (resp.items || resp.data)) || (Array.isArray(resp) ? resp : [])).map(flat); }
  api.load = async function () {
    var out = { denied: [] };
    var res = await Promise.all(TABLES.map(function (t) { return api.client.records.list(t, { limit: 1000 }).catch(function (e) { return { __error: e }; }); }));
    TABLES.forEach(function (t, i) { if (res[i] && res[i].__error) { out[t] = []; out.denied.push(t); } else out[t] = items(res[i]); });
    api.state = out;
    return out;
  };
  api.loadMembers = async function () {
    try { var mm = await api.client.podMembers.list(CFG.podId, { limit: 500 }); api.members = (mm && (mm.items || mm)) || []; } catch (e) { api.members = api.members || []; }
    return api.members;
  };
  api.reloadSoon = (function () { var t; return function (fn) { clearTimeout(t); t = setTimeout(fn, 300); }; })();

  /* ── who is this ── */
  function hasAction(a) { return api.actions.indexOf(a) >= 0; }
  api.memberTeam = function (m) {
    var r = (m && m.roles) || [];
    if (r.indexOf("POD_ADMIN") >= 0 || r.indexOf("POD_EDITOR") >= 0) return "manager";
    if (r.indexOf("FINANCE") >= 0) return "finance";
    if (r.indexOf("POD_USER") >= 0 || r.indexOf("SALES") >= 0) return "sales";
    return "none";
  };
  api.TEAM_LABEL = { manager: "Manager", finance: "Finance", sales: "Sales", none: "Can't use the app yet" };
  api.isManager = function () { return api.team === "manager"; };
  api.canAddPeople = function () { return hasAction("pod.member.manage"); };
  api.myName = function () {
    var me = api.me || {}, m = api.member || {};
    var full = m.user_name || [me.first_name, me.last_name].filter(Boolean).join(" ") || me.name || me.full_name;
    return full || api.first(api.myEmail().split("@")[0]);
  };
  api.myEmail = function () { return (api.me && api.me.email) || (api.member && (api.member.user_email || api.member.email)) || ""; };
  api.memberName = function (m) { return (m && (m.user_name || (m.user && [m.user.first_name, m.user.last_name].filter(Boolean).join(" ")))) || String((m && (m.user_email || m.email)) || "").split("@")[0]; };
  api.managers = function () { return api.members.filter(function (m) { return api.memberTeam(m) === "manager"; }); };
  api.managerNames = function () {
    var n = api.managers().filter(function (m) { return !api.same(m.user_email || m.email, api.myEmail()); }).map(function (m) { return api.first(api.memberName(m)); });
    if (!n.length) return "your manager";
    return n.length === 1 ? n[0] : n.slice(0, -1).join(", ") + " or " + n[n.length - 1];
  };
  api.lemmaUrl = function (path) { return (CFG.authUrl ? CFG.authUrl.replace(/\/auth\/?$/, "") : "https://lemma.work") + "/t/" + CFG.podId + (path || "/home"); };

  /* ── first open by a manager: lock the money tables to the right people ──
     Commissions, the plan, products and settings are RESTRICTED in this template, so until this runs only the
     person who installed it can read them. This gives each Lemma role its access, once:
       User (Sales): reads the plan, products, settings and their commissions
       FINANCE: also writes commissions (approve, pay out) and runs approve_deal
       Editor / Admin (Managers): change everything */
  var R = ["datastore.table.read", "datastore.record.read"], RW = R.concat(["datastore.record.write"]), RUN = ["function.read", "function.execute"];
  var ACCESS = [
    ["datastore_table", "commissions", { POD_USER: R, FINANCE: RW, POD_EDITOR: RW, POD_ADMIN: RW }],
    ["datastore_table", "commission_rules", { POD_USER: R, FINANCE: R, POD_EDITOR: RW, POD_ADMIN: RW }],
    ["datastore_table", "products", { POD_USER: R, FINANCE: R, POD_EDITOR: RW, POD_ADMIN: RW }],
    ["datastore_table", "settings", { POD_USER: R, FINANCE: R, POD_EDITOR: RW, POD_ADMIN: RW }],
    ["datastore_table", "invites", { POD_USER: R, FINANCE: R, POD_EDITOR: RW, POD_ADMIN: RW }],
    ["function", "approve_deal", { FINANCE: RUN, POD_EDITOR: RUN, POD_ADMIN: RUN }]
  ];
  api.ensureAccess = async function () {
    var s = api.settings(), setup = (s.setup && typeof s.setup === "object") ? s.setup : {};
    if (setup.access === ACCESS_VERSION || !api.canAddPeople()) return false;
    var pod = CFG.podId;
    var list = async function () { var rr = await api.client.podRoles.list(pod); return (rr && (rr.items || rr)) || []; };
    var roles = await list();
    if (!roles.some(function (r) { return r.name === "FINANCE"; })) {
      await api.client.podRoles.create({ name: "FINANCE", description: "Sales commissions: approves deals and marks payouts", permission_ids: [] }, pod);
      roles = await list();
    }
    var idOf = {}; roles.forEach(function (r) { idOf[r.name] = r.id; });
    for (var i = 0; i < ACCESS.length; i++) {
      var a = ACCESS[i];
      try { // keep it locked even if an install didn't carry the visibility over
        var cur = a[0] === "function" ? await api.client.functions.get(a[1]) : await api.client.tables.get(a[1]);
        if (cur && cur.visibility && cur.visibility !== "RESTRICTED") await (a[0] === "function" ? api.client.functions : api.client.tables).update(a[1], { visibility: "RESTRICTED" });
      } catch (e) { /* the grant below still applies */ }
      for (var role in a[2]) if (idOf[role]) await api.client.resourceAccess.replaceGrant(a[0], a[1], "ROLE", idOf[role], { permission_ids: a[2][role] }, pod);
    }
    setup.access = ACCESS_VERSION;
    await api.saveSettings({ setup: setup });
    return true;
  };
  api.saveSettings = async function (patch) {
    var s = api.settings();
    if (s.id) await api.client.records.update("settings", s.id, patch);
    else await api.client.records.create("settings", Object.assign({ currency_symbol: "₹", locale: "en-IN" }, patch));
    await api.load();
  };
  api.setupState = function () { var s = api.settings().setup; return (s && typeof s === "object") ? s : {}; };
  api.markSetup = async function (key) { var st = Object.assign({}, api.setupState()); st[key] = true; await api.saveSettings({ setup: st }); };

  /* Lemma invitations can only carry Lemma's own roles, so a Finance invitee joins as a User. The next time a
     manager opens the app, anyone who has joined since gets the team they were invited to. */
  api.applyInvites = async function () {
    if (!api.canAddPeople()) return false;
    var changed = false, pending = (api.state.invites || []).filter(function (i) { return i.status !== "joined"; });
    for (var k = 0; k < pending.length; k++) {
      var inv = pending[k], m = api.members.filter(function (x) { return api.same(x.user_email || x.email, inv.email); })[0];
      if (!m) continue;
      try {
        var want = api.rolesFor(inv.team, m.roles);
        if (want.join() !== (m.roles || []).join()) await api.client.podMembers.updateRoles(CFG.podId, m.pod_member_id, want);
        await api.client.records.update("invites", inv.id, { status: "joined" });
        changed = true;
      } catch (e) { /* try again next time */ }
    }
    if (changed) { await api.loadMembers(); await api.load(); await api.syncFinanceEmails(); }
    return changed;
  };
  api.rolesFor = function (team, current) {
    var keep = (current || []).filter(function (r) { return ["POD_ADMIN", "POD_EDITOR", "POD_USER", "POD_VIEWER", "FINANCE", "SALES"].indexOf(r) < 0; });
    if (team === "manager") return ["POD_ADMIN"].concat(keep);
    if (team === "finance") return ["POD_USER", "FINANCE"].concat(keep);
    return ["POD_USER"].concat(keep);
  };
  /* Tally sends the morning list to whoever is in Finance (or the managers, until someone is) */
  api.syncFinanceEmails = async function () {
    var pick = function (t) { return api.members.filter(function (m) { return api.memberTeam(m) === t; }).map(function (m) { return m.user_email || m.email; }).filter(Boolean); };
    var emails = pick("finance"); if (!emails.length) emails = pick("manager");
    var want = emails.sort().join(", ");
    if ((api.settings().finance_emails || "") !== want) { try { await api.saveSettings({ finance_emails: want }); } catch (e) {} }
  };

  /* ── per person: which intros they've seen (kept in Lemma, so it follows them to any device) ── */
  api.seen = function (key) {
    if ((api.state.seen || []).some(function (r) { return r.what === key; })) return true;
    try { return localStorage.getItem("sc-seen:" + api.myEmail() + ":" + key) === "1"; } catch (e) { return false; }
  };
  api.markSeen = async function (key) {
    try { localStorage.setItem("sc-seen:" + api.myEmail() + ":" + key, "1"); } catch (e) {}
    if (api.seen(key) && (api.state.seen || []).some(function (r) { return r.what === key; })) return;
    try { var rec = await api.client.records.create("seen", { what: key }); api.state.seen.push({ what: key, id: rec && rec.id }); } catch (e) {}
  };

  /* ── boot: load the SDK from the API host, sign in, work out who this is, load data ── */
  api.boot = function (onReady, onFail) {
    var base = (CFG.apiUrl || window.location.origin).replace(/\/$/, "");
    var s = document.createElement("script");
    s.src = base + "/public/sdk/lemma-client.js";
    s.onerror = function () { onFail("Couldn't reach Lemma. Check your connection and reload."); };
    s.onload = async function () {
      try {
        api.client = new window.LemmaClient.LemmaClient();
        var st = await api.client.initialize();
        if (!st || st.status !== "authenticated") { api.client.auth.redirectToAuth(); return; }
        api.me = st.user || {};
        var podId = CFG.podId;
        try { api.member = await api.client.podMembers.lookupByUserId(podId, api.me.id); api.roles = (api.member && api.member.roles) || []; } catch (e) { api.roles = []; }
        try { var mine = await api.client.podPermissions.me(podId); api.actions = (mine && (mine.actions || mine.permissions)) || []; } catch (e) { api.actions = []; }
        api.team = api.memberTeam({ roles: api.roles });
        // organisation owners reach every space without being in it: treat them as managers
        if (api.team === "none" && hasAction("app.update")) api.team = "manager";
        await Promise.all([api.load(), api.loadMembers()]);
        if (api.isManager()) {
          try { if (await api.ensureAccess()) await api.load(); } catch (e) { api.accessError = api.errText(e); }
          try { await api.applyInvites(); } catch (e) {}
          try { await api.syncFinanceEmails(); } catch (e) {}
        }
        try { var ag = await api.client.agents.get("tally"); if (ag && ag.id) api.tally.seed = ag.id; } catch (e) {}
        try {
          var sf = await api.client.podSurfaces.list(podId);
          (sf && (sf.items || sf) || []).forEach(function (x) { if (x.agent_name === "tally" && x.platform === "RESEND" && x.surface_identity_email) api.tally.email = x.surface_identity_email; });
        } catch (e) {}
        onReady(true);
        try { api.client.datastore.watchChanges({ onChange: function () { api.reloadSoon(function () { api.load().then(function () { onReady(false); }); }); } }); } catch (e) { /* polling below keeps it fresh */ }
        setInterval(function () { if (!document.hidden) api.load().then(function () { onReady(false); }); }, 30000);
      } catch (e) { onFail(api.errText(e)); }
    };
    document.head.appendChild(s);
  };

  /* ── toast + sheet ── */
  var toastTimer;
  api.toast = function (html) {
    var el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = html; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  };
  api.sheet = function (html, wire) {
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
    var close = function () { scrim.remove(); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    var f = scrim.querySelector("input, textarea, select, button.dark"); if (f) f.focus();
    if (wire) wire(scrim, close);
    return close;
  };
  api.copy = function (text, what) {
    var done = function () { api.toast("Copied " + api.esc(what || "") + "."); };
    try { navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this:", text); }); } catch (e) { window.prompt("Copy this:", text); }
  };

  /* ── Tally introduces itself: one card per step, then hands over to the page tour ── */
  api.intro = function (steps, onDone) {
    var i = 0, scrim = document.createElement("div");
    scrim.className = "intro-scrim";
    document.body.appendChild(scrim);
    function finish(skipped) { scrim.remove(); document.removeEventListener("keydown", onKey); onDone && onDone(skipped); }
    function onKey(e) { if (e.key === "Escape") finish(true); }
    function show() {
      var st = steps[i], last = i === steps.length - 1;
      scrim.innerHTML = '<div class="intro" role="dialog" aria-modal="true" aria-labelledby="intro-t" aria-describedby="intro-b">' + api.tallyFace("bob") +
        '<div class="name">Tally · your commissions teammate</div><h2 id="intro-t">' + api.esc(st.title) + '</h2><p id="intro-b">' + st.body + "</p>" +
        '<div class="dots" aria-hidden="true">' + steps.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + "</div>" +
        '<div class="actions">' + (last ? "" : '<button class="linkbtn" data-i="skip">Skip</button>') + '<span class="grow"></span>' + (i ? '<button class="btn" data-i="back">Back</button>' : "") +
        '<button class="btn dark" data-i="next">' + api.esc(last ? (st.cta || "Let’s go") : "Next") + "</button></div></div>";
      scrim.querySelector('[data-i="next"]').focus();
    }
    scrim.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-i]"); if (!t) return;
      var k = t.getAttribute("data-i");
      if (k === "skip") finish(true);
      if (k === "back") { i--; show(); }
      if (k === "next") { if (i === steps.length - 1) finish(false); else { i++; show(); } }
    });
    document.addEventListener("keydown", onKey);
    show();
  };

  /* ── page tour: steps point at elements with [data-tour="key"] ── */
  api.tour = function (steps, onDone) {
    steps = steps.filter(function (s) { var el = document.querySelector('[data-tour="' + s.target + '"]'); return el && el.getClientRects().length; });
    if (!steps.length) { onDone && onDone(); return; }
    var i = 0, hole = document.createElement("div"), card = document.createElement("div");
    hole.className = "tour-hole"; card.className = "tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-live", "polite");
    document.body.appendChild(hole); document.body.appendChild(card);
    function done() { hole.remove(); card.remove(); window.removeEventListener("resize", show); onDone && onDone(); }
    function show() {
      var st = steps[i], el = document.querySelector('[data-tour="' + st.target + '"]');
      if (el && el.getClientRects().length) {
        el.scrollIntoView({ block: "center" });
        var r = el.getBoundingClientRect(), pad = 6;
        hole.style.cssText = "display:block;left:" + (r.left - pad) + "px;top:" + (r.top - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + (r.height + pad * 2) + "px";
        var top = r.bottom + 12, left = Math.min(Math.max(12, r.left), window.innerWidth - 332);
        if (top + 210 > window.innerHeight) top = Math.max(12, r.top - 222);
        card.style.left = left + "px"; card.style.top = top + "px";
      }
      card.innerHTML = '<div class="who-says">' + api.tallyFace() + '<span class="step">' + (i + 1) + " of " + steps.length + "</span></div><h3>" + api.esc(st.title) + "</h3><p>" + st.body + '</p><div class="actions">' +
        '<button class="linkbtn" data-t="skip">Skip</button><span class="grow"></span>' + (i ? '<button class="btn sm" data-t="back">Back</button>' : "") +
        '<button class="btn sm dark" data-t="next">' + (i === steps.length - 1 ? "Got it" : "Next") + "</button></div>";
      card.querySelector('[data-t="next"]').focus();
    }
    card.addEventListener("click", function (e) {
      var t = e.target.getAttribute("data-t");
      if (t === "skip") done();
      if (t === "back") { i--; show(); }
      if (t === "next") { if (i === steps.length - 1) done(); else { i++; show(); } }
    });
    window.addEventListener("resize", show);
    show();
  };

  api.fail = function (msg) {
    document.getElementById("app").innerHTML = '<div class="center"><div><h1>Couldn’t open this</h1><p class="sub">' + api.esc(msg) + '</p><p><button class="btn" onclick="location.reload()">Try again</button></p></div></div>';
  };
  return api;
})();
