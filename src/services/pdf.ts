export type StoredPdf = {
  r2Key: string;
  fileSizeBytes: number | null;
  pageCount: number | null;
};

export async function storeInboundPdf(
  env: Env,
  mediaUrl: string,
  r2Key: string,
  contentType: string,
): Promise<StoredPdf> {
  if (!env.FILES)
    throw new Error("R2 FILES binding is required for PDF intake");
  const downloadUrl = mediaUrl.startsWith("meta:")
    ? await getMetaMediaDownloadUrl(env, mediaUrl.slice("meta:".length))
    : mediaUrl;
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      headers: mediaHeaders(env, downloadUrl),
    });
  } catch (error) {
    throw new Error(
      `Unable to fetch inbound PDF media: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(
      `Unable to fetch inbound PDF media: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType },
  });
  return {
    r2Key,
    fileSizeBytes: bytes.byteLength,
    pageCount: countPdfPages(bytes),
  };
}

async function getMetaMediaDownloadUrl(env: Env, mediaId: string): Promise<string> {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is required for Meta WhatsApp media downloads");
  }
  const version = env.WHATSAPP_GRAPH_API_VERSION ?? "v25.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  const body = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !body?.url) {
    throw new Error(`Meta WhatsApp media lookup failed: HTTP ${response.status}`);
  }
  return body.url;
}

function mediaHeaders(env: Env, mediaUrl: string): HeadersInit {
  if (mediaUrl.includes("lookaside.fbsbx.com") && env.WHATSAPP_ACCESS_TOKEN) {
    return {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    };
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return {};
  return {
    Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
  };
}

function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length || null;
}
