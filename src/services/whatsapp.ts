import type { InboundWhatsAppMessage } from "../domain";
import type { WorkflowAction } from "./messageWorkflow";

export type WhatsAppProvider = "twilio_sandbox" | "meta_cloud_api";

export async function verifyMetaSignature(request: Request, appSecret: string): Promise<boolean> {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;
  const body = await request.clone().text();
  const expected = `sha256=${await hmacSha256Hex(body, appSecret)}`;
  return timingSafeEqual(signature, expected);
}

export function verifyMetaWebhookChallenge(url: URL, verifyToken?: string): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && verifyToken && token === verifyToken) {
    return new Response(challenge, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function parseInboundMetaWhatsApp(request: Request): Promise<InboundWhatsAppMessage | null> {
  const raw = (await request.json()) as MetaWebhookPayload;
  const value = raw.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!value || !message) return null;

  const contact = value.contacts?.[0];
  const from = `whatsapp:+${message.from.replace(/^\+/, "")}`;
  const media = mediaFromMetaMessage(message);
  return {
    from,
    body: textFromMetaMessage(message),
    providerMessageId: message.id ?? null,
    media,
    raw: raw as unknown as Record<string, unknown>,
    senderName: contact?.profile?.name ?? null,
  };
}

export async function sendMetaWhatsAppText(env: Env, to: string, body: string): Promise<string | null> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required for Meta WhatsApp replies");
  }
  const recipient = to.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const version = env.WHATSAPP_GRAPH_API_VERSION ?? "v25.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    },
  );
  const responseBody = (await response.json().catch(() => null)) as MetaSendResponse | null;
  if (!response.ok) {
    throw new Error(`Meta WhatsApp send failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }
  return responseBody?.messages?.[0]?.id ?? null;
}

export async function sendMetaWhatsAppInteractiveButtons(
  env: Env,
  to: string,
  body: string,
  actions: WorkflowAction[],
): Promise<string | null> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required for Meta WhatsApp replies");
  }
  const buttons = actions.slice(0, 3).map((action) => ({
    type: "reply",
    reply: {
      id: action.id,
      title: action.title.slice(0, 20),
    },
  }));
  if (buttons.length === 0) return sendMetaWhatsAppText(env, to, body);

  const recipient = to.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const version = env.WHATSAPP_GRAPH_API_VERSION ?? "v25.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: { buttons },
        },
      }),
    },
  );
  const responseBody = (await response.json().catch(() => null)) as MetaSendResponse | null;
  if (!response.ok) {
    throw new Error(`Meta WhatsApp interactive send failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }
  return responseBody?.messages?.[0]?.id ?? null;
}

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function textFromMetaMessage(message: MetaMessage): string {
  if (message.text?.body) return message.text.body;
  const buttonReply = message.interactive?.button_reply;
  if (buttonReply?.id === "confirm_quote") return "Confirm";
  if (buttonReply?.id === "cancel_order") return "Cancel";
  if (buttonReply?.title) return buttonReply.title;
  if (message.document?.filename) return message.document.filename;
  if (message.image?.caption) return message.image.caption;
  return "";
}

function mediaFromMetaMessage(message: MetaMessage): InboundWhatsAppMessage["media"] {
  if (message.document) {
    return [
      {
        url: `meta:${message.document.id}`,
        contentType: message.document.mime_type ?? "application/pdf",
        filename: message.document.filename ?? null,
        sizeBytes: null,
        pageCount: null,
      },
    ];
  }
  if (message.image) {
    return [
      {
        url: `meta:${message.image.id}`,
        contentType: message.image.mime_type ?? "image/jpeg",
        filename: null,
        sizeBytes: null,
        pageCount: null,
      },
    ];
  }
  return [];
}

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string } }>;
        messages?: MetaMessage[];
      };
    }>;
  }>;
};

type MetaMessage = {
  from: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: {
      id?: string;
      title?: string;
    };
  };
  document?: {
    id: string;
    filename?: string;
    mime_type?: string;
  };
  image?: {
    id: string;
    mime_type?: string;
    caption?: string;
  };
};

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
};
