/**
 * Reusable pool of hotel-style stock photos (rooms, balconies, pools,
 * lobbies, exteriors), fetched from Wikimedia Commons (CC-licensed) by
 * scripts/fetch-hotel-images.mjs. Regenerate with:
 *   node scripts/fetch-hotel-images.mjs
 */
export const HOTEL_STOCK_IMAGES: string[] = [
  "/assets/hotel-stock/stock-1.jpg",
  "/assets/hotel-stock/stock-2.jpg",
  "/assets/hotel-stock/stock-3.jpg",
  "/assets/hotel-stock/stock-4.jpg",
  "/assets/hotel-stock/stock-5.jpg",
  "/assets/hotel-stock/stock-6.jpg",
  "/assets/hotel-stock/stock-7.jpg",
  "/assets/hotel-stock/stock-8.jpg",
  "/assets/hotel-stock/stock-9.jpg",
  "/assets/hotel-stock/stock-10.jpg",
  "/assets/hotel-stock/stock-11.jpg",
  "/assets/hotel-stock/stock-12.jpg",
  "/assets/hotel-stock/stock-14.jpg",
  "/assets/hotel-stock/stock-15.jpg"
];

/**
 * A stable, hotel-specific slice of the shared stock pool — different hotels
 * get a different rotation (seeded by id) so listings don't all look
 * identical, while the same hotel always shows the same photos.
 */
export function hotelImagesFor(hotelId: string, count: number): string[] {
  const seed = [...hotelId].reduce((s, c) => s + c.charCodeAt(0), 0);
  const n = HOTEL_STOCK_IMAGES.length;
  return Array.from({ length: Math.min(count, n) }, (_, i) => HOTEL_STOCK_IMAGES[(seed + i) % n]);
}
