// Nakhla irrigation engine — pure functions, no DOM, no network.
// Method: FAO-56 (crop water need) + FAO-29 (salinity leaching requirement).

export const DEFAULTS = Object.freeze({
  kc: 0.95,          // FAO-56 Table 12, date palm (mid/late season)
  canopyM2: 18,      // effective shaded/wetted area per mature palm under drip (m²)
  efficiency: 0.9,   // drip/bubbler application efficiency
  targetYield: 100,  // % — we never trade yield for water by default
  habitL: 300,       // L/palm/day: typical UAE practice all year (EAD sap-flow study)
  rainFactor: 0.8,   // share of rain that counts as effective
});

// FAO-29: date palm yield is 100% up to ECe 4.0 dS/m, then drops 3.6% per dS/m.
export const ecTargetForYield = (yieldPct) => 4.0 + (100 - yieldPct) / 3.6;

// FAO-29 leaching requirement for high-frequency (drip) irrigation.
// Returns Infinity when the water is too salty to grow the crop at that target.
export function leachingRequirement(ecw, ecTarget) {
  if (ecw <= 0) return 0;
  const denom = 5 * ecTarget - ecw;
  if (denom <= 0) return Infinity;
  const lr = ecw / denom;
  return lr >= 0.75 ? Infinity : lr;
}

export const tdsToEc = (ppm) => ppm / 640;

export function netNeedLitres({ et0, rainMm = 0, kc = DEFAULTS.kc, canopyM2 = DEFAULTS.canopyM2, rainFactor = DEFAULTS.rainFactor }) {
  // 1 mm of water over 1 m² = 1 litre
  return Math.max(0, et0 * kc * canopyM2 - rainFactor * rainMm * canopyM2);
}

export const grossLitres = (net, { efficiency, lr }) => net / efficiency / (1 - lr);

export function runMinutes(litres, emitters, flowLph) {
  if (litres <= 0) return 0;
  const exact = (litres / (emitters * flowLph)) * 60;
  return Math.ceil(exact / 5 - 1e-9) * 5;
}

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function decideBlock(block, day, settings = DEFAULTS) {
  const s = { ...DEFAULTS, ...settings };
  const ecTarget = ecTargetForYield(s.targetYield);
  const lr = leachingRequirement(block.ecw, ecTarget);
  const saltWarning = !Number.isFinite(lr);
  const netL = netNeedLitres({ et0: day.et0, rainMm: day.rain || 0, kc: s.kc, canopyM2: s.canopyM2, rainFactor: s.rainFactor });
  const lrUsed = saltWarning ? 0 : lr;
  const grossL = grossLitres(netL, { efficiency: s.efficiency, lr: lrUsed });
  const flushL = grossL - netL / s.efficiency;
  const minutes = runMinutes(grossL, block.emitters, block.flowLph);
  const habitMinutes = runMinutes(s.habitL, block.emitters, block.flowLph);
  // what actually goes on the ground is the rounded run time
  const appliedL = (minutes / 60) * block.emitters * block.flowLph;
  const savedM3 = ((s.habitL - appliedL) * block.palms) / 1000;
  return {
    block: block.name, netL, grossL, appliedL, flushL, lr: lrUsed, ecTarget,
    minutes, habitL: s.habitL, habitMinutes, savedM3, saltWarning,
    underWateredByHabit: s.habitL < grossL,
  };
}

export function compareHabit(daily, block, settings = DEFAULTS) {
  const s = { ...DEFAULTS, ...settings };
  const days = daily.map((d) => {
    const r = decideBlock(block, d, s);
    return { date: d.date, et0: d.et0, nakhlaL: r.grossL, habitL: s.habitL, risk: r.underWateredByHabit };
  });
  const sum = (f) => days.reduce((a, d) => a + f(d), 0);
  const habitM3 = (sum((d) => d.habitL) * block.palms) / 1000;
  const nakhlaM3 = (sum((d) => d.nakhlaL) * block.palms) / 1000;
  return {
    days,
    totals: {
      habitM3, nakhlaM3, savedM3: habitM3 - nakhlaM3,
      savedPct: habitM3 ? (1 - nakhlaM3 / habitM3) * 100 : 0,
      riskDays: days.filter((d) => d.risk).length,
      wastedM3: (sum((d) => Math.max(0, d.habitL - d.nakhlaL)) * block.palms) / 1000,
    },
  };
}

const daysInMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function annualEstimate(monthlyEt0, block, settings = DEFAULTS) {
  const s = { ...DEFAULTS, ...settings };
  const months = Object.entries(monthlyEt0).map(([month, et0]) => {
    const r = decideBlock(block, { et0, rain: 0 }, s);
    const n = daysInMonth(month);
    return {
      month, et0, days: n, nakhlaL: r.grossL, habitL: s.habitL,
      habitM3: (s.habitL * n * block.palms) / 1000,
      nakhlaM3: (r.grossL * n * block.palms) / 1000,
    };
  });
  const habitM3 = months.reduce((a, m) => a + m.habitM3, 0);
  const nakhlaM3 = months.reduce((a, m) => a + m.nakhlaM3, 0);
  return {
    months,
    totals: { habitM3, nakhlaM3, savedM3: habitM3 - nakhlaM3, savedPct: (1 - nakhlaM3 / habitM3) * 100 },
  };
}
