# Cloudflare Local Setup

Install dependencies:

```bash
bun install
```

Create `.dev.vars` from `.dev.vars.example`, fill the local WhatsApp Cloud API,
CodeGate/OpenAI, and Razorpay values you need, then run:

```bash
bun run dev
```

The AI integration uses `https://codegate.dev/v1` and `gpt-5.4-mini` by default.
With `OPENAI_API_KEY` configured, run the opt-in live validation with:

```bash
bun run test:ai:live
```

Apply D1 migrations locally:

```bash
bunx wrangler d1 migrations apply tobi-demo-db --local
```

Useful local checks:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/dashboard/login
```

The dashboard default local PIN is `123456` unless `ADMIN_PIN` is set.
