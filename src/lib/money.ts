export function rand(n: number | string | null | undefined): string {
  const v = Number(n || 0);
  return 'R' + v.toLocaleString('en-ZA', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
