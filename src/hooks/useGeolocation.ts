import { useCallback } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { useLazyReverseGeocodeQuery } from '@/store/photonApi';
import { choosePickup, setGeoStatus } from '@/store/slices/transportSlice';

/**
 * "Use my location" flow: read the browser position, reverse-geocode it via
 * Photon, and write the resolved pickup into the transport slice. Mirrors the
 * original status states (locating/denied/unsupported/outside/error).
 */
export function useGeolocation() {
  const dispatch = useAppDispatch();
  const [reverse] = useLazyReverseGeocodeQuery();

  return useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      dispatch(setGeoStatus('unsupported'));
      return;
    }
    dispatch(setGeoStatus('locating'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const place = await reverse({ lat: latitude, lon: longitude }).unwrap();
          if (!place) {
            dispatch(setGeoStatus('outside'));
            return;
          }
          dispatch(
            choosePickup({ city: place.city, addr: place.addr, lat: latitude, lon: longitude }),
          );
        } catch {
          dispatch(setGeoStatus('error'));
        }
      },
      (err) => dispatch(setGeoStatus(err && err.code === 1 ? 'denied' : 'error')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [dispatch, reverse]);
}
