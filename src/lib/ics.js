// ICS (calendar) export. VALARM TRIGGER:PT0M means the alarm fires at event time.

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildICS(events, tripName) {
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, ' ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jet Lag Lab//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(tripName)}`,
  ];
  events.forEach((e, i) => {
    const start = e.utc;
    const end = new Date(e.utc.getTime() + 15 * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:jetlag-${i}-${start.getTime()}@jetlaglab`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${esc(e.advice.icon + ' ' + e.advice.label)}`,
      `DESCRIPTION:${esc(e.phase + ' \u2014 ' + e.advice.instruction)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.advice.label)}`,
      'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
