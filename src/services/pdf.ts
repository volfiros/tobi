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
  let response: Response;
  try {
    response = await fetch(mediaUrl, {
      headers: twilioMediaHeaders(env),
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

function twilioMediaHeaders(env: Env): HeadersInit {
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
