// One-off: pull representative CC photos for every Ooty place from Wikimedia
// Commons into public/assets/places/<id>-N.jpg and emit src/data/placeImages.ts.
// Usage: node scripts/fetch-place-images.mjs
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUT_DIR = 'public/assets/places';
const PER_PLACE = 2;

/** Tuned Commons search queries per place id. */
const QUERIES = {
  'botanical-garden': 'Government Botanical Garden Ooty',
  'ooty-lake': 'Ooty Lake boathouse',
  'doddabetta-peak': 'Doddabetta peak Ooty',
  'toy-train': 'Nilgiri Mountain Railway train',
  'rose-garden': 'Government Rose Garden Ooty',
  'tea-factory-museum': 'tea processing machine factory',
  'st-stephens-church': "St Stephen's Church Ooty",
  'thread-garden': 'Thread Garden Ooty',
  'stone-house': 'Stone House Ooty',
  'deer-park': 'deer park Ooty',
  pykara: 'Pykara falls Ooty',
  'wenlock-downs': 'Wenlock Downs Ooty',
  'kamraj-sagar': 'Kamaraj Sagar Dam Ooty',
  'needle-view-point': 'mist valley viewpoint Western Ghats',
  'avalanche-lake': 'Avalanche Lake Nilgiris',
  'emerald-lake': 'Emerald Lake Nilgiris',
  'kalhatti-falls': 'Kalhatty falls',
  'toda-hamlet': 'Toda hut Nilgiris',
  mudumalai: 'Mudumalai National Park elephant',
  'sims-park': "Sim's Park Coonoor",
  'dolphins-nose-lambs-rock': "Dolphin's Nose Coonoor",
  'catherine-falls': 'Catherine Falls Kotagiri',
  'kodanad-viewpoint': 'Kodanad View Point',
  'elk-falls': 'waterfall Kotagiri Nilgiris',
  'longwood-shola': 'Longwood Shola Kotagiri',
  'john-sullivan-memorial': 'John Sullivan Ooty bungalow',
  'ketti-valley-viewpoint': 'Ketti valley Nilgiris',
  'highfield-tea-factory': 'tea estate Coonoor',
  'laws-falls': 'Law falls Coonoor',
  'droog-fort': 'tea estate hill fort Coonoor Nilgiris mountains',
  'wax-world': 'wax museum India',
  'tribal-museum': 'Toda people Nilgiris',
  'chocolate-museum': 'chocolate truffles fudge',
  'elk-hill-murugan': 'Murugan temple Ooty Elk Hill',
  'cairn-hill': 'shola forest Nilgiris',
  'charring-cross': 'Charring Cross Ooty',
  glenmorgan: 'Glenmorgan Nilgiris',
  'mukurthi-np': 'Mukurthi National Park',
};

const UA = 'ElateTripsDev/1.0 (contact: dev@elatetrips.com)';

async function search(query) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    '&generator=search&gsrnamespace=6&gsrlimit=6' +
    `&gsrsearch=${encodeURIComponent(query)}` +
    '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800';
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) return [];
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i) => i && /image\/(jpeg|png)/.test(i.mime) && i.width >= 500)
    .sort((a, b) => b.width - a.width)
    .map((i) => i.thumburl || i.url);
}

await mkdir(OUT_DIR, { recursive: true });
const manifest = {};

for (const [id, query] of Object.entries(QUERIES)) {
  try {
    const urls = await search(query);
    const saved = [];
    for (const u of urls) {
      if (saved.length >= PER_PLACE) break;
      try {
        const res = await fetch(u, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8_000) continue; // skip tiny/broken files
        const file = `${id}-${saved.length + 1}.jpg`;
        await writeFile(path.join(OUT_DIR, file), buf);
        saved.push(`/assets/places/${file}`);
      } catch {
        /* skip broken download */
      }
    }
    if (saved.length) manifest[id] = saved;
    console.log(`${id}: ${saved.length} image(s)`);
    await new Promise((r) => setTimeout(r, 300)); // be polite to the API
  } catch (e) {
    console.log(`${id}: FAILED ${e.message}`);
  }
}

const ts = `/**
 * Photos for the Ooty places, fetched from Wikimedia Commons (CC-licensed)
 * by scripts/fetch-place-images.mjs. Regenerate with:
 *   node scripts/fetch-place-images.mjs
 */
export const PLACE_IMAGES: Record<string, string[]> = ${JSON.stringify(manifest, null, 2)};
`;
await writeFile('src/data/placeImages.ts', ts);
console.log(`\nManifest: ${Object.keys(manifest).length} places with images`);
