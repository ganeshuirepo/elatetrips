'use client';

import { useRef } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setPickupQuery, choosePickup, clearPickup } from '@/store/slices/transportSlice';
import { openOnly, setPopover } from '@/store/slices/uiSlice';
import { useSearchPlacesQuery } from '@/store/photonApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import Icon from '@/components/ui/Icon';

const GEO_MSG: Record<string, string> = {
  denied: 'Location access was blocked. Allow it in your browser, or search above.',
  unsupported: 'Your browser can’t share location — please search above.',
  outside: 'You appear to be outside India. Please search your pickup city above.',
  error: 'Couldn’t fetch your location. Please try again or search above.',
};

/** Pickup-location search (Photon) + "use my location". Complete-trip only. */
export default function PickupSearch() {
  const dispatch = useAppDispatch();
  const { pickupQuery, pickupAddr, geoStatus } = useAppSelector((s) => s.transport);
  const open = useAppSelector((s) => s.ui.pickupOpen);
  const ref = useRef<HTMLDivElement>(null);
  const locate = useGeolocation();
  useOutsideClick(ref, () => dispatch(setPopover({ key: 'pickupOpen', open: false })), open);

  const debounced = useDebounce(pickupQuery.trim(), 320);
  const canSearch = debounced.length >= 3;
  const { data: results = [], isFetching } = useSearchPlacesQuery(debounced, { skip: !canSearch });

  const chosen = !!pickupAddr.trim();

  return (
    <div data-pickup ref={ref} className="flex flex-col gap-2">
      <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
        Pickup location
      </span>
      <div className="relative">
        <span className="text-muted pointer-events-none absolute top-1/2 left-[13px] -translate-y-1/2 text-[17px]">
          <Icon name="map-pin" />
        </span>
        <input
          value={pickupQuery}
          placeholder="Search your pickup city or address"
          onFocus={() => dispatch(openOnly('pickupOpen'))}
          onChange={(e) => {
            dispatch(setPickupQuery(e.target.value));
            dispatch(openOnly('pickupOpen'));
          }}
          className="text-ink w-full rounded-[12px] border-[1.5px] bg-white py-[11px] pr-[38px] pl-[40px] text-[14px] font-semibold outline-none"
          style={{ borderColor: chosen ? 'var(--primary)' : 'var(--line)' }}
        />
        {(pickupQuery || chosen) && (
          <button
            type="button"
            aria-label="Clear pickup"
            onClick={() => dispatch(clearPickup())}
            className="text-muted absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer border-none bg-transparent text-[17px]"
          >
            <Icon name="x" />
          </button>
        )}

        {open && (canSearch || results.length > 0) && (
          <div className="border-line absolute top-[calc(100%+8px)] right-0 left-0 z-20 rounded-[14px] border bg-white p-2 shadow-xl">
            {isFetching && <div className="text-muted px-3 py-2 text-[13px]">Searching…</div>}
            {!isFetching && results.length === 0 && (
              <div className="text-muted px-3 py-2 text-[13px]">No matches in India.</div>
            )}
            {results.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() =>
                  dispatch(
                    choosePickup({
                      city: r.city,
                      addr: r.addr,
                      lat: r.lat ?? null,
                      lon: r.lon ?? null,
                    }),
                  )
                }
                className="flex w-full items-start gap-[11px] rounded-[11px] border-none bg-transparent p-[10px] text-left"
              >
                <Icon name="map-pin" size={17} style={{ color: 'var(--primary)', marginTop: 2 }} />
                <span className="flex flex-col">
                  <span className="text-ink text-[13.5px] font-bold">{r.name}</span>
                  {r.sub && <span className="text-muted text-[12px]">{r.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outlined"
          size="small"
          onClick={locate}
          startIcon={<Icon name="current-location" size={16} />}
          disabled={geoStatus === 'locating'}
          sx={{
            color: 'var(--accent)',
            borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
            '&:hover': {
              borderColor: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            },
          }}
        >
          {geoStatus === 'locating' ? 'Locating…' : 'Use my location'}
        </Button>
        {GEO_MSG[geoStatus] && <span className="text-accent text-[12px]">{GEO_MSG[geoStatus]}</span>}
      </div>
    </div>
  );
}
