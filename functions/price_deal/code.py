#input_type_name: PriceInput
#output_type_name: PriceResult
#function_name: price_deal

from datetime import datetime, timezone

from pydantic import BaseModel
from lemma_sdk import FunctionContext


class PriceInput(BaseModel):
    deal_id: str


class PriceResult(BaseModel):
    deal_id: str
    expected_commission: float
    rate: float
    rule_used: str
    explanation: str
    sold_this_month: float


# ── How a commission is worked out (same code in price_deal and approve_deal) ──
# 1. Rate: a rule for this salesperson wins, then a rule for this product, then the rule for everyone.
# 2. Monthly bonus: once a salesperson's approved sales this month pass a rule's threshold,
#    the part of this deal above the threshold earns that rule's extra rate.
# Change the plan in the app (Commission plan, managers only) or by asking Tally, not here.


def _low(s):
    return (s or "").strip().lower()


def pick_rule(rules, rep_email, product):
    live = [r for r in rules if r.get("active", True) is not False]
    for kind, key in (("salesperson", _low(rep_email)), ("product", _low(product)), ("everyone", None)):
        for r in live:
            if r.get("applies_to") != kind:
                continue
            if key is not None and _low(r.get("match")) != key:
                continue
            return r
    return None


def money(x, symbol="₹", locale="en-IN"):
    n = int(round(float(x or 0)))
    s = str(abs(n))
    if locale == "en-IN" and len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    else:
        s = "{:,}".format(abs(n))
    return ("-" if n < 0 else "") + symbol + s


def pct(r):
    r = float(r or 0)
    return ("%g" % r) + "%"


def work_out(rules, rep_email, product, base, sold_this_month, symbol="₹", locale="en-IN"):
    """Returns (amount, rate_percent, rule_label, explanation) for `base` money received."""
    rule = pick_rule(rules, rep_email, product)
    if rule is None:
        return 0.0, 0.0, "No rule", "No commission rule covers this deal yet."
    rate = float(rule.get("rate") or 0)
    amount = base * rate / 100.0
    why = "{} of {} ({})".format(pct(rate), money(base, symbol, locale), rule.get("label") or "rule")
    label = rule.get("label") or "Rule"
    for b in sorted([r for r in rules if r.get("applies_to") == "monthly_bonus" and r.get("active", True) is not False],
                    key=lambda r: float(r.get("threshold") or 0)):
        t = float(b.get("threshold") or 0)
        above = max(0.0, (sold_this_month + base) - max(t, sold_this_month))
        if above > 0:
            extra = above * float(b.get("rate") or 0) / 100.0
            amount += extra
            why += " + {} bonus on {} above {} this month".format(pct(b.get("rate")), money(above, symbol, locale), money(t, symbol, locale))
            label += " + " + (b.get("label") or "monthly bonus")
    eff = (amount / base * 100.0) if base else rate
    return round(amount, 2), round(eff, 2), label, why


def _settings(pod):
    rows = pod.table("settings").list(limit=1).to_dict()["items"]
    s = rows[0] if rows else {}
    return s.get("currency_symbol") or "₹", s.get("locale") or "en-IN"


async def price_deal(ctx: FunctionContext, data: PriceInput) -> PriceResult:
    pod = ctx.pod
    deal = pod.table("deals").get(data.deal_id)
    symbol, locale = _settings(pod)
    rules = pod.table("commission_rules").list(limit=500).to_dict()["items"]
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    mine = pod.records.list("commissions", limit=1000, filter=[
        {"field": "rep_email", "op": "eq", "value": deal.get("rep_email") or ""},
        {"field": "month", "op": "eq", "value": month},
    ]).to_dict()["items"]
    sold = sum(float(c.get("base") or 0) for c in mine)
    # Same base approval uses: money received so far when part paid, otherwise the deal value.
    base = float(deal.get("amount") or 0)
    if deal.get("payment_status") == "part_paid":
        base = float(deal.get("amount_received") or 0)
    amount, rate, label, why = work_out(rules, deal.get("rep_email"), deal.get("product"), base, sold, symbol, locale)
    pod.table("deals").update(deal["id"], {"expected_commission": amount, "expected_rate": rate, "rule_used": label})
    return PriceResult(deal_id=deal["id"], expected_commission=amount, rate=rate, rule_used=label, explanation=why,
                       sold_this_month=sold)
