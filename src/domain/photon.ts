/** Pure helpers for shaping OpenStreetMap Photon geocoding responses. */

export interface PhotonFeature {
  properties?: Record<string, string | undefined>;
  geometry?: { coordinates?: number[] };
}

export interface Place {
  name: string;
  sub: string;
  city: string;
  addr: string;
  label: string;
  lat: number | undefined;
  lon: number | undefined;
}

/** Approx. mainland-India bounding box used to constrain searches. */
export const PICKUP_BBOX = '68.1,6.5,97.4,37.1';

/** Flatten a Photon feature into a display-ready place. */
export function buildPlace(f: PhotonFeature): Place {
  const p = f.properties || {};
  const g = (f.geometry && f.geometry.coordinates) || [];
  const name =
    p.name ||
    [p.housenumber, p.street].filter(Boolean).join(' ') ||
    p.city ||
    p.state ||
    'Location';
  const city = p.city || p.town || p.village || p.county || p.district || p.state || '';
  const parts: string[] = [];
  if (p.street && p.street !== name) parts.push(p.street);
  if (p.district && p.district !== city) parts.push(p.district);
  if (city) parts.push(city);
  if (p.state && p.state !== city) parts.push(p.state);
  if (p.postcode) parts.push(p.postcode);
  const sub = [...new Set(parts)].join(', ');
  const addr = [name, sub].filter(Boolean).join(', ');
  return { name, sub, city, addr, label: addr, lat: g[1], lon: g[0] };
}

/** De-duplicated, India-only place list (max 6) from a Photon search response. */
export function placesFromSearch(features: PhotonFeature[]): Place[] {
  const inIndia = features.filter((f) => (f.properties || {}).countrycode === 'IN');
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of inIndia) {
    const built = buildPlace(f);
    if (!built.addr || seen.has(built.label)) continue;
    seen.add(built.label);
    out.push(built);
    if (out.length >= 6) break;
  }
  return out;
}
