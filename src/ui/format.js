// Small display formatters (browser Date is fine here — this is view code).

// mm:ss (or h:mm:ss) from seconds.
export function fmtClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "12 Jun 2026"
export function fmtDate(iso) {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// "Today" / "Yesterday" / "N days ago" / "N weeks ago" / a date for older.
export function fmtRelative(iso) {
  if (!iso) return 'unknown';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'unknown';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return fmtDate(iso);
}
