export function formatRidership(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}
