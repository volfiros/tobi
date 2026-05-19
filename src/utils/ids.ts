const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createId(prefix: string): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${prefix}_${suffix.toLowerCase()}`;
}

export function createPublicOrderId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `TOBI-${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createPickupCode(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const value = 1000 + ((bytes[0] * 256 + bytes[1]) % 9000);
  return String(value);
}
