from app.tools.schemas import SendEmailRequest, SendEmailResult


class EmailTool:
    name = "send_email"
    description = "Simulate sending an email. Never delivers to a real mail server."

    def send_email(
        self,
        recipient: str,
        subject: str,
        body: str,
        attachments: list[str] | None = None,
    ) -> SendEmailResult:
        from app.security.trust_engine import SourceType, assess_trust

        request = SendEmailRequest(
            recipient=recipient,
            subject=subject,
            body=body,
            attachments=attachments or [],
        )
        return SendEmailResult(
            recipient=request.recipient,
            subject=request.subject,
            body=request.body,
            attachments=request.attachments,
            status="simulated",
            trust=assess_trust(SourceType.TOOL_RESPONSE, {"tool": "send_email"}),
        )
