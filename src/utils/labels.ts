export function label(value: string | null): string {
  return (value ?? "not set").replaceAll("_", " ");
}
