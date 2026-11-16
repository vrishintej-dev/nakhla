import { DEFAULTS, decideBlock, compareHabit, annualEstimate, formatDuration, tdsToEc } from './engine.js';
import { buildMessage, smsInfo, hmm, LANGS } from './messages.js';
import { LIWA, LOCATIONS } from './data.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: keep in memory */ } },
};

const DEFAULT_FARM = {
  locationId: 'liwa',
  habitL: DEFAULTS.habitL,
  targetYield: DEFAULTS.targetYield,
  blocks: [
    { name: 'A', label: 'North (blended water)', palms: 120, ecw: 1.5, emitters: 4, flowLph: 16 },
    { name: 'B', label: 'South (brackish well)', palms: 200, ecw: 6, emitters: 4, flowLph: 16 },
  ],
};

const state = {
  farm: store.get('nakhla:farm', DEFAULT_FARM),
  lang: store.get('nakhla:lang', 'en'),
  range: '60d',
  chartBlock: 0,
  wx: null, // { name, daily:[{date,et0,tmax,rain}], monthlyEt0, live, fetched }
};

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const fmtDate = (iso, opts = { day: 'numeric', month: 'short' }) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', opts);
const num = (v, d = 0) => Number(v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const settings = () => ({ ...DEFAULTS, habitL: +state.farm.habitL, targetYield: +state.farm.targetYield });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- weather ----------
const DAILY = 'et0_fao_evapotranspiration,temperature_2m_max,precipitation_sum';

async function fetchJSON(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.reason);
    return j;
  } finally { clearTimeout(t); }
}

async function fetchLive(loc) {
  const base = `latitude=${loc.lat}&longitude=${loc.lon}&timezone=Asia%2FDubai`;
  const f = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${base}&daily=${DAILY}&past_days=60&forecast_days=7`);
  const daily = f.daily.time.map((date, i) => ({
    date, et0: f.daily.et0_fao_evapotranspiration[i], tmax: f.daily.temperature_2m_max[i], rain: f.daily.precipitation_sum[i] || 0,
  })).filter((d) => d.et0 != null);
  let monthlyEt0 = null;
  try {
    const end = new Date(Date.now() - 6 * 86400000);
    const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    const iso = (d) => d.toISOString().slice(0, 10);
    const a = await fetchJSON(`https://archive-api.open-meteo.com/v1/archive?${base}&daily=et0_fao_evapotranspiration&start_date=${iso(start)}&end_date=${iso(lastDay)}`);
    const by = {};
    a.daily.time.forEach((t, i) => { const v = a.daily.et0_fao_evapotranspiration[i]; if (v != null) (by[t.slice(0, 7)] ||= []).push(v); });
    monthlyEt0 = Object.fromEntries(Object.entries(by).map(([m, v]) => [m, +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(2)]));
  } catch { /* monthly view falls back */ }
  return { name: loc.name, daily, monthlyEt0, live: true, fetched: new Date().toISOString() };
}

async function loadWeather() {
  const loc = LOCATIONS.find((l) => l.id === state.farm.locationId) || LOCATIONS[0];
  const key = 'nakhla:wx:' + loc.id;
  const cached = store.get(key, null);
  const snapshot = loc.id === 'liwa' ? { name: LIWA.name, daily: LIWA.daily, monthlyEt0: LIWA.monthlyEt0, live: false, fetched: LIWA.fetched + 'T12:00:00Z', snapshot: true } : null;
  state.wx = cached || snapshot || { ...LIWA, live: false, snapshot: true, fallback: true, fetched: LIWA.fetched + 'T12:00:00Z' };
  setStatus();
  render();
  try {
    const live = await fetchLive(loc);
    if (!live.monthlyEt0) live.monthlyEt0 = (cached && cached.monthlyEt0) || (snapshot && snapshot.monthlyEt0) || LIWA.monthlyEt0;
    state.wx = live;
    store.set(key, { ...live, live: false });
  } catch {
    state.wx = { ...state.wx, live: false };
  }
  setStatus();
  render();
}

function setStatus() {
  const s = $('status');
  const w = state.wx;
  if (w.live) { s.textContent = 'Live forecast · Open-Meteo'; s.className = 'pill'; return; }
  const when = fmtDate(w.fetched.slice(0, 10));
  s.textContent = w.fallback ? `Offline · Liwa data from ${when}` : `Offline · saved forecast from ${when}`;
  s.className = 'pill offline';
}

// ---------- pick "today" ----------
function pickToday() {
  const t = todayISO();
  const d = state.wx.daily;
  const exact = d.findIndex((x) => x.date === t);
  if (exact >= 0) return { idx: exact, exact: true };
  const past = d.filter((x) => x.date <= t);
  return { idx: past.length ? d.indexOf(past.at(-1)) : 0, exact: false };
}

// ---------- render ----------
function render() {
  if (!state.wx) return;
  const { idx, exact } = pickToday();
  const day = state.wx.daily[idx];
  const s = settings();
  const decisions = state.farm.blocks.map((b) => decideBlock(b, day, s));

  $('today-date').textContent = (exact ? 'Today · ' : 'Latest forecast day · ') + fmtDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' });
  $('wx').innerHTML = `
    <div><b>${num(day.et0, 1)} mm</b>evaporation (ET0)</div>
    <div><b>${num(day.tmax)}°C</b>max temp</div>
    ${day.rain > 0 ? `<div><b>${num(day.rain, 1)} mm</b>rain</div>` : ''}`;

  renderBlocks(decisions);
  renderMessage(decisions);
  renderPlan(idx, s);
  renderProof(idx, s);
}

function renderBlocks(decisions) {
  const max = Math.max(...decisions.map((d) => Math.max(d.minutes, d.habitMinutes)), 1);
  $('blocks').innerHTML = decisions.map((d, i) => {
    const b = state.farm.blocks[i];
    if (d.saltWarning) {
      return `<article class="block"><h3>Block ${esc(b.name)} · ${esc(b.label || '')}</h3>
        <div class="alert">⚠ Water at ${num(b.ecw, 1)} dS/m is too salty for date palms at this yield target. Don't irrigate from this source today. Test the well again, or blend it with better water.</div></article>`;
    }
    const more = d.minutes > d.habitMinutes;
    return `<article class="block">
      <h3>Block ${esc(b.name)} · ${esc(b.label || '')}</h3>
      <div class="big">${formatDuration(d.minutes)}</div>
      <div class="usual">${more ? 'More than' : 'instead of'} the usual <s>${formatDuration(d.habitMinutes)}</s></div>
      <div class="bars" aria-hidden="true">
        <div class="bar n" style="width:${(d.minutes / max) * 100}%"></div>
        <div class="bar h" style="width:${(d.habitMinutes / max) * 100}%"></div>
      </div>
      <div class="badges">
        <span class="badge">${num(d.appliedL)} L / palm</span>
        <span class="badge">${b.palms} palms</span>
        <span class="badge">water ${num(b.ecw, 1)} dS/m</span>
        ${d.lr >= 0.1 ? `<span class="badge">+${num(d.flushL)} L salt flush</span>` : ''}
        ${more ? '<span class="badge warn">Habit is under-watering this block</span>' : ''}
      </div>
      ${d.lr >= 0.4 ? blendTip(b, d) : ''}
      <details><summary>Why ${formatDuration(d.minutes)}?</summary>
        <ul class="why">
          <li><span>Palm uses today (ET0 × 0.95 × ${DEFAULTS.canopyM2} m²)</span><span>${num(d.netL)} L</span></li>
          <li><span>Drip losses (${Math.round(DEFAULTS.efficiency * 100)}% efficient)</span><span>+${num(d.netL / DEFAULTS.efficiency - d.netL)} L</span></li>
          <li><span>Salt flush (LR ${num(d.lr * 100)}% for ${num(b.ecw, 1)} dS/m)</span><span>+${num(d.flushL)} L</span></li>
          <li><span>Needed per palm</span><span>${num(d.grossL)} L</span></li>
          <li><span>${b.emitters} emitters × ${b.flowLph} L/h, rounded up</span><span>${formatDuration(d.minutes)}</span></li>
          <li><span>Habit (${d.habitL} L/palm)</span><span>${formatDuration(d.habitMinutes)}</span></li>
        </ul>
      </details>
    </article>`;
  }).join('');

  const saved = decisions.reduce((a, d) => a + (d.saltWarning ? 0 : d.savedM3), 0);
  const habitM3 = state.farm.blocks.reduce((a, b) => a + (state.farm.habitL * b.palms) / 1000, 0);
  $('hero-total').innerHTML = saved > 0
    ? `Following Nakhla saves <b>${num(saved, 1)} m³</b> of water today (${num((saved / habitM3) * 100)}% less than the habit), with no salt build-up.`
    : `Today Nakhla needs <b>${num(-saved, 1)} m³ more</b> than the habit, because salty water needs extra flushing in this heat.`;
}

// Hidden problem: on a very salty well most of the water only flushes salt.
function blendTip(b, d) {
  const cleaner = state.farm.blocks.filter((x) => x !== b && x.ecw < b.ecw).sort((x, y) => x.ecw - y.ecw)[0];
  const day = { et0: d.netL / (DEFAULTS.kc * DEFAULTS.canopyM2), rain: 0 };
  const at90 = decideBlock(b, day, { ...settings(), targetYield: 90 });
  let txt = `${num(d.lr * 100)}% of this water only flushes salt. A 90% yield target cuts it to ${num(at90.grossL)} L/palm`;
  if (cleaner) {
    const mixEc = (b.ecw + cleaner.ecw) / 2;
    const half = decideBlock({ ...b, ecw: mixEc }, day, settings());
    txt += `; blending 50/50 with Block ${esc(cleaner.name)} water (${num(mixEc, 1)} dS/m) cuts it to ${num(half.grossL)} L/palm at full yield`;
  }
  return `<p class="hint">💡 ${txt}.</p>`;
}

function renderMessage(decisions) {
  const langs = $('langs');
  langs.innerHTML = Object.entries(LANGS).map(([k, v]) =>
    `<button type="button" role="tab" data-lang="${k}" aria-selected="${k === state.lang}">${v.label}</button>`).join('');
  const msg = buildMessage(decisions, state.lang);
  const bubble = $('msg');
  bubble.textContent = msg;
  bubble.dir = LANGS[state.lang].dir;
  bubble.lang = state.lang;
  const info = smsInfo(msg);
  $('msg-meta').textContent = `${info.chars} characters · ${info.encoding} · ${info.segments} SMS · works on any basic phone`;
  $('wa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
  $('sms').href = 'sms:?&body=' + encodeURIComponent(msg);
  state.currentMsg = msg;
}

function renderPlan(idx, s) {
  const days = state.wx.daily.slice(idx, idx + 7);
  const blocks = state.farm.blocks;
  $('plan').innerHTML = `<thead><tr><th>Day</th><th>ET0</th><th>Max</th>${blocks.map((b) => `<th>Block ${esc(b.name)}</th>`).join('')}</tr></thead>
  <tbody>${days.map((d, i) => `<tr class="${i === 0 ? 'today' : ''}">
    <td>${fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
    <td>${num(d.et0, 1)} mm</td><td>${num(d.tmax)}°C</td>
    ${blocks.map((b) => { const r = decideBlock(b, d, s); return `<td>${r.saltWarning ? '⚠ too salty' : hmm(r.minutes)}</td>`; }).join('')}
  </tr>`).join('')}</tbody>`;
}

// ---------- proof chart ----------
function renderProof(idx, s) {
  const sel = $('chart-block');
  sel.innerHTML = state.farm.blocks.map((b, i) => `<option value="${i}" ${i === state.chartBlock ? 'selected' : ''}>Block ${esc(b.name)} · ${num(b.ecw, 1)} dS/m</option>`).join('');
  const block = state.farm.blocks[state.chartBlock] || state.farm.blocks[0];
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === state.range)));

  let points, totals, label, source;
  if (state.range === '60d') {
    const hist = state.wx.daily.slice(0, idx + 1).slice(-60);
    const r = compareHabit(hist, block, s);
    points = r.days.map((d) => ({ key: d.date, x: fmtDate(d.date), et0: d.et0, n: d.nakhlaL, h: d.habitL, risk: d.risk }));
    totals = r.totals;
    label = `${fmtDate(hist[0].date)} – ${fmtDate(hist.at(-1).date)}`;
    source = `Real daily ET0 for ${state.wx.name} (Open-Meteo, ERA5 + forecast). Block ${block.name}: ${block.palms} palms.`;
  } else {
    const r = annualEstimate(state.wx.monthlyEt0, block, s);
    points = r.months.map((m) => ({ key: m.month, x: fmtDate(m.month + '-01', { month: 'short' }), et0: m.et0, n: m.nakhlaL, h: m.habitL, risk: m.nakhlaL > m.habitL }));
    const riskMonths = points.filter((p) => p.risk).length;
    totals = { ...r.totals, riskDays: riskMonths, monthly: true };
    label = `${fmtDate(r.months[0].month + '-01', { month: 'short', year: 'numeric' })} – ${fmtDate(r.months.at(-1).month + '-01', { month: 'short', year: 'numeric' })}`;
    source = `Monthly mean ET0, ${state.wx.name} (Open-Meteo ERA5 archive). Block ${block.name}: ${block.palms} palms.`;
  }

  const saves = totals.savedM3 >= 0;
  $('stats').innerHTML = `${saves ? `
    <div class="stat"><b>${num(totals.savedM3)} m³</b><span>water saved · ${label}</span></div>
    <div class="stat"><b>${num(totals.savedPct)}%</b><span>less than the ${s.habitL} L habit</span></div>
    <div class="stat"><b>${num(totals.savedM3 / 2500, 1)}</b><span>Olympic pools of groundwater</span></div>` : `
    <div class="stat"><b>+${num(-totals.savedM3)} m³</b><span>extra water this block needs · ${label}</span></div>
    <div class="stat"><b>${num(-totals.savedPct)}%</b><span>more than the ${s.habitL} L habit: this well is too salty for a flat schedule</span></div>
    <div class="stat"><b>Blend</b><span>mix with better water or lower the yield target to cut the flushing</span></div>`}
    <div class="stat"><b>${totals.riskDays}</b><span>${totals.monthly ? 'months' : 'days'} the habit under-watered (salt builds up)</span></div>`;

  $('legend').innerHTML = `
    <span class="key"><i style="background:var(--water)"></i>Nakhla (litres per palm per day)</span>
    <span class="key"><i class="dash"></i>Habit (${s.habitL} L every day)</span>
    ${points.some((p) => p.risk) ? '<span class="key"><i class="dot"></i>Habit under-waters: salt risk</span>' : ''}`;
  $('chart-source').textContent = source;
  $('chart-table').innerHTML = `<thead><tr><th>${state.range === '60d' ? 'Date' : 'Month'}</th><th>ET0 mm</th><th>Nakhla L</th><th>Habit L</th><th>Salt risk</th></tr></thead>
    <tbody>${points.map((p) => `<tr><td>${p.x}</td><td>${num(p.et0, 2)}</td><td>${num(p.n)}</td><td>${num(p.h)}</td><td>${p.risk ? 'yes' : ''}</td></tr>`).join('')}</tbody>`;
  drawChart(points);
}

function drawChart(points) {
  const svg = $('chart');
  const W = svg.clientWidth || 640, H = svg.clientHeight || 280;
  const m = { t: 12, r: 14, b: 26, l: 44 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const peak = Math.max(...points.map((p) => Math.max(p.n, p.h))) * 1.08;
  const tickStep = [25, 50, 100, 150, 200, 250, 500].find((st) => peak / st <= 5) || 500;
  const yMax = Math.ceil(peak / tickStep) * tickStep;
  const ticks = Array.from({ length: yMax / tickStep + 1 }, (_, i) => i * tickStep);
  const xs = (i) => m.l + (points.length === 1 ? 0 : (i * (W - m.l - m.r)) / (points.length - 1));
  const ys = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
  const step = Math.ceil(points.length / Math.max(3, Math.floor((W - m.l - m.r) / 70)));
  const showX = (i) => i === 0 || (i % step === 0 && points.length - 1 - i >= step * 0.6) || i === points.length - 1;
  const anchor = (i) => (i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle');
  const line = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p[k]).toFixed(1)}`).join('');
  const area = `${line('h')} ${points.map((p, i) => `L${xs(points.length - 1 - i).toFixed(1)},${ys(points[points.length - 1 - i].n).toFixed(1)}`).join(' ')} Z`;

  svg.innerHTML = `
    <title id="chart-title">Nakhla litres per palm per day versus the habit</title>
    ${ticks.map((t) => `<g><line x1="${m.l}" x2="${W - m.r}" y1="${ys(t)}" y2="${ys(t)}" stroke="#e6dccb" stroke-width="1"/>
      <text x="${m.l - 6}" y="${ys(t) + 4}" text-anchor="end" font-size="11" fill="#857664">${Math.round(t)}</text></g>`).join('')}
    ${points.map((p, i) => showX(i) ? `<text x="${xs(i)}" y="${H - 8}" text-anchor="${anchor(i)}" font-size="11" fill="#857664">${p.x}</text>` : '').join('')}
    <path d="${area}" fill="#1d6fa8" fill-opacity="0.10"/>
    <path d="${line('h')}" fill="none" stroke="#c0661c" stroke-width="2" stroke-dasharray="6 3"/>
    <path d="${line('n')}" fill="none" stroke="#1d6fa8" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((p, i) => p.risk ? `<circle cx="${xs(i)}" cy="${ys(p.n)}" r="4.5" fill="#b42318" stroke="#fffdf8" stroke-width="2"/>` : '').join('')}
    <line id="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="#5c4f41" stroke-width="1" opacity="0"/>
    <circle id="xd" r="5" fill="#1d6fa8" stroke="#fffdf8" stroke-width="2" opacity="0"/>
    <rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" id="hit"/>`;

  const tip = $('tip');
  const hit = svg.querySelector('#hit'), xh = svg.querySelector('#xh'), xd = svg.querySelector('#xd');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (points.length - 1))));
    const p = points[i];
    xh.setAttribute('x1', xs(i)); xh.setAttribute('x2', xs(i)); xh.setAttribute('opacity', '0.5');
    xd.setAttribute('cx', xs(i)); xd.setAttribute('cy', ys(p.n)); xd.setAttribute('opacity', '1');
    tip.hidden = false;
    tip.style.left = `${(xs(i) / W) * r.width}px`;
    tip.style.top = `${(ys(Math.max(p.n, p.h)) / H) * r.height + 20}px`;
    tip.innerHTML = `<b>${p.x}</b>ET0 ${num(p.et0, 1)} mm<br>Nakhla ${num(p.n)} L · Habit ${num(p.h)} L<br>${p.risk ? '⚠ habit under-waters' : `saves ${num(p.h - p.n)} L/palm`}`;
  };
  const leave = () => { tip.hidden = true; xh.setAttribute('opacity', '0'); xd.setAttribute('opacity', '0'); };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', leave);
  hit.addEventListener('touchend', leave);
}

// ---------- farm form ----------
function renderFarm() {
  const f = state.farm;
  $('farm').innerHTML = `
    ${f.blocks.map((b, i) => `<fieldset class="fblock" data-i="${i}">
      <legend>Block ${esc(b.name)}</legend>
      <label class="f">Name<input data-k="name" value="${esc(b.name)}" maxlength="3"></label>
      <label class="f">Description<input data-k="label" value="${esc(b.label || '')}"></label>
      <label class="f">Palms<input data-k="palms" type="number" min="1" value="${b.palms}"></label>
      <label class="f">Water EC (dS/m)<input data-k="ecw" type="number" min="0" step="0.1" value="${b.ecw}"></label>
      <label class="f">…or TDS pen (ppm)<input data-k="tds" type="number" min="0" step="10" placeholder="e.g. 3840"></label>
      <label class="f">Emitters per palm<input data-k="emitters" type="number" min="1" value="${b.emitters}"></label>
      <label class="f">Flow per emitter (L/h)<input data-k="flowLph" type="number" min="1" value="${b.flowLph}"></label>
    </fieldset>`).join('')}
    <fieldset class="fblock"><legend>Farm</legend>
      <label class="f">Habit today (L/palm/day)<input id="habit" type="number" min="0" step="10" value="${f.habitL}"></label>
      <label class="f">Yield target (%)<input id="yield" type="number" min="70" max="100" value="${f.targetYield}"></label>
    </fieldset>
    <div class="farm-actions">
      <button type="button" class="btn" id="add-block">Add block</button>
      ${f.blocks.length > 1 ? '<button type="button" class="btn" id="rm-block">Remove last block</button>' : ''}
      <button type="button" class="btn" id="reset">Reset demo farm</button>
    </div>`;
}

function onFarmInput(e) {
  const t = e.target;
  if (t.id === 'habit') state.farm.habitL = Math.max(0, +t.value || 0);
  else if (t.id === 'yield') state.farm.targetYield = Math.min(100, Math.max(70, +t.value || 100));
  else {
    const fs = t.closest('fieldset[data-i]');
    if (!fs) return;
    const b = state.farm.blocks[+fs.dataset.i];
    const k = t.dataset.k;
    if (k === 'tds') {
      if (t.value) { b.ecw = +tdsToEc(+t.value).toFixed(2); fs.querySelector('[data-k="ecw"]').value = b.ecw; }
    } else if (k === 'name' || k === 'label') b[k] = t.value || (k === 'name' ? '?' : '');
    else b[k] = Math.max(k === 'ecw' ? 0 : 1, +t.value || 0);
  }
  store.set('nakhla:farm', state.farm);
  render();
}

// ---------- wiring ----------
function init() {
  $('loc').innerHTML = LOCATIONS.map((l) => `<option value="${l.id}" ${l.id === state.farm.locationId ? 'selected' : ''}>${l.name}</option>`).join('');
  $('loc').addEventListener('change', (e) => { state.farm.locationId = e.target.value; store.set('nakhla:farm', state.farm); loadWeather(); });
  $('langs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]'); if (!b) return;
    state.lang = b.dataset.lang; store.set('nakhla:lang', state.lang); render();
  });
  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { state.range = b.dataset.range; render(); }));
  $('chart-block').addEventListener('change', (e) => { state.chartBlock = +e.target.value; render(); });
  $('farm').addEventListener('input', onFarmInput);
  $('farm').addEventListener('click', (e) => {
    if (e.target.id === 'add-block') {
      const name = String.fromCharCode(65 + state.farm.blocks.length);
      state.farm.blocks.push({ name, label: 'New block', palms: 100, ecw: 3, emitters: 4, flowLph: 16 });
    } else if (e.target.id === 'rm-block') {
      state.farm.blocks.pop();
      state.chartBlock = Math.min(state.chartBlock, state.farm.blocks.length - 1);
    } else if (e.target.id === 'reset') {
      state.farm = structuredClone(DEFAULT_FARM); state.chartBlock = 0;
    } else return;
    store.set('nakhla:farm', state.farm); renderFarm(); render();
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.currentMsg); $('copy').textContent = 'Copied ✓'; }
    catch { $('copy').textContent = 'Select the text to copy'; }
    setTimeout(() => { $('copy').textContent = 'Copy'; }, 1800);
  });
  $('speak').addEventListener('click', speak);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });

  renderFarm();
  loadWeather();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function speak() {
  const note = $('speak-note');
  if (!('speechSynthesis' in window)) { note.hidden = false; note.textContent = 'This browser cannot read aloud.'; return; }
  const want = LANGS[state.lang].speech;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === want) || voices.find((v) => v.lang.startsWith(want.slice(0, 2)));
  const u = new SpeechSynthesisUtterance(state.currentMsg.replace(/‎/g, '').replace(/m3|m³/g, state.lang === 'en' ? 'cubic metres' : 'm³'));
  u.lang = want;
  if (voice) u.voice = voice;
  note.hidden = !!voice || voices.length === 0;
  if (!voice && voices.length) note.textContent = `No ${LANGS[state.lang].label} voice is installed on this device, so it may read with a different accent.`;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

init();
