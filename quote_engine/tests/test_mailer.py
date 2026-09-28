"""Mailer unit tests. SMTP is mocked — no network."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import mailer  # noqa: E402


class MailerTests(unittest.TestCase):
    def test_from_address_defaults_to_college_mailbox(self) -> None:
        with patch("mailer.os.getenv", return_value=None):
            self.assertEqual(mailer.from_address(), "dhawalevs@rknec.edu")

    def test_send_requires_password(self) -> None:
        with patch("mailer.os.getenv", return_value=""):
            with self.assertRaisesRegex(mailer.MailerError, "SMTP_PASSWORD"):
                mailer.send_quote_document(
                    to_email="customer@example.com",
                    customer_name="Asha",
                    subject="Quote",
                    text_body="Hello",
                    share_url="http://example.com/q/abc",
                )

    def test_send_logs_in_as_college_mailbox(self) -> None:
        env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "dhawalevs@rknec.edu",
            "SMTP_PASSWORD": "app-password-here",
            "SMTP_FROM": "dhawalevs@rknec.edu",
        }
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        with patch.dict("os.environ", env, clear=False):
            with patch("mailer.smtplib.SMTP", return_value=smtp) as ctor:
                result = mailer.send_quote_document(
                    to_email="customer@example.com",
                    customer_name="Asha",
                    subject="Quote",
                    text_body="Hello",
                    share_url="http://example.com/q/abc",
                    attachment_html="<html></html>",
                )
        ctor.assert_called_once()
        smtp.login.assert_called_once_with("dhawalevs@rknec.edu", "app-password-here")
        smtp.sendmail.assert_called_once()
        self.assertEqual(result["email_from"], "dhawalevs@rknec.edu")
        self.assertEqual(result["email_to"], "customer@example.com")


if __name__ == "__main__":
    unittest.main()
