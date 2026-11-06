/* ── Sales commissions: the screens ──────────────────────────────────────────
   Sales:   My deals · Log a deal · Commission plan (read only)
   Finance: Approvals · Payouts · Team · Commission plan (read only)
   Manager: Overview · People · Commission plan (edit) · Settings, and can switch to the Finance and Sales screens.
   Everyone always acts as themselves: deals are logged under the signed-in person, approvals carry the approver's name. */
(function () {
  var esc = CM.esc, money = CM.money, ico = CM.ico, sum = CM.sum, plural = CM.plural;
  var S = { mode: null, form: null, formErr: {}, logBusy: false, busy: {}, err: {}, rejecting: {}, rejectText: {}, month: null, open: {}, draft: {}, tryit: { rep: "", product: "", amount: "100000" }, peopleBusy: "" };
  var MODE_INFO = {
    manager: ["Manager", "See everyone, add people, set the plan"],
    finance: ["Finance", "Approve deals and pay out"],
    sales: ["Sales", "Log your own deals, see your commission"]
  };
  function me() { return { name: CM.myName(), email: CM.myEmail() }; }
  function phone() { return window.innerWidth <= 760; }

  /* ── which screens this person gets ── */
  function modes() { return CM.team === "manager" ? ["manager", "finance", "sales"] : CM.team === "finance" ? ["finance"] : CM.team === "sales" ? ["sales"] : []; }
  function mode() {
    var m = modes();
    if (S.mode && m.indexOf(S.mode) >= 0) return S.mode;
    var saved = null; try { saved = localStorage.getItem("sc-mode:" + CM.myEmail()); } catch (e) {}
    return m.indexOf(saved) >= 0 ? saved : m[0];
  }
  function setMode(m) {
    S.mode = m; try { localStorage.setItem("sc-mode:" + CM.myEmail(), m); } catch (e) {}
    if (location.hash && location.hash !== "#/") location.hash = "#/"; else render();
    window.scrollTo(0, 0); maybeIntro(false);
  }

  /* ── data helpers ── */
  function lineFor(deal) { return CM.state.commissions.filter(function (c) { return c.deal_id === deal.id; })[0] || null; }
  function baseOf(d) { return d.payment_status === "part_paid" ? (Number(d.amount_received) || 0) : (Number(d.amount) || 0); }
  function priced(d) { return CM.workOut(CM.state.commission_rules, d.rep_email, d.product, baseOf(d), CM.soldThisMonth(d.rep_email)); }
  function myDeals() {
    var m = me();
    return CM.state.deals.filter(function (d) { return CM.same(d.rep_email, m.email); })
      .sort(function (a, b) { return String(b.closed_on || b.created_at || "").localeCompare(String(a.closed_on || a.created_at || "")) || String(b.created_at).localeCompare(String(a.created_at)); });
  }
  function stage(d) {
    var line = lineFor(d);
    if (d.status === "rejected") return { cls: "rejected", label: "Not approved" };
    if (d.status === "approved") return line && line.status === "paid_out" ? { cls: "paid", label: "Paid out" } : { cls: "approved", label: "Approved" };
    if (!d.check_status) return { cls: "checking", label: "Being checked" };
    if (d.check_status === "needs_a_look") return { cls: "look", label: "Needs a look" };
    return { cls: "waiting", label: "With finance" };
  }
  function waitingDeals() {
    return CM.state.deals.filter(function (d) { return d.status === "waiting"; }).sort(function (a, b) {
      var la = a.check_status === "needs_a_look" ? 0 : 1, lb = b.check_status === "needs_a_look" ? 0 : 1;
      return la - lb || String(a.created_at).localeCompare(String(b.created_at));
    });
  }
  /* salespeople: everyone in the Sales team, plus anyone who has logged a deal */
  function salesPeople() {
    var seen = {}, out = [];
    var add = function (name, email) { var k = String(email || "").toLowerCase(); if (k && !seen[k]) { seen[k] = 1; out.push({ name: name || email, email: email }); } };
    CM.members.forEach(function (m) { if (CM.memberTeam(m) === "sales") add(CM.memberName(m), m.user_email || m.email); });
    CM.state.deals.concat(CM.state.commissions).forEach(function (d) { add(d.rep_name, d.rep_email); });
    return out.sort(function (a, b) { return String(a.name).localeCompare(b.name); });
  }
  function products(all) { return CM.state.products.filter(function (p) { return all || p.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(b.name); }); }
  function productRule(name) { return CM.state.commission_rules.filter(function (r) { return r.applies_to === "product" && CM.same(r.match, name); })[0] || null; }
  function stdRule() { return CM.state.commission_rules.filter(function (r) { return r.applies_to === "everyone" && r.active !== false; })[0] || null; }
  function tallyMail() { return CM.tally.email ? '<a href="mailto:' + esc(CM.tally.email) + '">' + esc(CM.tally.email) + "</a>" : ""; }
  function company() { return CM.settings().company || ""; }

  /* ═══ SALES ═══ */
  function viewHome() {
    var m = me(), deals = myDeals(), lines = CM.state.commissions.filter(function (c) { return CM.same(c.rep_email, m.email); });
    var month = CM.thisMonth();
    var earned = lines.filter(function (c) { return c.month === month; });
    var waiting = deals.filter(function (d) { return d.status === "waiting"; });
    var paid = lines.filter(function (c) { return c.status === "paid_out"; });
    var lastPaid = paid.map(function (c) { return c.paid_out_on || ""; }).sort().pop();
    var head = '<div class="page-head"><div><h1>Hi ' + esc(CM.first(m.name)) + '</h1><p class="sub">' + CM.monthName(month, true) + "</p></div>" +
      '<div class="row"><button class="helpbtn" data-replay aria-label="Show me around">' + ico("help") + '</button><a class="btn dark" href="#/log" data-tour="log">' + ico("plus", 16) + "Log a deal</a></div></div>";
    var stats = '<div class="stats" data-tour="stats">' +
      '<div class="stat"><label><i style="background:var(--earned)"></i>Earned in ' + CM.monthName(month) + "</label><b>" + money(sum(earned, function (c) { return c.amount; })) + "</b><small>" + plural(earned.length, "deal") + " approved</small></div>" +
      '<div class="stat"><label><i style="background:var(--waiting)"></i>Waiting for finance</label><b>' + money(sum(waiting, function (d) { return d.expected_commission; })) + "</b><small>" + plural(waiting.length, "deal") + ", if approved as they are</small></div>" +
      '<div class="stat"><label><i style="background:var(--ink)"></i>Paid out so far</label><b>' + money(sum(paid, function (c) { return c.amount; })) + "</b><small>" + (lastPaid ? "Last payout " + CM.day(lastPaid) : "Nothing paid out yet") + "</small></div></div>";
    var list = deals.length ? '<div class="dl" data-tour="deals"><div class="dl-head"><span>Deal</span><span>Value</span><span>Commission</span><span>Status</span></div>' + deals.map(function (d) {
      var st = stage(d), line = lineFor(d), com;
      if (line) com = '<div class="d-com">' + money(line.amount) + "</div>";
      else if (d.status === "rejected") com = '<div class="d-com soft">—</div>';
      else com = '<div class="d-com soft" title="If approved as it is">≈ ' + money(d.expected_commission != null ? d.expected_commission : priced(d).amount) + "</div>";
      var note = "";
      if (d.status === "rejected" && d.finance_note) note = '<div class="d-note note rejected">Finance: ' + esc(d.finance_note) + "</div>";
      else if (d.status === "waiting" && d.check_status === "needs_a_look" && d.check_note) note = '<div class="d-note note look">' + esc(d.check_note) + "</div>";
      return '<a class="drow" href="#/deal/' + esc(d.id) + '"><div class="d-main"><b>' + esc(d.customer) + "</b><small>" + esc(d.product || "") + (d.closed_on ? " · " + CM.day(d.closed_on) : "") + '</small></div><div class="d-amt">' + money(d.amount) + "</div>" + com + '<div class="d-st"><span class="chip ' + st.cls + '">' + st.label + "</span></div>" + note + "</a>";
    }).join("") + "</div>" : '<div class="empty" data-tour="deals"><b>No deals logged yet</b>Log each deal you close. Tally checks it and works out your commission.<p><a class="btn dark" href="#/log">Log your first deal</a></p></div>';
    var say = CM.tally.email ? '<div class="say">' + CM.tallyFace() + '<div><b>On the move?</b><p>Email me the deal from your work email and I’ll log it for you: ' + tallyMail() + '.</p><q>“Closed Bluefin, Annual plan, 3,00,000 before tax, paid in full, INV-2061”</q></div></div>' : "";
    return head + stats + '<div class="section">Your deals <span>' + deals.length + "</span></div>" + list + say;
  }

  function viewDeal(id) {
    var m = me(), d = CM.state.deals.filter(function (x) { return x.id === id; })[0];
    var crumbs = '<div class="crumbs"><a href="#/">' + ico("back", 16) + "Your deals</a></div>";
    if (!d) return crumbs + '<div class="empty"><b>That deal isn’t here</b>It may have been removed.</div>';
    if (!CM.same(d.rep_email, m.email)) return crumbs + '<div class="empty"><b>That’s someone else’s deal</b>You can see your own deals here.</div>';
    var line = lineFor(d), st = stage(d);
    var steps = [
      { k: "done", b: "Logged", s: (d.created_at ? CM.day(d.created_at) : CM.day(d.closed_on)) + (d.logged_via && d.logged_via !== "app" ? " · by " + esc(d.logged_via) : "") },
      d.check_status ? { k: "done", b: "Checked by Tally", s: d.check_status === "needs_a_look" ? "Needs a look" : "Looks right" } : { k: "now", b: "Tally is checking", s: "Usually under a minute" },
      d.status === "approved" ? { k: "done", b: "Approved", s: "by " + esc(CM.first(d.reviewed_by)) + " · " + CM.day(d.reviewed_at) } :
        d.status === "rejected" ? { k: "bad", b: "Not approved", s: "by " + esc(CM.first(d.reviewed_by)) + " · " + CM.day(d.reviewed_at) } :
        { k: d.check_status ? "now" : "", b: "Finance approves", s: "Waiting" },
      line && line.status === "paid_out" ? { k: "done", b: "Paid out", s: CM.day(line.paid_out_on) } : { k: line ? "now" : "", b: "Paid out", s: line ? "With the next payout" : "After approval" }
    ];
    var track = '<div class="track" aria-label="Where this deal is">' + steps.map(function (x) { return '<div class="tstep ' + x.k + '"><i></i><b>' + x.b + "</b><small>" + x.s + "</small></div>"; }).join("") + "</div>";
    var com;
    if (line) com = '<div class="box"><h2>Commission</h2><div class="big">' + money(line.amount) + '</div><p class="muted" style="margin:0">On ' + money(line.base) + " received · " + esc(line.rule_used || "") + "</p></div>";
    else if (d.status === "rejected") com = '<div class="box"><h2>Finance didn’t approve this</h2><p class="note rejected" style="margin:0 0 12px">' + esc(d.finance_note || "No reason given.") + '</p><a class="btn" href="#/log/again/' + esc(d.id) + '">Fix it and log again</a></div>';
    else {
      var e = priced(d);
      com = '<div class="box"><h2>If approved as it is</h2><div class="big" style="color:var(--earned)">' + money(e.amount) + "</div>" + CM.cline(e.parts, e.amount) +
        (d.payment_status === "part_paid" ? '<p class="muted" style="margin:8px 0 0">Commission is paid on what the customer has paid so far.</p>' : "") +
        (d.payment_status === "not_paid" ? '<p class="muted" style="margin:8px 0 0">Finance approves once the customer has paid.</p>' : "") + "</div>";
    }
    var check = '<div class="box" style="margin-top:20px"><div class="row" style="margin-bottom:10px">' + CM.tallyFace().replace('class="tally ', 'style="width:28px;height:28px" class="tally ') + "<h2>Tally’s check</h2></div>" +
      (d.check_status ? '<p class="note ' + (d.check_status === "needs_a_look" ? "look" : "ok") + '" style="margin:0">' + esc(d.check_note || "") + "</p>" : '<p class="muted" style="margin:0"><span class="chip checking">Checking</span> Payment, duplicates and the amount, then it goes to finance.</p>') + "</div>";
    var facts = '<div class="box"><div class="row" style="margin-bottom:10px"><h2 class="grow">Deal</h2>' + (d.status === "waiting" ? '<button class="btn sm" id="edit">Edit</button>' : "") + '</div><dl class="facts">' +
      "<dt>Customer</dt><dd>" + esc(d.customer) + (d.customer_email ? '<br><span class="muted">' + esc(d.customer_email) + "</span>" : "") + "</dd>" +
      "<dt>Product</dt><dd>" + esc(d.product || "—") + "</dd>" +
      "<dt>Value before tax</dt><dd class=\"num\">" + money(d.amount) + "</dd>" +
      "<dt>Payment</dt><dd>" + esc(CM.payLabel[d.payment_status] || "") + (d.payment_status === "part_paid" ? " · " + (d.amount_received ? money(d.amount_received) + " received" : "amount received not filled in") : "") + "</dd>" +
      "<dt>Reference</dt><dd>" + esc(d.payment_ref || "—") + "</dd>" +
      "<dt>Closed</dt><dd>" + (CM.day(d.closed_on) || "—") + "</dd>" +
      (d.notes ? "<dt>Notes</dt><dd>" + esc(d.notes) + "</dd>" : "") + "</dl></div>";
    return crumbs + '<div class="page-head"><div><h1>' + esc(d.customer) + '</h1><p class="sub">' + esc(d.product || "") + " · " + money(d.amount) + '</p></div><span class="chip ' + st.cls + '">' + st.label + "</span></div>" +
      track + '<div class="cols"><div>' + com + check + "</div>" + facts + "</div>";
  }

  function blankForm(from) {
    var f = { customer: "", customer_email: "", product: "", productOther: false, amount: "", closed_on: CM.today(), payment_status: "paid_in_full", amount_received: "", payment_ref: "", notes: "" };
    if (from) Object.keys(f).forEach(function (k) { if (from[k] != null && k !== "closed_on" && k !== "productOther") f[k] = from[k]; });
    var names = products().map(function (p) { return p.name; });
    if (f.product && names.length && names.indexOf(f.product) < 0) f.productOther = true;
    return f;
  }
  function viewLog() {
    var m = me(), f = S.form, e = S.formErr;
    var base = f.payment_status === "part_paid" ? (Number(f.amount_received) || 0) : (Number(f.amount) || 0);
    var est = CM.workOut(CM.state.commission_rules, m.email, f.product, base, CM.soldThisMonth(m.email));
    var fld = function (key, label, input, hint) { return '<div class="field"><label for="f-' + key + '">' + label + "</label>" + input + (e[key] ? '<span class="err" id="e-' + key + '">' + esc(e[key]) + "</span>" : hint ? '<span class="hint">' + hint + "</span>" : "") + "</div>"; };
    var inp = function (key, type, extra) { return '<input class="input" id="f-' + key + '" name="' + key + '" type="' + type + '" value="' + esc(f[key]) + '"' + (e[key] ? ' aria-invalid="true" aria-describedby="e-' + key + '"' : "") + (extra || "") + ">"; };
    var names = products().map(function (p) { return p.name; });
    var prod;
    if (names.length) {
      var pick = f.productOther ? "__other" : f.product;
      prod = '<select class="input" id="f-product_pick" aria-label="Product"><option value=""' + (pick ? "" : " selected") + ">Pick a product</option>" + names.map(function (n) { return '<option value="' + esc(n) + '"' + (pick === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + '<option value="__other"' + (pick === "__other" ? " selected" : "") + ">Something else</option></select>" +
        (f.productOther ? '<input class="input" style="margin-top:8px" id="f-product" name="product" type="text" placeholder="What did you sell?" value="' + esc(f.product) + '">' : "");
      prod = fld("product_pick", "Product", prod, "So the right rate applies");
    } else prod = fld("product", "Product <span class=\"muted\">(optional)</span>", inp("product", "text"), "What you sold");
    var seg = '<div class="seg" role="group" aria-label="Payment">' + [["paid_in_full", "Paid in full"], ["part_paid", "Part paid"], ["not_paid", "Not paid yet"]].map(function (p) { return '<button type="button" data-pay="' + p[0] + '" aria-pressed="' + (f.payment_status === p[0]) + '">' + p[1] + "</button>"; }).join("") + "</div>";
    var form = '<form id="logform" novalidate>' +
      fld("customer", "Customer", inp("customer", "text", ' autocomplete="organization" required')) +
      '<div class="two">' + prod + fld("amount", "Deal value before tax", inp("amount", "number", ' inputmode="decimal" min="0" step="any" required')) + "</div>" +
      '<div class="field"><label>Payment</label>' + seg + "</div>" +
      (f.payment_status === "part_paid" ? fld("amount_received", "Received so far, before tax", inp("amount_received", "number", ' inputmode="decimal" min="0" step="any"'), "Commission is paid on this now, and on the rest once it’s paid") : "") +
      '<div class="two">' + fld("payment_ref", "Invoice or payment reference", inp("payment_ref", "text"), "Finance checks the payment against this") +
      fld("closed_on", "Closed on", inp("closed_on", "date")) + "</div>" +
      fld("customer_email", "Customer email <span class=\"muted\">(optional)</span>", inp("customer_email", "email", ' autocomplete="email"')) +
      fld("notes", "Anything finance should know <span class=\"muted\">(optional)</span>", '<textarea class="input" id="f-notes" name="notes">' + esc(f.notes) + "</textarea>") +
      '<p class="muted" style="font-size:13px;margin:-4px 0 16px">Logged as you, ' + esc(m.name) + ".</p>" +
      '<div class="row"><button class="btn dark" type="submit" ' + (S.logBusy ? "disabled" : "") + ">" + (S.logBusy ? "Logging…" : "Log deal") + '</button><a class="btn ghost" href="#/">Cancel</a></div></form>';
    var side = '<aside class="estimate" aria-live="polite" data-tour="estimate"><div class="muted" style="font-weight:550">You’d earn</div><div class="big">' + money(est.amount) + "</div>" +
      (base ? CM.cline(est.parts, est.amount) : '<span class="muted">Fill in the deal value to see it.</span>') +
      '<p class="muted" style="margin:12px 0 0;font-size:13px">Worked out from your team’s commission plan. Finance confirms the payment and approves; the final amount uses the plan on that day.</p></aside>';
    return '<div class="crumbs"><a href="#/">' + ico("back", 16) + "Your deals</a></div>" +
      '<div class="page-head"><div><h1>Log a deal</h1><p class="sub">Tally checks it, then finance approves it.</p></div></div>' +
      '<div class="form-grid">' + form + side + "</div>" +
      '<div class="est-bar" aria-hidden="true"><span>You’d earn</span><b>' + money(est.amount) + "</b></div>";
  }

  /* the plan, in plain words (Sales and Finance) */
  function viewPlanRead() {
    var m = me(), rules = CM.state.commission_rules.filter(function (r) { return r.active !== false; });
    var mine = rules.filter(function (r) { return r.applies_to === "salesperson" && CM.same(r.match, m.email); })[0];
    var std = stdRule(), items = [];
    if (mine) items.push('<li><span class="rate yours">' + CM.pct(mine.rate) + "</span><div><b>Your rate</b><div class=\"muted\">It applies to every deal you close, whatever the product.</div></div></li>");
    if (std) items.push('<li><span class="rate">' + CM.pct(std.rate) + "</span><div><b>Standard rate</b><div class=\"muted\">Of what the customer pays, before tax" + (mine ? ", for salespeople without their own rate" : "") + ".</div></div></li>");
    rules.filter(function (r) { return r.applies_to === "product"; }).forEach(function (r) { items.push('<li><span class="rate">' + CM.pct(r.rate) + "</span><div><b>" + esc(r.match) + '</b><div class="muted">On this product' + (mine ? " (your own rate comes first)" : "") + ".</div></div></li>"); });
    rules.filter(function (r) { return r.applies_to === "monthly_bonus"; }).forEach(function (r) { items.push('<li><span class="rate">+' + CM.pct(r.rate) + "</span><div><b>" + esc(r.label || "Monthly bonus") + '</b><div class="muted">Once your approved sales pass ' + money(r.threshold) + " in a month, everything above that earns an extra " + CM.pct(r.rate) + ".</div></div></li>"); });
    if (CM.team !== "sales") rules.filter(function (r) { return r.applies_to === "salesperson"; }).forEach(function (r) { var p = salesPeople().filter(function (x) { return CM.same(x.email, r.match); })[0]; items.push('<li><span class="rate">' + CM.pct(r.rate) + "</span><div><b>" + esc(p ? p.name : r.match) + '</b><div class="muted">Their own rate, on every deal.</div></div></li>'); });
    return '<div class="page-head"><div><h1>Commission plan</h1><p class="sub">How commission is worked out. Commission is paid on money the customer has actually paid.</p></div></div>' +
      (items.length ? '<div class="box"><ul class="rules-list">' + items.join("") + "</ul></div>" : '<div class="empty"><b>No plan yet</b>' + esc(CM.managerNames()) + " hasn’t set the rates yet.</div>") +
      '<div class="say">' + CM.tallyFace() + "<div><b>Want a change?</b><p>" + esc(CM.managerNames()) + " sets the plan. Changes apply to deals approved from then on.</p></div></div>";
  }

  /* ═══ FINANCE ═══ */
  function approvalCard(d) {
    var p = priced(d), look = d.check_status === "needs_a_look", busy = S.busy[d.id], err = S.err[d.id];
    var canApprove = d.payment_status !== "not_paid" && baseOf(d) > 0;
    var why = d.payment_status === "not_paid" ? "Approve once the customer has paid" : (d.payment_status === "part_paid" && !(Number(d.amount_received) > 0)) ? "Fill in what’s been received first" : "";
    var check = d.check_status ? '<p class="note ' + (look ? "look" : "ok") + '" style="margin:0"><b>' + (look ? "Needs a look" : "Looks right") + ":</b> " + esc(d.check_note || "") + "</p>"
      : '<p class="note ok" style="margin:0"><span class="chip checking">Checking</span> Tally is checking this deal.</p>';
    var recv = (d.payment_status === "part_paid" && !(Number(d.amount_received) > 0)) ? '<div class="row" style="margin-top:10px;flex-wrap:wrap"><label for="rcv-' + esc(d.id) + '" class="muted">Received so far, before tax</label><input class="input" style="width:160px" type="number" inputmode="decimal" id="rcv-' + esc(d.id) + '"><button class="btn sm" data-rcv="' + esc(d.id) + '">Save</button></div>' : "";
    var reject = S.rejecting[d.id] ? '<div class="a-reject"><label for="why-' + esc(d.id) + '" style="font-weight:550">Why aren’t you approving it? ' + esc(CM.first(d.rep_name)) + ' sees this.</label><textarea class="input" id="why-' + esc(d.id) + '" data-why="' + esc(d.id) + '">' + esc(S.rejectText[d.id] || "") + '</textarea><div class="row"><button class="btn danger" data-confirm-reject="' + esc(d.id) + '">Don’t approve</button><button class="btn ghost" data-cancel-reject="' + esc(d.id) + '">Cancel</button></div></div>' : "";
    return '<article class="acard' + (look ? " look" : "") + '" data-tour="card">' +
      '<div class="a-top">' + CM.av(d.rep_name) + '<div class="who grow"><b>' + esc(d.rep_name) + "</b><small>Logged " + CM.day(d.created_at) + (d.logged_via && d.logged_via !== "app" ? " by " + esc(d.logged_via) : "") + "</small></div>" + (look ? '<span class="chip look">Needs a look</span>' : d.check_status ? '<span class="chip waiting">Looks right</span>' : '<span class="chip checking">Checking</span>') + "</div>" +
      '<div class="a-mid"><div><h3>' + esc(d.customer) + "</h3><small>" + esc(d.product || "No product") + (d.closed_on ? " · closed " + CM.day(d.closed_on) : "") + "</small></div>" +
      '<dl class="a-facts"><div><dt>Value</dt><dd>' + money(d.amount) + "</dd></div><div><dt>Payment</dt><dd>" + esc(CM.payLabel[d.payment_status] || "") + (d.payment_status === "part_paid" && d.amount_received ? " · " + money(d.amount_received) : "") + "</dd></div><div><dt>Reference</dt><dd>" + esc(d.payment_ref || "None given") + "</dd></div></dl></div>" +
      check + recv + (d.notes ? '<p class="muted" style="margin:10px 0 0">“' + esc(d.notes) + "”</p>" : "") +
      '<div class="a-foot"><div class="grow">' + (canApprove ? CM.cline(p.parts, p.amount, p.label) : '<span class="muted">' + why + "</span>") + "</div>" +
      '<div class="row actions-row"><button class="btn" data-reject="' + esc(d.id) + '"' + (busy ? " disabled" : "") + '>Don’t approve</button><button class="btn dark" data-approve="' + esc(d.id) + '"' + (busy || !canApprove ? " disabled" : "") + (canApprove ? ' data-tour="approve"' : "") + ">" + (busy ? "Approving…" : "Approve " + (canApprove ? money(p.amount) : "")) + "</button></div></div>" +
      (err ? '<p class="note rejected" style="margin:10px 0 0" role="alert">' + esc(err) + "</p>" : "") + reject + "</article>";
  }
  function viewApprovals() {
    var w = waitingDeals(), look = w.filter(function (d) { return d.check_status === "needs_a_look"; });
    var total = sum(w.filter(function (d) { return d.payment_status !== "not_paid"; }), function (d) { return priced(d).amount; });
    var decided = CM.state.deals.filter(function (d) { return d.status !== "waiting" && d.reviewed_at; }).sort(function (a, b) { return String(b.reviewed_at).localeCompare(String(a.reviewed_at)); }).slice(0, 8);
    var decidedHtml = decided.length ? '<div class="section">Decided recently <span>' + decided.length + '</span></div><div class="grid mobile-cards"><table class="t"><thead><tr><th>Deal</th><th>Salesperson</th><th>Decision</th><th class="r">Commission</th></tr></thead><tbody>' + decided.map(function (d) {
      var line = lineFor(d);
      return "<tr><td><b>" + esc(d.customer) + '</b><br><small class="muted">' + CM.day(d.reviewed_at) + " · " + esc(CM.first(d.reviewed_by)) + "</small></td><td>" + esc(d.rep_name) + "</td><td>" + (d.status === "approved" ? '<span class="chip approved">Approved</span>' : '<span class="chip rejected">Not approved</span><div class="muted" style="font-size:12.5px;margin-top:2px">' + esc(d.finance_note || "") + "</div>") + '</td><td class="r">' + (line ? money(line.amount) : "—") + "</td></tr>";
    }).join("") + "</tbody></table>" + decided.map(function (d) {
      var line = lineFor(d);
      return '<div class="mc"><div class="row"><b class="grow">' + esc(d.customer) + "</b>" + (d.status === "approved" ? '<span class="chip approved">Approved</span>' : '<span class="chip rejected">Not approved</span>') + '</div><div class="kv"><span>' + esc(d.rep_name) + " · " + esc(CM.first(d.reviewed_by)) + "</span><span>" + (line ? money(line.amount) : "—") + "</span></div></div>";
    }).join("") + "</div>" : "";
    var tip = '<div class="say">' + CM.tallyFace() + "<div><b>Pro tip: set your own approval rules</b><p>Chat with Lemma to let me approve the easy ones for you, for example:</p><q>“Auto-approve deals under " + money(50000) + " that are paid in full, have a reference and look right.”</q>" +
      (CM.isManager() ? '<p style="margin-top:8px"><a class="linkbtn" href="' + esc(CM.lemmaUrl()) + '" target="_blank" rel="noopener">Open Lemma</a></p>' : '<p style="margin-top:8px" class="muted">Ask ' + esc(CM.managerNames()) + " to switch it on. It takes one message.</p>") + "</div></div>";
    return '<div class="page-head"><div><h1>Ready to approve</h1><p class="sub">' + (w.length ? "Tally has checked every deal here. Approving locks in the commission from your plan." : "Nothing is waiting. New deals appear here as salespeople log them.") + '</p></div><button class="helpbtn" data-replay aria-label="Show me around">' + ico("help") + "</button></div>" +
      (w.length ? '<div class="headline" style="margin-bottom:20px"><div><b>' + w.length + "</b><small>deal" + (w.length === 1 ? "" : "s") + " waiting</small></div><div><b>" + look.length + "</b><small>need" + (look.length === 1 ? "s" : "") + ' a look</small></div><div><b>' + money(total) + "</b><small>commission if all approved</small></div></div>" + w.map(approvalCard).join("") : '<div class="empty"><b>All caught up</b>Tally sends you a list each weekday morning when deals are waiting.</div>') + decidedHtml + tip;
  }

  function months() { var m = {}; m[CM.thisMonth()] = 1; CM.state.commissions.forEach(function (c) { if (c.month) m[c.month] = 1; }); return Object.keys(m).sort().reverse(); }
  function teamTable() {
    var month = S.month || CM.thisMonth();
    var rows = salesPeople().map(function (r) {
      var lines = CM.state.commissions.filter(function (c) { return CM.same(c.rep_email, r.email) && c.month === month; });
      var waiting = CM.state.deals.filter(function (d) { return CM.same(d.rep_email, r.email) && d.status === "waiting"; });
      return { r: r, lines: lines, sales: sum(lines, function (c) { return c.base; }), earned: sum(lines, function (c) { return c.amount; }), paid: sum(lines.filter(function (c) { return c.status === "paid_out"; }), function (c) { return c.amount; }), waiting: waiting };
    });
    var tot = { n: sum(rows, function (x) { return x.lines.length; }), sales: sum(rows, function (x) { return x.sales; }), earned: sum(rows, function (x) { return x.earned; }), paid: sum(rows, function (x) { return x.paid; }), waiting: sum(rows, function (x) { return x.waiting.length; }) };
    var sel = '<select class="monthsel" id="month" aria-label="Month">' + months().map(function (m) { return '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + CM.monthName(m, true) + "</option>"; }).join("") + "</select>";
    var table = '<table class="t"><thead><tr><th>Salesperson</th><th class="r">Deals approved</th><th class="r">Sales</th><th class="r">Commission</th><th class="r">Paid out</th><th class="r">Waiting now</th></tr></thead><tbody>' + rows.map(function (x) {
      var open = S.open[x.r.email];
      return '<tr class="link" data-rep="' + esc(x.r.email) + '" tabindex="0" aria-expanded="' + Boolean(open) + '"><td><span class="row">' + CM.av(x.r.name) + esc(x.r.name) + '</span></td><td class="r">' + x.lines.length + '</td><td class="r">' + money(x.sales) + '</td><td class="r"><b>' + money(x.earned) + '</b></td><td class="r">' + money(x.paid) + '</td><td class="r">' + (x.waiting.length || "—") + "</td></tr>" +
        (open ? '<tr><td colspan="6" style="background:#FAFBFC">' + (x.lines.length ? x.lines.map(function (c) { return '<div class="row" style="padding:4px 0"><span class="grow">' + esc(c.customer) + ' <span class="muted">· ' + esc(c.rule_used || "") + '</span></span><span class="num">' + money(c.amount) + "</span>" + (c.status === "paid_out" ? '<span class="chip paid">Paid out</span>' : '<span class="chip approved">To pay</span>') + "</div>"; }).join("") : '<span class="muted">No approved deals this month.</span>') + "</td></tr>" : "");
    }).join("") + '</tbody><tfoot><tr><td>Team</td><td class="r">' + tot.n + '</td><td class="r">' + money(tot.sales) + '</td><td class="r">' + money(tot.earned) + '</td><td class="r">' + money(tot.paid) + '</td><td class="r">' + (tot.waiting || "—") + "</td></tr></tfoot></table>";
    var cards = rows.map(function (x) { return '<div class="mc"><div class="row">' + CM.av(x.r.name) + '<b class="grow">' + esc(x.r.name) + '</b><b class="num">' + money(x.earned) + '</b></div><div class="kv"><span class="muted">Deals approved</span><span>' + x.lines.length + '</span><span class="muted">Sales</span><span>' + money(x.sales) + '</span><span class="muted">Paid out</span><span>' + money(x.paid) + '</span><span class="muted">Waiting now</span><span>' + (x.waiting.length || "—") + "</span></div></div>"; }).join("");
    return { sel: sel, html: rows.length ? '<div class="grid mobile-cards" style="border:0"><div class="grid">' + table + "</div>" + cards + "</div>" : '<div class="empty"><b>No salespeople yet</b>They appear here once they’re in the Sales team or log a deal.</div>' };
  }
  function viewTeam() {
    var t = teamTable();
    return '<div class="page-head"><div><h1>Team</h1><p class="sub">Commission earned by each salesperson, by the month finance approved it.</p></div>' + t.sel + "</div>" + t.html;
  }
  function viewPayouts() {
    var due = CM.state.commissions.filter(function (c) { return c.status === "approved"; });
    var paid = CM.state.commissions.filter(function (c) { return c.status === "paid_out"; });
    var byMonth = function (list) { var m = {}; list.forEach(function (c) { (m[c.month] = m[c.month] || []).push(c); }); return Object.keys(m).sort().reverse().map(function (k) { return { month: k, lines: m[k] }; }); };
    var byRep = function (lines) { var m = {}; lines.forEach(function (c) { var k = c.rep_email; m[k] = m[k] || { name: c.rep_name, n: 0, amount: 0 }; m[k].n++; m[k].amount += Number(c.amount) || 0; }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.amount - a.amount; }); };
    var dueHtml = byMonth(due).map(function (g) {
      var people = byRep(g.lines);
      return '<section class="paygroup"><header><div class="grow"><b>' + CM.monthName(g.month, true) + '</b><div class="muted">' + plural(people.length, "person", "people") + " · " + plural(g.lines.length, "deal") + '</div></div><b class="num">' + money(sum(g.lines, function (c) { return c.amount; })) + '</b><button class="btn dark" data-payout="' + g.month + '" data-tour="payout">Mark paid out</button></header>' +
        people.map(function (p) { return '<div class="payline">' + CM.av(p.name) + '<span class="grow">' + esc(p.name) + ' <span class="muted">· ' + plural(p.n, "deal") + '</span></span><b class="num">' + money(p.amount) + "</b></div>"; }).join("") + "</section>";
    }).join("");
    var paidHtml = byMonth(paid).map(function (g) {
      var on = g.lines.map(function (c) { return c.paid_out_on || ""; }).sort().pop();
      return '<div class="payline"><span class="grow"><b>' + CM.monthName(g.month, true) + '</b> <span class="muted">· paid out ' + CM.day(on) + " · " + plural(g.lines.length, "deal") + '</span></span><b class="num">' + money(sum(g.lines, function (c) { return c.amount; })) + "</b></div>";
    }).join("");
    return '<div class="page-head"><div><h1>Payouts</h1><p class="sub">Approved commission that hasn’t been paid yet. Once it’s in payroll, mark it paid out so salespeople see it.</p></div></div>' +
      (dueHtml || '<div class="empty"><b>Nothing to pay out</b>Approved commission appears here until you mark it paid.</div>') +
      (paidHtml ? '<div class="section">Paid out</div><div class="grid">' + paidHtml + "</div>" : "");
  }

  /* ═══ MANAGER ═══ */
  function gsSteps() {
    var s = CM.settings(), st = CM.setupState(), others = CM.members.filter(function (m) { return !CM.same(m.user_email || m.email, CM.myEmail()); }).length + CM.state.invites.length;
    var appUrl = location.origin + "/";
    return [
      { done: Boolean(s.company), title: "Name your company", sub: "It shows at the top of the app and in Tally’s messages.",
        act: '<input class="input" id="gs-company" placeholder="Company name" style="max-width:240px" value="' + esc(s.company || "") + '"><input class="input" id="gs-cur" aria-label="Currency symbol" style="width:64px;text-align:center" value="' + esc(s.currency_symbol || "₹") + '"><button class="btn sm dark" data-gs="company">Save</button>' },
      { done: Boolean(stdRule()), title: "Set your standard commission rate", sub: "What every deal earns unless a product or a person has its own rate.",
        act: '<span class="ratebox row" style="gap:6px"><input class="input inline-in" id="gs-rate" type="number" inputmode="decimal" step="0.1" value="10" aria-label="Standard rate in percent">%</span><button class="btn sm dark" data-gs="plan">Save</button><a class="linkbtn" href="#/plan">Products, personal rates and bonuses</a>' },
      { done: others > 0, title: "Add your people", sub: "Pick Sales, Finance or Manager for each person. Lemma emails them an invite.",
        act: '<button class="btn sm dark" data-add-people>Add people</button>' },
      { done: Boolean(st.shared), title: "Tell your team where to find it", sub: "Send them the app link." + (CM.tally.email ? " Salespeople can also email deals to Tally." : ""),
        act: '<button class="btn sm" data-copy="' + esc(appUrl) + '" data-what="the app link">' + ico("copy", 15) + "Copy app link</button>" + (CM.tally.email ? '<button class="btn sm" data-copy="' + esc(CM.tally.email) + '" data-what="Tally’s email">' + ico("copy", 15) + "Copy Tally’s email</button>" : "") + '<button class="btn sm dark" data-gs="shared">Done</button>' }
    ];
  }
  function viewOverview() {
    var steps = gsSteps(), left = steps.filter(function (x) { return !x.done; }).length, st = CM.setupState();
    var gs = (left && !st.gs_hidden) ? '<section class="gs"><header data-tour="gs">' + CM.tallyFace() + '<div class="grow"><b>Let’s get your team set up</b><div class="muted" style="font-size:13px">' + (4 - left) + " of 4 done · about ten minutes</div></div>" + (left < 4 ? '<button class="linkbtn" data-gs="hide">Hide</button>' : "") + "</header>" +
      steps.map(function (x, i) { return '<div class="gs-step' + (x.done ? " done" : "") + '"><span class="n">' + (x.done ? "✓" : i + 1) + '</span><div><b>' + x.title + '</b><div class="muted">' + x.sub + '</div><div class="do">' + x.act + "</div></div></div>"; }).join("") + "</section>" : "";
    var month = CM.thisMonth(), lines = CM.state.commissions.filter(function (c) { return c.month === month; });
    var due = CM.state.commissions.filter(function (c) { return c.status === "approved"; }), w = waitingDeals();
    var head = '<div class="headline" style="margin-bottom:8px"><div><b>' + money(sum(lines, function (c) { return c.amount; })) + "</b><small>commission approved in " + CM.monthName(month) + "</small></div><div><b>" + w.length + "</b><small>deal" + (w.length === 1 ? "" : "s") + " waiting for finance</small></div><div><b>" + money(sum(due, function (c) { return c.amount; })) + "</b><small>approved, not paid out yet</small></div></div>";
    var t = teamTable();
    var err = CM.accessError ? '<p class="note rejected" role="alert">Couldn’t finish locking the money tables to the right people: ' + esc(CM.accessError) + ". Reload to try again.</p>" : "";
    return err + gs + '<div class="page-head"><div><h1>' + (company() ? esc(company()) + "’s commissions" : "Everyone’s commissions") + '</h1><p class="sub">Every salesperson, by the month finance approved it.</p></div><div class="row">' + t.sel + '<button class="helpbtn" data-replay aria-label="Show me around">' + ico("help") + "</button></div></div>" + head + '<div style="margin-top:16px">' + t.html + "</div>";
  }

  function viewPeople() {
    var mine = CM.myEmail(), can = CM.canAddPeople(), busy = S.peopleBusy;
    var list = CM.members.slice().sort(function (a, b) { var o = { manager: 0, finance: 1, sales: 2, none: 3 }; return (o[CM.memberTeam(a)] - o[CM.memberTeam(b)]) || CM.memberName(a).localeCompare(CM.memberName(b)); });
    var rows = list.map(function (m) {
      var team = CM.memberTeam(m), email = m.user_email || m.email, self = CM.same(email, mine);
      var sel = '<select data-team="' + esc(m.pod_member_id) + '" aria-label="Team for ' + esc(CM.memberName(m)) + '"' + (!can || self || busy === m.pod_member_id ? " disabled" : "") + ">" + (team === "none" ? '<option value="none" selected>Pick a team</option>' : "") +
        ["sales", "finance", "manager"].map(function (t) { return '<option value="' + t + '"' + (t === team ? " selected" : "") + ">" + CM.TEAM_LABEL[t] + "</option>"; }).join("") + "</select>";
      return '<div class="pp-row">' + CM.av(CM.memberName(m)) + '<div class="grow"><b>' + esc(CM.memberName(m)) + (self ? ' <span class="muted" style="font-weight:500">(you)</span>' : "") + "</b><small>" + esc(email) + "</small></div>" + sel + "</div>";
    }).join("");
    var pending = CM.state.invites.filter(function (i) { return i.status !== "joined"; });
    var pend = pending.length ? '<div class="section">Invited <span>' + pending.length + '</span></div><div class="pp">' + pending.map(function (i) {
      return '<div class="pp-row">' + CM.av(i.email) + '<div class="grow"><b>' + esc(i.email) + "</b><small>Joins as " + CM.TEAM_LABEL[i.team] + (i.invited_by ? " · invited by " + esc(CM.first(i.invited_by)) : "") + '</small></div><span class="chip waiting">Invite sent</span></div>';
    }).join("") + "</div>" + (pending.some(function (i) { return i.team === "finance"; }) ? '<p class="muted" style="font-size:13px">Lemma invites can’t carry the Finance team, so people invited to Finance join as Sales. The next time you open this app after they join, they move to Finance on their own.</p>' : "") : "";
    return '<div class="page-head"><div><h1>People</h1><p class="sub">Everyone uses this one app. What they see depends on their team.</p></div>' +
      (can ? '<button class="btn dark" data-add-people data-tour="add-people">' + ico("plus", 16) + "Add people</button>" : "") + "</div>" +
      '<div class="legend"><div><b>Sales</b><span>Log their own deals and see their own commission.</span></div><div><b>Finance</b><span>Approve deals, mark payouts, see the team’s totals.</span></div><div><b>Manager</b><span>See everything, add people, set the plan. Lemma calls them Admins.</span></div></div>' +
      (can ? "" : '<p class="note look" style="margin-bottom:14px">Only this space’s admins can add people or change teams. You’re an editor, so ask an admin.</p>') +
      '<div class="pp">' + (rows || '<div class="pp-row muted">Nobody else yet.</div>') + "</div>" + pend +
      '<p class="muted" style="font-size:13px;margin-top:14px">To take someone out of the app completely, remove them from the space in Lemma: <a href="' + esc(CM.lemmaUrl("/about/people")) + '" target="_blank" rel="noopener">open People</a>.</p>';
  }

  var KIND = {
    salesperson: { title: "Personal rates", help: "One person’s own rate, on every deal they close. It beats product rates.", add: "Add a personal rate" },
    monthly_bonus: { title: "Monthly bonus", help: "Once someone’s approved sales in a month pass the threshold, everything above it earns this much extra.", add: "Add a monthly bonus" }
  };
  function draftVal(id, k, cur) { var d = S.draft[id] || {}; return d[k] != null ? d[k] : (cur == null ? "" : cur); }
  function saveBtn(id) { var dirty = S.draft[id] && Object.keys(S.draft[id]).length; return '<button class="btn sm' + (dirty ? " dark" : "") + '" data-save="' + esc(id) + '"' + (dirty ? "" : " disabled") + ">Save</button>"; }
  function ruleRow(r) {
    var who;
    if (r.applies_to === "monthly_bonus") who = '<label class="row" style="gap:6px;flex-wrap:wrap">Above <input class="input" style="width:140px" type="number" inputmode="decimal" data-f="threshold" data-id="' + esc(r.id) + '" value="' + esc(draftVal(r.id, "threshold", r.threshold)) + '" aria-label="Monthly threshold"> a month</label>';
    else who = '<select class="input" data-f="match" data-id="' + esc(r.id) + '" aria-label="Salesperson">' + (r.match ? "" : '<option value="">Pick a salesperson</option>') + salesPeople().concat(r.match && !salesPeople().some(function (p) { return CM.same(p.email, r.match); }) ? [{ name: r.match, email: r.match }] : []).map(function (p) { return '<option value="' + esc(p.email) + '"' + (CM.same(draftVal(r.id, "match", r.match), p.email) ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select>";
    var rate = '<span class="ratebox">' + (r.applies_to === "monthly_bonus" ? "+" : "") + '<input class="input" type="number" inputmode="decimal" step="0.1" min="0" data-f="rate" data-id="' + esc(r.id) + '" value="' + esc(draftVal(r.id, "rate", r.rate)) + '" aria-label="Rate in percent">%</span>';
    var on = '<label class="switch"><input type="checkbox" data-on="' + esc(r.id) + '"' + (r.active !== false ? " checked" : "") + ">" + (r.active !== false ? "On" : "Off") + "</label>";
    return '<div class="rrow' + (r.active === false ? " off" : "") + '">' + who + rate + on + saveBtn(r.id) + "</div>";
  }
  function productRow(p) {
    var rule = productRule(p.name), rateCur = rule && rule.active !== false ? rule.rate : "", std = stdRule();
    return '<div class="prow' + (p.active === false ? " off" : "") + '"><input class="input" data-f="name" data-id="' + esc(p.id) + '" value="' + esc(draftVal(p.id, "name", p.name)) + '" aria-label="Product name">' +
      '<span class="ratebox"><input class="input" type="number" inputmode="decimal" step="0.1" min="0" data-f="rate" data-id="' + esc(p.id) + '" value="' + esc(draftVal(p.id, "rate", rateCur)) + '" placeholder="' + (std ? CM.pct(std.rate).replace("%", "") : "") + '" aria-label="Rate for ' + esc(p.name) + ' in percent">%</span>' +
      '<label class="switch"><input type="checkbox" data-pon="' + esc(p.id) + '"' + (p.active !== false ? " checked" : "") + ">" + (p.active !== false ? "On" : "Off") + "</label>" + saveBtn(p.id) + "</div>";
  }
  function viewPlanEdit() {
    var rules = CM.state.commission_rules, std = stdRule();
    var stdHtml = '<section class="rgroup"><h2>Standard rate</h2><p>What every deal earns unless a product or a person has its own rate.</p><div class="grid"><div class="rrow"><b>Every deal</b>' +
      (std ? '<span class="ratebox"><input class="input" type="number" inputmode="decimal" step="0.1" min="0" data-f="rate" data-id="' + esc(std.id) + '" value="' + esc(draftVal(std.id, "rate", std.rate)) + '" aria-label="Standard rate in percent">%</span><span></span>' + saveBtn(std.id)
        : '<span class="ratebox"><input class="input" type="number" inputmode="decimal" step="0.1" id="std-new" value="10" aria-label="Standard rate in percent">%</span><span></span><button class="btn sm dark" data-std-new>Set</button>') + "</div></div></section>";
    var prods = products(true);
    var prodHtml = '<section class="rgroup" data-tour="products"><h2>Products</h2><p>What salespeople pick when they log a deal. Leave the rate empty to use the standard rate; switch a product off to hide it.</p>' +
      (prods.length ? '<div class="grid">' + prods.map(productRow).join("") + "</div>" : '<div class="empty" style="padding:14px">No products yet. Salespeople type what they sold until you add some.</div>') +
      '<button class="linkbtn" style="margin-top:10px" data-add-product>+ Add a product</button></section>';
    var groups = ["salesperson", "monthly_bonus"].map(function (k) {
      var list = rules.filter(function (r) { return r.applies_to === k; });
      return '<section class="rgroup"><h2>' + KIND[k].title + "</h2><p>" + KIND[k].help + "</p>" + (list.length ? '<div class="grid">' + list.map(ruleRow).join("") + "</div>" : '<div class="empty" style="padding:14px">None yet.</div>') +
        '<button class="linkbtn" style="margin-top:10px" data-radd="' + k + '">+ ' + KIND[k].add + "</button></section>";
    }).join("");
    var tr = S.tryit, rp = salesPeople(), repEmail = tr.rep || (rp[0] || {}).email || CM.myEmail();
    var res = CM.workOut(rules, repEmail, tr.product, Number(tr.amount) || 0, CM.soldThisMonth(repEmail));
    var tryit = '<aside class="tryit" aria-live="polite"><h2 style="margin-bottom:10px">Try it</h2>' +
      (rp.length ? '<div class="field"><label for="try-rep">Salesperson</label><select class="input" id="try-rep">' + rp.map(function (r) { return '<option value="' + esc(r.email) + '"' + (r.email === repEmail ? " selected" : "") + ">" + esc(r.name) + "</option>"; }).join("") + "</select></div>" : "") +
      '<div class="two"><div class="field"><label for="try-prod">Product</label><select class="input" id="try-prod"><option value="">Any</option>' + products().map(function (p) { return '<option value="' + esc(p.name) + '"' + (p.name === tr.product ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + '</select></div><div class="field"><label for="try-amt">Paid, before tax</label><input class="input" id="try-amt" type="number" inputmode="decimal" value="' + esc(tr.amount) + '"></div></div>' +
      '<div class="muted" style="font-weight:550">They’d earn</div><div style="font-size:26px;font-weight:650;color:var(--earned)" class="num">' + money(res.amount) + "</div>" + CM.cline(res.parts, res.amount, res.label) + '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Counts what they’ve already had approved this month (' + money(CM.soldThisMonth(repEmail)) + "), so bonuses show as they would today.</p></aside>";
    var say = '<div class="say" data-tour="ask-tally">' + CM.tallyFace() + '<div><b>Rather just say it?</b><p>Ask me in Lemma, by email or in Slack, and I’ll change the plan for you:</p><ul class="tips"><li><q>“Add a product called Annual plan at 12%.”</q></li><li><q>“Give Asha 15% on everything she sells.”</q></li><li><q>“Add a 2% bonus above ' + money(500000) + ' a month.”</q></li></ul><p style="margin-top:8px"><a class="linkbtn" href="' + esc(CM.lemmaUrl()) + '" target="_blank" rel="noopener">Open Lemma</a></p></div></div>';
    return '<div class="page-head"><div><h1>Commission plan</h1><p class="sub">A person’s own rate comes first, then a product rate, then the standard rate. Bonuses add on top. Changes apply to deals approved from now on.</p></div><button class="helpbtn" data-replay aria-label="Show me around">' + ico("help") + "</button></div>" +
      '<div class="rules-layout" style="display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:28px;align-items:start"><div>' + stdHtml + prodHtml + groups + "</div><div>" + tryit + say + "</div></div>" +
      "<style>@media (max-width:860px){.rules-layout{grid-template-columns:1fr !important}}</style>";
  }

  function viewSettings() {
    var s = CM.settings(), fin = String(s.finance_emails || "").split(/\s*,\s*/).filter(Boolean);
    var names = fin.map(function (e) { var m = CM.members.filter(function (x) { return CM.same(x.user_email || x.email, e); })[0]; return m ? CM.memberName(m) : e; });
    var LOC = [["en-IN", "1,00,000 (India)"], ["en-US", "100,000"], ["en-GB", "100,000 (UK)"], ["de-DE", "100.000"], ["fr-FR", "100 000"]];
    var co = '<section class="box" style="margin-bottom:20px"><h2>Company and money</h2><div class="two" style="margin-top:12px"><div class="field"><label for="st-company">Company name</label><input class="input" id="st-company" value="' + esc(s.company || "") + '"></div>' +
      '<div class="two" style="gap:0 12px"><div class="field"><label for="st-cur">Currency symbol</label><input class="input" id="st-cur" value="' + esc(s.currency_symbol || "₹") + '"></div><div class="field"><label for="st-loc">Number format</label><select class="input" id="st-loc">' + LOC.map(function (l) { return '<option value="' + l[0] + '"' + ((s.locale || "en-IN") === l[0] ? " selected" : "") + ">" + l[1] + "</option>"; }).join("") + "</select></div></div></div>" +
      '<button class="btn dark" data-save-settings>Save</button></section>';
    var chUrl = CM.lemmaUrl("/about/channels");
    var tally = '<section class="box" style="margin-bottom:20px"><div class="row" style="margin-bottom:10px">' + CM.tallyFace().replace('class="tally ', 'style="width:44px;height:44px" class="tally ') + '<div><h2>How people reach Tally</h2><div class="muted" style="font-size:13px">Everyone talks to Tally as themselves, so salespeople only ever hear about their own deals.</div></div></div>' +
      '<div class="chan"><b>Email</b><div>' + (CM.tally.email ? '<div class="copy"><code>' + esc(CM.tally.email) + '</code><button class="btn sm" data-copy="' + esc(CM.tally.email) + '" data-what="Tally’s email">' + ico("copy", 15) + "Copy</button></div>" : "") + '<span>Tally has its own address. Salespeople email a deal from the address they sign in with, and Tally logs it under them.</span></div></div>' +
      '<div class="chan"><b>WhatsApp</b><span>Give Tally a WhatsApp number your team can message. Ready in a few minutes.</span></div>' +
      '<div class="chan"><b>Telegram</b><span>Give Tally its own Telegram bot. About a minute.</span></div>' +
      '<div class="chan"><b>Slack</b><span>Add Lemma to your Slack, then give Tally its own bot and invite it to your sales or finance channel.</span></div>' +
      '<div class="chan"><b>Microsoft Teams</b><span>Add Tally to Teams as an app. Your Teams admin approves it once.</span></div>' +
      '<p style="margin:14px 0 0"><a class="btn" href="' + esc(chUrl) + '" target="_blank" rel="noopener">Connect a channel in Lemma</a></p></section>';
    var morning = '<section class="box" style="margin-bottom:20px"><h2>Tally’s messages</h2><ul class="tips" style="margin-top:10px"><li>Each weekday at 9:30 (India time), the list of deals waiting goes to ' + (names.length ? esc(names.join(", ")) : "the Finance team") + ".</li><li>Each salesperson hears when a deal is approved or not, and why.</li><li>On the 1st, everyone gets their statement for the month.</li></ul></section>";
    var more = '<section class="box"><h2>Make Tally do more</h2><p class="muted" style="margin:6px 0 10px">This app is a starting point. Chat with Lemma to change how it works for your team, for example:</p><ul class="tips">' +
      "<li><q>“Auto-approve deals under " + money(50000) + " that are paid in full with a reference.”</q></li><li><q>“Send the morning list at 10 instead.”</q></li><li><q>“Add a Region field to deals and show it in the app.”</q></li><li><q>“When a deal is marked Closed won in HubSpot, log it here for its owner.”</q></li></ul>" +
      '<p style="margin-top:10px"><a class="linkbtn" href="' + esc(CM.lemmaUrl()) + '" target="_blank" rel="noopener">Open Lemma</a></p></section>';
    return '<div class="page-head"><div><h1>Settings</h1><p class="sub">Your company, how people reach Tally, and what it sends.</p></div></div>' + co + tally + morning + more;
  }

  /* ═══ nobody's-team screens ═══ */
  function viewNoAccess() {
    return '<div class="center"><div style="max-width:420px">' + CM.tallyFace("bob").replace('class="tally ', 'style="width:96px;height:96px;margin-bottom:14px" class="tally ') +
      "<h1>You’re not on a team here yet</h1><p class=\"sub\">This is " + (company() ? esc(company()) + "’s " : "your team’s ") + "sales commissions app. Ask " + esc(CM.managerNames()) + " to add you to Sales or Finance, then open it again.</p></div></div>";
  }
  function pendingFinance() {
    return CM.team === "sales" && CM.state.invites.some(function (i) { return CM.same(i.email, CM.myEmail()) && i.team === "finance" && i.status !== "joined"; });
  }
  function viewPendingFinance() {
    return '<div class="center"><div style="max-width:440px">' + CM.tallyFace("bob").replace('class="tally ', 'style="width:96px;height:96px;margin-bottom:14px" class="tally ') +
      "<h1>Almost there, " + esc(CM.first(CM.myName())) + '</h1><p class="sub">You’ve been added to Finance. ' + esc(CM.managerNames()) + " needs to open this app once to finish, and then you’ll see the deals waiting for approval here.</p></div></div>";
  }
  function notReady() {
    var need = ["commission_rules", "settings"];
    return CM.team !== "manager" && need.every(function (t) { return CM.state.denied.indexOf(t) >= 0; });
  }
  function viewNotReady() {
    return '<div class="center"><div style="max-width:440px">' + CM.tallyFace("bob").replace('class="tally ', 'style="width:96px;height:96px;margin-bottom:14px" class="tally ') +
      '<h1>I’m still being set up</h1><p class="sub">Ask ' + esc(CM.managerNames()) + " to open Sales commissions once. That finishes the setup, and then this app is ready for you.</p></div></div>";
  }

  /* ═══ shell + routing ═══ */
  var NAV = {
    sales: [["home", "#/", "deals", "Your deals"], ["log", "#/log", "plus", "Log a deal"], ["plan", "#/plan", "rules", "Commission plan", "Plan"]],
    finance: [["approvals", "#/", "check", "Approvals"], ["payouts", "#/payouts", "pay", "Payouts"], ["team", "#/team", "users", "Team"], ["plan", "#/plan", "rules", "Commission plan", "Plan"]],
    manager: [["overview", "#/", "home", "Overview"], ["people", "#/people", "person", "People"], ["plan", "#/plan", "rules", "Commission plan", "Plan"], ["settings", "#/settings", "setup", "Settings"]]
  };
  function route() {
    var h = (location.hash || "#/").slice(1).split("/").filter(Boolean), md = mode(), home = NAV[md] ? NAV[md][0][0] : "home";
    if (md === "sales" && h[0] === "deal" && h[1]) return { view: "deal", id: h[1] };
    if (md === "sales" && h[0] === "log") return { view: "log", again: h[1] === "again" ? h[2] : null };
    var ok = (NAV[md] || []).map(function (n) { return n[0]; });
    return { view: ok.indexOf(h[0]) >= 0 ? h[0] : home };
  }
  function body(r) {
    var md = mode();
    if (md === "sales") return r.view === "deal" ? viewDeal(r.id) : r.view === "log" ? viewLog() : r.view === "plan" ? viewPlanRead() : viewHome();
    if (md === "finance") return r.view === "payouts" ? viewPayouts() : r.view === "team" ? viewTeam() : r.view === "plan" ? (CM.isManager() ? viewPlanEdit() : viewPlanRead()) : viewApprovals();
    return r.view === "people" ? viewPeople() : r.view === "plan" ? viewPlanEdit() : r.view === "settings" ? viewSettings() : viewOverview();
  }
  function shell(r, inner) {
    var md = mode(), ms = modes(), n = waitingDeals().length;
    var nav = (NAV[md] || []).map(function (x) { return x.concat([]); });
    if (md === "finance" && n) nav[0][5] = n;
    var on = function (k) { return r.view === k || (k === "home" && (r.view === "deal")); };
    var switcher = ms.length > 1 ? '<div class="modes" role="group" aria-label="Screens" data-tour="modes">' + ms.map(function (m) { return '<button data-mode="' + m + '" aria-pressed="' + (m === md) + '" title="' + esc(MODE_INFO[m][1]) + '">' + MODE_INFO[m][0] + "</button>"; }).join("") + "</div>" : "";
    var pill = ms.length > 1 ? '<button class="mode-pill" data-mode-pill data-tour="modes-m" aria-label="Switch screens">' + MODE_INFO[md][0] + ico("chev", 14) + "</button>" : "";
    return '<div class="shell"><aside class="side"><div class="brand"><span class="brand-mark">' + CM.MARK + '</span><div><b>Sales commissions</b><small>' + esc(company()) + "</small></div></div>" + switcher + '<nav class="nav">' +
      nav.map(function (x) { return '<a href="' + x[1] + '" class="' + (on(x[0]) ? "on" : "") + '"' + (on(x[0]) ? ' aria-current="page"' : "") + ' data-tour="nav-' + x[0] + '">' + ico(x[2]) + x[3] + (x[5] ? '<span class="count">' + x[5] + "</span>" : "") + "</a>"; }).join("") +
      '</nav><div class="side-foot">' + CM.av(CM.myName()) + '<div class="who"><b>' + esc(CM.myName()) + "</b><small>" + CM.TEAM_LABEL[CM.team] + "</small></div></div></aside>" +
      '<div class="main"><header class="topbar"><span class="brand-mark">' + CM.MARK + '</span><b class="grow">Sales commissions</b>' + pill + CM.av(CM.myName()) + '</header><main class="page" id="page">' + inner + "</main>" +
      '<nav class="tabs" aria-label="Sections">' + nav.map(function (x) { return '<a href="' + x[1] + '" class="' + (on(x[0]) ? "on" : "") + '" data-tour="tab-' + x[0] + '">' + ico(x[2], 20) + (x[4] || x[3]) + (x[5] ? '<span class="count">' + x[5] + "</span>" : "") + "</a>"; }).join("") + "</nav></div></div>";
  }
  var lastView = "";
  function render() {
    if (!CM.state) return;
    document.title = "Sales commissions" + (company() ? " · " + company() : "");
    var app = document.getElementById("app");
    if (CM.team === "none") { app.innerHTML = viewNoAccess(); return; }
    if (pendingFinance()) { app.innerHTML = viewPendingFinance(); return; }
    if (notReady()) { app.innerHTML = viewNotReady(); return; }
    var ae = document.activeElement;
    if (ae && ae.getAttribute && ae.getAttribute("data-f")) return; // don't redraw while someone is typing in the plan
    var keep = ae && ae.id && /^(why-|try-|rcv-|gs-|st-)/.test(ae.id) ? ae.id : null, caret = keep && ae.selectionStart;
    var r = route(), inner;
    if (r.view === "log") {
      var key = "log:" + (r.again || "");
      if (!S.form || lastView !== key) { S.form = blankForm(r.again ? CM.state.deals.filter(function (d) { return d.id === r.again; })[0] : null); S.formErr = {}; }
      lastView = key;
      if (document.getElementById("logform") && ae && document.getElementById("logform").contains(ae)) { refreshEstimate(); return; }
      inner = viewLog();
    } else { lastView = r.view; inner = body(r); }
    var y = window.scrollY;
    app.innerHTML = shell(r, inner);
    if (r.view === "log") document.getElementById("page").classList.add("has-est");
    window.scrollTo(0, y);
    if (keep && document.getElementById(keep)) { var el = document.getElementById(keep); el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) {} }
    wire(r);
  }
  function refreshEstimate() {
    var side = document.querySelector(".estimate"); if (!side) return;
    var tmp = document.createElement("div"); tmp.innerHTML = viewLog();
    side.innerHTML = tmp.querySelector(".estimate").innerHTML;
    var bar = document.querySelector(".est-bar"); if (bar) bar.innerHTML = tmp.querySelector(".est-bar").innerHTML;
  }
  function redrawLog() { var pos = document.activeElement && document.activeElement.id; document.getElementById("page").innerHTML = viewLog(); wire(route()); if (pos && document.getElementById(pos)) document.getElementById(pos).focus(); }

  /* ═══ wiring ═══ */
  function wire(r) {
    var q = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
    q("[data-mode]", function (b) { b.onclick = function () { setMode(b.getAttribute("data-mode")); }; });
    q("[data-mode-pill]", function (b) { b.onclick = pickMode; });
    q("[data-replay]", function (b) { b.onclick = function () { maybeIntro(true); }; });
    q("[data-copy]", function (b) { b.onclick = function () { CM.copy(b.getAttribute("data-copy"), b.getAttribute("data-what")); }; });
    q("[data-add-people]", function (b) { b.onclick = addPeople; });
    // sales
    var ed = document.getElementById("edit"); if (ed) ed.onclick = function () { editDeal(r.id); };
    var form = document.getElementById("logform");
    if (form) {
      form.addEventListener("input", function (e) { var t = e.target; if (t.name) { S.form[t.name] = t.value; delete S.formErr[t.name]; refreshEstimate(); } });
      var pick = document.getElementById("f-product_pick");
      if (pick) pick.onchange = function () { S.form.productOther = pick.value === "__other"; S.form.product = S.form.productOther ? "" : pick.value; redrawLog(); if (S.form.productOther) { var t = document.getElementById("f-product"); if (t) t.focus(); } };
      q("[data-pay]", function (b) { b.onclick = function () { S.form.payment_status = b.getAttribute("data-pay"); redrawLog(); var nb = document.querySelector('[data-pay="' + S.form.payment_status + '"]'); if (nb) nb.focus(); }; });
      form.onsubmit = function (e) { e.preventDefault(); submitDeal(); };
    }
    // finance
    q("[data-approve]", function (b) { b.onclick = function () { approve(b.getAttribute("data-approve")); }; });
    q("[data-reject]", function (b) { b.onclick = function () { var id = b.getAttribute("data-reject"); S.rejecting[id] = true; render(); var ta = document.getElementById("why-" + id); if (ta) ta.focus(); }; });
    q("[data-cancel-reject]", function (b) { b.onclick = function () { delete S.rejecting[b.getAttribute("data-cancel-reject")]; render(); }; });
    q("[data-confirm-reject]", function (b) { b.onclick = function () { reject(b.getAttribute("data-confirm-reject")); }; });
    q("[data-why]", function (ta) { ta.oninput = function () { S.rejectText[ta.getAttribute("data-why")] = ta.value; }; });
    q("[data-rcv]", function (b) { b.onclick = async function () { var id = b.getAttribute("data-rcv"), v = Number(document.getElementById("rcv-" + id).value); if (!(v > 0)) return; try { await CM.client.records.update("deals", id, { amount_received: v }); await CM.load(); render(); } catch (e) { CM.toast("Couldn’t save that: " + esc(CM.errText(e))); } }; });
    q("[data-payout]", function (b) { b.onclick = function () { payout(b.getAttribute("data-payout")); }; });
    q("[data-rep]", function (tr) { var go = function () { var k = tr.getAttribute("data-rep"); S.open[k] = !S.open[k]; render(); }; tr.onclick = go; tr.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
    var mo = document.getElementById("month"); if (mo) mo.onchange = function () { S.month = mo.value; render(); };
    // manager: getting started, people, plan, settings
    q("[data-gs]", function (b) { b.onclick = function () { gsAction(b.getAttribute("data-gs"), b); }; });
    q("[data-team]", function (s) { s.onchange = function () { changeTeam(s.getAttribute("data-team"), s.value); }; });
    q("[data-f]", function (inp) {
      var mark = function () { var id = inp.getAttribute("data-id"); (S.draft[id] = S.draft[id] || {})[inp.getAttribute("data-f")] = inp.value; var sv = document.querySelector('[data-save="' + id + '"]'); if (sv) { sv.disabled = false; sv.classList.add("dark"); } };
      inp.oninput = mark; if (inp.tagName === "SELECT") inp.onchange = mark;
      inp.onblur = function () { setTimeout(function () { if (!document.activeElement || !document.activeElement.getAttribute("data-f")) render(); }, 150); };
    });
    q("[data-save]", function (b) { b.onmousedown = function (e) { e.preventDefault(); }; b.onclick = function () { saveDraft(b.getAttribute("data-save")); }; });
    q("[data-on]", function (c) { c.onchange = async function () { try { await CM.client.records.update("commission_rules", c.getAttribute("data-on"), { active: c.checked }); await CM.load(); render(); } catch (e) { CM.toast("Couldn’t change it: " + esc(CM.errText(e))); } }; });
    q("[data-pon]", function (c) { c.onchange = async function () { try { await CM.client.records.update("products", c.getAttribute("data-pon"), { active: c.checked }); await CM.load(); render(); } catch (e) { CM.toast("Couldn’t change it: " + esc(CM.errText(e))); } }; });
    q("[data-radd]", function (b) { b.onclick = function () { addRule(b.getAttribute("data-radd")); }; });
    q("[data-add-product]", function (b) { b.onclick = addProduct; });
    q("[data-std-new]", function (b) { b.onclick = function () { setStandard(document.getElementById("std-new").value); }; });
    ["try-rep", "try-prod", "try-amt"].forEach(function (id) { var el = document.getElementById(id); if (el) el.oninput = el.onchange = function () { S.tryit[{ "try-rep": "rep", "try-prod": "product", "try-amt": "amount" }[id]] = el.value; render(); }; });
    q("[data-save-settings]", function (b) { b.onclick = saveSettingsPage; });
  }

  /* ═══ actions ═══ */
  function pickMode() {
    var md = mode();
    CM.sheet("<h2>Which screen?</h2><p class=\"sub\">You’re a manager, so you can see the app the way each team does. You always act as yourself.</p><div class=\"mode-list\">" +
      modes().map(function (m) { return '<button data-pick="' + m + '" aria-pressed="' + (m === md) + '"><b>' + MODE_INFO[m][0] + "</b><span>" + MODE_INFO[m][1] + "</span></button>"; }).join("") + "</div>", function (root, close) {
      Array.prototype.forEach.call(root.querySelectorAll("[data-pick]"), function (b) { b.onclick = function () { close(); setMode(b.getAttribute("data-pick")); }; });
    });
  }
  async function submitDeal() {
    var m = me(), f = S.form, err = {};
    if (!String(f.customer).trim()) err.customer = "Who bought?";
    if (!(Number(f.amount) > 0)) err.amount = "Enter the deal value, before tax.";
    if (f.payment_status === "part_paid" && !(Number(f.amount_received) > 0)) err.amount_received = "How much has come in so far?";
    if (f.payment_status === "part_paid" && Number(f.amount_received) > Number(f.amount)) err.amount_received = "That’s more than the deal value.";
    if (f.customer_email && !/^\S+@\S+\.\S+$/.test(f.customer_email)) err.customer_email = "That doesn’t look like an email.";
    S.formErr = err;
    if (Object.keys(err).length) { redrawLog(); var first = document.getElementById("f-" + Object.keys(err)[0]); if (first) first.focus(); return; }
    S.logBusy = true; render();
    var data = { customer: f.customer.trim(), product: String(f.product || "").trim() || null, amount: Number(f.amount), closed_on: f.closed_on || null, payment_status: f.payment_status,
      amount_received: f.payment_status === "part_paid" ? Number(f.amount_received) : null, payment_ref: f.payment_ref.trim() || null, customer_email: f.customer_email.trim() || null,
      notes: f.notes.trim() || null, rep_name: m.name, rep_email: m.email, logged_via: "app", status: "waiting" };
    Object.keys(data).forEach(function (k) { if (data[k] === null) delete data[k]; });
    try {
      var rec = await CM.client.records.create("deals", data);
      var id = rec && (rec.id || (rec.data && rec.data.id));
      S.logBusy = false; S.form = null;
      await CM.load();
      CM.toast("Logged " + esc(data.customer) + ". Tally is checking it now.");
      location.hash = id ? "#/deal/" + id : "#/";
    } catch (e) { S.logBusy = false; S.formErr = { customer: "Couldn’t log it: " + CM.errText(e) + ". Your details are still here." }; render(); }
  }
  function editDeal(id) {
    var m = me(), d = CM.state.deals.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    CM.sheet('<h2>Edit ' + esc(d.customer) + '</h2><p class="sub">Finance sees that you changed it.</p><form id="ed" style="margin-top:14px">' +
      '<div class="field"><label for="ed-ps">Payment</label><select class="input" id="ed-ps">' + [["paid_in_full", "Paid in full"], ["part_paid", "Part paid"], ["not_paid", "Not paid yet"]].map(function (p) { return '<option value="' + p[0] + '"' + (d.payment_status === p[0] ? " selected" : "") + ">" + p[1] + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="ed-rcv">Received so far, before tax</label><input class="input" id="ed-rcv" type="number" inputmode="decimal" value="' + esc(d.amount_received == null ? "" : d.amount_received) + '"></div>' +
      '<div class="field"><label for="ed-ref">Invoice or payment reference</label><input class="input" id="ed-ref" value="' + esc(d.payment_ref || "") + '"></div>' +
      '<div class="field"><label for="ed-amt">Deal value before tax</label><input class="input" id="ed-amt" type="number" inputmode="decimal" value="' + esc(d.amount) + '"></div>' +
      '<div class="actions"><button type="button" class="btn" data-x>Cancel</button><button class="btn dark" type="submit">Save changes</button></div></form>', function (root, close) {
      root.querySelector("[data-x]").onclick = close;
      root.querySelector("#ed").onsubmit = async function (e) {
        e.preventDefault();
        var patch = { payment_status: root.querySelector("#ed-ps").value, payment_ref: root.querySelector("#ed-ref").value.trim(), amount: Number(root.querySelector("#ed-amt").value) || d.amount,
          check_status: "needs_a_look", check_note: CM.first(m.name) + " changed this deal on " + CM.day(CM.today()) + " after Tally’s check. Have a look before approving." };
        var rcv = root.querySelector("#ed-rcv").value; if (rcv !== "") patch.amount_received = Number(rcv);
        try { await CM.client.records.update("deals", d.id, patch); close(); await CM.load(); render(); CM.toast("Saved. Finance will see it changed."); }
        catch (err) { CM.toast("Couldn’t save: " + esc(CM.errText(err))); }
      };
    });
  }
  async function approve(id) {
    var d = CM.state.deals.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    S.busy[id] = true; delete S.err[id]; render();
    try {
      var run = await CM.client.functions.run("approve_deal", { input: { deal_id: id, reviewer_name: CM.myName() } });
      var status = String((run && (run.status || run.state)) || "").toUpperCase();
      if (status === "FAILED" || status === "ERROR" || (run && run.error)) throw new Error(CM.errText({ message: run.error || run.error_message || "It didn’t go through." }));
      var out = (run && (run.output_data || run.output || run.result)) || {};
      await CM.load();
      CM.toast("Approved " + esc(d.customer) + ". " + esc(CM.first(d.rep_name)) + " earns " + money(out.amount != null ? out.amount : priced(d).amount) + ".");
    } catch (e) { S.err[id] = CM.errText(e); }
    delete S.busy[id]; render();
  }
  async function reject(id) {
    var d = CM.state.deals.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var why = String(S.rejectText[id] || "").trim();
    if (!why) { S.err[id] = "Say why, so " + CM.first(d.rep_name) + " can fix it."; render(); var ta = document.getElementById("why-" + id); if (ta) ta.focus(); return; }
    S.busy[id] = true; delete S.err[id]; render();
    try {
      await CM.client.records.update("deals", id, { status: "rejected", finance_note: why, reviewed_by: CM.myName(), reviewed_by_email: CM.myEmail(), reviewed_at: new Date().toISOString() });
      delete S.rejecting[id]; delete S.rejectText[id]; await CM.load();
      CM.toast("Not approved. " + esc(CM.first(d.rep_name)) + " will hear why.");
    } catch (e) { S.err[id] = "Couldn’t save that: " + CM.errText(e); }
    delete S.busy[id]; render();
  }
  function payout(month) {
    var lines = CM.state.commissions.filter(function (c) { return c.status === "approved" && c.month === month; });
    var total = sum(lines, function (c) { return c.amount; });
    CM.sheet("<h2>Mark " + CM.monthName(month, true) + " paid out?</h2><p class=\"sub\">" + plural(lines.length, "commission") + " totalling <b>" + money(total) + "</b> will show as paid out on " + CM.day(CM.today()) + ". Do this once the money is in payroll.</p>" +
      '<div class="actions"><button class="btn" data-x>Cancel</button><button class="btn dark" data-go>Mark ' + money(total) + " paid out</button></div>", function (root, close) {
      root.querySelector("[data-x]").onclick = close;
      root.querySelector("[data-go]").onclick = async function () {
        this.disabled = true; this.textContent = "Marking…";
        try {
          for (var i = 0; i < lines.length; i++) await CM.client.records.update("commissions", lines[i].id, { status: "paid_out", paid_out_on: CM.today() });
          close(); await CM.load(); render(); CM.toast(CM.monthName(month) + " is marked paid out.");
        } catch (e) { close(); CM.toast("Couldn’t finish: " + esc(CM.errText(e)) + ". Some may already be marked."); await CM.load(); render(); }
      };
    });
  }

  async function gsAction(k, btn) {
    try {
      if (k === "company") {
        var name = document.getElementById("gs-company").value.trim(), cur = document.getElementById("gs-cur").value.trim() || "₹";
        if (!name) { CM.toast("Type your company’s name first."); return; }
        btn.disabled = true; await CM.saveSettings({ company: name, currency_symbol: cur });
      } else if (k === "plan") {
        btn.disabled = true; await setStandard(document.getElementById("gs-rate").value); return;
      } else if (k === "shared") { await CM.markSetup("shared"); }
      else if (k === "hide") { await CM.markSetup("gs_hidden"); }
    } catch (e) { CM.toast("Couldn’t save: " + esc(CM.errText(e))); }
    render();
  }
  async function setStandard(v) {
    var rate = Number(v);
    if (!(rate >= 0) || v === "") { CM.toast("Type a rate, like 10."); return; }
    try {
      var cur = CM.state.commission_rules.filter(function (r) { return r.applies_to === "everyone"; })[0];
      if (cur) await CM.client.records.update("commission_rules", cur.id, { rate: rate, active: true });
      else await CM.client.records.create("commission_rules", { label: "Standard rate", applies_to: "everyone", rate: rate, active: true });
      await CM.load(); render(); CM.toast("Standard rate set to " + CM.pct(rate) + ".");
    } catch (e) { CM.toast("Couldn’t save: " + esc(CM.errText(e))); render(); }
  }
  async function saveDraft(id) {
    var d = S.draft[id]; if (!d) return;
    try {
      var rule = CM.state.commission_rules.filter(function (r) { return r.id === id; })[0];
      var prod = CM.state.products.filter(function (p) { return p.id === id; })[0];
      if (rule) {
        var patch = {}; Object.keys(d).forEach(function (k) { patch[k] = (k === "rate" || k === "threshold") ? Number(d[k]) : String(d[k]).trim(); });
        if (rule.applies_to === "salesperson" && patch.match) { var p = salesPeople().filter(function (x) { return CM.same(x.email, patch.match); })[0]; patch.label = (p ? p.name : patch.match) + "’s rate"; }
        await CM.client.records.update("commission_rules", id, patch);
      } else if (prod) {
        var newName = d.name != null ? String(d.name).trim() : prod.name, pr = productRule(prod.name);
        if (!newName) { CM.toast("A product needs a name."); return; }
        if (newName !== prod.name) await CM.client.records.update("products", id, { name: newName });
        var rateTxt = d.rate != null ? String(d.rate).trim() : (pr && pr.active !== false ? String(pr.rate) : "");
        if (pr) {
          if (rateTxt === "") await CM.client.records.update("commission_rules", pr.id, { active: false, match: newName });
          else await CM.client.records.update("commission_rules", pr.id, { rate: Number(rateTxt), match: newName, label: newName + " rate", active: true });
        } else if (rateTxt !== "") await CM.client.records.create("commission_rules", { label: newName + " rate", applies_to: "product", match: newName, rate: Number(rateTxt), active: true });
      }
      delete S.draft[id]; await CM.load(); render(); CM.toast("Saved. It applies to deals approved from now on.");
    } catch (e) { CM.toast("Couldn’t save: " + esc(CM.errText(e))); }
  }
  async function addRule(kind) {
    var p = salesPeople()[0];
    var base = kind === "salesperson" ? { label: (p ? p.name : "Personal") + "’s rate", match: p ? p.email : "", rate: 10 } : { label: "Monthly bonus", rate: 2, threshold: 500000 };
    base.applies_to = kind; base.active = true;
    try { await CM.client.records.create("commission_rules", base); await CM.load(); render(); } catch (e) { CM.toast("Couldn’t add it: " + esc(CM.errText(e))); }
  }
  function addProduct() {
    CM.sheet('<h2>Add a product</h2><p class="sub">Salespeople pick it when they log a deal.</p><form id="ap" style="margin-top:14px"><div class="field"><label for="ap-name">Name</label><input class="input" id="ap-name" placeholder="Annual plan" required></div>' +
      '<div class="field"><label for="ap-rate">Its own rate <span class="muted">(optional)</span></label><span class="ratebox row" style="gap:6px"><input class="input" style="width:100px" id="ap-rate" type="number" inputmode="decimal" step="0.1" min="0">%</span><span class="hint">Leave it empty to use the standard rate.</span></div>' +
      '<div class="actions"><button type="button" class="btn" data-x>Cancel</button><button class="btn dark" type="submit">Add product</button></div></form>', function (root, close) {
      root.querySelector("[data-x]").onclick = close;
      root.querySelector("#ap").onsubmit = async function (e) {
        e.preventDefault();
        var name = root.querySelector("#ap-name").value.trim(), rate = root.querySelector("#ap-rate").value.trim();
        if (!name) return;
        try {
          await CM.client.records.create("products", { name: name, active: true });
          var pr = productRule(name);
          if (rate !== "") { if (pr) await CM.client.records.update("commission_rules", pr.id, { rate: Number(rate), active: true }); else await CM.client.records.create("commission_rules", { label: name + " rate", applies_to: "product", match: name, rate: Number(rate), active: true }); }
          close(); await CM.load(); render(); CM.toast("Added " + esc(name) + ".");
        } catch (err) { CM.toast("Couldn’t add it: " + esc(CM.errText(err))); }
      };
    });
  }
  async function saveSettingsPage() {
    try {
      await CM.saveSettings({ company: document.getElementById("st-company").value.trim(), currency_symbol: document.getElementById("st-cur").value.trim() || "₹", locale: document.getElementById("st-loc").value });
      render(); CM.toast("Saved.");
    } catch (e) { CM.toast("Couldn’t save: " + esc(CM.errText(e))); }
  }

  /* People: add someone, or move them between teams */
  async function changeTeam(memberId, team) {
    var m = CM.members.filter(function (x) { return x.pod_member_id === memberId; })[0]; if (!m || team === "none") return;
    S.peopleBusy = memberId; render();
    try {
      await CM.client.podMembers.updateRoles(CM.CFG.podId, memberId, CM.rolesFor(team, m.roles));
      await CM.loadMembers(); await CM.syncFinanceEmails();
      CM.toast(esc(CM.first(CM.memberName(m))) + " is in " + CM.TEAM_LABEL[team] + " now.");
    } catch (e) { CM.toast("Couldn’t change that: " + esc(CM.errText(e))); }
    S.peopleBusy = ""; render();
  }
  function addPeople() {
    if (!CM.canAddPeople()) { CM.toast("Only this space’s admins can add people."); return; }
    var team = "sales";
    var form = function () {
      return '<h2>Add people</h2><p class="sub">They get an email from Lemma. Once they’re in, this app shows them their team’s screens.</p><form id="inv" style="margin-top:14px" novalidate>' +
        '<div class="field"><label for="inv-email">Work email</label><input class="input" id="inv-email" type="email" autocomplete="off" placeholder="asha@company.com"><span class="hint">Add several at once by separating them with commas.</span></div>' +
        '<div class="field"><label>Team</label><div class="seg" role="group" aria-label="Team">' + ["sales", "finance", "manager"].map(function (t) { return '<button type="button" data-t="' + t + '" aria-pressed="' + (t === team) + '">' + CM.TEAM_LABEL[t] + "</button>"; }).join("") + "</div>" +
        '<span class="hint" id="inv-hint">' + { sales: "Logs their own deals and sees their own commission.", finance: "Approves deals and marks payouts.", manager: "Sees everything, adds people and sets the plan." }[team] + "</span></div>" +
        '<p class="note rejected" id="inv-err" hidden></p><div id="inv-done"></div><div class="actions"><button type="button" class="btn" data-x>Close</button><button class="btn dark" type="submit" id="inv-go">Add</button></div></form>';
    };
    CM.sheet(form(), function (root, close) {
      var wireSheet = function () {
        root.querySelector("[data-x]").onclick = function () { close(); render(); };
        Array.prototype.forEach.call(root.querySelectorAll("[data-t]"), function (b) { b.onclick = function () { team = b.getAttribute("data-t"); var keep = root.querySelector("#inv-email").value; root.querySelector(".sheet").innerHTML = form(); root.querySelector("#inv-email").value = keep; wireSheet(); }; });
        root.querySelector("#inv").onsubmit = async function (e) {
          e.preventDefault();
          var emails = root.querySelector("#inv-email").value.split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean), errEl = root.querySelector("#inv-err"), go = root.querySelector("#inv-go");
          errEl.hidden = true;
          if (!emails.length || emails.some(function (x) { return !/^\S+@\S+\.\S+$/.test(x); })) { errEl.textContent = "Check the email address."; errEl.hidden = false; return; }
          go.disabled = true; go.textContent = "Adding…";
          var out = [];
          for (var i = 0; i < emails.length; i++) {
            try { out.push(await invite(emails[i], team)); } catch (err) { out.push({ email: emails[i], error: CM.errText(err) }); }
          }
          await CM.loadMembers(); await CM.load(); await CM.syncFinanceEmails();
          root.querySelector("#inv-done").innerHTML = '<div class="pp" style="margin-bottom:8px">' + out.map(function (o) {
            var msg = o.error ? '<span class="muted" style="color:var(--rejected)">' + esc(o.error) + "</span>" : o.added ? "Added to " + CM.TEAM_LABEL[team] + ". They can open the app now." : o.moved ? "Already here. Moved to " + CM.TEAM_LABEL[team] + "." :
              (o.emailed ? "Invite emailed." : "Lemma couldn’t email them. Send them this link: " + '<button type="button" class="linkbtn" data-copy="' + esc(o.link || "") + '" data-what="the invite link">copy invite link</button>');
            return '<div class="pp-row"><div class="grow"><b>' + esc(o.email) + "</b><small>" + msg + "</small></div></div>";
          }).join("") + "</div>";
          Array.prototype.forEach.call(root.querySelectorAll("[data-copy]"), function (b) { b.onclick = function () { CM.copy(b.getAttribute("data-copy"), b.getAttribute("data-what")); }; });
          root.querySelector("#inv-email").value = ""; go.disabled = false; go.textContent = "Add more";
        };
      };
      wireSheet();
    });
  }
  async function invite(email, team) {
    var pod = CM.CFG.podId;
    var here = CM.members.filter(function (m) { return CM.same(m.user_email || m.email, email); })[0];
    if (here) { await CM.client.podMembers.updateRoles(pod, here.pod_member_id, CM.rolesFor(team, here.roles)); return { email: email, moved: true }; }
    if (!CM.org) { var p = await CM.client.pods.get(pod); CM.org = p && (p.organization_id || (p.organization && p.organization.id)); }
    var om = null;
    try { var res = await CM.client.request("GET", "/organizations/" + CM.org + "/members?limit=500"); om = ((res && res.items) || []).filter(function (x) { return CM.same(x.user && x.user.email, email); })[0]; } catch (e) { /* not allowed to list: invite instead */ }
    if (om) { await CM.client.podMembers.add(pod, { organization_member_id: om.id, roles: CM.rolesFor(team, []) }); return { email: email, added: true }; }
    var body = { email: email, role: "ORG_MEMBER", pod_id: pod, pod_role: team === "manager" ? "POD_ADMIN" : "POD_USER", redirect_uri: location.origin + "/" }, inv;
    try { inv = await CM.client.request("POST", "/organizations/" + CM.org + "/invitations", { body: body }); }
    catch (e) { if (/redirect/i.test(CM.errText(e))) { delete body.redirect_uri; inv = await CM.client.request("POST", "/organizations/" + CM.org + "/invitations", { body: body }); } else throw e; }
    try { await CM.client.records.create("invites", { email: email, team: team, invited_by: CM.myName(), status: "invited" }); } catch (e) {}
    return { email: email, invited: true, emailed: inv && inv.emailed !== false, link: inv && inv.accept_url };
  }

  /* ═══ Tally's intro, then a short tour of the page (once per person, per screen) ═══ */
  function introSteps(md) {
    var first = CM.first(CM.myName()), co = company(), at = co ? " at " + esc(co) : "";
    if (md === "sales") return [
      { title: "Hi " + first + ", I’m Tally.", body: "I look after sales commissions" + at + ". I’m going to help you log your deals." },
      { title: "Log a deal in a minute", body: "Tell me the customer, the value and whether they’ve paid. You’ll see what you’ll earn as you type." + (CM.tally.email ? " You can also email deals to me at <b>" + esc(CM.tally.email) + "</b>." : "") },
      { title: "I’ll take it from there", body: "I check every deal, finance approves it, and I tell you the moment it’s approved. What you’ve earned this month is always on your home screen.", cta: "Show me" }
    ];
    if (md === "finance") return [
      { title: "Hi " + first + ", I’m Tally.", body: "I look after sales commissions" + at + ". I check every deal before it reaches you." },
      { title: "Every deal arrives checked", body: "Payment, reference, duplicates and unusual amounts. Anything odd is flagged in amber. You approve, or say why not, and I tell the salesperson." },
      { title: "A list every morning", body: "Each weekday at 9:30 I send you what’s waiting. Once the money is in payroll, mark the month paid out.", cta: "Show me" }
    ];
    return [
      { title: "Hi " + first + ", I’m Tally.", body: "I’ll run sales commissions for your team: checking every deal, working out what it earns, and keeping everyone posted." },
      { title: "You see everything", body: "As a manager you see everyone’s commission, and you can switch to the Finance or Sales screens any time. You always act as yourself." },
      { title: "Three things to set up", body: "Your commission plan, your people, and how your team reaches me. It takes about ten minutes, and the steps are on your home screen.", cta: "Let’s set up" }
    ];
  }
  function tourSteps(md) {
    var ph = phone();
    if (md === "sales") return [
      { target: "log", title: "Log each deal you close", body: "Customer, value and whether they’ve paid. You see what you’ll earn as you type." },
      { target: "deals", title: "Follow every deal", body: "Each deal shows where it is: being checked, with finance, approved or paid out." },
      { target: "stats", title: "Your month at a glance", body: "Approved commission counts toward this month. Paid out shows once finance runs the payout." }
    ];
    if (md === "finance") return [
      { target: "card", title: "Every deal arrives checked", body: "My note is at the top of each card. Amber means have a look first." },
      { target: "approve", title: "Approve locks in the commission", body: "It’s worked out from your plan, shown as rate × money received. The salesperson hears straight away." },
      { target: ph ? "tab-payouts" : "nav-payouts", title: "Pay out once a month", body: "Approved commission waits in Payouts until you mark the month paid." }
    ];
    return [
      { target: "gs", title: "Start here", body: "Four short steps: your company, your standard rate, your people, and telling your team." },
      { target: ph ? "modes-m" : "modes", title: "See it the way your team does", body: "Switch to the Finance or Sales screens here. You always act as yourself." },
      { target: ph ? "tab-people" : "nav-people", title: "Add your people", body: "Pick Sales, Finance or Manager for each person. Lemma sends them an invite." }
    ];
  }
  var introOpen = false;
  function maybeIntro(force) {
    var md = mode(), key = "intro:" + md;
    if (!md || introOpen || (!force && CM.seen(key))) return;
    if (location.hash && location.hash !== "#/") { if (!force) return; location.hash = "#/"; }
    introOpen = true;
    CM.intro(introSteps(md), function (skipped) {
      introOpen = false; CM.markSeen(key);
      if (!skipped) setTimeout(function () { CM.tour(tourSteps(md)); }, 120);
    });
  }

  window.addEventListener("hashchange", function () { if (route().view !== "log") S.form = null; S.draft = {}; render(); window.scrollTo(0, 0); });
  window.addEventListener("resize", (function () { var t, w = window.innerWidth; return function () { clearTimeout(t); t = setTimeout(function () { if ((w <= 760) !== (window.innerWidth <= 760)) render(); w = window.innerWidth; }, 200); }; })());
  CM.boot(function (first) { render(); if (first) setTimeout(function () { maybeIntro(false); }, 250); }, CM.fail);
})();
