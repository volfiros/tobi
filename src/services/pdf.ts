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
    pageCount: await countPdfPages(bytes),
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

async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  const text = decodePdfBytes(bytes);
  const rawPageCount = countKnownPageSignals(text);
  const streamPageCount = await countFlateDecodedPageSignals(bytes, text);
  const pageCount = Math.max(rawPageCount, streamPageCount);
  return pageCount || null;
}

function countKnownPageSignals(text: string): number {
  return Math.max(countPageObjects(text), countPagesTreeEntries(text));
}

function countPageObjects(text: string): number {
  return text.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

function countPagesTreeEntries(text: string): number {
  const counts = [
    ...pageTreeCountsFromPattern(text, /\/Type\s*\/Pages\b[\s\S]{0,1000}?\/Count\s+(\d+)/g),
    ...pageTreeCountsFromPattern(text, /\/Count\s+(\d+)[\s\S]{0,1000}?\/Type\s*\/Pages\b/g),
  ];
  return Math.max(0, ...counts);
}

function pageTreeCountsFromPattern(text: string, pattern: RegExp): number[] {
  return Array.from(text.matchAll(pattern), (match) => Number(match[1])).filter(
    (count) => Number.isInteger(count) && count > 0,
  );
}

async function countFlateDecodedPageSignals(
  bytes: Uint8Array,
  text: string,
): Promise<number> {
  let count = 0;
  const streamPattern =
    /<<(?:.|\n|\r)*?\/Filter\s*(?:\[\s*)?\/FlateDecode\b(?:.|\n|\r)*?>>\s*stream\r?\n?/g;
  for (const match of text.matchAll(streamPattern)) {
    const streamStart = match.index + match[0].length;
    const streamEnd = text.indexOf("endstream", streamStart);
    if (streamEnd === -1) continue;

    const streamBytes = trimPdfStreamBytes(bytes.slice(streamStart, streamEnd));
    const inflated = await inflatePdfStream(streamBytes);
    if (!inflated) continue;
    count += countStreamPageSignals(decodePdfBytes(inflated));
  }
  return count;
}

function countStreamPageSignals(text: string): number {
  const pageObjects = countPageObjects(text);
  return pageObjects || countPagesTreeEntries(text);
}

function trimPdfStreamBytes(bytes: Uint8Array): Uint8Array {
  let start = 0;
  let end = bytes.length;
  while (start < end && (bytes[start] === 0x0a || bytes[start] === 0x0d)) {
    start += 1;
  }
  while (
    end > start &&
    (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)
  ) {
    end -= 1;
  }
  return bytes.slice(start, end);
}

async function inflatePdfStream(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("deflate"),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function decodePdfBytes(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}
