/**
 * South African clubs and their courses.
 *
 * Club names, locations, course names and pars are real. Stroke indexes, hole
 * lengths and green fees are REPRESENTATIVE SAMPLE DATA generated for the demo
 * — they are not official scorecards or live rates. A club edits its own tee
 * sheet and pricing from the admin console once it signs up.
 *
 * Distances are in metres, as South African cards are.
 */

/* Deterministic pseudo-random so seeded data is stable between runs. */
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const LENGTHS = {
  3: [135, 195],
  4: [300, 410],
  5: [445, 520],
};

/**
 * Builds a full card from a par layout: plausible metres per hole, then stroke
 * indexes allocated the way a club does it — odd numbers on the harder nine,
 * even on the other, hardest hole taking the lowest index in its nine.
 */
export function buildHoles(seedKey, pars) {
  const random = rng(seedKey);

  const metres = pars.map((par) => {
    const [min, max] = LENGTHS[par];
    return Math.round((min + random() * (max - min)) / 5) * 5;
  });

  // Difficulty proxy: how long the hole plays relative to a standard for its par.
  const standard = { 3: 165, 4: 355, 5: 480 };
  const difficulty = pars.map((par, i) => metres[i] - standard[par] + (par === 3 ? -12 : 0));

  const front = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const back = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const sum = (idx) => idx.reduce((total, i) => total + difficulty[i], 0);
  const frontIsHarder = sum(front) >= sum(back);

  const si = new Array(18);
  const allocate = (indexes, startAt) => {
    const ordered = [...indexes].sort((a, b) => difficulty[b] - difficulty[a]);
    ordered.forEach((holeIndex, rank) => {
      si[holeIndex] = startAt + rank * 2;
    });
  };
  allocate(frontIsHarder ? front : back, 1);
  allocate(frontIsHarder ? back : front, 2);

  return pars.map((par, i) => ({ hole: i + 1, par, si: si[i], metres: metres[i] }));
}

const P72_A = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const P72_B = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4];
const P72_C = [5, 4, 4, 3, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4];
const P71 = [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4];
const P73 = [4, 5, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5];

/** cents, so no floating point money. R1 350 -> 135000 */
const rand = (rands) => rands * 100;

export const CLUBS = [
  {
    id: 'clb_steenberg',
    name: 'Steenberg Golf Club',
    slug: 'steenberg',
    city: 'Tokai, Cape Town',
    province: 'Western Cape',
    blurb: 'Parkland golf under the Steenberg mountains in the Constantia valley.',
    phone: '021 713 2233',
    email: 'proshop@steenberggolf.example',
    website: 'https://steenberggolfclub.co.za',
    brandColor: '#1D3B2E',
    courses: [
      {
        id: 'crs_steenberg',
        name: 'Steenberg',
        tee: 'White',
        rating: 72.4,
        slope: 133,
        pars: P72_A,
        weekday: rand(1350),
        weekend: rand(1550),
        cart: rand(400),
        firstTee: '06:40',
        lastTee: '16:00',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_erinvale',
    name: 'Erinvale Golf Club',
    slug: 'erinvale',
    city: 'Somerset West',
    province: 'Western Cape',
    blurb: 'Gary Player design at the foot of the Helderberg, host of the 1996 World Cup.',
    phone: '021 847 1144',
    email: 'bookings@erinvale.example',
    website: 'https://erinvale.co.za',
    brandColor: '#4A574F',
    courses: [
      {
        id: 'crs_erinvale',
        name: 'Erinvale',
        tee: 'White',
        rating: 72.1,
        slope: 135,
        pars: P72_B,
        weekday: rand(950),
        weekend: rand(1150),
        cart: rand(380),
        firstTee: '06:50',
        lastTee: '15:50',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_arabella',
    name: 'Arabella Golf Club',
    slug: 'arabella',
    city: 'Kleinmond',
    province: 'Western Cape',
    blurb: 'Lakeside holes on the Bot River lagoon, framed by the Kogelberg.',
    phone: '028 284 0000',
    email: 'golf@arabella.example',
    website: 'https://arabellagolfclub.co.za',
    brandColor: '#163025',
    courses: [
      {
        id: 'crs_arabella',
        name: 'Arabella',
        tee: 'White',
        rating: 73.0,
        slope: 138,
        pars: P72_C,
        weekday: rand(1150),
        weekend: rand(1350),
        cart: rand(400),
        firstTee: '07:00',
        lastTee: '15:40',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_pearlvalley',
    name: 'Pearl Valley at Val de Vie',
    slug: 'pearl-valley',
    city: 'Franschhoek',
    province: 'Western Cape',
    blurb: 'Jack Nicklaus signature layout between the Simonsberg and Drakenstein.',
    phone: '021 867 8000',
    email: 'proshop@pearlvalley.example',
    website: 'https://pearlvalley.co.za',
    brandColor: '#C2A76A',
    courses: [
      {
        id: 'crs_pearl_valley',
        name: 'Pearl Valley',
        tee: 'White',
        rating: 73.4,
        slope: 140,
        pars: P72_A,
        weekday: rand(1250),
        weekend: rand(1450),
        cart: rand(420),
        firstTee: '06:40',
        lastTee: '16:10',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_dezalze',
    name: 'De Zalze Golf Club',
    slug: 'de-zalze',
    city: 'Stellenbosch',
    province: 'Western Cape',
    blurb: 'Winelands golf threading through vineyards and old oaks.',
    phone: '021 880 7300',
    email: 'bookings@dezalze.example',
    website: 'https://dezalzegolf.co.za',
    brandColor: '#C2A76A',
    courses: [
      {
        id: 'crs_de_zalze',
        name: 'De Zalze',
        tee: 'White',
        rating: 71.8,
        slope: 131,
        pars: P72_B,
        weekday: rand(950),
        weekend: rand(1150),
        cart: rand(370),
        firstTee: '06:50',
        lastTee: '16:00',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_fancourt',
    name: 'Fancourt',
    slug: 'fancourt',
    city: 'George',
    province: 'Western Cape',
    blurb: 'Three Gary Player courses on the Garden Route, including The Links.',
    phone: '044 804 0000',
    email: 'golf@fancourt.example',
    website: 'https://fancourt.co.za',
    brandColor: '#4A574F',
    courses: [
      {
        id: 'crs_fancourt_links',
        name: 'The Links',
        tee: 'White',
        rating: 74.6,
        slope: 145,
        pars: P73,
        weekday: rand(2000),
        weekend: rand(2200),
        cart: rand(450),
        firstTee: '07:00',
        lastTee: '15:20',
        interval: 12,
      },
      {
        id: 'crs_fancourt_montagu',
        name: 'Montagu',
        tee: 'White',
        rating: 72.9,
        slope: 136,
        pars: P72_A,
        weekday: rand(1250),
        weekend: rand(1450),
        cart: rand(450),
        firstTee: '06:50',
        lastTee: '15:50',
        interval: 10,
      },
      {
        id: 'crs_fancourt_outeniqua',
        name: 'Outeniqua',
        tee: 'White',
        rating: 72.2,
        slope: 132,
        pars: P72_C,
        weekday: rand(1100),
        weekend: rand(1300),
        cart: rand(450),
        firstTee: '06:50',
        lastTee: '15:50',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_simola',
    name: 'Simola Golf & Country Estate',
    slug: 'simola',
    city: 'Knysna',
    province: 'Western Cape',
    blurb: 'Jack Nicklaus design above the Knysna lagoon and the Featherbed.',
    phone: '044 302 9600',
    email: 'proshop@simola.example',
    website: 'https://simola.co.za',
    brandColor: '#163025',
    courses: [
      {
        id: 'crs_simola',
        name: 'Simola',
        tee: 'White',
        rating: 72.6,
        slope: 137,
        pars: P72_B,
        weekday: rand(950),
        weekend: rand(1100),
        cart: rand(390),
        firstTee: '07:00',
        lastTee: '15:40',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_humewood',
    name: 'Humewood Golf Club',
    slug: 'humewood',
    city: 'Gqeberha',
    province: 'Eastern Cape',
    blurb: 'The country’s truest links, laid out on the dunes of Algoa Bay.',
    phone: '041 583 2137',
    email: 'office@humewoodgolf.example',
    website: 'https://humewoodgolf.co.za',
    brandColor: '#BE3A2B',
    courses: [
      {
        id: 'crs_humewood',
        name: 'Humewood',
        tee: 'White',
        rating: 73.2,
        slope: 136,
        pars: P72_A,
        weekday: rand(750),
        weekend: rand(900),
        cart: rand(350),
        firstTee: '06:40',
        lastTee: '16:00',
        interval: 9,
      },
    ],
  },
  {
    id: 'clb_stfrancis',
    name: 'St Francis Links',
    slug: 'st-francis-links',
    city: 'St Francis Bay',
    province: 'Eastern Cape',
    blurb: 'Jack Nicklaus links running through fynbos and dune scrub.',
    phone: '042 200 4400',
    email: 'golf@stfrancislinks.example',
    website: 'https://stfrancislinks.com',
    brandColor: '#1D3B2E',
    courses: [
      {
        id: 'crs_st_francis',
        name: 'St Francis Links',
        tee: 'White',
        rating: 74.0,
        slope: 142,
        pars: P72_C,
        weekday: rand(900),
        weekend: rand(1100),
        cart: rand(380),
        firstTee: '07:00',
        lastTee: '15:30',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_durbancc',
    name: 'Durban Country Club',
    slug: 'durban-country-club',
    city: 'Durban',
    province: 'KwaZulu-Natal',
    blurb: 'Classic 1922 layout in the dunes, long the home of the SA Open.',
    phone: '031 313 1777',
    email: 'reception@durbancc.example',
    website: 'https://durbancountryclub.co.za',
    brandColor: '#7C8E84',
    courses: [
      {
        id: 'crs_durban_cc',
        name: 'Durban Country Club',
        tee: 'White',
        rating: 73.6,
        slope: 139,
        pars: P72_B,
        weekday: rand(1100),
        weekend: rand(1300),
        cart: rand(400),
        firstTee: '06:30',
        lastTee: '15:40',
        interval: 9,
      },
    ],
  },
  {
    id: 'clb_zimbali',
    name: 'Zimbali Country Club',
    slug: 'zimbali',
    city: 'Ballito',
    province: 'KwaZulu-Natal',
    blurb: 'Tom Weiskopf design cut through coastal forest above the Dolphin Coast.',
    phone: '032 538 1041',
    email: 'proshop@zimbali.example',
    website: 'https://zimbalicountryclub.co.za',
    brandColor: '#163025',
    courses: [
      {
        id: 'crs_zimbali',
        name: 'Zimbali',
        tee: 'White',
        rating: 72.8,
        slope: 137,
        pars: P72_A,
        weekday: rand(1050),
        weekend: rand(1250),
        cart: rand(400),
        firstTee: '06:40',
        lastTee: '15:50',
        interval: 10,
      },
    ],
  },
  {
    id: 'clb_royaljhb',
    name: 'Royal Johannesburg & Kensington',
    slug: 'royal-johannesburg',
    city: 'Johannesburg',
    province: 'Gauteng',
    blurb: 'Two highveld championship courses; the East has hosted the SA Open.',
    phone: '011 640 3021',
    email: 'bookings@royaljk.example',
    website: 'https://royaljk.co.za',
    brandColor: '#1D3B2E',
    courses: [
      {
        id: 'crs_royal_jhb_east',
        name: 'East Course',
        tee: 'White',
        rating: 73.8,
        slope: 138,
        pars: P72_C,
        weekday: rand(900),
        weekend: rand(1100),
        cart: rand(380),
        firstTee: '06:20',
        lastTee: '16:10',
        interval: 9,
      },
      {
        id: 'crs_royal_jhb_west',
        name: 'West Course',
        tee: 'White',
        rating: 71.9,
        slope: 130,
        pars: P71,
        weekday: rand(750),
        weekend: rand(950),
        cart: rand(380),
        firstTee: '06:20',
        lastTee: '16:10',
        interval: 9,
      },
    ],
  },
  {
    id: 'clb_glendower',
    name: 'Glendower Golf Club',
    slug: 'glendower',
    city: 'Ekurhuleni',
    province: 'Gauteng',
    blurb: 'Tree-lined parkland in a bird sanctuary, a regular SA Open host.',
    phone: '011 453 1013',
    email: 'proshop@glendower.example',
    website: 'https://glendower.co.za',
    brandColor: '#C2A76A',
    courses: [
      {
        id: 'crs_glendower',
        name: 'Glendower',
        tee: 'White',
        rating: 74.2,
        slope: 141,
        pars: P73,
        weekday: rand(850),
        weekend: rand(1050),
        cart: rand(370),
        firstTee: '06:30',
        lastTee: '16:00',
        interval: 9,
      },
    ],
  },
  {
    id: 'clb_leopardcreek',
    name: 'Leopard Creek Country Club',
    slug: 'leopard-creek',
    city: 'Malelane',
    province: 'Mpumalanga',
    blurb: 'Gary Player design overlooking the Crocodile River and the Kruger.',
    phone: '013 791 2000',
    email: 'golf@leopardcreek.example',
    website: 'https://leopardcreek.co.za',
    brandColor: '#C2A76A',
    courses: [
      {
        id: 'crs_leopard_creek',
        name: 'Leopard Creek',
        tee: 'White',
        rating: 74.4,
        slope: 143,
        pars: P72_B,
        weekday: rand(2200),
        weekend: rand(2400),
        cart: rand(450),
        firstTee: '06:30',
        lastTee: '15:00',
        interval: 12,
      },
    ],
  },
  {
    id: 'clb_garyplayer',
    name: 'Gary Player Country Club',
    slug: 'gary-player',
    city: 'Sun City',
    province: 'North West',
    blurb: 'Home of the Nedbank Golf Challenge, and every bit as long as it looks.',
    phone: '014 557 1245',
    email: 'golf@suncity.example',
    website: 'https://suninternational.com',
    brandColor: '#BE3A2B',
    courses: [
      {
        id: 'crs_gary_player',
        name: 'Gary Player CC',
        tee: 'White',
        rating: 74.8,
        slope: 144,
        pars: P72_A,
        weekday: rand(1750),
        weekend: rand(1950),
        cart: rand(450),
        firstTee: '06:40',
        lastTee: '15:20',
        interval: 12,
      },
    ],
  },
];

export const PROVINCES = [...new Set(CLUBS.map((c) => c.province))].sort();
export const totalPar = (holes) => holes.reduce((sum, h) => sum + h.par, 0);
