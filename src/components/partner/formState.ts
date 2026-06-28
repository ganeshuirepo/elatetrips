import type { PartnerEoiBody } from '@/store/elateApi';
import { SERVICES } from './data';

/** Per-service editable state in the form. */
export interface ServiceState {
  on: boolean;
  packages: string[];
  packageOther: string;
  fulfilment: string;
  leadTime: string;
  priceRange: string;
  capacityPerDay: string;
  notes: string;
}

export interface PartnerForm {
  property: {
    hotelName: string;
    city: string;
    category: string;
    totalRooms: string;
    contactName: string;
    role: string;
    email: string;
    phone: string;
  };
  surprise: { capable: string; setupWindow: string; photoProof: string };
  inventory: {
    updateMethod: string;
    channelManagerOrPMS: string;
    updateFrequency: string;
    liveAvailability: string;
    roomsAllocated: string;
    rateModel: string;
    confirmationSLA: string;
  };
  notes: string;
  consent: boolean;
  services: Record<string, ServiceState>;
}

const emptyService = (): ServiceState => ({
  on: false,
  packages: [],
  packageOther: '',
  fulfilment: '',
  leadTime: '',
  priceRange: '',
  capacityPerDay: '',
  notes: '',
});

export const initialForm = (): PartnerForm => ({
  property: {
    hotelName: '',
    city: 'Ooty',
    category: '',
    totalRooms: '',
    contactName: '',
    role: '',
    email: '',
    phone: '',
  },
  surprise: { capable: '', setupWindow: '', photoProof: '' },
  inventory: {
    updateMethod: '',
    channelManagerOrPMS: '',
    updateFrequency: '',
    liveAvailability: '',
    roomsAllocated: '',
    rateModel: '',
    confirmationSLA: '',
  },
  notes: '',
  consent: false,
  services: Object.fromEntries(SERVICES.map((s) => [s.key, emptyService()])),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keys of the mandatory (asterisked) fields, used for errors + progress. */
export type RequiredKey =
  | 'hotelName'
  | 'contactName'
  | 'email'
  | 'phone'
  | 'capable'
  | 'updateMethod'
  | 'consent';

/** Returns the set of required keys that are still missing/invalid. */
export function missingRequired(f: PartnerForm): Set<RequiredKey> {
  const miss = new Set<RequiredKey>();
  if (!f.property.hotelName.trim()) miss.add('hotelName');
  if (!f.property.contactName.trim()) miss.add('contactName');
  if (!f.property.email.trim() || !EMAIL_RE.test(f.property.email.trim())) miss.add('email');
  if (!f.property.phone.trim()) miss.add('phone');
  if (!f.surprise.capable) miss.add('capable');
  if (!f.inventory.updateMethod) miss.add('updateMethod');
  if (!f.consent) miss.add('consent');
  return miss;
}

const REQUIRED_TOTAL = 7;

/** 0–100 completion of the mandatory fields, for the progress bar. */
export function progressPct(f: PartnerForm): number {
  return Math.round(((REQUIRED_TOTAL - missingRequired(f).size) / REQUIRED_TOTAL) * 100);
}

/** Build the API payload from form state (only interested services included). */
export function toPayload(f: PartnerForm): PartnerEoiBody {
  const services = SERVICES.filter((s) => f.services[s.key].on).map((s) => {
    const st = f.services[s.key];
    const packages = s.packages
      ? [
          ...st.packages.filter((p) => p !== '__other__'),
          ...(st.packageOther.trim() ? [st.packageOther.trim()] : []),
        ]
      : undefined;
    return {
      service: s.key,
      ...(packages ? { packages } : {}),
      fulfilment: st.fulfilment,
      leadTime: st.leadTime,
      priceRange: st.priceRange,
      capacityPerDay: st.capacityPerDay,
      notes: st.notes,
    };
  });

  return {
    property: { ...f.property },
    services,
    surprise: { ...f.surprise },
    inventory: { ...f.inventory },
    notes: f.notes,
    consent: true,
  };
}
