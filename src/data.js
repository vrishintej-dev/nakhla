// REAL weather data snapshot — Open-Meteo (ERA5 reanalysis archive + forecast API),
// fetched 16 Nov 2026 for Liwa Oasis, Abu Dhabi (23.12 N, 53.77 E), timezone Asia/Dubai.
// et0 = FAO-56 Penman-Monteith reference evapotranspiration (mm/day).
// Used when the phone is offline; the app refreshes it live from Open-Meteo when online.

const csv = (s) => s.split(',').map(Number);

function days(start, values) {
  const d0 = new Date(start + 'T00:00:00Z');
  return values.map((_, i) => new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10));
}

const archiveStart = '2026-09-12';
const archiveEt0 = csv('8.72,7.67,7.26,7.62,8.4,8.74,7.27,7.84,8.58,8.62,7.17,7.24,7.11,7.45,7.61,6.74,7.47,7.98,7.03,5.04,8.25,6.71,6.78,7.24,7.4,6.33,7.73,6.16,6.11,6.62,6.45,6.05,6.17,6.54,5.82,6.54,6.77,6.57,5.65,6.34,5.2,5.85,6.23,5.59,5.79,6.04,5.8,5.88,5.18,5.76,5.96,5.21,5.02,4.96,5.26,5.26,5.5,5.44,5.31,5.17');
const archiveTmax = csv('44,41,41,42,43,44,44,45,46,44,42,43,43,43,44,44,44,45,42,40,40,38,40,42,43,43,43,41,40,39,40,37,38,39,40,40,40,40,39,39,39,38,38,37,38,38,37,36,36,37,36,36,37,37,36,36,35,35,36,35');
const archiveRain = archiveEt0.map(() => 0);

const forecastStart = '2026-11-11';
const forecastEt0 = csv('5.24,4.75,5.56,5.2,5.15,4.39,4.08,3.96,4.47,4.61,4.62,3.48');
const forecastTmax = csv('33,30,30,29,30,29,29,29,30,29,31,29');
const forecastRain = csv('2.9,0,0,0,0,0,0,0,0,0,0,0');

const build = (start, et0, tmax, rain, source) =>
  days(start, et0).map((date, i) => ({ date, et0: et0[i], tmax: tmax[i], rain: rain[i], source }));

export const LIWA = {
  name: 'Liwa Oasis, Abu Dhabi',
  lat: 23.12,
  lon: 53.77,
  fetched: '2026-11-16',
  daily: [
    ...build(archiveStart, archiveEt0, archiveTmax, archiveRain, 'ERA5 archive'),
    ...build(forecastStart, forecastEt0, forecastTmax, forecastRain, 'forecast'),
  ],
  // Mean daily ET0 per month, Nov 2025 – Nov 2026 (Nov 2026 = 1–10 Nov)
  monthlyEt0: {
    '2025-11': 4.63, '2025-12': 3.72, '2026-01': 3.65, '2026-02': 4.98,
    '2026-03': 6.06, '2026-04': 7.59, '2026-05': 9.59, '2026-06': 10.32,
    '2026-07': 9.63, '2026-08': 8.65, '2026-09': 7.91, '2026-10': 6.28,
  },
};

export const LOCATIONS = [
  { id: 'liwa', name: 'Liwa Oasis', lat: 23.12, lon: 53.77 },
  { id: 'alain', name: 'Al Ain', lat: 24.21, lon: 55.74 },
  { id: 'dhaid', name: 'Al Dhaid (Sharjah)', lat: 25.29, lon: 55.88 },
  { id: 'qudra', name: 'Al Qudra (Dubai)', lat: 24.84, lon: 55.37 },
];
