import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  placesFromSearch,
  buildPlace,
  PICKUP_BBOX,
  type Place,
  type PhotonFeature,
} from '@/domain/photon';

interface PhotonResponse {
  features?: PhotonFeature[];
}

/**
 * RTK Query wrapper around the open-source Photon geocoder. Caching + request
 * de-duplication replace the original hand-rolled AbortController/debounce; the
 * UI debounces the query string before it reaches this slice.
 */
export const photonApi = createApi({
  reducerPath: 'photonApi',
  baseQuery: fetchBaseQuery({ baseUrl: 'https://photon.komoot.io' }),
  endpoints: (build) => ({
    searchPlaces: build.query<Place[], string>({
      query: (q) => `/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&bbox=${PICKUP_BBOX}`,
      transformResponse: (res: PhotonResponse) => placesFromSearch(res.features || []),
      keepUnusedDataFor: 120,
    }),
    reverseGeocode: build.query<Place | null, { lat: number; lon: number }>({
      query: ({ lat, lon }) => `/reverse?lat=${lat}&lon=${lon}&lang=en`,
      transformResponse: (res: PhotonResponse) => {
        const f = (res.features || [])[0];
        if (!f || (f.properties || {}).countrycode !== 'IN') return null;
        return buildPlace(f);
      },
    }),
  }),
});

export const { useSearchPlacesQuery, useLazyReverseGeocodeQuery } = photonApi;
