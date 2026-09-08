// Destination-anchored protocol engine.
// Builds a timeline of events anchored to the FINAL destination clock and
// attaches circadian advice to each event.

import { wallToUTC, utcToWall, local, nextLocalHour } from './time.js';

// Colour styles reused across advice categories.
export const STYLES = {
  dark: { background: '#1a1a1a', color: '#FFF9E6', borderColor: '#1a1a1a' },
  indigo: { background: '#e0e7ff', color: '#312e81', borderColor: '#c7d2fe' },
  amber: { background: '#fef3c7', color: '#78350f', borderColor: '#fde68a' },
  sage: { background: '#D9EAD3', color: '#14532d', borderColor: '#bbf7d0' },
  orange: { background: '#ffedd5', color: '#7c2d12', borderColor: '#fed7aa' },
};

function advise(hour, kind, city, dest, loc, locAirport, anchorLabel) {
  const note = anchorLabel ? ` It's ${anchorLabel} in ${city}.` : '';

  if (kind === 'melatonin')
    return {
      label: 'MELATONIN WINDOW', style: STYLES.indigo, icon: '\uD83D\uDC8A',
      instruction: `It's ${dest.formatted} in ${city} (${dest.tzAbbr}) \u2014 about 1.5h before your first bedtime. If you use melatonin (0.5\u20133mg), now is the physiologically optimal time. Dim lights, no screens.`,
      why: 'Low-dose melatonin taken ~1.5\u20132h before target bedtime advances the body clock. Timing matters more than dose \u2014 taken at the wrong circadian phase it can shift you the wrong way. Pair with dim light for maximum effect.',
    };

  if (kind === 'bedtime')
    return {
      label: 'BEDTIME \u2022 FIRST EVENING', style: STYLES.dark, icon: '\uD83C\uDF19',
      instruction: `It's ${dest.formatted} \u2014 your first bedtime in ${city} (${dest.tzAbbr}).${note} Local time at ${locAirport.code} is ${loc.formatted} (${loc.tzAbbr}). Dim lights, no screens, light stretch, eye mask + earplugs. Aim for 7\u20138h aligned to ${city}.`,
      why: 'Your first night anchors the new rhythm. Dimming 2h before bed lets melatonin rise naturally. Keeping this bedtime \u2014 even if not sleepy \u2014 speeds entrainment. A light dinner and a cool room help initiate sleep.',
    };

  if (kind === 'arrival-plus') {
    if (hour >= 23 || hour < 5)
      return {
        label: 'ARRIVAL +2H \u2022 DARK', style: STYLES.indigo, icon: '\uD83C\uDFE8',
        instruction: `It's ${dest.formatted} \u2014 NIGHT in ${city} (${dest.tzAbbr}). You landed 2h ago at ${locAirport.code} \u2022 ${locAirport.city} (${loc.formatted}). Stay dark, no big meal, hydrate, eye mask. Let ${city} night do the work.`,
        why: 'The first 2h after landing are critical. Bright light at the wrong circadian phase delays adaptation. Staying dark when your final clock says night preserves melatonin and lets your master clock lock to the new time.',
      };
    if (hour >= 5 && hour < 10)
      return {
        label: 'ARRIVAL +2H \u2022 LIGHT', style: STYLES.amber, icon: '\uD83C\uDFE8',
        instruction: `It's ${dest.formatted} \u2014 MORNING in ${city} (${dest.tzAbbr}). You're at ${locAirport.code} \u2022 ${locAirport.city} (${loc.formatted}). Get outside, bright light, walk 20 min, protein + water. Anchor morning now.`,
        why: 'Light within 2h of arrival is the strongest zeitgeber. 10,000 lux for 20 min can shift the clock ~1.5h. Morning cortisol plus light anchors wakefulness.',
      };
  }

  if (hour >= 23 || hour < 5) {
    if (kind === 'boarding')
      return {
        label: 'SLEEP \u2022 BOARD DARK', style: STYLES.indigo, icon: '\uD83D\uDE34',
        instruction: `It's ${dest.formatted} \u2014 NIGHT in ${city} (${dest.tzAbbr}).${note} You're boarding at ${locAirport.code} \u2022 ${locAirport.city} where it's ${loc.formatted} (${loc.tzAbbr}), but your final clock says sleep. Board dark: sunglasses in terminal, no caffeine, water only, eye mask ready.`,
        why: 'Night is melatonin-high. Blue light at the wrong time shifts you the wrong way and can extend jet lag 24\u201348h. Even 30 lux suppresses melatonin ~50%. Boarding dark preserves the melatonin rise.',
      };
    const inAir = kind === 'midflight' || kind === 'mid-anchor' || kind === 'takeoff';
    if (inAir)
      return {
        label: 'DARK REST', style: STYLES.indigo, icon: '\u2708\uFE0F',
        instruction: `It's ${dest.formatted} \u2014 NIGHT in ${city} (${dest.tzAbbr}).${note} You're at ${locAirport.code} \u2022 ${locAirport.city} where it's ${loc.formatted} (${loc.tzAbbr}), but final clock says sleep. Stay dark, no screens, water only, eye mask.`,
        why: 'Protecting this window is critical. Melatonin peaks at night; light or food now anchors you to the old time.',
      };
    return {
      label: 'SLEEP \u2022 FAST', style: STYLES.indigo, icon: '\uD83D\uDE34',
      instruction: `It's ${dest.formatted} \u2014 NIGHT in ${city} (${dest.tzAbbr}).${note} You're at ${locAirport.code} \u2022 ${locAirport.city} where it's ${loc.formatted} (${loc.tzAbbr}), but final clock says sleep. Eye mask on, no meals, no bright screens. Fast until ${city} breakfast.`,
      why: 'Fasting prevents your gut clock anchoring to the wrong time \u2014 time-restricted feeding shifts peripheral clocks within a day. Night fasting lets melatonin do its work.',
    };
  }
  if (hour >= 5 && hour < 10)
    return {
      label: 'LIGHT + PROTEIN', style: STYLES.amber, icon: '\u2600\uFE0F',
      instruction: `It's ${dest.formatted} \u2014 MORNING in ${city} (${dest.tzAbbr}).${note} Locally at ${locAirport.code} it's ${loc.formatted} (${loc.tzAbbr}). Bright light on, walk, high-protein breakfast, hydrate.`,
      why: 'Morning light + protein advances the clock. Light is the strongest zeitgeber \u2014 10,000 lux for 20 min shifts ~1.5h. Protein provides tyrosine for alertness.',
    };
  if (hour >= 10 && hour < 18)
    return {
      label: 'WORK / LIGHT', style: STYLES.sage, icon: '\uD83C\uDF3F',
      instruction: `It's ${dest.formatted} \u2014 DAYTIME in ${city} (${dest.tzAbbr}).${note} At ${locAirport.code} it's ${loc.formatted} (${loc.tzAbbr}). Stay active on ${city} time, get daylight, light snack if hungry.`,
      why: 'Daytime light suppresses melatonin and signals "day." Movement reinforces wakefulness and speeds entrainment.',
    };
  return {
    label: kind === 'landing' ? 'LIGHT DINNER' : 'WIND DOWN', style: STYLES.orange,
    icon: kind === 'landing' ? '\uD83C\uDF7D\uFE0F' : '\uD83C\uDF19',
    instruction: `It's ${dest.formatted} \u2014 EVENING in ${city} (${dest.tzAbbr}).${note} Local ${locAirport.code}: ${loc.formatted} (${loc.tzAbbr}). Light dinner, dim lights after 8pm final time.`,
    why: 'A light, early dinner avoids a late insulin spike before sleep. Dimming lets melatonin rise naturally.',
  };
}

export function buildProtocol(computed, melatonin) {
  const legs = computed.filter((c) => c.valid && c.utcDep && c.utcArr && c.leg.dep && c.leg.arr);
  if (!legs.length) return null;

  const finalArr = legs[legs.length - 1].leg.arr;
  const tz = finalArr.tz;
  const city = finalArr.city;

  const anchors = [
    { h: 22, desc: 'bedtime' }, { h: 23, desc: 'sleep time' },
    { h: 6, desc: 'breakfast time' }, { h: 18, desc: 'dinner time' },
  ];

  function daySpan(startUTC, endUTC) {
    const days = new Set();
    for (let t = startUTC.getTime() - 129600000; t <= endUTC.getTime() + 129600000; t += 3600000) {
      const d = utcToWall(new Date(t), tz).split('T')[0];
      if (d) days.add(d);
    }
    return Array.from(days).sort();
  }

  function anchorsInFlight(startUTC, endUTC) {
    const found = [];
    for (const day of daySpan(startUTC, endUTC)) {
      for (const a of anchors) {
        const u = wallToUTC(`${day}T${String(a.h).padStart(2, '0')}:00`, tz);
        if (u && u.getTime() > startUTC.getTime() && u.getTime() < endUTC.getTime())
          found.push({ utc: u, anchor: a });
      }
    }
    const seen = new Set();
    const out = [];
    for (const f of found.sort((x, y) => x.utc - y.utc)) {
      if (!seen.has(f.utc.getTime())) { seen.add(f.utc.getTime()); out.push(f); }
    }
    return out;
  }

  const events = [];
  legs.forEach((c, i) => {
    const n = i + 1, O = c.leg.dep.code, U = c.leg.arr.code;
    const fn = c.leg.flightNo ? ` \u2022 ${c.leg.flightNo}` : '';
    events.push({ id: `boarding-${i}`, utc: new Date(c.utcDep.getTime() - 3600000), phase: `Boarding Leg ${n} \u2022 ${O} \u2192 ${U} \u2022 1h before takeoff${fn}`, loc: c.leg.dep, kind: 'boarding' });
    events.push({ id: `takeoff-${i}`, utc: new Date(c.utcDep.getTime()), phase: `Takeoff Leg ${n} \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'takeoff' });

    const mid = anchorsInFlight(c.utcDep, c.utcArr);
    if (mid.length) {
      mid.forEach((m, k) => events.push({ id: `mid-${i}-${k}`, utc: m.utc, phase: `Mid-flight Leg ${n} \u2022 It's ${m.anchor.desc} in ${city} \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'mid-anchor', anchorLabel: m.anchor.desc }));
    } else {
      events.push({ id: `mid-${i}`, utc: new Date(c.utcDep.getTime() + c.durationMs / 2), phase: `Mid-flight Leg ${n} \u2022 Halfway \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'midflight' });
    }
    events.push({ id: `landing-${i}`, utc: new Date(c.utcArr.getTime()), phase: `Landing Leg ${n} \u2022 ${U} \u2022 ${c.leg.arr.city}${fn}`, loc: c.leg.arr, kind: 'landing' });
  });

  const last = legs[legs.length - 1];
  events.push({ id: 'arrival-plus', utc: new Date(last.utcArr.getTime() + 7200000), phase: `Arrival +2h \u2022 ${last.leg.arr.code} \u2022 ${city} \u2022 Stay on final time`, loc: last.leg.arr, kind: 'arrival-plus' });

  const bed = nextLocalHour(22, last.utcArr, tz);
  if (bed) {
    if (melatonin) {
      events.push({ id: 'melatonin', utc: new Date(bed.getTime() - 5400000), phase: `Melatonin window \u2022 1.5h before ${city} bedtime`, loc: last.leg.arr, kind: 'melatonin', anchorLabel: 'melatonin' });
    }
    events.push({ id: 'bedtime', utc: bed, phase: `Bedtime \u2022 First evening in ${city} \u2022 22:00 ${city} time`, loc: last.leg.arr, kind: 'bedtime', anchorLabel: 'bedtime' });
  }

  events.sort((a, b) => a.utc - b.utc);
  return events.map((e) => {
    const dest = local(e.utc, tz);
    const loc = local(e.utc, e.loc.tz);
    return { ...e, dest, local: loc, advice: advise(dest.hour, e.kind, city, dest, loc, e.loc, e.anchorLabel) };
  });
}
