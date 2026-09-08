import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AIRPORTS, TZ_CHOICES, searchAirports } from './data/airports.js';
import { tzOffsetHours, wallToUTC, local, fmtDur } from './lib/time.js';
import { blankLeg, encodeTrip, decodeTrip } from './lib/trip.js';
import { buildProtocol } from './lib/protocol.js';
import { buildICS, download } from './lib/ics.js';

// An example trip for quick demoing: Cape Town -> Johannesburg -> Seattle.
function exampleTrip() {
  const cpt = AIRPORTS.find((a) => a.code === 'CPT');
  const jnb = AIRPORTS.find((a) => a.code === 'JNB');
  const sea = AIRPORTS.find((a) => a.code === 'SEA');
  const day = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  const d2 = new Date(day.getTime() + 86400000);
  const dn = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
  return [
    { ...blankLeg(), dep: cpt, arr: jnb, depWall: `${d}T18:00`, arrWall: `${d}T20:05`, flightNo: 'SA330' },
    { ...blankLeg(), dep: jnb, arr: sea, depWall: `${d}T22:30`, arrWall: `${dn}T15:45`, flightNo: 'DL201' },
  ];
}

const PHASE_STYLE = {
  NIGHT: { background: '#312e81', color: '#e0e7ff' },
  MORNING: { background: '#fef3c7', color: '#78350f' },
  DAYTIME: { background: '#D9EAD3', color: '#14532d' },
  EVENING: { background: '#ffedd5', color: '#7c2d12' },
};

export default function App() {
  const [legs, setLegs] = useState([]);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState('');
  const bootstrapped = useRef(false);

  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); }, []);

  // Load from URL hash first, else localStorage.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    try {
      const hash = window.location.hash;
      if (hash.startsWith('#trip=')) {
        const decoded = decodeTrip(hash.slice(6));
        if (decoded && decoded.length) { setLegs(decoded); return; }
      }
      const saved = localStorage.getItem('jetlag-trip');
      if (saved) { const d = decodeTrip(saved); if (d) setLegs(d); }
    } catch {}
  }, []);

  // Autosave to localStorage.
  useEffect(() => {
    try {
      if (legs.length) localStorage.setItem('jetlag-trip', encodeTrip(legs));
      else localStorage.removeItem('jetlag-trip');
    } catch {}
  }, [legs]);

  const updateLeg = (id, patch) => setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLeg = (id) => setLegs((ls) => ls.filter((l) => l.id !== id));
  const addFirst = () => setLegs([blankLeg()]);
  const resetTrip = () => { setLegs([]); try { localStorage.removeItem('jetlag-trip'); history.replaceState(null, '', location.pathname); } catch {} flash('Trip reset'); };
  const loadExample = () => { setLegs(exampleTrip()); flash('Example trip loaded'); };
  const addLeg = () => {
    const last = legs[legs.length - 1];
    const dep = last?.arr || null;
    const depWall = last?.arrWall || '';
    setLegs((ls) => [...ls, { ...blankLeg(), dep, depWall, arrWall: '' }]);
  };

  // Per-leg UTC times + validity.
  const computed = useMemo(() => legs.map((l) => {
    if (!l.dep || !l.arr || !l.dep.tz || !l.arr.tz || !l.depWall || !l.arrWall)
      return { leg: l, utcDep: null, utcArr: null, durationMs: null, valid: false };
    const utcDep = wallToUTC(l.depWall, l.dep.tz);
    const utcArr = wallToUTC(l.arrWall, l.arr.tz);
    if (!utcDep || !utcArr) return { leg: l, utcDep, utcArr, durationMs: null, valid: false };
    const durationMs = utcArr.getTime() - utcDep.getTime();
    return { leg: l, utcDep, utcArr, durationMs, valid: durationMs > 0 };
  }), [legs, tick]);

  const layovers = useMemo(() => {
    const out = [];
    for (let i = 0; i < computed.length - 1; i++) {
      const a = computed[i], b = computed[i + 1];
      if (!a.valid || !b.valid) { out.push({ idx: i, ms: null, valid: false, airport: a.leg.arr }); continue; }
      const ms = b.utcDep.getTime() - a.utcArr.getTime();
      out.push({ idx: i, ms, valid: ms >= 0, airport: a.leg.arr });
    }
    return out;
  }, [computed]);

  const chainOK = useMemo(() => {
    const valids = computed.filter((c) => c.valid);
    for (let i = 1; i < valids.length; i++) {
      if (valids[i].utcDep.getTime() < valids[i - 1].utcArr.getTime()) return false;
    }
    return true;
  }, [computed]);

  const summary = useMemo(() => {
    const v = computed.filter((c) => c.valid && c.durationMs != null);
    if (!v.length) return null;
    const totalFlight = v.reduce((s, c) => s + (c.durationMs || 0), 0);
    const totalLayover = layovers.filter((l) => l.valid && l.ms != null).reduce((s, l) => s + (l.ms || 0), 0);
    const first = v[0], last = v[v.length - 1];
    const offOrigin = tzOffsetHours(first.leg.dep.tz, first.utcDep);
    const shift = tzOffsetHours(last.leg.arr.tz, last.utcArr) - offOrigin;
    return {
      totalFlight, totalLayover, stops: legs.length - 1, shift,
      origin: first.leg.dep, final: last.leg.arr,
      originAbbr: local(first.utcDep, first.leg.dep.tz).tzAbbr,
      finalAbbr: local(last.utcArr, last.leg.arr.tz).tzAbbr,
    };
  }, [computed, layovers, legs.length]);

  const protocol = useMemo(() => buildProtocol(computed), [computed]);

  const copyLink = () => {
    const url = `${location.origin}${location.pathname}#trip=${encodeTrip(legs)}`;
    (navigator.clipboard?.writeText(url) ?? Promise.reject())
      .then(() => flash('Shareable link copied \u2713'))
      .catch(() => { history.replaceState(null, '', `#trip=${encodeTrip(legs)}`); flash('Link set in address bar \u2014 copy it'); });
  };
  const copyText = () => {
    if (!protocol) return flash('Add flights first');
    const txt = protocol.map((e) => `${e.advice.icon} ${e.dest.formatted} (${summary?.final.city})\n${e.phase}\n\u2192 ${e.advice.instruction}\n`).join('\n');
    (navigator.clipboard?.writeText(txt) ?? Promise.reject())
      .then(() => flash('Plan copied as text \u2713')).catch(() => flash('Copy failed'));
  };
  const exportICS = () => {
    if (!protocol) return flash('Add flights first');
    download(`jetlag-${summary?.final.code || 'trip'}.ics`, buildICS(protocol, `Jet Lag Lab \u2014 ${summary?.final.city || 'Trip'}`), 'text/calendar');
    flash('Calendar file downloaded \u2713');
  };
  const printPlan = () => {
    if (!protocol) return flash('Add flights first');
    window.print();
  };

  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const BULLET = '\u2022';
  const ARROW = '\u2192';
  const DASH = '\u2014';

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <p className="label">Jet Lag Lab by Yas &amp; Mich {BULLET} Science-Backed</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', marginTop: 4 }}>Jet Lag Lab</h1>
          <p className="muted" style={{ fontSize: 12, marginTop: 8, maxWidth: '48ch', lineHeight: 1.6 }}>
            A science-backed protocol that anchors your body clock to your final destination {DASH} for any route, worldwide. Type IATA, city, or country. Wall times are interpreted in that airport&apos;s timezone.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, fontWeight: 500 }}>{today}</p>
          <p className="label" style={{ opacity: .5 }}>Worldwide</p>
        </div>
      </div>

      {legs.length === 0 ? (
        <div className="card no-print" style={{ textAlign: 'center', padding: '48px 24px', borderStyle: 'dashed' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--cream)', border: '1px solid var(--tan)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24 }}>{'\u2708\uFE0F'}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>No flights yet</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Add your first flight to generate your protocol. Multi-leg worldwide supported.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
            <button className="btn" style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: 'var(--ink)' }} onClick={addFirst}>+ Add First Flight</button>
            <button className="btn" onClick={loadExample}>Load example trip</button>
          </div>
        </div>
      ) : (
        <>
          {summary && (
            <div className="card summary-card" style={{ background: 'var(--ink)', color: 'var(--cream)', borderColor: 'var(--ink)', marginBottom: 24 }}>
              <span className="label" style={{ opacity: .6 }}>Journey Summary {BULLET} Final dest = {summary.final.city}</span>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="pill" style={{ background: 'var(--ink2)', border: '1px solid #3a3a3a', color: 'inherit' }}>{'\u2708\uFE0F'} Total flight: <b>{fmtDur(summary.totalFlight)}</b></span>
                <span className="pill" style={{ background: 'var(--ink2)', border: '1px solid #3a3a3a', color: 'inherit' }}>{'\u23F3'} Total layover: <b>{fmtDur(summary.totalLayover)}</b></span>
                <span className="pill" style={{ background: 'var(--ink2)', border: '1px solid #3a3a3a', color: 'inherit' }}>{'\uD83D\uDD01'} {summary.stops} stop{summary.stops !== 1 ? 's' : ''}</span>
                <span className="pill ok" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                  {summary.shift > 0 ? '+' : ''}{summary.shift.toFixed(1)}h {summary.shift > 0 ? 'eastward' : summary.shift < 0 ? 'westward' : 'same'} {BULLET} {summary.origin.code} {summary.originAbbr} {ARROW} {summary.final.code} {summary.finalAbbr}
                </span>
              </div>
            </div>
          )}

          <div className="space no-print" style={{ marginBottom: 16 }}>
            {legs.map((leg, i) => (
              <LegCard key={leg.id} leg={leg} index={i} comp={computed[i]} layover={layovers[i]} onUpdate={updateLeg} onRemove={removeLeg} />
            ))}
          </div>

          <div className="row no-print" style={{ marginBottom: 16 }}>
            <button className="btn" onClick={addLeg}>+ Add Leg</button>
            <button className="btn btn-dark" onClick={() => setTick((t) => t + 1)}>GENERATE PROTOCOL</button>
            <button className="btn" onClick={copyLink}>{'\uD83D\uDD17'} Copy shareable link</button>
            <button className="btn" onClick={copyText}>{'\uD83D\uDCCB'} Copy plan as text</button>
            <button className="btn" onClick={exportICS}>{'\uD83D\uDCC5'} Add to calendar (.ics)</button>
            <button className="btn" onClick={printPlan}>{'\uD83D\uDDA8\uFE0F'} Print / Save as PDF</button>
            <button className="btn" onClick={resetTrip}>Reset trip</button>
          </div>

          {!chainOK && (
            <div className="card warn no-print" style={{ marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
              {'\u26A0\uFE0F'} Your legs are out of order {DASH} a later flight departs before an earlier one lands. Check your wall times.
            </div>
          )}
        </>
      )}

      <ProtocolList protocol={protocol} summary={summary} legs={legs} />

      <p style={{ fontSize: 10, opacity: .4, marginTop: 40, textAlign: 'center' }}>
        Jet Lag Lab by Yas &amp; Mich {BULLET} Destination-time anchored {BULLET} Informational only, not medical advice.
      </p>

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );
}

function AirportPicker({ leg, side, onUpdate }) {
  const isDep = side === 'dep';
  const q = isDep ? leg.depQ : leg.arrQ;
  const open = isDep ? leg.depOpen : leg.arrOpen;
  const chosen = isDep ? leg.dep : leg.arr;
  const wall = isDep ? leg.depWall : leg.arrWall;
  const boxRef = useRef(null);
  const results = useMemo(() => searchAirports(q), [q]);
  const BULLET = '\u2022';
  const MIDDOT = '\u00B7';
  const ARROW = '\u2192';
  const DASH = '\u2014';

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) onUpdate(leg.id, isDep ? { depOpen: false } : { arrOpen: false }); }
    function onEsc(e) { if (e.key === 'Escape') onUpdate(leg.id, isDep ? { depOpen: false } : { arrOpen: false }); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [leg.id, isDep]);

  const pick = (a) => {
    if (a.needsTz) {
      onUpdate(leg.id, isDep ? { dep: { ...a, tz: null }, depQ: a.city, depOpen: false } : { arr: { ...a, tz: null }, arrQ: a.city, arrOpen: false });
    } else {
      onUpdate(leg.id, isDep ? { dep: a, depQ: '', depOpen: false } : { arr: a, arrQ: '', arrOpen: false });
    }
  };
  const setTz = (tz) => onUpdate(leg.id, isDep ? { dep: { ...leg.dep, tz } } : { arr: { ...leg.arr, tz } });

  return (
    <div className="field">
      <label className="label">{isDep ? 'Departure' : 'Arrival'} {BULLET} Wall time in airport tz</label>
      <div style={{ position: 'relative', marginTop: 8 }} ref={boxRef}>
        <input className="txt" value={q}
          onChange={(e) => onUpdate(leg.id, isDep ? { depQ: e.target.value, depOpen: true } : { arrQ: e.target.value, arrOpen: true })}
          onFocus={() => onUpdate(leg.id, isDep ? { depOpen: true } : { arrOpen: true })}
          placeholder={isDep ? 'CPT, Cape Town, Heathrow...' : 'SEA, Seattle, JFK...'} />
        {open && results.length > 0 && (
          <div className="dropdown">
            {results.map((a) => (
              <div key={a.code + a.city} className="opt" style={{ cursor: 'pointer' }} onClick={() => pick(a)}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{a.code} {MIDDOT} {a.city}</p>
                  <p className="muted" style={{ fontSize: 11, margin: 0 }}>{a.name}, {a.country}</p>
                </div>
                <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>{a.needsTz ? 'pick tz' : a.tz.split('/').pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {chosen && (
        <div className="pill" style={{ marginTop: 8, background: '#fff' }}>
          <b>{chosen.code}</b> {MIDDOT} {chosen.city}{chosen.tz ? ` ${BULLET} ${local(new Date(), chosen.tz).tzAbbr}` : ''}
        </div>
      )}

      {chosen && !chosen.tz && (
        <div className="field warn" style={{ marginTop: 8, padding: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 6px' }}>{'\u26A0\uFE0F'} Custom airport {DASH} choose its timezone (advice is wrong without it):</p>
          <select className="txt" value="" onChange={(e) => e.target.value && setTz(e.target.value)}>
            <option value="">Select timezone{'\u2026'}</option>
            {TZ_CHOICES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      )}

      <input type="datetime-local" className="txt" style={{ marginTop: 8 }} value={wall}
        onChange={(e) => onUpdate(leg.id, isDep ? { depWall: e.target.value } : { arrWall: e.target.value })} />
      <p className="muted" style={{ fontSize: 10, marginTop: 4 }}>
        Entered as wall time in {chosen?.tz || 'airport tz'} {ARROW} UTC {wall && chosen?.tz ? (wallToUTC(wall, chosen.tz)?.toISOString().slice(11, 16) + 'Z' || DASH) : DASH}
      </p>
    </div>
  );
}

function LegCard({ leg, index, comp, layover, onUpdate, onRemove }) {
  const BULLET = '\u2022';
  const ARROW = '\u2192';
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <p className="label">Leg {index + 1} {BULLET} {leg.dep?.code || 'DEP'} {ARROW} {leg.arr?.code || 'ARR'}</p>
        <div className="row">
          <input className="txt" style={{ width: 150, padding: '6px 12px', borderRadius: 9999, background: 'var(--cream)' }}
            value={leg.flightNo} onChange={(e) => onUpdate(leg.id, { flightNo: e.target.value })} placeholder="Flight no e.g. SA203" />
          <button className="btn btn-dark" style={{ padding: '6px 12px' }} onClick={() => onRemove(leg.id)}>Remove</button>
        </div>
      </div>

      <div className="grid2">
        <AirportPicker leg={leg} side="dep" onUpdate={onUpdate} />
        <AirportPicker leg={leg} side="arr" onUpdate={onUpdate} />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {comp?.durationMs != null && (
          <span className={'pill ' + (comp.valid ? 'ok' : 'warn')} style={{ fontWeight: 700 }}>
            {comp.valid ? `\u2708\uFE0F ${fmtDur(comp.durationMs)} flight time` : `\u26A0\uFE0F ${fmtDur(comp.durationMs)} \u2014 check times`}
          </span>
        )}
        {comp?.utcDep && comp?.utcArr && (
          <span className="pill">UTC {comp.utcDep.toISOString().slice(0, 16).replace('T', ' ')}Z {ARROW} {comp.utcArr.toISOString().slice(0, 16).replace('T', ' ')}Z</span>
        )}
      </div>

      {layover && layover.ms != null && (
        <div className="field" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, background: '#FFF8E1' }}>
          <span>{'\uD83D\uDD04'}</span>
          <span style={{ fontWeight: layover.valid ? 600 : 700, color: layover.valid ? 'inherit' : '#b91c1c' }}>
            {fmtDur(layover.ms)} layover at {layover.airport?.code} {layover.airport?.city ? BULLET + ' ' + layover.airport.city : ''} {layover.valid ? '' : '(overlap!)'}
          </span>
        </div>
      )}
    </div>
  );
}

function ProtocolCard({ e, summary }) {
  const BULLET = '\u2022';
  const DASH = '\u2014';
  return (
    <div className="card protocol-card">
      <div className="row" style={{ gap: 8 }}>
        <span style={{ fontSize: 14 }}>{e.advice.icon}</span>
        <p className="label">{e.phase}</p>
        <span className="pill" style={{ fontSize: 10, fontWeight: 700, ...e.advice.style }}>{e.advice.label}</span>
        {e.phaseOfDay && (
          <span className="pill phase-chip" style={{ fontSize: 10, fontWeight: 700, ...(PHASE_STYLE[e.phaseOfDay] || {}) }}>
            {e.phaseOfDay} in {summary?.final.city}
          </span>
        )}
      </div>
      <div className="row pill-row" style={{ marginTop: 12 }}>
        <span className="pill">{e.loc.code} {BULLET} {e.loc.city} local: {e.local.formatted} {BULLET} {e.local.tzAbbr}</span>
        <span className="pill" style={{ background: 'var(--ink)', color: 'var(--cream)', fontWeight: 700, borderColor: 'var(--ink)' }}>
          FINAL {BULLET} {summary?.final.city}: {e.dest.formatted} {BULLET} {e.dest.tzAbbr}
        </span>
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, marginTop: 12, lineHeight: 1.4 }}>{e.advice.instruction}</p>
      <details className="why" style={{ marginTop: 12 }}>
        <summary className="row" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .7 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ink)', color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>i</span>
          Why this works {DASH} science
        </summary>
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: .8, marginTop: 12 }}>{e.advice.why}</p>
      </details>
    </div>
  );
}

function ProtocolList({ protocol, summary, legs }) {
  const DASH = '\u2014';
  const ARROW = '\u2192';
  const BULLET = '\u2022';
  if (!protocol) {
    return (
      <div className="card" style={{ fontSize: 13 }}>
        <p className="muted">Enter airports and wall times (local to each airport) to generate your protocol. Search IATA, city, or country worldwide {DASH} custom airports supported (assign a timezone).</p>
      </div>
    );
  }

  // Group events by leg so long multi-leg trips scan more easily.
  const groups = [];
  protocol.forEach((e) => {
    const li = e.legIndex ?? 0;
    let g = groups.find((x) => x.legIndex === li);
    if (!g) { g = { legIndex: li, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  groups.sort((a, b) => a.legIndex - b.legIndex);

  return (
    <div className="space protocol-list">
      {groups.map((g) => {
        const leg = legs[g.legIndex];
        const dep = leg?.dep?.code || 'DEP';
        const arr = leg?.arr?.code || 'ARR';
        const fn = leg?.flightNo ? ` ${BULLET} ${leg.flightNo}` : '';
        return (
          <div key={g.legIndex} className="leg-group">
            <div className="leg-divider">
              <span className="leg-divider-label">Leg {g.legIndex + 1} {BULLET} {dep} {ARROW} {arr}{fn}</span>
            </div>
            <div className="space">
              {g.items.map((e) => <ProtocolCard key={e.id} e={e} summary={summary} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
