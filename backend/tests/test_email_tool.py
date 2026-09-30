import pytest
from pydantic import ValidationError

from app.tools.email import EmailTool


def test_send_email_is_simulated_and_echoes_fields() -> None:
    result = EmailTool().send_email(
        recipient="finance@acme.local",
        subject="Q3 invoice",
        body="Please find the invoice attached.",
        attachments=["invoice.txt"],
    )
    assert result.status == "simulated"
    assert result.recipient == "finance@acme.local"
    assert result.subject == "Q3 invoice"
    assert result.body == "Please find the invoice attached."
    assert result.attachments == ["invoice.txt"]


def test_send_email_defaults_attachments_to_empty_list() -> None:
    result = EmailTool().send_email(
        recipient="ops@acme.local",
        subject="Status",
        body="All green.",
    )
    assert result.attachments == []
    assert result.status == "simulated"


def test_send_email_rejects_empty_recipient() -> None:
    with pytest.raises(ValidationError):
        EmailTool().send_email(recipient="", subject="Hi", body="Hello")
