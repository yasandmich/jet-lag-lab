// DST-correct timezone helpers built on Intl.DateTimeFormat.

// Offset (in hours) of a timezone at a given instant.
export function tzOffsetHours(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (k) => Number(parts.find((p) => p.type === k)?.value || '0');
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return (asUTC - date.getTime()) / 3600000;
  } catch {
    return 0;
  }
}

// Convert a wall-clock string (YYYY-MM-DDTHH:mm) in a timezone to a real UTC Date.
export function wallToUTC(wall, tz) {
  if (!wall || !wall.includes('T')) return null;
  try {
    const [d, t] = wall.split('T');
    const [Y, Mo, D] = d.split('-').map(Number);
    const [H, Mi] = t.split(':').map(Number);
    if ([Y, Mo, D, H, Mi].some((n) => isNaN(n))) return null;
    let guess = Date.UTC(Y, Mo - 1, D, H, Mi);
    for (let i = 0; i < 6; i++) {
      const off = tzOffsetHours(tz, new Date(guess)) * 3600000;
      const corrected = Date.UTC(Y, Mo - 1, D, H, Mi) - off;
      if (Math.abs(corrected - guess) < 60000) { guess = corrected; break; }
      guess = corrected;
    }
    return new Date(guess);
  } catch {
    return null;
  }
}

// Format a UTC Date as the wall-clock date string in a timezone.
export function utcToWall(date, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const g = (k) => p.find((x) => x.type === k)?.value || '00';
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
  } catch {
    return date.toISOString().slice(0, 16);
  }
}

// Human-friendly local time + hour + tz abbreviation.
export function local(date, tz) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(date));
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(date);
    const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short', hour: '2-digit' })
      .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || tz.split('/').pop();
    return { formatted, hour: isNaN(hour) ? 0 : hour, tzAbbr };
  } catch {
    return { formatted: date.toUTCString(), hour: date.getUTCHours(), tzAbbr: 'UTC' };
  }
}

export function fmtDur(ms) {
  if (ms == null || isNaN(ms)) return '\u2014';
  if (ms < 0) return 'Invalid (arrival before departure)';
  const mins = Math.round(ms / 60000), h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// First UTC instant matching a target local hour after a given time.
export function nextLocalHour(hour24, afterUTC, tz) {
  try {
    let day = utcToWall(afterUTC, tz).split('T')[0];
    for (let i = 0; i < 4; i++) {
      const cand = wallToUTC(`${day}T${String(hour24).padStart(2, '0')}:00`, tz);
      if (cand && cand.getTime() > afterUTC.getTime()) return cand;
      const d = new Date(day + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      day = d.toISOString().slice(0, 10);
    }
    return null;
  } catch {
    return null;
  }
}
