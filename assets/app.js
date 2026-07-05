/**
 * app.js  —  The World's Money, to Scale
 *
 * Loads data/market-data.json, renders every section of the page.
 * No figures are hardcoded here — all numbers come from the JSON.
 * Falls back to FALLBACK_DATA when the fetch fails (file:// or network error).
 */

'use strict';

// ── Inline fallback (mirrors initial market-data.json; used for file:// opens) ──
const FALLBACK_DATA = {
  meta: { generatedAt: '2026-07-03T00:00:00.000Z', currency: 'USD', unit: 'trillion', version: 2 },
  assetClasses: [
    { id: 're',    name: 'Real Estate',  sub: 'Global residential + commercial property', valueT: 393.3, asOf: '2025-01-01', source: 'Savills, 2025',      tier: 2, stale: false },
    { id: 'bond',  name: 'Bonds',        sub: 'Global debt securities outstanding',       valueT: 156.0, asOf: '2025-08-01', source: 'BIS, Aug 2025',     tier: 2, stale: false },
    { id: 'eq',    name: 'Equities',     sub: 'Global listed market capitalisation',      valueT: 135.0, asOf: '2025-12-01', source: 'Bloomberg/WFE',     tier: 2, stale: false },
    { id: 'm2',    name: 'Broad Money',  sub: 'M2 — US + EZ + CN + JP',                  valueT: 101.7, asOf: '2026-07-01', source: 'StreetStats, Jul 2026', tier: 2, stale: false },
    { id: 'gold',  name: 'Gold',         sub: 'All above-ground gold × spot price',       valueT:  23.5, asOf: '2026-07-03', source: 'Gold API / WGC',    tier: 1, stale: false },
    { id: 'crypto',name: 'Crypto',       sub: 'Total crypto market capitalisation',       valueT:   3.3, asOf: '2026-07-03', source: 'CoinGecko',         tier: 1, stale: false },
  ],
  derivatives: { notionalT: 846, grossMarketValueT: 21.8, asOf: '2025-06', source: 'BIS, Jun 2025' },
  crypto: {
    totalT: 3.3, athT: 4.27, athDate: '2025-10', volume24hB: 118.0,
    btc: { capT: 1.72, dominancePct: 52.1, priceUsd: 87000 },
    eth: { capB: 460, dominancePct: 13.9, priceUsd: 3800 },
    stablecoinsB: 230,
    top5: [
      { rank: 1, id: 'bitcoin',      symbol: 'BTC',  name: 'Bitcoin',  priceUsd: 87000,  capB: 1720, change24hPct: 0 },
      { rank: 2, id: 'ethereum',     symbol: 'ETH',  name: 'Ethereum', priceUsd: 3800,   capB: 460,  change24hPct: 0 },
      { rank: 3, id: 'tether',       symbol: 'USDT', name: 'Tether',   priceUsd: 1.00,   capB: 140,  change24hPct: 0 },
      { rank: 4, id: 'solana',       symbol: 'SOL',  name: 'Solana',   priceUsd: 180,    capB: 85,   change24hPct: 0 },
      { rank: 5, id: 'binancecoin',  symbol: 'BNB',  name: 'BNB',      priceUsd: 640,    capB: 93,   change24hPct: 0 },
    ],
    sparklineData: [],
  },
  gold: { spotUsdPerOz: 3320, aboveGroundTonnes: 220000, impliedCapT: 23.5, sparklineData: [] },
  deltas: { day: { crypto: null, gold: null }, month: { crypto: null, gold: null } },
  countryEquityMarkets: [
    { rank:  1, country: 'United States',  region: 'americas', capT: 65.0, note: 'NYSE + NASDAQ',             badge: null },
    { rank:  2, country: 'China',          region: 'asia',     capT: 11.2, note: 'Shanghai + Shenzhen + HK',  badge: null },
    { rank:  3, country: 'Japan',          region: 'asia',     capT:  6.5, note: 'TSE',                       badge: null },
    { rank:  4, country: 'India',          region: 'asia',     capT:  5.8, note: 'BSE + NSE',                 badge: { text: '↑ +38%', dir: 'up' } },
    { rank:  5, country: 'United Kingdom', region: 'emea',     capT:  3.7, note: 'LSE',                       badge: null },
    { rank:  6, country: 'Canada',         region: 'americas', capT:  3.4, note: 'TSX',                       badge: null },
    { rank:  7, country: 'France',         region: 'emea',     capT:  3.2, note: 'Euronext Paris',            badge: null },
    { rank:  8, country: 'Saudi Arabia',   region: 'emea',     capT:  2.8, note: 'Tadawul',                   badge: null },
    { rank:  9, country: 'Germany',        region: 'emea',     capT:  2.4, note: 'Deutsche Börse',            badge: null },
    { rank: 10, country: 'South Korea',    region: 'asia',     capT:  2.3, note: 'KRX',                       badge: { text: '↑ +45%', dir: 'up' } },
  ],
  equityFacts: [
    { value: '$65T', label: 'USA market alone' },
    { value:  '48%', label: 'US share of global equity' },
    { value: '2.1×', label: 'equities vs. bonds' },
  ],
};

// ── Country flag lookup ───────────────────────────────────────────────────────
const FLAGS = {
  'United States':  '🇺🇸',
  'China':          '🇨🇳',
  'Japan':          '🇯🇵',
  'India':          '🇮🇳',
  'United Kingdom': '🇬🇧',
  'Canada':         '🇨🇦',
  'France':         '🇫🇷',
  'Saudi Arabia':   '🇸🇦',
  'Germany':        '🇩🇪',
  'South Korea':    '🇰🇷',
};

// ── Ordering for scale strip and panels ──────────────────────────────────────
const ASSET_ORDER = ['re', 'bond', 'eq', 'm2', 'gold', 'crypto'];

// ── Utilities ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function fmt(value, decimals = 1) {
  return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtT(value) { return `$${fmt(value)}T`; }
function fmtB(value) { return `$${fmt(value, 0)}B`; }

function staleAttrs(item) {
  return item?.stale ? ' data-stale title="Using last known value (live fetch failed)"' : '';
}

function timeAgo(isoDate) {
  if (!isoDate) return 'unknown';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const h = diffMs / 3600000;
  if (h < 0.5) return 'just now';
  if (h < 1)   return 'less than an hour ago';
  if (h < 24)  return `${Math.floor(h)}h ago`;
  if (h < 48)  return 'yesterday';
  return `${Math.floor(h / 24)}d ago`;
}

function isOld(isoDate) {
  if (!isoDate) return true;
  return (Date.now() - new Date(isoDate).getTime()) > 25 * 3600000;
}

// Returns HTML string for a delta chip, or '' when delta is null.
function deltaBadge(delta, label, title = '') {
  if (!delta || delta.pct == null) return '';
  const dir   = delta.pct > 0.04 ? 'up' : delta.pct < -0.04 ? 'down' : 'flat';
  const arrow = delta.pct > 0.04 ? '▲' : delta.pct < -0.04 ? '▼' : '—';
  const sign  = delta.pct > 0 ? '+' : '';
  const tip   = title || (label === '1d' ? 'Change vs. yesterday\'s automated snapshot' : 'Change vs. snapshot from ~30 days ago');
  return `<span class="delta-badge delta-${dir}" title="${tip}">${arrow} ${sign}${delta.pct.toFixed(1)}% <span class="delta-period">${label}</span></span>`;
}

// Renders a tiny inline SVG sparkline from an array of {date, value} points.
function miniSparklineSVG(points, color) {
  if (!points || points.length < 3) return '';
  const vals  = points.map(p => p.totalT ?? p.impliedCapT ?? 0);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 0.001;
  const W = 120, H = 28, PAD = 2;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = vals[0], last = vals[vals.length - 1];
  const trend = last > first ? '+' : last < first ? '−' : '≈';
  return `
    <div class="mini-spark" title="${trend} ${points[0].date} → ${points[points.length-1].date}">
      <svg viewBox="0 0 ${W} ${H + 2}" class="mini-spark-svg">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"
          stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>`;
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadData(bypassCache = false) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    // On manual refresh, append a timestamp so the browser never serves a
    // stale cached copy of the JSON.
    const url = bypassCache
      ? `data/market-data.json?t=${Date.now()}`
      : 'data/market-data.json';
    const res = await fetch(url, {
      signal: controller.signal,
      cache:  bypassCache ? 'no-store' : 'default',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[worlds-money] fetch failed, using fallback data:', err.message);
    return FALLBACK_DATA;
  }
}

// ── Theme management ─────────────────────────────────────────────────────────
function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function currentTheme() {
  return document.documentElement.dataset.theme || (prefersDark() ? 'dark' : 'light');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}
function initTheme() {
  const sys = prefersDark() ? 'dark' : 'light';
  applyTheme(sys);
}
function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

// ── Ordered asset class helper ───────────────────────────────────────────────
function orderedAssets(assetClasses) {
  return ASSET_ORDER.map(id => assetClasses.find(a => a.id === id)).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Render functions
// ─────────────────────────────────────────────────────────────────────────────

function renderRefreshStatus(data) {
  const el = $('refresh-status');
  if (!el) return;
  const ts = data.meta?.generatedAt;
  const hasStale = data.assetClasses.some(a => a.stale);
  const ago = timeAgo(ts);
  const old = isOld(ts);

  let cls = '';
  if (hasStale) cls = 'stale-warning';
  else if (old)  cls = 'old-warning';

  el.className = `refresh-status${cls ? ` ${cls}` : ''}`;
  el.title = ts ? `Generated: ${new Date(ts).toUTCString()}` : '';
  el.textContent = `refreshed ${ago}${hasStale ? ' · some data stale' : ''}`;
}

function renderHero(data) {
  const el = $('hero');
  if (!el) return;

  const assets = orderedAssets(data.assetClasses);
  const total  = assets.reduce((s, a) => s + a.valueT, 0);
  const crypto = data.assetClasses.find(a => a.id === 'crypto');
  const cryptoPct = ((crypto.valueT / total) * 100).toFixed(2);
  const us = data.countryEquityMarkets?.find(m => m.rank === 1);
  const eqA = data.assetClasses.find(a => a.id === 'eq');

  const tips = {
    re:     `${fmt((data.assetClasses.find(a=>a.id==='re').valueT / total)*100, 1)}% of all tracked wealth`,
    bond:   `${fmt(data.assetClasses.find(a=>a.id==='bond').valueT / crypto.valueT, 0)}× the size of crypto`,
    eq:     us ? `US alone: ${fmtT(us.capT)} — ${fmt(us.capT / eqA.valueT * 100, 0)}% of global equities` : '',
    m2:     `${fmt(data.assetClasses.find(a=>a.id==='m2').valueT / crypto.valueT, 0)}× total crypto market cap`,
    gold:   `${fmt(data.gold.aboveGroundTonnes / 1000, 0)}k tonnes above ground · ${fmt(data.gold.aboveGroundTonnes / 1000, 0)}k × 32,150 oz/tonne`,
    crypto: data.crypto.top5?.length >= 3
      ? data.crypto.top5.slice(0, 5).map(c => {
          const p = c.priceUsd;
          const pFmt = p >= 10000 ? `$${fmt(p, 0)}` : p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`;
          return `<span class="tip-coin"><span class="tip-coin-sym">${c.symbol}</span><span class="tip-coin-px mono">${pFmt}</span></span>`;
        }).join('')
      : `${fmt((1 - crypto.valueT / data.crypto.athT) * 100, 0)}% below ATH of ${fmtT(data.crypto.athT)}`,
  };

  const keyPrices = {
    gold:   `$${fmt(data.gold.spotUsdPerOz, 0)}/oz`,
    crypto: `$${fmt(data.crypto.btc.priceUsd, 0)} BTC`,
  };

  el.innerHTML = `
    <div class="section-inner hero-inner">
      <div class="hero-headline">
        <p class="hero-eyebrow">Global wealth · six asset classes · live Tier-1 data</p>
        <div class="hero-total">
          <span class="hero-total-num mono">${fmtT(total)}</span>
          <span class="hero-total-label">total tracked across 6 asset classes</span>
        </div>
      </div>
      <div class="hero-grid" role="list" aria-label="Asset class totals">
        ${assets.map(a => {
          const d = data.deltas ?? {};
          const dayD   = d.day?.[a.id]   ?? null;
          const monthD = d.month?.[a.id] ?? null;
          const deltaHtml = a.tier === 1
            ? `<div class="hero-item-deltas">
                ${deltaBadge(dayD,   '1d')}
                ${deltaBadge(monthD, '30d')}
                ${!dayD && !monthD ? '<span class="delta-badge delta-na" title="Deltas available after 24h of automated snapshots">— history building</span>' : ''}
               </div>`
            : `<div class="hero-item-deltas"><span class="delta-badge delta-na" title="This figure is manually reviewed each month">monthly curated</span></div>`;
          return `
          <div class="hero-item hero-item--${a.id}" role="listitem" tabindex="0">
            <div class="hero-item-value mono"${staleAttrs(a)}>${fmtT(a.valueT)}</div>
            ${deltaHtml}
            <div class="hero-item-name">${a.name}</div>
            ${keyPrices[a.id] ? `<div class="hero-item-price">${keyPrices[a.id]}</div>` : ''}
            <div class="hero-item-date dim">${a.source}</div>
            <div class="hero-tip" aria-hidden="true">
              <p class="hero-tip-sub">${a.sub}</p>
              ${tips[a.id] ? `<div class="hero-tip-fact">${tips[a.id]}</div>` : ''}
              <p class="hero-tip-tier">Tier ${a.tier} · ${a.tier === 1 ? 'live · updated daily' : 'updated monthly'}</p>
            </div>
          </div>`;
        }).join('')}
      </div>
      <p class="hero-legend" role="note">
        <span class="delta-badge delta-up" aria-hidden="true">▲ example</span>&thinsp;
        <span class="delta-badge delta-down" aria-hidden="true">▼ example</span>
        Changes are vs. automated daily snapshots.
        <span class="delta-badge delta-na" aria-hidden="true">monthly curated</span>
        assets update when manually revised.
      </p>
      <p class="hero-kicker">
        Crypto = <strong>${cryptoPct}%</strong> of all tracked wealth
        &nbsp;·&nbsp; gold is
        <strong>${fmt(data.gold.impliedCapT / crypto.valueT, 1)}×</strong> larger
      </p>
    </div>
  `;
}

function renderScaleStrip(data) {
  const track = $('scale-track');
  if (!track) return;

  const assets = orderedAssets(data.assetClasses);
  const maxVal = assets[0].valueT;

  track.innerHTML = assets.map(a => {
    const pct   = (a.valueT / maxVal) * 100;
    const dayD  = data.deltas?.day?.[a.id]   ?? null;
    const strip = dayD ? deltaBadge(dayD, '1d') : '';
    return `
      <div class="bar-row" data-id="${a.id}">
        <div class="bar-label">
          <span class="bar-name">${a.name}</span>
          <span class="bar-meta"${staleAttrs(a)}>${a.source} · ${a.asOf.slice(0,7)}</span>
          ${strip ? `<span class="bar-delta">${strip}</span>` : ''}
        </div>
        <div class="bar-container" role="group" aria-label="${a.name} bar">
          <div class="bar-fill bar-fill--${a.id}"
               style="--target-width: ${pct.toFixed(4)}%"
               role="progressbar"
               aria-valuenow="${a.valueT.toFixed(1)}"
               aria-valuemin="0"
               aria-valuemax="${maxVal.toFixed(1)}"
               aria-label="${a.name}: ${fmtT(a.valueT)}">
          </div>
          <span class="bar-value"${staleAttrs(a)}>${fmtT(a.valueT)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderHundredBill(data) {
  const el = $('chips-row');
  if (!el) return;

  const assets = orderedAssets(data.assetClasses);
  const total  = assets.reduce((s, a) => s + a.valueT, 0);

  el.innerHTML = assets.map(a => {
    const dollars = (a.valueT / total) * 100;
    const display = dollars < 1 ? `$${dollars.toFixed(2)}` : `$${Math.round(dollars)}`;
    return `
      <div class="chip chip--${a.id}">
        <span class="chip-amount mono"${staleAttrs(a)}>${display}</span>
        <span class="chip-label">${a.name}</span>
      </div>
    `;
  }).join('');
}

function renderAssetPanels(data) {
  const grid = $('panels-grid');
  if (!grid) return;

  const assets = orderedAssets(data.assetClasses);
  const crypto = data.assetClasses.find(a => a.id === 'crypto');
  const total  = assets.reduce((s, a) => s + a.valueT, 0);

  // One highlight fact per panel (all computed from raw values)
  const facts = {
    re:     `${fmt((data.assetClasses.find(a=>a.id==='re').valueT / total)*100, 1)}% of all tracked wealth`,
    bond:   `${fmt(data.assetClasses.find(a=>a.id==='bond').valueT / crypto.valueT, 0)}× the size of crypto`,
    eq:     data.equityFacts.map(f => `<strong>${f.value}</strong> ${f.label}`).join(' · '),
    m2:     `${fmt(data.assetClasses.find(a=>a.id==='m2').valueT / crypto.valueT, 0)}× total crypto market cap`,
    gold:   `$${fmt(data.gold.spotUsdPerOz, 0)}/oz · ${fmt(data.gold.aboveGroundTonnes/1000, 0)}k tonnes above ground`,
    crypto: `${fmt((1 - crypto.valueT / data.crypto.athT) * 100, 0)}% below Oct ${data.crypto.athDate.slice(0,4)} ATH of ${fmtT(data.crypto.athT)}`,
  };

  const SPARK_COLOR = { gold: 'var(--c-gold)', crypto: 'var(--c-crypto)' };
  const SPARK_POINTS = {
    gold:   data.gold?.sparklineData?.map(p => ({ ...p, totalT: p.impliedCapT })),
    crypto: data.crypto?.sparklineData,
  };

  grid.innerHTML = assets.map(a => {
    const dayD   = data.deltas?.day?.[a.id]   ?? null;
    const monthD = data.deltas?.month?.[a.id] ?? null;
    const sparkPts = SPARK_POINTS[a.id];
    const sparkHtml = sparkPts?.length >= 3
      ? miniSparklineSVG(sparkPts.slice(-30), SPARK_COLOR[a.id])
      : '';
    const deltaRow = (dayD || monthD) ? `
      <div class="panel-deltas">
        ${deltaBadge(dayD,   '1d')}
        ${deltaBadge(monthD, '30d')}
      </div>` : '';

    return `
    <article class="panel panel--${a.id}" aria-label="${a.name} panel">
      <div class="panel-header">
        <span class="panel-name">${a.name}</span>
        <span class="panel-tier panel-tier--${a.tier}">Tier ${a.tier}</span>
      </div>
      <div class="panel-value"${staleAttrs(a)}>${fmtT(a.valueT)}</div>
      ${deltaRow}
      <p class="panel-sub">${a.sub}</p>
      <p class="panel-fact">${facts[a.id] ?? ''}</p>
      ${sparkHtml}
      <p class="panel-source dim">
        ${a.source}${a.asOf ? ` · ${a.asOf.slice(0,7)}` : ''}
        ${a.stale ? '<span class="source-stale-badge">stale</span>' : ''}
      </p>
    </article>`;
  }).join('');
}

function renderCountryLeague(data) {
  const list = $('league-list');
  if (!list) return;

  const markets   = data.countryEquityMarkets;
  const usCapT    = markets.find(m => m.rank === 1)?.capT ?? 1;

  list.innerHTML = markets.map(m => {
    const pct    = (m.capT / usCapT) * 100;
    const flag   = FLAGS[m.country] ?? '🏳';
    const badge  = m.badge
      ? `<span class="league-badge league-badge--${m.badge.dir}" aria-label="${m.badge.text}">${m.badge.text}</span>`
      : '';

    return `
      <div class="league-item bar-row" data-region="${m.region}">
        <span class="league-rank mono">${m.rank}</span>
        <span class="league-flag" role="img" aria-label="${m.country} flag">${flag}</span>
        <span class="league-country">
          ${m.country}
          <span class="league-note">${m.note}</span>
        </span>
        <div class="league-bar-container bar-container" role="group" aria-label="${m.country} market cap bar">
          <div class="league-bar-fill bar-fill league-bar-fill--${m.region}"
               style="--target-width: ${pct.toFixed(2)}%"
               role="progressbar"
               aria-valuenow="${m.capT}"
               aria-valuemin="0"
               aria-valuemax="${usCapT}"
               aria-label="${m.country}: ${fmtT(m.capT)}">
          </div>
        </div>
        <span class="league-cap mono">${fmtT(m.capT)}</span>
        ${badge}
      </div>
    `;
  }).join('');
}

function renderCryptoAnatomy(data) {
  const c = data.crypto;

  // Update section title
  const titleSpan = $('crypto-total-display');
  if (titleSpan) titleSpan.textContent = fmt(c.totalT);

  // ── Donut chart ──────────────────────────────────────────────────────────
  const donutWrap = $('donut-wrap');
  if (donutWrap) {
    const totalB      = c.totalT * 1000;  // convert T → B for denominator
    const btcPct      = c.btc.dominancePct;
    const ethPct      = c.eth.dominancePct;
    const stablePct   = Math.min((c.stablecoinsB / totalB) * 100, 100 - btcPct - ethPct - 0.1);
    const otherPct    = Math.max(100 - btcPct - ethPct - stablePct, 0);

    const segments = [
      { pct: btcPct,    color: '#f97316', label: 'Bitcoin' },
      { pct: ethPct,    color: '#a78bfa', label: 'Ethereum' },
      { pct: stablePct, color: '#34d399', label: 'Stablecoins' },
      { pct: otherPct,  color: '#4f81ff', label: 'Other' },
    ];

    const R = 80, SW = 24;
    const CX = 100, CY = 100;
    const circ = 2 * Math.PI * R;
    let dashOffset = 0;
    const circles = segments.map(seg => {
      const dash = (seg.pct / 100) * circ;
      const gap  = circ - dash;
      const el   = `<circle
        cx="${CX}" cy="${CY}" r="${R}"
        fill="none"
        stroke="${seg.color}"
        stroke-width="${SW}"
        stroke-dasharray="${dash.toFixed(3)} ${gap.toFixed(3)}"
        stroke-dashoffset="${(-dashOffset).toFixed(3)}"
        class="donut-segment"
        aria-label="${seg.label}: ${seg.pct.toFixed(1)}%"
      />`;
      dashOffset += dash;
      return el;
    }).join('');

    const legendItems = segments.map(seg => `
      <div class="donut-legend-item">
        <span class="donut-legend-swatch" style="background:${seg.color}"></span>
        <span>${seg.label}</span>
        <span class="donut-legend-pct mono">${seg.pct.toFixed(1)}%</span>
      </div>
    `).join('');

    donutWrap.innerHTML = `
      <svg class="donut-svg" viewBox="0 0 200 200" role="img"
           aria-label="Crypto market composition donut chart">
        ${circles}
      </svg>
      <div class="donut-center">
        <span class="donut-center-value mono">${fmtT(c.totalT)}</span>
        <span class="donut-center-label">total</span>
      </div>
      <div class="donut-legend" aria-label="Donut chart legend">
        ${legendItems}
      </div>
    `;
  }

  // ── Stats panel ───────────────────────────────────────────────────────────
  const statsEl = $('crypto-stats');
  if (statsEl) {
    const drawdownPct = ((1 - c.totalT / c.athT) * 100).toFixed(0);
    const drawdownCls = parseFloat(drawdownPct) > 0 ? 'crypto-drawdown' : '';

    // Top-5 price table (if available)
    let top5Html = '';
    if (c.top5?.length >= 3) {
      const rows = c.top5.slice(0, 5).map(coin => {
        const p = coin.priceUsd;
        const pFmt = p >= 10000 ? `$${fmt(p, 0)}`
                   : p >= 100   ? `$${fmt(p, 0)}`
                   : p >= 1     ? `$${p.toFixed(2)}`
                   :              `$${p.toFixed(4)}`;
        const chg = coin.change24hPct ?? 0;
        const chgCls = chg > 0 ? 'chg-up' : chg < 0 ? 'chg-down' : 'chg-flat';
        const chgStr = `${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`;
        return `
          <div class="top5-row">
            <span class="top5-rank mono">${coin.rank}</span>
            <span class="top5-sym">${coin.symbol}</span>
            <span class="top5-price mono">${pFmt}</span>
            <span class="top5-chg ${chgCls}">${chgStr}</span>
            <span class="top5-cap dim">${fmtB(coin.capB)}</span>
          </div>`;
      }).join('');
      top5Html = `
        <div class="crypto-stat-row top5-block">
          <span class="crypto-stat-label">Top 5 by market cap</span>
          <div class="top5-list">${rows}</div>
        </div>`;
    }

    statsEl.innerHTML = `
      ${top5Html}
      <div class="crypto-stat-row">
        <span class="crypto-stat-label">Stablecoins</span>
        <span class="crypto-stat-value mono">${fmtB(c.stablecoinsB)}</span>
        <span class="crypto-stat-sub">${fmt((c.stablecoinsB / (c.totalT * 1000)) * 100, 1)}% of crypto (USDT-based approx)</span>
      </div>
      <div class="crypto-stat-row">
        <span class="crypto-stat-label">24h volume</span>
        <span class="crypto-stat-value mono">${fmtB(c.volume24hB)}</span>
      </div>
      <div class="crypto-stat-row">
        <span class="crypto-stat-label">All-time high</span>
        <span class="crypto-stat-value mono">${fmtT(c.athT)}</span>
        <span class="crypto-stat-sub">${c.athDate}</span>
      </div>
      <div class="crypto-stat-row">
        <span class="crypto-stat-label">Drawdown from ATH</span>
        <span class="crypto-stat-value mono ${drawdownCls}">${drawdownPct}%</span>
        <span class="crypto-stat-sub">below ${fmtT(c.athT)}</span>
      </div>
    `;
  }

  // ── Sparkline ─────────────────────────────────────────────────────────────
  renderSparkline(c.sparklineData);
}

function renderSparkline(sparklineData) {
  const el = $('sparkline-wrap');
  if (!el) return;

  if (!Array.isArray(sparklineData) || sparklineData.length < 7) {
    el.hidden = true;
    return;
  }

  const pts   = sparklineData.slice(-30);
  const vals  = pts.map(d => d.totalT);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 0.001;
  const W = 300, H = 44, PAD = 2;

  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  el.innerHTML = `
    <p class="sparkline-label">30-day crypto cap trend</p>
    <svg viewBox="0 0 ${W} ${H + 4}" role="img"
         aria-label="Sparkline: crypto market cap last ${vals.length} days, ${fmtT(min)} to ${fmtT(max)}">
      <polyline
        points="${points}"
        fill="none"
        stroke="var(--c-crypto)"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
    <p class="sparkline-label" style="display:flex;justify-content:space-between;max-width:300px">
      <span>${pts[0].date}</span>
      <span>${pts[pts.length-1].date}</span>
    </p>
  `;
  el.hidden = false;
}

function renderDerivatives(data) {
  const wrap  = $('ghost-bar-wrap');
  const intro = $('ghost-bar-intro');
  if (!wrap) return;

  const d   = data.derivatives;
  const re  = data.assetClasses.find(a => a.id === 're');
  // Notional width relative to real estate (the widest real asset)
  const notionalPct  = Math.min((d.notionalT  / re.valueT) * 100, 100);
  const grossPct     = Math.min((d.grossMarketValueT / re.valueT) * 100, 100);

  // Use static placeholder so this is idempotent on re-render
  if (intro) {
    intro.innerHTML = `
      Derivatives are not wealth — they are contracts that reference underlying assets.
      Notional value counts the face value of every contract, not what anyone stands to gain or lose.
      <strong>Gross market value</strong> (${fmtT(d.grossMarketValueT)}) is a better measure of real exposure.
      Both are shown with a dashed bar to signal they are <em>not</em> on the same scale as the assets above.
    `;
  }

  wrap.innerHTML = `
    <div class="ghost-item">
      <div class="ghost-label-row">
        <span class="ghost-name">Notional value (all derivatives)</span>
        <span class="ghost-value mono">${fmtT(d.notionalT)}</span>
      </div>
      <div class="ghost-bar-container" role="img" aria-label="Notional value bar: ${fmtT(d.notionalT)}">
        <div class="ghost-bar-fill" style="width:${notionalPct.toFixed(2)}%"></div>
      </div>
      <span class="ghost-note">
        Face value of all OTC + exchange-traded contracts · source: ${d.source}
      </span>
    </div>
    <div class="ghost-item">
      <div class="ghost-label-row">
        <span class="ghost-name">Gross market value (real exposure)</span>
        <span class="ghost-value mono">${fmtT(d.grossMarketValueT)}</span>
      </div>
      <div class="ghost-bar-container" role="img" aria-label="Gross market value bar: ${fmtT(d.grossMarketValueT)}">
        <div class="ghost-bar-fill" style="width:${grossPct.toFixed(2)}%"></div>
      </div>
      <span class="ghost-note">
        Cost to replace all contracts at current prices · source: ${d.source}
      </span>
    </div>
    <p class="ghost-disclaimer">
      ⚠ Bars above are scaled to global real estate ($${fmt(re.valueT)}T) for orientation only.
      Notional and gross market values <strong>cannot</strong> be summed with real-asset totals.
    </p>
  `;
}

function renderTakeaways(data) {
  const grid = $('takeaways-grid');
  if (!grid) return;

  const ac     = data.assetClasses;
  const crypto = ac.find(a => a.id === 'crypto');
  const gold   = ac.find(a => a.id === 'gold');
  const re     = ac.find(a => a.id === 're');
  const eq     = ac.find(a => a.id === 'eq');
  const bond   = ac.find(a => a.id === 'bond');
  const total  = ac.reduce((s, a) => s + a.valueT, 0);
  const us     = data.countryEquityMarkets.find(m => m.rank === 1);

  // All computed from raw JSON values — never hardcoded
  const items = [
    {
      value: `${fmt(crypto.valueT / total * 100, 2)}%`,
      label: 'of all tracked global wealth is crypto',
    },
    {
      value: `${fmt(gold.valueT / crypto.valueT, 1)}×`,
      label: `gold is larger than total crypto`,
    },
    {
      value: `${fmt(eq.valueT / crypto.valueT, 1)}×`,
      label: 'global equities vs. total crypto',
    },
    {
      value: `${fmt(re.valueT / crypto.valueT, 0)}×`,
      label: 'global real estate vs. crypto',
    },
    {
      value: `${fmt((1 - data.crypto.totalT / data.crypto.athT) * 100, 0)}%`,
      label: `below all-time high of ${fmtT(data.crypto.athT)} (${data.crypto.athDate})`,
    },
    {
      value: fmtT(us?.capT ?? 0),
      label: `US equity market alone — ${fmt((us?.capT ?? 0) / eq.valueT * 100, 0)}% of global equities`,
    },
    {
      value: `${fmt(bond.valueT / eq.valueT, 2)}×`,
      label: 'bonds vs. equities by value',
    },
    {
      value: `$${fmt(data.gold.spotUsdPerOz, 0)}/oz`,
      label: `gold spot · implied cap ${fmtT(data.gold.impliedCapT)}`,
    },
  ];

  grid.innerHTML = items.map(item => `
    <div class="takeaway">
      <div class="takeaway-value mono">${item.value}</div>
      <div class="takeaway-label">${item.label}</div>
    </div>
  `).join('');
}

function renderSources(data) {
  const list = $('sources-list');
  if (!list) return;

  const rows = data.assetClasses.map(a => `
    <div class="source-row">
      <span class="source-id">${a.id.toUpperCase()}</span>
      <span class="source-name">${a.sub}${a.stale ? '<span class="source-stale-badge">stale</span>' : ''}</span>
      <span class="source-date mono">${a.source} · ${a.asOf.slice(0,7)}</span>
    </div>
  `).join('');

  const derivRow = `
    <div class="source-row">
      <span class="source-id">DERIV</span>
      <span class="source-name">OTC derivatives notional + gross market value</span>
      <span class="source-date mono">${data.derivatives.source} · ${data.derivatives.asOf}</span>
    </div>
  `;

  const note = `
    <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1.5rem;line-height:1.6">
      Tier 1 data (crypto, gold) is fetched daily by a GitHub Actions cron job.
      Tier 2 data (real estate, bonds, equities, M2) is updated monthly from the sources above.
      All figures in USD trillions. Derivatives are listed for context only and are excluded from all wealth totals.
    </p>
  `;

  list.innerHTML = rows + derivRow + note;
}

// ── Main render dispatcher ────────────────────────────────────────────────────
function renderAll(data) {
  // Run each section independently so one failure doesn't blank the whole page
  const steps = [
    renderRefreshStatus,
    renderHero,
    renderScaleStrip,
    renderHundredBill,
    renderAssetPanels,
    renderCountryLeague,
    renderCryptoAnatomy,
    renderDerivatives,
    renderTakeaways,
    renderSources,
  ];
  for (const fn of steps) {
    try { fn(data); }
    catch (err) { console.error(`[worlds-money] ${fn.name} failed:`, err); }
  }

  // Reveal all sections that were hidden during initial load
  document.querySelectorAll('#main-content section[hidden]').forEach(s => {
    s.removeAttribute('hidden');
  });
  const loading = $('loading-state');
  if (loading) loading.hidden = true;
}

// ── Animation: IntersectionObserver for bar rows ──────────────────────────────
function setupObserver() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.bar-row').forEach(el => el.classList.add('animate'));
    return;
  }

  const obs = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('animate');
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  // Observe only rows that haven't animated yet
  document.querySelectorAll('.bar-row:not(.animate)').forEach(el => obs.observe(el));
}

// ── Done toast ────────────────────────────────────────────────────────────────
function showDoneToast() {
  const toast = $('refresh-toast');
  if (!toast) return;
  toast.classList.remove('show');
  void toast.offsetWidth;   // force reflow so the animation restarts cleanly
  toast.classList.add('show');
}

// ── Refresh button handler ────────────────────────────────────────────────────
async function refreshData() {
  const btn    = $('refresh-btn');
  const status = $('refresh-status');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  if (status) { status.textContent = 'refreshing…'; status.className = 'refresh-status'; }

  try {
    const data = await loadData(true);   // bypassCache = true
    document.querySelectorAll('.bar-row.animate').forEach(el => el.classList.remove('animate'));
    renderAll(data);
    setupObserver();
    showDoneToast();
  } catch (err) {
    console.error('[worlds-money] Refresh failed:', err);
    if (status) status.textContent = 'refresh failed';
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  $('theme-toggle')?.addEventListener('click', toggleTheme);
  $('refresh-btn')?.addEventListener('click', refreshData);

  try {
    const data = await loadData();
    renderAll(data);
    setupObserver();
  } catch (err) {
    // This path should never be reached — renderAll is internally protected.
    // Shown here as a last-resort safety net.
    console.error('[worlds-money] Fatal init error:', err);
    const loading = $('loading-state');
    if (loading) {
      loading.innerHTML = `
        <p style="color:var(--danger)">
          ⚠ Could not render market data.
          <button onclick="location.reload()" style="text-decoration:underline;background:none;border:none;color:inherit;cursor:pointer">Reload page</button>
        </p>`;
    }
    document.querySelectorAll('#main-content section[hidden]').forEach(s => {
      s.removeAttribute('hidden');
    });
  }
}

init();
