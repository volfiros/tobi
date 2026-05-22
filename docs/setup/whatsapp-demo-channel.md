# WhatsApp Demo Channel Setup

The demo does not require WhatsApp native payments. Use the Meta WhatsApp Cloud API (MetaCloud)
for chat delivery, then keep Razorpay Test Mode for payment confirmation.

## Meta WhatsApp Cloud API (MetaCloud)

1. In Meta Developer settings, set the callback URL to:

```text
https://<your-public-host>/webhooks/whatsapp
```

2. Set the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe to WhatsApp message webhook events.
4. Configure these Worker values:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_GRAPH_API_VERSION
```

5. Send a PDF plus text such as:

```text
2 copies B&W spiral double sided pickup at 5
```

## Legacy Twilio Sandbox Fallback

Twilio sandbox support is retained only for older demos and form-encoded smoke
tests. If needed, set the Twilio inbound webhook URL to:

```text
https://<your-public-host>/webhooks/whatsapp
```

Use `POST` as the webhook method.

For local smoke testing without Meta WhatsApp Cloud API or Twilio, post form data directly to
`/webhooks/whatsapp` with fields such as `From`, `Body`, `NumMedia`,
`MediaUrl0`, `MediaContentType0`, and `pageCount`.
