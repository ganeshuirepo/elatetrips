import Icon from '@/components/ui/Icon';

/** Informational note — a dedicated local guide is included on every trip. */
export default function LocalGuideNote() {
  return (
    <div
      className="border-line flex items-start gap-3 rounded-[14px] border p-4"
      style={{ background: 'color-mix(in srgb, var(--primary) 5%, #fff)' }}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[18px]"
        style={{ background: 'var(--primary)', color: '#fff' }}
      >
        <Icon name="map-search" />
      </span>
      <div className="flex flex-col">
        <span className="text-ink text-[13.5px] font-extrabold">A local guide is included</span>
        <span className="text-muted text-[12.5px]">
          Every trip comes with a dedicated local guide who plans your itinerary and coordinates
          with hotels, event managers and partners — no selection needed.
        </span>
      </div>
    </div>
  );
}
