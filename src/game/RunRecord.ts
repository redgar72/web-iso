const BEST_TIME_KEY = 'web-iso-best-time';

export function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getBestRunTimeSeconds(): number {
  const raw = localStorage.getItem(BEST_TIME_KEY);
  if (raw == null) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function setBestRunTimeSeconds(seconds: number): void {
  localStorage.setItem(BEST_TIME_KEY, String(seconds));
}
