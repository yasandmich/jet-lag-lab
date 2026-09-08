// Trip encoding for shareable links (compact JSON in URL hash) + localStorage.

export function blankLeg() {
  return {
    id: Math.random().toString(36).slice(2),
    dep: null, arr: null, depWall: '', arrWall: '',
    flightNo: '', depQ: '', arrQ: '', depOpen: false, arrOpen: false,
  };
}

export function encodeTrip(legs) {
  const slim = legs.map((l) => ({
    d: l.dep ? { c: l.dep.code, n: l.dep.name, ci: l.dep.city, co: l.dep.country, tz: l.dep.tz } : null,
    a: l.arr ? { c: l.arr.code, n: l.arr.name, ci: l.arr.city, co: l.arr.country, tz: l.arr.tz } : null,
    dw: l.depWall, aw: l.arrWall, f: l.flightNo || '',
  }));
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(slim))));
  } catch {
    return '';
  }
}

export function decodeTrip(str) {
  try {
    const slim = JSON.parse(decodeURIComponent(escape(atob(str))));
    return slim.map((s) => ({
      id: Math.random().toString(36).slice(2),
      dep: s.d ? { code: s.d.c, name: s.d.n, city: s.d.ci, country: s.d.co, tz: s.d.tz } : null,
      arr: s.a ? { code: s.a.c, name: s.a.n, city: s.a.ci, country: s.a.co, tz: s.a.tz } : null,
      depWall: s.dw || '', arrWall: s.aw || '', flightNo: s.f || '',
      depQ: '', arrQ: '', depOpen: false, arrOpen: false,
    }));
  } catch {
    return null;
  }
}
