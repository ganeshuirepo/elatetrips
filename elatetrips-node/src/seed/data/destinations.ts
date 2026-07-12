/**
 * Places. `kind: 'destination'` unlocks the full app (trip builder + celebration
 * packages, experiences included); `kind: 'city'` shows local experiences only.
 */
export const destinations = [
  { id: 'ooty', name: 'Ooty', tag: 'Queen of the Nilgiris', icon: 'ti-mountain', kind: 'destination', on: true, lat: 11.4102, lon: 76.695 },
  { id: 'coorg', name: 'Coorg', tag: 'Scotland of India', icon: 'ti-trees', kind: 'destination', on: false, lat: 12.4244, lon: 75.7382 },
  { id: 'munnar', name: 'Munnar', tag: 'Tea-garden hills', icon: 'ti-leaf', kind: 'destination', on: false, lat: 10.0889, lon: 77.0595 },
  { id: 'goa', name: 'Goa', tag: 'Beaches & sunsets', icon: 'ti-beach', kind: 'destination', on: false, lat: 15.2993, lon: 74.124 },

  // Cities — local experiences only (metro & tier-2), rolling out now.
  { id: 'blr', name: 'Bengaluru', tag: 'Garden city weekends', icon: 'ti-building-skyscraper', kind: 'city', on: true, lat: 12.9716, lon: 77.5946 },
  { id: 'hyd', name: 'Hyderabad', tag: 'City of pearls & biryani', icon: 'ti-building-castle', kind: 'city', on: true, lat: 17.385, lon: 78.4867 },
  { id: 'chn', name: 'Chennai', tag: 'Marina mornings', icon: 'ti-beach', kind: 'city', on: true, lat: 13.0827, lon: 80.2707 },
  { id: 'cbe', name: 'Coimbatore', tag: 'Gateway to the ghats', icon: 'ti-mountain', kind: 'city', on: true, lat: 11.0168, lon: 76.9558 },
];
