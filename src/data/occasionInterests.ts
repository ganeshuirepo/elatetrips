/**
 * Configurable interest filters per occasion — shown in the popup that opens
 * when a celebration or escape tile is picked on the Plan step. Options are
 * custom placeholders for now; swap or extend per occasion as offerings grow.
 */

export interface OccasionInterest {
  id: string;
  label: string;
  icon: string;
}

export const OCCASION_INTERESTS: Record<string, OccasionInterest[]> = {
  birthday: [
    { id: 'cake', label: 'Cake & bakery', icon: 'ti-cake' },
    { id: 'decor', label: 'Balloon & room decor', icon: 'ti-balloon' },
    { id: 'photography', label: 'Photography', icon: 'ti-camera' },
    { id: 'dinner', label: 'Candlelight dinner', icon: 'ti-tools-kitchen-2' },
    { id: 'music', label: 'Live music', icon: 'ti-music' },
    { id: 'games', label: 'Party games', icon: 'ti-confetti' },
  ],
  anniversary: [
    { id: 'romantic-dinner', label: 'Romantic dinner', icon: 'ti-tools-kitchen-2' },
    { id: 'decor', label: 'Room decor', icon: 'ti-flower' },
    { id: 'couple-spa', label: 'Couple spa', icon: 'ti-massage' },
    { id: 'photoshoot', label: 'Couple photoshoot', icon: 'ti-camera' },
    { id: 'flowers-gifts', label: 'Flowers & gifts', icon: 'ti-gift' },
    { id: 'boat-ride', label: 'Private boat ride', icon: 'ti-sailboat' },
  ],
  honeymoon: [
    { id: 'decor', label: 'Honeymoon room decor', icon: 'ti-flower' },
    { id: 'dinner', label: 'Candlelight dinner', icon: 'ti-tools-kitchen-2' },
    { id: 'photoshoot', label: 'Couple photoshoot', icon: 'ti-camera' },
    { id: 'couple-spa', label: 'Couple spa', icon: 'ti-massage' },
    { id: 'private-tours', label: 'Private sightseeing', icon: 'ti-map-pin' },
  ],
  bachelor: [
    { id: 'party-night', label: 'Party night', icon: 'ti-confetti' },
    { id: 'bonfire', label: 'Bonfire & music', icon: 'ti-flame' },
    { id: 'adventure', label: 'Adventure dares', icon: 'ti-mountain' },
    { id: 'karaoke', label: 'Karaoke', icon: 'ti-microphone-2' },
    { id: 'game-night', label: 'Game night', icon: 'ti-cards' },
  ],
  teamouting: [
    { id: 'proposal-decor', label: 'Proposal setup & decor', icon: 'ti-diamond' },
    { id: 'photographer', label: 'Photographer on cue', icon: 'ti-camera' },
    { id: 'viewpoint-dinner', label: 'Private viewpoint dinner', icon: 'ti-tools-kitchen-2' },
    { id: 'flowers', label: 'Flowers & ring styling', icon: 'ti-flower' },
    { id: 'music', label: 'Violinist / live music', icon: 'ti-music' },
  ],
  group: [
    { id: 'team-games', label: 'Group games & activities', icon: 'ti-users-group' },
    { id: 'bonfire', label: 'Bonfire evening', icon: 'ti-flame' },
    { id: 'bbq', label: 'BBQ night', icon: 'ti-grill' },
    { id: 'karaoke', label: 'Karaoke & music', icon: 'ti-microphone-2' },
    { id: 'picnic', label: 'Picnic day out', icon: 'ti-basket' },
  ],
  // Escapes
  family: [
    { id: 'spa', label: 'Spa & massage', icon: 'ti-massage' },
    { id: 'yoga', label: 'Yoga sessions', icon: 'ti-yoga' },
    { id: 'meditation', label: 'Meditation', icon: 'ti-sparkles' },
    { id: 'ayurveda', label: 'Ayurveda therapies', icon: 'ti-leaf' },
    { id: 'nature-walks', label: 'Guided nature walks', icon: 'ti-trees' },
  ],
  adventure: [
    { id: 'trekking', label: 'Trekking', icon: 'ti-trekking' },
    { id: 'camping', label: 'Camping', icon: 'ti-tent' },
    { id: 'cycling', label: 'Mountain cycling', icon: 'ti-bike' },
    { id: 'offroading', label: 'Jeep off-roading', icon: 'ti-car' },
    { id: 'kayaking', label: 'Kayaking & boating', icon: 'ti-kayak' },
  ],
  nature: [
    { id: 'tea-tours', label: 'Tea estate tours', icon: 'ti-plant' },
    { id: 'tribal-village', label: 'Toda village visit', icon: 'ti-home-eco' },
    { id: 'local-cuisine', label: 'Local cuisine trail', icon: 'ti-tools-kitchen-2' },
    { id: 'chocolate', label: 'Chocolate making', icon: 'ti-candy' },
    { id: 'handicrafts', label: 'Handicraft shopping', icon: 'ti-shopping-bag' },
  ],
};

/** Options for an occasion; empty when none are configured yet. */
export const interestsFor = (occasionId: string): OccasionInterest[] =>
  OCCASION_INTERESTS[occasionId] ?? [];
