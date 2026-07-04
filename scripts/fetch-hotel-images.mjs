// One-off: pull a reusable pool of hotel-style CC photos (rooms, balconies,
// pools, lobbies, exteriors) from Wikimedia Commons into
// public/assets/hotel-stock/<n>.jpg and emit src/data/hotelImages.ts.
// Usage: node scripts/fetch-hotel-images.mjs
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUT_DIR = 'public/assets/hotel-stock';

/** One search query per pooled photo — variety across rooms/views/amenities. */
const QUERIES = [
  'luxury hotel room interior',
  'hotel bedroom king size bed',
  'hotel suite living area',
  'hotel room balcony mountain view',
  'hotel room balcony garden view',
  'resort swimming pool',
  'hotel infinity pool',
  'hotel lobby interior',
  'hotel bathroom luxury',
  'boutique hotel exterior',
  'resort villa exterior',
  'hotel restaurant dining area',
  'spa massage room resort',
  'wooden cabin interior fireplace',
  'hotel garden view terrace',
];

const UA = 'ElateTripsDev/1.0 (contact: dev@elatetrips.com)';

async function search(query) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    '&generator=search&gsrnamespace=6&gsrlimit=6' +
    `&gsrsearch=${encodeURIComponent(query)}` +
    '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=900';
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) return [];
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i) => i && /image\/(jpeg|png)/.test(i.mime) && i.width >= 600)
    .sort((a, b) => b.width - a.width)
    .map((i) => i.thumburl || i.url);
}

await mkdir(OUT_DIR, { recursive: true });
const files = [];

for (let idx = 0; idx < QUERIES.length; idx++) {
  const query = QUERIES[idx];
  try {
    const urls = await search(query);
    let saved = false;
    for (const u of urls) {
      if (saved) break;
      try {
        const res = await fetch(u, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8_000) continue; // skip tiny/broken files
        const file = `stock-${idx + 1}.jpg`;
        await writeFile(path.join(OUT_DIR, file), buf);
        files.push(`/assets/hotel-stock/${file}`);
        saved = true;
      } catch {
        /* skip broken download */
      }
    }
    console.log(`${query}: ${saved ? 'ok' : 'FAILED'}`);
    await new Promise((r) => setTimeout(r, 300)); // be polite to the API
  } catch (e) {
    console.log(`${query}: FAILED ${e.message}`);
  }
}

const ts = `/**
 * Reusable pool of hotel-style stock photos (rooms, balconies, pools,
 * lobbies, exteriors), fetched from Wikimedia Commons (CC-licensed) by
 * scripts/fetch-hotel-images.mjs. Regenerate with:
 *   node scripts/fetch-hotel-images.mjs
 */
export const HOTEL_STOCK_IMAGES: string[] = ${JSON.stringify(files, null, 2)};
`;
await writeFile('src/data/hotelImages.ts', ts);
console.log(`\nSaved ${files.length} images`);
