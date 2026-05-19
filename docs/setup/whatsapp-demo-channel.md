# WhatsApp Demo Channel Setup

The demo does not require WhatsApp native payments. Use a WhatsApp test channel
only for chat delivery.

The fastest option is Twilio WhatsApp Sandbox:

1. Open Twilio Console and enable the WhatsApp Sandbox.
2. Join the sandbox from your phone using Twilio's join code.
3. Set the inbound webhook URL to:

```text
https://<your-public-host>/webhooks/whatsapp
```

4. Use `POST` as the webhook method.
5. Send a PDF plus text such as:

```text
2 copies B&W spiral double sided pickup at 5
```

For local smoke testing without Twilio, post form data directly to
`/webhooks/whatsapp` with fields such as `From`, `Body`, `NumMedia`,
`MediaUrl0`, `MediaContentType0`, and `pageCount`.
