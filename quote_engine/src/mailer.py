"""Send policy documents from the agent mailbox over SMTP.

Default sender is dhawalevs@rknec.edu (Google Workspace / Gmail SMTP).
Credentials come from the environment — never hard-code a password.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid
from html import escape

DEFAULT_FROM = "dhawalevs@rknec.edu"


class MailerError(RuntimeError):
    """SMTP is missing, rejected, or failed."""


def from_address() -> str:
    return (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or DEFAULT_FROM).strip()


def from_name() -> str:
    return (os.getenv("SMTP_FROM_NAME") or "InsureAI").strip() or "InsureAI"


def configured() -> bool:
    return bool((os.getenv("SMTP_PASSWORD") or "").strip() and from_address())


def _settings() -> dict[str, str | int]:
    host = (os.getenv("SMTP_HOST") or "smtp.gmail.com").strip()
    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or from_address()).strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    return {"host": host, "port": port, "user": user, "password": password}


def render_email_html(*, customer_name: str, subject: str, text_body: str, share_url: str) -> str:
    name = escape(customer_name or "there")
    return f"""<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5">
  <p>Hi {name},</p>
  <p>{escape(text_body)}</p>
  <p><a href="{escape(share_url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Open your policy document</a></p>
  <p>The full document is also attached to this email.</p>
  <p style="color:#64748b;font-size:12px">Sent by {escape(from_name())} from {escape(from_address())}.</p>
</body></html>"""


def send_quote_document(
    *,
    to_email: str,
    customer_name: str,
    subject: str,
    text_body: str,
    share_url: str,
    attachment_html: str | None = None,
    attachment_name: str = "policy-document.html",
) -> dict[str, str]:
    to_addr = (to_email or "").strip()
    if "@" not in to_addr:
        raise MailerError("Customer email address is missing or invalid.")
    if not configured():
        raise MailerError(
            f"Email is not configured. Add a Gmail App Password for {from_address()} "
            "as SMTP_PASSWORD in quote_engine/.env, then restart the API."
        )

    cfg = _settings()
    sender = from_address()
    html_body = render_email_html(
        customer_name=customer_name, subject=subject, text_body=text_body, share_url=share_url,
    )

    msg = MIMEMultipart("mixed")
    msg["From"] = formataddr((from_name(), sender))
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=sender.split("@")[-1])
    msg["Reply-To"] = sender

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    if attachment_html:
        part = MIMEApplication(attachment_html.encode("utf-8"), _subtype="html")
        part.add_header("Content-Disposition", "attachment", filename=attachment_name)
        msg.attach(part)

    try:
        with smtplib.SMTP(str(cfg["host"]), int(cfg["port"]), timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(str(cfg["user"]), str(cfg["password"]))
            smtp.sendmail(sender, [to_addr], msg.as_string())
    except smtplib.SMTPAuthenticationError as exc:
        raise MailerError(
            f"Gmail rejected {sender}. Use a 16-character App Password (not the mailbox login password) "
            "in SMTP_PASSWORD."
        ) from exc
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        raise MailerError(f"Could not send email from {sender}: {exc}") from exc

    return {"email_from": sender, "email_to": to_addr}
