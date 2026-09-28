"""Server-rendered quote document: printable (Save as PDF) and customer accept page."""

from __future__ import annotations

from html import escape
from typing import Any

BRAND = "InsureAI"

ADDON_LABELS: dict[str, str] = {
    "zero_depreciation": "Zero Depreciation",
    "roadside_assistance": "24x7 Roadside Assistance",
    "engine_protection": "Engine Protection",
    "consumables_cover": "Consumables Cover",
    "return_to_invoice": "Return to Invoice",
    "key_replacement": "Key Replacement",
}
PLAN_LABELS = {"basic": "Basic (Third-party only)", "standard": "Standard (Comprehensive)", "premium": "Premium (Comprehensive + add-ons)"}
CATEGORY_LABELS = {
    "definitions": "Insured's Declared Value",
    "coverage": "What this policy covers",
    "exclusions": "What is not covered",
    "ncb": "No Claim Bonus",
    "claims": "How to claim",
    "addons": "Add-on wordings",
}


def addon_label(name: str) -> str:
    return ADDON_LABELS.get(name, name.replace("_", " ").title())


def _inr(value: Any) -> str:
    amount = float(value or 0)
    whole, paise = f"{amount:.2f}".split(".")
    sign = "-" if whole.startswith("-") else ""
    whole = whole.lstrip("-")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}&#8377;{whole}.{paise}"


def _date(value: Any) -> str:
    return value.strftime("%d %b %Y") if value else "-"


STYLE = """
*{box-sizing:border-box}body{margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a}
.page{max-width:820px;margin:24px auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,.08);padding:36px}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:16px}
.brand{font-size:24px;font-weight:800;color:#2563eb}.muted{color:#64748b;font-size:13px}
h2{font-size:15px;margin:24px 0 8px;color:#1e293b;text-transform:uppercase;letter-spacing:.05em}
h3{font-size:14px;margin:16px 0 6px;color:#334155}
.section{font-size:13px;line-height:1.55;color:#334155;margin:0 0 12px}
.section p{margin:0 0 8px}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 4px;border-bottom:1px solid #e2e8f0}
td.r{text-align:right;font-variant-numeric:tabular-nums}.total td{font-weight:800;font-size:17px;border-top:2px solid #0f172a;border-bottom:none}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:14px}.grid b{color:#475569;font-weight:600}
.banner{margin:20px 0;padding:14px 18px;border-radius:12px;font-weight:600}
.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}.warn{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
.btn{display:inline-block;border:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none}
.primary{background:#2563eb;color:#fff}.ghost{background:#e2e8f0;color:#0f172a}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.reason{color:#64748b;font-size:12px}
details{margin-top:18px;font-size:12px;color:#475569}code{display:block;white-space:pre-wrap;background:#f8fafc;padding:10px;border-radius:8px}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}.actions,.noprint{display:none}}
"""


def render_quote_html(
    quote: dict[str, Any],
    *,
    customer_view: bool,
    accept_action: str | None = None,
    just_accepted: bool = False,
    policy_sections: list[dict[str, Any]] | None = None,
) -> str:
    """`quote` is a QuoteOut dumped in python mode (Decimals, datetimes)."""
    b = quote["breakdown"]
    c = quote["customer"]
    status = quote["effective_status"]
    e = escape

    addon_rows = "".join(
        f"<tr><td>{e(addon_label(a['addon_name']))}"
        + (f"<div class='reason'>{e(a['recommendation_reason'])}</div>" if a.get("recommendation_reason") else "")
        + f"</td><td class='r'>{_inr(a['price'])}</td></tr>"
        for a in b["addon_breakdown"]
    )
    od_rows = ""
    if quote["plan_tier"] != "basic":
        od_rows = (
            f"<tr><td>Own Damage premium ({b['od_rate_pct']}% of IDV)</td><td class='r'>{_inr(b['od_premium'])}</td></tr>"
            f"<tr><td>No Claim Bonus ({b['ncb_discount_pct']}%, {b['claim_free_years']} claim-free yr)</td>"
            f"<td class='r'>-{_inr(b['ncb_discount_amount'])}</td></tr>"
        )

    if status == "converted":
        banner = "<div class='banner ok'>" + (
            "Thank you! Your quote is accepted. Your agent will contact you to complete payment and issue the policy."
            if just_accepted else f"Accepted on {_date(quote['converted_at'])}."
        ) + "</div>"
    elif status == "expired":
        banner = f"<div class='banner warn'>This quote expired on {_date(quote['valid_until'])}. Please ask your agent for a fresh quote.</div>"
    else:
        banner = f"<div class='banner warn noprint'>Valid until {_date(quote['valid_until'])}. Premiums exclude any later changes to the vehicle or claim history.</div>"

    actions = ["<button class='btn ghost' onclick='window.print()'>Download / Print PDF</button>"]
    if customer_view and accept_action and status in ("draft", "sent"):
        actions.insert(0, (
            f"<form method='post' action='{e(accept_action)}' style='margin:0'>"
            "<button class='btn primary' type='submit'>Accept this quote</button></form>"
        ))

    trace = "" if customer_view else (
        "<details open><summary>How this premium was calculated (deterministic, rule-based)</summary><code>"
        + e("\n".join(b["formula_trace"])) + "</code></details>"
    )

    wording = ""
    selected_names = {a["addon_name"] for a in b.get("addon_breakdown") or []}
    if policy_sections:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for section in policy_sections:
            cat = section.get("parent_category") or "other"
            if cat == "addons" and section.get("related_addon"):
                related = str(section["related_addon"])
                if selected_names and not any(related in name or name.startswith(related) for name in selected_names):
                    # still show all add-on wordings on the complete document
                    pass
            grouped.setdefault(cat, []).append(section)
        order = ["definitions", "coverage", "exclusions", "ncb", "addons", "claims"]
        blocks = []
        for cat in order + [c for c in grouped if c not in order]:
            items = grouped.get(cat) or []
            if not items:
                continue
            title = CATEGORY_LABELS.get(cat, cat.replace("_", " ").title())
            body = "".join(
                f"<h3>{e(item['section_number'])} {e(item['section_title'])}</h3>"
                f"<div class='section'>{e(item['content']).replace(chr(10), '<br>')}</div>"
                for item in items
            )
            blocks.append(f"<h2>{e(title)}</h2>{body}")
        wording = "".join(blocks)

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(quote['display_id'])} - {e(quote.get('insurer') or '')} Motor Policy Quote</title><style>{STYLE}</style></head><body>
<div class="page">
  <div class="head">
    <div><div class="brand">{BRAND}</div><div class="muted">Complete motor policy quote &middot; {e(quote.get('insurer') or b.get('insurer') or '')}</div></div>
    <div style="text-align:right"><div style="font-weight:800;font-size:18px">{e(quote['display_id'])}</div>
      <div class="muted">Issued {_date(quote['created_at'])} &middot; Valid until {_date(quote['valid_until'])}</div></div>
  </div>
  {banner}
  <h2>Customer</h2>
  <div class="grid"><div><b>Name:</b> {e(c['name'])}</div><div><b>Mobile:</b> {e(c['phone'])}</div>
    <div><b>Email:</b> {e(c.get('email') or '-')}</div><div><b>City:</b> {e(quote.get('city') or c['city'])}</div></div>
  <h2>Vehicle</h2>
  <div class="grid"><div><b>Vehicle:</b> {e(b['vehicle'])}</div><div><b>Age:</b> {b['vehicle_age_months']} months</div>
    <div><b>Ex-showroom:</b> {_inr(b['ex_showroom_price'])}</div>
    <div><b>IDV (Insured Declared Value):</b> {_inr(b['idv']) if quote['plan_tier'] != 'basic' else 'n/a (third-party only)'}</div></div>
  <h2>Premium &mdash; {e(quote.get('insurer') or '')} {e(PLAN_LABELS.get(quote['plan_tier'], quote['plan_tier']))}</h2>
  <table>
    {od_rows}
    <tr><td>Third-party liability premium</td><td class="r">{_inr(b['tp_premium'])}</td></tr>
    {addon_rows}
    <tr><td><b>Net premium</b></td><td class="r"><b>{_inr(quote['total_premium'])}</b></td></tr>
    <tr><td>GST @ 18%</td><td class="r">{_inr(quote['gst_amount'])}</td></tr>
    <tr class="total"><td>Total payable</td><td class="r">{_inr(quote['total_payable'])}</td></tr>
  </table>
  {trace}
  {wording}
  <div class="actions">{''.join(actions)}</div>
  <p class="muted" style="margin-top:28px">This document combines the calculated premium from this insurer's rate card with the policy wording on file. \
Subject to vehicle inspection and the insurer's issued policy schedule. Verify against the official policy wording before binding cover.</p>
</div></body></html>"""


def render_message_page(title: str, message: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{escape(title)}</title>
<style>{STYLE}</style></head><body><div class="page"><div class="brand">{BRAND}</div>
<h2>{escape(title)}</h2><p>{escape(message)}</p></div></body></html>"""
