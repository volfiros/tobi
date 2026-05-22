// Twilio sandbox is no longer used for WhatsApp chatbot traffic; the app has migrated to the MetaCloud API.
import type { InboundWhatsAppMessage } from "../domain";

export async function verifyTwilioSignature(request: Request, authToken: string, publicAppUrl?: string): Promise<boolean> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return false;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return false;
  }

  const url = new URL(request.url);
  const configuredBase = publicAppUrl ? new URL(publicAppUrl) : null;
  const webhookUrl = `${configuredBase?.origin ?? url.origin}${url.pathname}${url.search}`;
  const form = await request.clone().formData();
  const pairs = Array.from(form.entries())
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  const signedPayload = pairs.reduce((payload, [key, value]) => `${payload}${key}${value}`, webhookUrl);
  const expected = await hmacSha1Base64(signedPayload, authToken);
  return timingSafeEqual(signature, expected);
}

export async function parseInboundWhatsApp(request: Request): Promise<InboundWhatsAppMessage> {
  const contentType = request.headers.get("content-type") ?? "";
  const raw: Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    Object.assign(raw, await request.json());
  } else {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      raw[key] = typeof value === "string" ? value : String(value);
    }
  }

  const mediaCount = Number(raw.NumMedia ?? raw.mediaCount ?? 0);
  const media = Array.from({ length: mediaCount }, (_, index) => ({
    url: String(raw[`MediaUrl${index}`] ?? raw.mediaUrl ?? ""),
    contentType: String(raw[`MediaContentType${index}`] ?? raw.contentType ?? "application/pdf"),
    filename: typeof raw[`MediaFilename${index}`] === "string" ? String(raw[`MediaFilename${index}`]) : null,
    sizeBytes: raw.fileSizeBytes ? Number(raw.fileSizeBytes) : null,
    pageCount: raw.pageCount ? Number(raw.pageCount) : null,
  })).filter((item) => item.url || item.contentType);

  return {
    from: String(raw.From ?? raw.from ?? "whatsapp:+910000000000"),
    body: String(raw.Body ?? raw.body ?? ""),
    providerMessageId: typeof raw.MessageSid === "string" ? raw.MessageSid : typeof raw.messageId === "string" ? raw.messageId : null,
    media,
    raw,
  };
}

export function twimlMessage(body: string): Response {
  const escaped = body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return new Response(`<Response><Message>${escaped}</Message></Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

async function hmacSha1Base64(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
