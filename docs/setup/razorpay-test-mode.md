# Razorpay Test Mode Setup

Use Razorpay Test Mode for the demo payment flow. This gives automated payment
confirmation without Meta Business setup or real-money transfers.

1. Create or open a Razorpay account.
2. Switch the Razorpay dashboard to **Test Mode**.
3. Create API keys and copy the test key id and secret.
4. Set local secrets in `.dev.vars`:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=replace-with-webhook-secret
```

5. Expose the local Worker with a tunnel, or deploy to Cloudflare Workers.
6. Configure this webhook URL in Razorpay:

```text
POST https://<your-public-host>/webhooks/razorpay
```

7. Subscribe to these events:

```text
payment_link.paid
payment_link.expired
payment_link.cancelled
payment.captured
payment.failed
```

The app only marks an order paid after the Razorpay webhook signature verifies.
Customer messages and screenshots never mark payment success.
