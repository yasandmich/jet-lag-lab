// Destination-anchored protocol engine.
// Builds a timeline of events anchored to the FINAL destination clock and
// attaches circadian advice to each event.
//
// NOTE: Advice is action-only. It deliberately does NOT restate the clock
// times, because the UI renders those as pills next to each card. This avoids
// duplicated information. Phase-of-day (NIGHT/MORNING/etc.) is returned as a
// separate `phaseOfDay` tag so the UI can show it as a small colored chip.

import { wallToUTC, utcToWall, local, nextLocalHour } from './time.js';

// Colour styles reused across advice categories.
export const STYLES = {
  dark: { background: '#1a1a1a', color: '#FFF9E6', borderColor: '#1a1a1a' },
  indigo: { background: '#e0e7ff', color: '#312e81', borderColor: '#c7d2fe' },
  amber: { background: '#fef3c7', color: '#78350f', borderColor: '#fde68a' },
  sage: { background: '#D9EAD3', color: '#14532d', borderColor: '#bbf7d0' },
  orange: { background: '#ffedd5', color: '#7c2d12', borderColor: '#fed7aa' },
};

function phaseOfDay(hour) {
  if (hour >= 23 || hour < 5) return 'NIGHT';
  if (hour >= 5 && hour < 10) return 'MORNING';
  if (hour >= 10 && hour < 18) return 'DAYTIME';
  return 'EVENING';
}

function advise(hour, kind, city) {
  if (kind === 'bedtime')
    return {
      label: 'BEDTIME \u2022 FIRST EVENING', style: STYLES.dark, icon: '\uD83C\uDF19',
      instruction: `Your first bedtime in ${city}. Dim lights, no screens, light stretch, eye mask + earplugs. Aim for 7\u20138h of sleep aligned to ${city} time.`,
      why: 'Your first night anchors the new rhythm. Dimming light for 2h before bed lets your body wind down naturally. Keeping this bedtime \u2014 even if you are not sleepy \u2014 speeds adaptation. A light dinner and a cool room help you fall asleep.',
    };

  if (kind === 'arrival-plus') {
    if (hour >= 23 || hour < 5)
      return {
        label: 'ARRIVAL +2H \u2022 STAY DARK', style: STYLES.indigo, icon: '\uD83C\uDFE8',
        instruction: `It is night in ${city}. Stay dark, avoid a big meal, hydrate, and use an eye mask. Let the destination night do the work.`,
        why: 'The first 2h after landing are critical. Bright light at the wrong circadian phase delays adaptation. Staying dark when your destination clock says night lets your master clock lock onto the new time.',
      };
    if (hour >= 5 && hour < 10)
      return {
        label: 'ARRIVAL +2H \u2022 GET LIGHT', style: STYLES.amber, icon: '\uD83C\uDFE8',
        instruction: `It is morning in ${city}. Get outside into bright light, walk for 20 min, and have protein + water. Anchor your morning now.`,
        why: 'Light within 2h of arrival is the strongest time cue. 10,000 lux for 20 min can shift the clock ~1.5h. Morning light plus a natural cortisol peak anchors wakefulness.',
      };
  }

  if (hour >= 23 || hour < 5) {
    if (kind === 'boarding')
      return {
        label: 'SLEEP \u2022 BOARD DARK', style: STYLES.indigo, icon: '\uD83D\uDE34',
        instruction: `It is night in ${city}, so board in "sleep mode": sunglasses in the terminal, no caffeine, water only, eye mask ready.`,
        why: 'At night your body expects darkness. Blue light at the wrong time shifts you the wrong way and can extend jet lag by 24\u201348h. Even 30 lux of light meaningfully disrupts night-time rest. Boarding dark protects your wind-down.',
      };
    const inAir = kind === 'midflight' || kind === 'mid-anchor' || kind === 'takeoff';
    if (inAir)
      return {
        label: 'DARK REST', style: STYLES.indigo, icon: '\u2708\uFE0F',
        instruction: `It is night in ${city}. Stay dark, no screens, water only, eye mask on \u2014 rest even if you can't fully sleep.`,
        why: 'Protecting this window is critical. At night your body expects rest; light or food now anchors you to the time zone you left.',
      };
    return {
      label: 'SLEEP \u2022 FAST', style: STYLES.indigo, icon: '\uD83D\uDE34',
      instruction: `It is night in ${city}. Eye mask on, no meals, no bright screens. Fast until breakfast time in ${city}.`,
      why: 'Fasting keeps your gut clock from anchoring to the wrong time \u2014 time-restricted eating shifts peripheral clocks within a day. Fasting overnight supports proper adaptation.',
    };
  }
  if (hour >= 5 && hour < 10)
    return {
      label: 'LIGHT + PROTEIN', style: STYLES.amber, icon: '\u2600\uFE0F',
      instruction: `It is morning in ${city}. Bright light on, walk, have a high-protein breakfast, and hydrate.`,
      why: 'Morning light plus protein advances the clock. Light is the strongest time cue \u2014 10,000 lux for 20 min shifts ~1.5h. Protein provides tyrosine for alertness.',
    };
  if (hour >= 10 && hour < 18)
    return {
      label: 'STAY ACTIVE', style: STYLES.sage, icon: '\uD83C\uDF3F',
      instruction: `It is daytime in ${city}. Stay active on ${city} time, get daylight, and have a light snack if hungry.`,
      why: 'Daytime light keeps you alert and signals "day" to your body. Movement reinforces wakefulness and speeds adaptation.',
    };
  return {
    label: kind === 'landing' ? 'LIGHT DINNER' : 'WIND DOWN', style: STYLES.orange,
    icon: kind === 'landing' ? '\uD83C\uDF7D\uFE0F' : '\uD83C\uDF19',
    instruction: `It is evening in ${city}. Have a light dinner and dim the lights after 8pm ${city} time.`,
    why: 'A light, early dinner avoids a late blood-sugar spike before sleep. Dimming lights lets your body begin winding down naturally.',
  };
}

export function buildProtocol(computed) {
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
    events.push({ id: `boarding-${i}`, legIndex: i, utc: new Date(c.utcDep.getTime() - 3600000), phase: `Boarding Leg ${n} \u2022 ${O} \u2192 ${U} \u2022 1h before takeoff${fn}`, loc: c.leg.dep, kind: 'boarding' });
    events.push({ id: `takeoff-${i}`, legIndex: i, utc: new Date(c.utcDep.getTime()), phase: `Takeoff Leg ${n} \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'takeoff' });

    const mid = anchorsInFlight(c.utcDep, c.utcArr);
    if (mid.length) {
      mid.forEach((m, k) => events.push({ id: `mid-${i}-${k}`, legIndex: i, utc: m.utc, phase: `Mid-flight Leg ${n} \u2022 It's ${m.anchor.desc} in ${city} \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'mid-anchor', anchorLabel: m.anchor.desc }));
    } else {
      events.push({ id: `mid-${i}`, legIndex: i, utc: new Date(c.utcDep.getTime() + c.durationMs / 2), phase: `Mid-flight Leg ${n} \u2022 Halfway \u2022 ${O} \u2192 ${U}${fn}`, loc: c.leg.dep, kind: 'midflight' });
    }
    events.push({ id: `landing-${i}`, legIndex: i, utc: new Date(c.utcArr.getTime()), phase: `Landing Leg ${n} \u2022 ${U} \u2022 ${c.leg.arr.city}${fn}`, loc: c.leg.arr, kind: 'landing' });
  });

  const last = legs[legs.length - 1];
  const lastLegIndex = legs.length - 1;
  events.push({ id: 'arrival-plus', legIndex: lastLegIndex, utc: new Date(last.utcArr.getTime() + 7200000), phase: `Arrival +2h \u2022 ${last.leg.arr.code} \u2022 ${city} \u2022 Stay on final time`, loc: last.leg.arr, kind: 'arrival-plus' });

  const bed = nextLocalHour(22, last.utcArr, tz);
  if (bed) {
    events.push({ id: 'bedtime', legIndex: lastLegIndex, utc: bed, phase: `Bedtime \u2022 First evening in ${city} \u2022 22:00 ${city} time`, loc: last.leg.arr, kind: 'bedtime', anchorLabel: 'bedtime' });
  }

  events.sort((a, b) => a.utc - b.utc);
  return events.map((e) => {
    const dest = local(e.utc, tz);
    const loc = local(e.utc, e.loc.tz);
    return { ...e, dest, local: loc, phaseOfDay: phaseOfDay(dest.hour), advice: advise(dest.hour, e.kind, city) };
  });
}
