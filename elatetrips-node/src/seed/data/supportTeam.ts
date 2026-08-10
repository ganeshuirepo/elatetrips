import type { SupportStaff, SupportVendor } from '../../modules/support/support.types';

/**
 * Mock operations team behind the Elate Assistant (post-booking support plan
 * §3.3–3.4): remote Celebration Managers with no city — theirs is a
 * stable-connectivity desk role — and one local Operational Manager per live
 * destination, who owns every red ticket in their city.
 */
export const supportStaff: SupportStaff[] = [
  { id: 'cm-meera', name: 'Meera Nair', role: 'cm', phone: '9811100011', avatar: '👩🏽‍💼', shift: '8 am – 8 pm' },
  { id: 'cm-arjun', name: 'Arjun Rao', role: 'cm', phone: '9811100012', avatar: '👨🏽‍💼', shift: '8 pm – 8 am' },
  { id: 'om-ooty', name: 'Senthil Kumar', role: 'om', city: 'ooty', phone: '9822200021', avatar: '🧔🏽', shift: 'on call' },
  { id: 'om-coorg', name: 'Kaveri Gowda', role: 'om', city: 'coorg', phone: '9822200022', avatar: '👩🏽', shift: 'on call' },
  { id: 'om-munnar', name: 'Biju Thomas', role: 'om', city: 'munnar', phone: '9822200023', avatar: '👨🏽', shift: 'on call' },
  { id: 'om-goa', name: 'Perpetua D’Souza', role: 'om', city: 'goa', phone: '9822200024', avatar: '👩🏻', shift: 'on call' },
];

/**
 * The vendor network with the OM's tested backup bench: minimum primary + one
 * backup per category per city (§3.4). Ratings are the OM's field judgment.
 * Ooty carries the full bench (it is the live destination); the coming-soon
 * cities carry the categories their packages already reference.
 */
export const supportVendors: SupportVendor[] = [
  // Ooty — full bench
  { id: 'v-oo-dec1', name: 'Nilgiri Decor Studio', category: 'decor', city: 'ooty', rating: 4.7, phone: '9833300101', backup: false },
  { id: 'v-oo-dec2', name: 'Hillside Balloons & Blooms', category: 'decor', city: 'ooty', rating: 4.4, phone: '9833300102', backup: true },
  { id: 'v-oo-cake1', name: 'Modern Stores Bakery', category: 'cake', city: 'ooty', rating: 4.8, phone: '9833300103', backup: false },
  { id: 'v-oo-cake2', name: 'King Star Confectionery', category: 'cake', city: 'ooty', rating: 4.5, phone: '9833300104', backup: true },
  { id: 'v-oo-flo1', name: 'Ooty Rose Garden Florists', category: 'flowers', city: 'ooty', rating: 4.6, phone: '9833300105', backup: false },
  { id: 'v-oo-flo2', name: 'Botanical Blooms', category: 'flowers', city: 'ooty', rating: 4.3, phone: '9833300106', backup: true },
  { id: 'v-oo-pho1', name: 'Mist & Light Studio', category: 'photo', city: 'ooty', rating: 4.9, phone: '9833300107', backup: false },
  { id: 'v-oo-pho2', name: 'Frame the Hills', category: 'photo', city: 'ooty', rating: 4.4, phone: '9833300108', backup: true },
  { id: 'v-oo-cab1', name: 'Blue Mountain Cabs', category: 'cab', city: 'ooty', rating: 4.5, phone: '9833300109', backup: false },
  { id: 'v-oo-cab2', name: 'Nilgiri Rides', category: 'cab', city: 'ooty', rating: 4.2, phone: '9833300110', backup: true },
  { id: 'v-oo-exp1', name: 'Tea Trail Experiences', category: 'experience', city: 'ooty', rating: 4.7, phone: '9833300111', backup: false },
  // Coorg
  { id: 'v-co-dec1', name: 'Coorg Celebration Crafts', category: 'decor', city: 'coorg', rating: 4.6, phone: '9833300201', backup: false },
  { id: 'v-co-dec2', name: 'Estate Decor Co.', category: 'decor', city: 'coorg', rating: 4.3, phone: '9833300202', backup: true },
  { id: 'v-co-cake1', name: 'Madikeri Oven', category: 'cake', city: 'coorg', rating: 4.7, phone: '9833300203', backup: false },
  { id: 'v-co-flo1', name: 'Kaveri Florals', category: 'flowers', city: 'coorg', rating: 4.5, phone: '9833300204', backup: false },
  { id: 'v-co-pho1', name: 'Coffee Bloom Studio', category: 'photo', city: 'coorg', rating: 4.8, phone: '9833300205', backup: false },
  // Munnar
  { id: 'v-mu-dec1', name: 'High Range Decorators', category: 'decor', city: 'munnar', rating: 4.5, phone: '9833300301', backup: false },
  { id: 'v-mu-cake1', name: 'Tea County Bakes', category: 'cake', city: 'munnar', rating: 4.6, phone: '9833300302', backup: false },
  { id: 'v-mu-flo1', name: 'Valley Petals', category: 'flowers', city: 'munnar', rating: 4.4, phone: '9833300303', backup: false },
  { id: 'v-mu-pho1', name: 'Cloudline Frames', category: 'photo', city: 'munnar', rating: 4.7, phone: '9833300304', backup: false },
  // Goa
  { id: 'v-go-dec1', name: 'Susegad Setups', category: 'decor', city: 'goa', rating: 4.6, phone: '9833300401', backup: false },
  { id: 'v-go-dec2', name: 'Beachside Balloon Co.', category: 'decor', city: 'goa', rating: 4.2, phone: '9833300402', backup: true },
  { id: 'v-go-cake1', name: 'Panjim Patisserie', category: 'cake', city: 'goa', rating: 4.8, phone: '9833300403', backup: false },
  { id: 'v-go-flo1', name: 'Mandovi Flowers', category: 'flowers', city: 'goa', rating: 4.5, phone: '9833300404', backup: false },
  { id: 'v-go-pho1', name: 'Golden Hour Goa', category: 'photo', city: 'goa', rating: 4.9, phone: '9833300405', backup: false },
];
