/**
 * app.js  —  The World's Money, to Scale
 *
 * Loads data/market-data.json, renders every section of the page.
 * No figures are hardcoded here — all numbers come from the JSON.
 * Falls back to FALLBACK_DATA when the fetch fails (file:// or network error).
 */

'use strict';

// ── Inline fallback (mirrors initial market-data.json; used for file:// opens) ──
// Shared x-axis for all yearlyTrend series (2026 = latest value, mid-year).
// Mirrors TREND_YEARS in scripts/refresh-data.mjs.
const TREND_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const FALLBACK_DATA = {
  meta: { generatedAt: '2026-07-03T00:00:00.000Z', currency: 'USD', unit: 'trillion', version: 2 },
  assetClasses: [
    { id: 're',    name: 'Real Estate',  sub: 'Global residential + commercial property', valueT: 393.3, asOf: '2025-01-01', source: 'Savills, 2025',      tier: 2, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [217, 228, 281, 280, 297, 327, 380, 380, 380, 385, 393, 393], source: 'Savills World Research, year-end totals' } },
    { id: 'bond',  name: 'Bonds',        sub: 'Global debt securities outstanding',       valueT: 156.0, asOf: '2025-08-01', source: 'BIS, Aug 2025',     tier: 2, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [97, 100, 106, 103, 115, 128, 130, 126, 133, 141, 150, 156], source: 'BIS debt securities statistics' } },
    { id: 'eq',    name: 'Equities',     sub: 'Global listed market capitalisation',      valueT: 135.0, asOf: '2025-12-01', source: 'Bloomberg/WFE',     tier: 2, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [67, 70, 85, 74, 88, 105, 122, 98, 111, 128, 135, 135], source: 'WFE / Bloomberg year-end market cap' } },
    { id: 'm2',    name: 'Broad Money',  sub: 'Cash, bank deposits & savings — money created by central banks and the lending system',  valueT: 101.7, asOf: '2026-07-01', source: 'StreetStats, Jul 2026', tier: 2, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [53, 57, 62, 64, 68, 78, 85, 82, 86, 92, 98, 102], source: 'Fed + ECB + PBoC + BoJ, year-end M2' } },
    { id: 'gold',  name: 'Gold',         sub: 'All above-ground gold × spot price',       valueT:  23.5, asOf: '2026-07-03', source: 'Gold API / WGC',    tier: 1, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [7.5, 8.1, 9.2, 9.1, 10.8, 13.4, 12.9, 12.9, 14.6, 18.6, 29.0, 29.2], source: 'WGC 220k tonnes × year-end spot' } },
    { id: 'crypto',name: 'Crypto',       sub: 'Total crypto market capitalisation',       valueT:   3.3, asOf: '2026-07-03', source: 'CoinGecko',         tier: 1, stale: false,
      yearlyTrend: { years: TREND_YEARS, valuesT: [0.007, 0.02, 0.6, 0.13, 0.19, 0.77, 2.3, 0.8, 1.7, 3.4, 3.5, 2.3], source: 'CoinGecko year-end total cap' } },
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
  worldGdp: {
    totalT: 126.0, asOf: '2026-01-01', source: 'IMF WEO, Apr 2026',
    topCountries: [
      { rank: 1,  country: 'United States',  gdpT: 32.4, popM: 341,  medianAge: 38.9, workPopPct: 65 },
      { rank: 2,  country: 'China',          gdpT: 20.9, popM: 1408, medianAge: 39.0, workPopPct: 68 },
      { rank: 3,  country: 'Germany',        gdpT: 5.5,  popM: 84,   medianAge: 44.6, workPopPct: 64 },
      { rank: 4,  country: 'Japan',          gdpT: 4.4,  popM: 124,  medianAge: 49.0, workPopPct: 59 },
      { rank: 5,  country: 'United Kingdom', gdpT: 4.3,  popM: 68,   medianAge: 40.7, workPopPct: 64 },
      { rank: 6,  country: 'India',          gdpT: 4.2,  popM: 1441, medianAge: 28.7, workPopPct: 67 },
      { rank: 7,  country: 'France',         gdpT: 3.6,  popM: 68,   medianAge: 42.3, workPopPct: 62 },
      { rank: 8,  country: 'Italy',          gdpT: 2.7,  popM: 59,   medianAge: 46.6, workPopPct: 63 },
      { rank: 9,  country: 'Canada',         gdpT: 2.5,  popM: 40,   medianAge: 41.8, workPopPct: 66 },
      { rank: 10, country: 'Brazil',         gdpT: 2.1,  popM: 216,  medianAge: 33.7, workPopPct: 70 },
    ],
  },
  centralBanks: {
    totalT: 24.2, peakTotalT: 30.5, peakYear: '2022',
    asOf: '2026-06-01', source: 'Fed / ECB / BoJ / PBoC official releases',
    banks: [
      { name: "People's Bank of China", abbr: 'PBoC', flag: '🇨🇳', balanceSheetT: 6.75 },
      { name: 'Federal Reserve',        abbr: 'Fed',  flag: '🇺🇸', balanceSheetT: 6.74 },
      { name: 'European Central Bank',  abbr: 'ECB',  flag: '🇪🇺', balanceSheetT: 6.73 },
      { name: 'Bank of Japan',          abbr: 'BoJ',  flag: '🇯🇵', balanceSheetT: 3.97 },
    ],
  },
  globalDebt: {
    totalT: 348, debtToGdpPct: 330,
    asOf: '2025-12-31', source: 'IIF Global Debt Monitor, Feb 2026',
    sectors: [
      { id: 'govt', name: 'Government',          valueT: 106.7, color: '#4f81ff' },
      { id: 'corp', name: 'Non-financial Corps', valueT: 100.6, color: '#a78bfa' },
      { id: 'fin',  name: 'Financial Sector',    valueT:  76.1, color: '#fbbf24' },
      { id: 'hh',   name: 'Households',          valueT:  64.6, color: '#34d399' },
    ],
  },
  wealthDistribution: {
    totalT: 477, asOf: '2024-12-31', source: 'UBS Global Wealth Report, 2025',
    tiers: [
      { group: 'Top 1%',     adultsM:   60, sharePct: 48.1 },
      { group: 'Next 9%',    adultsM:  540, sharePct: 38.9 },
      { group: 'Middle 40%', adultsM: 2400, sharePct: 11.2 },
      { group: 'Bottom 50%', adultsM: 3000, sharePct:  1.8 },
    ],
  },
  topPrivateCompanies: {
    asOf: '2026-07-04', source: 'companiesmarketcap.com',
    companies: [
      { rank:  1, name: 'NVIDIA',    ticker: 'NVDA', flag: '🇺🇸', sector: 'AI / Chips',       capT: 4.72 },
      { rank:  2, name: 'Apple',     ticker: 'AAPL', flag: '🇺🇸', sector: 'Consumer Tech',    capT: 4.53 },
      { rank:  3, name: 'Alphabet',  ticker: 'GOOG', flag: '🇺🇸', sector: 'Internet',         capT: 4.35 },
      { rank:  4, name: 'Microsoft', ticker: 'MSFT', flag: '🇺🇸', sector: 'Cloud',            capT: 2.90 },
      { rank:  5, name: 'Amazon',    ticker: 'AMZN', flag: '🇺🇸', sector: 'E-Commerce/Cloud', capT: 2.61 },
      { rank:  6, name: 'TSMC',      ticker: 'TSM',  flag: '🇹🇼', sector: 'Semiconductors',   capT: 2.25 },
      { rank:  7, name: 'SpaceX',    ticker: 'SPCX', flag: '🇺🇸', sector: 'Aerospace',        capT: 2.13 },
      { rank:  8, name: 'Broadcom',  ticker: 'AVGO', flag: '🇺🇸', sector: 'Semiconductors',   capT: 1.71 },
      { rank:  9, name: 'Meta',      ticker: 'META', flag: '🇺🇸', sector: 'Social Media',     capT: 1.48 },
      { rank: 10, name: 'Tesla',     ticker: 'TSLA', flag: '🇺🇸', sector: 'EVs / Energy',     capT: 1.48 },
    ],
  },
  topStateEntities: {
    asOf: '2025-12-31', source: 'SWFI, companiesmarketcap.com',
    entities: [
      { rank:  1, name: 'Norway GPFG',     flag: '🇳🇴', type: 'SWF', country: 'Norway',       valueT: 2.00 },
      { rank:  2, name: 'Saudi Aramco',    flag: '🇸🇦', type: 'SOE', country: 'Saudi Arabia', valueT: 1.68 },
      { rank:  3, name: 'China Inv. Corp', flag: '🇨🇳', type: 'SWF', country: 'China',        valueT: 1.24 },
      { rank:  4, name: 'ADIA',            flag: '🇦🇪', type: 'SWF', country: 'UAE',          valueT: 1.10 },
      { rank:  5, name: 'SAFE (China)',    flag: '🇨🇳', type: 'SWF', country: 'China',        valueT: 1.08 },
      { rank:  6, name: 'Kuwait IA',       flag: '🇰🇼', type: 'SWF', country: 'Kuwait',       valueT: 1.00 },
      { rank:  7, name: 'GIC Singapore',   flag: '🇸🇬', type: 'SWF', country: 'Singapore',    valueT: 0.94 },
      { rank:  8, name: 'PIF',             flag: '🇸🇦', type: 'SWF', country: 'Saudi Arabia', valueT: 0.93 },
      { rank:  9, name: 'Qatar IA',        flag: '🇶🇦', type: 'SWF', country: 'Qatar',        valueT: 0.56 },
      { rank: 10, name: 'Temasek',         flag: '🇸🇬', type: 'SWF', country: 'Singapore',    valueT: 0.49 },
    ],
  },
  marketTrends: {
    asOf: '2025-12-31', source: 'S&P Dow Jones, WGC, Bloomberg, BLS, Federal Reserve',
    assetReturns: {
      years: ['2020','2021','2022','2023','2024','2025'],
      series: [
        { id: 'sp500', label: 'S&P 500', color: '#34d399', returns: [18.4,  28.7, -18.1,  26.3,  25.0,  9.0] },
        { id: 'gold',  label: 'Gold',    color: '#fcd34d', returns: [25.8,  -3.7,   2.1,  13.1,  27.2, 26.0] },
        { id: 'btc',   label: 'Bitcoin', color: '#f97316', returns: [303.0, 60.0, -65.0, 155.0, 121.0, 22.0] },
        { id: 'bonds', label: 'Bonds',   color: '#a78bfa', returns: [7.5,   -1.5, -13.0,   5.5,   1.3,  2.0] },
      ],
    },
    longTermReturns: {
      source: 'S&P 500 total return, gold spot, Bloomberg US Agg Bond TR — year-end cumulative from $1',
      since2010: {
        years: ['2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [1.15,1.18,1.36,1.80,2.05,2.08,2.33,2.84,2.71,3.57,4.23,5.44,4.46,5.63,7.03,7.67],
        gold:  [1.31,1.44,1.52,1.10,1.09,0.98,1.06,1.20,1.18,1.39,1.74,1.68,1.68,1.90,2.41,3.03],
        bonds: [1.07,1.15,1.20,1.17,1.24,1.25,1.28,1.33,1.33,1.44,1.55,1.53,1.33,1.40,1.42,1.45],
      },
      since2000: {
        years: ['2000','2001','2002','2003','2004','2005','2006','2007','2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [0.91,0.80,0.62,0.80,0.89,0.93,1.08,1.14,0.72,0.91,1.05,1.07,1.24,1.64,1.86,1.89,2.12,2.58,2.46,3.24,3.84,4.94,4.05,5.11,6.39,6.97],
        gold:  [0.94,0.95,1.20,1.43,1.51,1.77,2.19,2.89,3.00,3.75,4.90,5.40,5.71,4.15,4.08,3.66,3.97,4.49,4.42,5.23,6.53,6.31,6.29,7.11,9.06,11.42],
        bonds: [1.12,1.21,1.33,1.39,1.45,1.48,1.55,1.66,1.74,1.85,1.97,2.12,2.21,2.16,2.29,2.30,2.37,2.45,2.45,2.66,2.86,2.82,2.45,2.59,2.62,2.67],
      },
      since1990: {
        years: ['1990','1991','1992','1993','1994','1995','1996','1997','1998','1999','2000','2001','2002','2003','2004','2005','2006','2007','2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [0.97,1.27,1.36,1.50,1.52,2.09,2.57,3.43,4.41,5.33,4.85,4.27,3.33,4.28,4.75,4.98,5.77,6.09,3.83,4.85,5.58,5.70,6.61,8.75,9.95,10.09,11.30,13.77,13.16,17.31,20.49,26.37,21.60,27.28,34.09,37.16],
        gold:  [1.00,0.90,0.85,1.00,0.98,0.99,0.94,0.74,0.74,0.74,0.70,0.71,0.89,1.06,1.12,1.31,1.63,2.14,2.23,2.78,3.63,4.00,4.24,3.07,3.03,2.71,2.95,3.33,3.28,3.88,4.85,4.68,4.67,5.28,6.72,8.47],
        bonds: [1.09,1.26,1.36,1.49,1.45,1.72,1.78,1.95,2.12,2.10,2.35,2.54,2.81,2.92,3.05,3.12,3.25,3.48,3.66,3.88,4.13,4.45,4.64,4.55,4.82,4.85,4.98,5.15,5.15,5.60,6.02,5.93,5.16,5.44,5.51,5.62],
      },
    },
    rateAndInflation: {
      labels: ["Jan'20","Jul'20","Jan'21","Jul'21","Jan'22","Jul'22","Jan'23","Jul'23","Jan'24","Jul'24","Jan'25","Jul'25"],
      fedFunds: [1.55, 0.09, 0.09, 0.10, 0.08, 2.33, 4.33, 5.33, 5.33, 5.33, 4.33, 4.33],
      cpiYoY:   [2.5,  1.0,  1.4,  5.4,  7.5,  9.1,  6.4,  3.2,  3.1,  2.9,  3.0,  2.4],
    },
  },
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
  'Italy':          '🇮🇹',
  'Brazil':         '🇧🇷',
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

// Renders a small area chart of curated year-by-year totals ($T) with a caption row.
function miniYearChartSVG(trend, color) {
  if (!trend?.years?.length || trend.years.length < 3 || trend.years.length !== trend.valuesT?.length) return '';
  const { years, valuesT } = trend;
  const min   = Math.min(...valuesT);
  const max   = Math.max(...valuesT);
  const range = max - min || 0.001;
  const W = 120, H = 36, PAD = 3;
  const pts = valuesT.map((v, i) => [
    (i / (valuesT.length - 1)) * W,
    H - PAD - ((v - min) / range) * (H - PAD * 2),
  ]);
  const y0 = years[0], y1 = years[years.length - 1];
  const v0 = valuesT[0], v1 = valuesT[valuesT.length - 1];
  const tip = `${y0}: $${fmt(v0)}T → ${y1}: $${fmt(v1)}T · ${trend.source ?? ''}`;
  return `
    <div class="mini-year" title="${tip}">
      <svg viewBox="0 0 ${W} ${H + 2}" class="mini-year-svg" role="img" aria-label="${y0}–${y1} yearly trend">
        <path d="${areaPath(pts, H - 1)}" fill="${color}" fill-opacity="0.12"/>
        <path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="1.5"
          stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <div class="mini-chart-caption"><span class="mono">${y0}</span><span>yearly · $T</span><span class="mono">${y1}</span></div>
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

// ── Section navigation menu ──────────────────────────────────────────────────
function initNavMenu() {
  const toggle = $('nav-menu-toggle');
  const menu   = $('nav-menu');
  if (!toggle || !menu) return;

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') closeMenu(); });
  document.addEventListener('click', e => {
    if (!menu.hidden && !e.target.closest('.nav-menu-wrap')) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { closeMenu(); toggle.focus(); }
  });
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
    m2:     `M2 counts every dollar that could be spent quickly: coins, notes, checking accounts, savings accounts, and money-market funds. Covers US + Eurozone + China + Japan — ~70% of global GDP. ${fmt(data.assetClasses.find(a=>a.id==='m2').valueT / crypto.valueT, 0)}× the size of crypto.`,
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
    m2:     `M2 = cash + bank deposits + money-market funds. Every loan a bank makes creates new M2. Covers US + EZ + CN + JP. ${fmt(data.assetClasses.find(a=>a.id==='m2').valueT / crypto.valueT, 0)}× the size of all crypto.`,
    gold:   `$${fmt(data.gold.spotUsdPerOz, 0)}/oz · ${fmt(data.gold.aboveGroundTonnes/1000, 0)}k tonnes above ground`,
    crypto: `${fmt((1 - crypto.valueT / data.crypto.athT) * 100, 0)}% below Oct ${data.crypto.athDate.slice(0,4)} ATH of ${fmtT(data.crypto.athT)}`,
  };

  const PANEL_COLOR = {
    re:     'var(--c-re)',
    bond:   'var(--c-bond)',
    eq:     'var(--c-eq)',
    m2:     'var(--c-m2)',
    gold:   'var(--c-gold)',
    crypto: 'var(--c-crypto)',
  };
  const SPARK_POINTS = {
    gold:   data.gold?.sparklineData?.map(p => ({ ...p, totalT: p.impliedCapT })),
    crypto: data.crypto?.sparklineData,
  };

  grid.innerHTML = assets.map(a => {
    const dayD   = data.deltas?.day?.[a.id]   ?? null;
    const monthD = data.deltas?.month?.[a.id] ?? null;
    const yearHtml = miniYearChartSVG(a.yearlyTrend, PANEL_COLOR[a.id]);
    const sparkPts = SPARK_POINTS[a.id];
    const sparkHtml = sparkPts?.length >= 3
      ? miniSparklineSVG(sparkPts.slice(-30), PANEL_COLOR[a.id])
        + '<div class="mini-chart-caption"><span></span><span>30-day live</span><span></span></div>'
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
      ${yearHtml}
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

// ── SVG chart helpers ─────────────────────────────────────────────────────────

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function areaPath(pts, bottomY) {
  if (!pts.length) return '';
  return `${smoothPath(pts)} L${pts[pts.length-1][0].toFixed(1)},${bottomY} L${pts[0][0].toFixed(1)},${bottomY} Z`;
}

const SECTOR_COLORS = {
  'AI / Chips':       '#f97316',
  'Consumer Tech':    '#4f81ff',
  'Internet':         '#34d399',
  'Cloud':            '#a78bfa',
  'E-Commerce/Cloud': '#06b6d4',
  'Semiconductors':   '#fb923c',
  'Aerospace':        '#38bdf8',
  'Social Media':     '#ec4899',
  'EVs / Energy':     '#10b981',
};

function renderCompanyRankings(data) {
  const el = $('company-panels');
  if (!el) return;
  const priv  = data.topPrivateCompanies;
  const state = data.topStateEntities;
  if (!priv || !state) return;

  const maxPriv  = priv.companies[0].capT;
  const maxState = state.entities[0].valueT;

  const privRows = priv.companies.map(c => {
    const pct   = (c.capT  / maxPriv)  * 100;
    const sColor = SECTOR_COLORS[c.sector] ?? 'var(--text-muted)';
    return `
      <div class="co-item">
        <span class="co-rank mono">${c.rank}</span>
        <span class="co-flag">${c.flag}</span>
        <div class="co-info">
          <span class="co-name">${c.name}</span>
          <span class="co-sector" style="color:${sColor}">${c.sector}</span>
        </div>
        <div class="co-bar-wrap bar-container">
          <div class="co-bar-fill co-bar-priv bar-fill"
               style="--target-width:${pct.toFixed(1)}%"
               role="progressbar" aria-valuenow="${c.capT}" aria-valuemax="${maxPriv}">
          </div>
        </div>
        <span class="co-cap mono">${fmtT(c.capT)}</span>
      </div>`;
  }).join('');

  const stateRows = state.entities.map(s => {
    const pct     = (s.valueT / maxState) * 100;
    const typeCls = s.type === 'SOE' ? 'co-type-soe' : 'co-type-swf';
    return `
      <div class="co-item">
        <span class="co-rank mono">${s.rank}</span>
        <span class="co-flag">${s.flag}</span>
        <div class="co-info">
          <span class="co-name">${s.name}</span>
          <span class="co-type-badge ${typeCls}">${s.type}</span>
        </div>
        <div class="co-bar-wrap bar-container">
          <div class="co-bar-fill co-bar-state bar-fill"
               style="--target-width:${pct.toFixed(1)}%"
               role="progressbar" aria-valuenow="${s.valueT}" aria-valuemax="${maxState}">
          </div>
        </div>
        <span class="co-cap mono">${fmtT(s.valueT)}</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="co-panels">
      <div class="co-panel">
        <div class="co-panel-hdr">
          <span class="co-panel-title">Private / Public Markets</span>
          <span class="co-panel-sub dim">${priv.source} · ${priv.asOf.slice(0,7)}</span>
        </div>
        <div class="co-list">${privRows}</div>
      </div>
      <div class="co-panel co-panel--state">
        <div class="co-panel-hdr">
          <span class="co-panel-title">State-Owned Entities</span>
          <span class="co-panel-sub dim">SWF = sovereign wealth fund · SOE = state enterprise</span>
        </div>
        <div class="co-list">${stateRows}</div>
      </div>
    </div>`;
}

function renderGlobalTrends(data) {
  const el = $('trends-charts');
  if (!el) return;
  const t = data.marketTrends;
  if (!t) return;

  // ── Shared: build cumulative SVG from series + xLabels ────────────────────
  function buildCumulativeChart(series, xLabels) {
    const W = 580, H = 230;
    const PL = 42, PR = 72, PT = 18, PB = 36;
    const CW = W - PL - PR, CH = H - PT - PB;
    const n = series[0].cum.length;

    const allVals = series.flatMap(s => s.cum);
    const maxVal  = Math.max(...allVals);
    const minFloor = Math.min(...allVals.filter(v => v > 0)) * 0.85;

    const LY_MIN = Math.log10(Math.max(minFloor, 0.4));
    const LY_MAX = Math.log10(maxVal * 1.18);
    const LY_RNG = LY_MAX - LY_MIN;
    const xS = i => PL + (i / (n - 1)) * CW;
    const yS = v => PT + CH - ((Math.log10(Math.max(v, Math.pow(10, LY_MIN))) - LY_MIN) / LY_RNG) * CH;
    const botY = yS(Math.pow(10, LY_MIN));

    const TICK_POOL = [0.4, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 10, 15, 20, 30, 40];
    const yTicks = TICK_POOL.filter(v => v >= Math.pow(10, LY_MIN) * 0.95 && v <= maxVal * 1.15);

    const grid = yTicks.map(v => {
      const y = yS(v).toFixed(1);
      return `<line x1="${PL}" y1="${y}" x2="${PL+CW}" y2="${y}" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>
              <text x="${PL-4}" y="${(parseFloat(y)+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${v}×</text>`;
    }).join('');

    const xAxisLabels = xLabels.map((lb, i) => {
      if (!lb) return '';
      const x = xS(i).toFixed(1);
      return `<text x="${x}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${lb}</text>`;
    }).join('');

    const chartPaths = series.map(s => {
      const pts = s.cum.map((v, i) => [xS(i), yS(v)]);
      const lp  = smoothPath(pts);
      const ap  = areaPath(pts, botY);
      const ep  = pts[pts.length - 1];
      const val = s.cum[s.cum.length - 1];
      const lbl = val >= 10 ? val.toFixed(1) + '×' : val.toFixed(2) + '×';
      return `<path d="${ap}" fill="${s.color}" opacity="0.08"/>
              <path d="${lp}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="${ep[0].toFixed(1)}" cy="${ep[1].toFixed(1)}" r="3.5" fill="${s.color}"/>
              <text x="${(ep[0]+7).toFixed(1)}" y="${(ep[1]+4).toFixed(1)}" font-size="10" font-weight="700" font-family="var(--font-mono)" fill="${s.color}">${s.label}</text>
              <text x="${(ep[0]+7).toFixed(1)}" y="${(ep[1]+15).toFixed(1)}" font-size="9" font-family="var(--font-mono)" fill="${s.color}" opacity="0.75">${lbl}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Cumulative $1 investment chart">${grid}${xAxisLabels}${chartPaths}</svg>`;
  }

  // ── Build datasets for each period ─────────────────────────────────────────
  // All views use long-term cumulative arrays (S&P 500, Gold, Bonds)
  function mkLongTermDataset(lr, startLabel) {
    if (!lr) return null;
    const series = [
      { label: 'S&P 500', color: '#34d399', cum: [1.00, ...lr.sp500] },
      { label: 'Gold',    color: '#d97706', cum: [1.00, ...lr.gold]  },
      { label: 'Bonds',   color: '#a78bfa', cum: [1.00, ...lr.bonds] },
    ];
    const labels = [startLabel, ...lr.years.map((y, i) => {
      const yr = parseInt(y);
      const isFirst = yr === parseInt(lr.years[0]);
      const isLast  = i === lr.years.length - 1;
      return (!isFirst && yr % 5 === 0) || isLast ? String(yr) : '';
    })];
    return { series, labels };
  }

  const ds2010 = mkLongTermDataset(t.longTermReturns?.since2010, "Jan '10");
  const ds2000 = mkLongTermDataset(t.longTermReturns?.since2000, "Jan '00");
  const ds1990 = mkLongTermDataset(t.longTermReturns?.since1990, "Jan '90");

  const DATASETS = {
    '2010': ds2010 ? { series: ds2010.series, labels: ds2010.labels, sub: `S&P 500, Gold, Bonds · log scale · through Dec 2025 · ${t.source}` } : null,
    '2000': ds2000 ? { series: ds2000.series, labels: ds2000.labels, sub: `S&P 500, Gold, Bonds · log scale · through Dec 2025 · ${t.source}` } : null,
    '1990': ds1990 ? { series: ds1990.series, labels: ds1990.labels, sub: `S&P 500, Gold, Bonds · log scale · through Dec 2025 · ${t.source}` } : null,
  };
  const defaultPeriod = ds2010 ? '2010' : '2000';

  // ── Chart 2: Annual returns bar chart (S&P 500, Gold, Bonds) ──────────────
  function makeReturnsChart() {
    const W = 340, H = 220;
    const PL = 36, PR = 10, PT = 24, PB = 34;
    const CW = W - PL - PR, CH = H - PT - PB;
    const sub = t.assetReturns.series.filter(s => s.id !== 'btc');
    const yrs = t.assetReturns.years;
    const Y_MIN = -22, Y_MAX = 35;
    const Y_RNG = Y_MAX - Y_MIN;
    const yS = v => PT + CH - ((v - Y_MIN) / Y_RNG) * CH;
    const y0 = yS(0);
    const grpW = CW / yrs.length;
    const barW = (grpW - 6) / sub.length;

    const bars = sub.flatMap((s, si) =>
      s.returns.map((v, yi) => {
        const bx = PL + yi * grpW + 3 + si * barW;
        const vClamped = Math.max(Y_MIN, Math.min(Y_MAX, v));
        const top = v >= 0 ? yS(vClamped) : y0;
        const ht  = Math.max(Math.abs(yS(vClamped) - y0), 2);
        return `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${ht.toFixed(1)}" fill="${s.color}" rx="2" opacity="0.85"/>`;
      })
    ).join('');

    const yTicks = [-20, -10, 0, 10, 20, 30];
    const grid = yTicks.map(v => {
      const y = yS(v).toFixed(1);
      return `<line x1="${PL}" y1="${y}" x2="${PL+CW}" y2="${y}" stroke="currentColor" stroke-opacity="${v === 0 ? '0.3' : '0.07'}" stroke-width="1" ${v === 0 ? 'stroke-dasharray="3,3"' : ''}/>
              <text x="${PL-3}" y="${(parseFloat(y)+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${v}%</text>`;
    }).join('');

    const xLbls = yrs.map((yr, i) => {
      const x = (PL + i * grpW + grpW / 2).toFixed(1);
      return `<text x="${x}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${yr}</text>`;
    }).join('');

    const legend = sub.map((s, i) => {
      const lx = PL + i * 90;
      return `<rect x="${lx}" y="${PT-14}" width="8" height="8" fill="${s.color}" rx="2" opacity="0.85"/>
              <text x="${lx+11}" y="${PT-6}" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${s.label}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Annual asset returns 2020-2025">${grid}${bars}${xLbls}${legend}</svg>`;
  }

  // ── Chart 3: Fed Funds Rate + CPI ─────────────────────────────────────────
  function makeRateChart() {
    const W = 340, H = 220;
    const PL = 30, PR = 14, PT = 24, PB = 34;
    const CW = W - PL - PR, CH = H - PT - PB;
    const { labels, fedFunds, cpiYoY } = t.rateAndInflation;
    const n = labels.length;
    const Y_MIN = 0, Y_MAX = 10, Y_RNG = Y_MAX - Y_MIN;
    const xS  = i => PL + (i / (n - 1)) * CW;
    const yS  = v => PT + CH - ((v - Y_MIN) / Y_RNG) * CH;
    const bottomY = yS(0);
    const fedPts = fedFunds.map((v, i) => [xS(i), yS(v)]);
    const cpiPts = cpiYoY.map((v, i)  => [xS(i), yS(v)]);

    const yTicks = [0, 2, 4, 6, 8, 10];
    const grid = yTicks.map(v => {
      const y = yS(v).toFixed(1);
      return `<line x1="${PL}" y1="${y}" x2="${PL+CW}" y2="${y}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"/>
              <text x="${PL-3}" y="${(parseFloat(y)+3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${v}%</text>`;
    }).join('');

    const xLbls = [0, 2, 4, 6, 8, 11].map(i => {
      const x = xS(i).toFixed(1);
      return `<text x="${x}" y="${H-6}" text-anchor="middle" font-size="8" fill="var(--text-muted)" font-family="var(--font-mono)">${labels[i]}</text>`;
    }).join('');

    const legend = `
      <rect x="${PL}" y="${PT-14}" width="8" height="8" fill="#ef4444" rx="2" opacity="0.8"/>
      <text x="${PL+11}" y="${PT-6}" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">CPI YoY</text>
      <rect x="${PL+70}" y="${PT-14}" width="8" height="8" fill="#4f81ff" rx="2" opacity="0.8"/>
      <text x="${PL+81}" y="${PT-6}" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">Fed Rate</text>`;

    // Peak CPI annotation
    const peakIdx = 5; // Jul'22 = 9.1% peak
    const px = xS(peakIdx).toFixed(1), py = (yS(9.1) - 8).toFixed(1);
    const annotation = `<text x="${px}" y="${py}" text-anchor="middle" font-size="9" font-weight="700" fill="#ef4444" font-family="var(--font-mono)">9.1%</text>
      <line x1="${px}" y1="${(parseFloat(py)+2).toFixed(1)}" x2="${px}" y2="${yS(9.1).toFixed(1)}" stroke="#ef4444" stroke-width="1" stroke-dasharray="2,2" opacity="0.6"/>`;

    return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Fed Funds Rate vs CPI inflation 2020-2025">
      ${grid}
      <path d="${areaPath(cpiPts, bottomY)}" fill="#ef4444" opacity="0.08"/>
      <path d="${smoothPath(cpiPts)}" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${areaPath(fedPts, bottomY)}" fill="#4f81ff" opacity="0.08"/>
      <path d="${smoothPath(fedPts)}" fill="none" stroke="#4f81ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${xLbls}${legend}${annotation}
    </svg>`;
  }

  const defaultDs = DATASETS[defaultPeriod];
  el.innerHTML = `
    <div class="trends-grid">
      <div class="trend-card trend-card--full">
        <div class="trend-card-hdr trend-card-hdr--row">
          <div>
            <span class="trend-card-title" id="cumChart-title">$1 Invested Jan ${defaultPeriod}</span>
            <span class="trend-card-sub" id="cumChart-sub">${defaultDs.sub}</span>
          </div>
          <div class="chart-toggles" role="group" aria-label="Select time period">
            ${ds2010 ? `<button class="chart-toggle${defaultPeriod==='2010'?' chart-toggle--active':''}" data-period="2010">Since 2010</button>` : ''}
            ${ds2000 ? `<button class="chart-toggle${defaultPeriod==='2000'?' chart-toggle--active':''}" data-period="2000">Since 2000</button>` : ''}
            ${ds1990 ? `<button class="chart-toggle${defaultPeriod==='1990'?' chart-toggle--active':''}" data-period="1990">Since 1990</button>` : ''}
          </div>
        </div>
        <div id="cumChart-wrap">${buildCumulativeChart(defaultDs.series, defaultDs.labels)}</div>
      </div>
      <div class="trend-card">
        <div class="trend-card-hdr">
          <span class="trend-card-title">Annual Returns</span>
          <span class="trend-card-sub">S&P 500 · Gold · Bitcoin · Bonds · 2020–2025</span>
        </div>
        ${makeReturnsChart()}
      </div>
      <div class="trend-card">
        <div class="trend-card-hdr">
          <span class="trend-card-title">Rates &amp; Inflation</span>
          <span class="trend-card-sub">US Fed Funds Rate vs. CPI · Jan 2020 – Jul 2025</span>
        </div>
        ${makeRateChart()}
      </div>
    </div>`;

  // Wire toggle buttons
  const wrapEl  = document.getElementById('cumChart-wrap');
  const titleEl = document.getElementById('cumChart-title');
  const subEl   = document.getElementById('cumChart-sub');
  el.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      const ds = DATASETS[period];
      if (!ds) return;
      el.querySelectorAll('.chart-toggle').forEach(b => b.classList.toggle('chart-toggle--active', b === btn));
      titleEl.textContent = `$1 Invested Jan ${period}`;
      subEl.textContent   = ds.sub;
      wrapEl.innerHTML    = buildCumulativeChart(ds.series, ds.labels);
    });
  });
}

function renderWorldGdp(data) {
  const listEl = $('gdp-list');
  if (!listEl) return;
  const g = data.worldGdp;
  if (!g) return;

  const maxGdp = g.topCountries[0].gdpT;
  const totalTracked = data.assetClasses.reduce((s, a) => s + a.valueT, 0);

  listEl.innerHTML = g.topCountries.map(c => {
    const pct     = (c.gdpT / maxGdp) * 100;
    const flag    = FLAGS[c.country] ?? '🌐';
    const popFmt  = c.popM >= 1000 ? `${(c.popM / 1000).toFixed(2)}B` : `${c.popM}M`;
    const workM   = c.popM && c.workPopPct ? Math.round(c.popM * c.workPopPct / 100) : null;
    const workFmt = workM ? (workM >= 1000 ? `${(workM / 1000).toFixed(2)}B` : `${workM}M`) : '';
    const demogHtml = (c.popM || c.medianAge || c.workPopPct) ? `
      <div class="gdp-demog">
        ${c.popM      ? `<span class="gdp-stat"><span class="gdp-stat-lbl">pop</span> ${popFmt}</span>` : ''}
        ${c.medianAge ? `<span class="gdp-stat"><span class="gdp-stat-lbl">med. age</span> ${c.medianAge}</span>` : ''}
        ${workFmt     ? `<span class="gdp-stat"><span class="gdp-stat-lbl">workforce</span> ${workFmt} (${c.workPopPct}%)</span>` : ''}
      </div>` : '';
    return `
      <div class="gdp-item">
        <span class="league-rank mono">${c.rank}</span>
        <span class="league-flag" role="img" aria-label="${c.country}">${flag}</span>
        <div class="gdp-country-info">
          <span class="gdp-country">${c.country}</span>
          ${demogHtml}
        </div>
        <div class="gdp-bar-container bar-container" role="group" aria-label="${c.country} GDP bar">
          <div class="gdp-bar-fill bar-fill"
               style="--target-width: ${pct.toFixed(2)}%"
               role="progressbar"
               aria-valuenow="${c.gdpT}"
               aria-valuemin="0"
               aria-valuemax="${maxGdp}">
          </div>
        </div>
        <span class="gdp-cap mono">${fmtT(c.gdpT)}</span>
      </div>`;
  }).join('');

  const ratioEl = $('gdp-ratios');
  if (ratioEl) {
    const re = data.assetClasses.find(a => a.id === 're');
    const eq = data.assetClasses.find(a => a.id === 'eq');
    ratioEl.innerHTML = [
      { label: 'All tracked assets vs. world GDP', value: `${fmt(totalTracked / g.totalT, 1)}×` },
      { label: 'Global real estate vs. GDP',       value: `${fmt(re.valueT / g.totalT, 1)}×` },
      { label: 'Global equities vs. GDP',          value: `${fmt(eq.valueT / g.totalT, 2)}×` },
      { label: 'Crypto as % of world GDP',         value: `${fmt(data.crypto.totalT / g.totalT * 100, 1)}%` },
    ].map(r => `
      <div class="ratio-card">
        <div class="ratio-value mono">${r.value}</div>
        <div class="ratio-label">${r.label}</div>
      </div>`).join('');
  }
}

function renderCentralBanks(data) {
  const barsEl = $('cb-bars');
  if (!barsEl) return;
  const cb = data.centralBanks;
  if (!cb) return;

  const maxB = Math.max(...cb.banks.map(b => b.balanceSheetT));

  barsEl.innerHTML = cb.banks.map(b => {
    const pct = (b.balanceSheetT / maxB) * 100;
    return `
      <div class="cb-item">
        <span class="league-flag" role="img" aria-label="${b.name}">${b.flag}</span>
        <span class="cb-abbr">${b.abbr}</span>
        <span class="cb-name dim">${b.name}</span>
        <div class="cb-bar-container bar-container" role="group" aria-label="${b.abbr} balance sheet bar">
          <div class="cb-bar-fill bar-fill"
               style="--target-width: ${pct.toFixed(2)}%"
               role="progressbar"
               aria-valuenow="${b.balanceSheetT}"
               aria-valuemin="0"
               aria-valuemax="${maxB}">
          </div>
        </div>
        <span class="cb-cap mono">${fmtT(b.balanceSheetT)}</span>
      </div>`;
  }).join('');

  const totalEl = $('cb-total');
  if (totalEl) totalEl.textContent = fmtT(cb.totalT);

  const factsEl = $('cb-facts');
  if (factsEl) {
    const cryptoT = data.crypto.totalT;
    const goldT   = data.gold.impliedCapT;
    const shrinkPct = fmt((1 - cb.totalT / cb.peakTotalT) * 100, 0);
    factsEl.innerHTML = [
      { label: 'vs. all crypto (×)',             value: `${fmt(cb.totalT / cryptoT, 1)}×` },
      { label: 'vs. all above-ground gold',      value: `${fmt(cb.totalT / goldT * 100, 0)}%` },
      { label: `QT shrinkage from ${cb.peakYear} peak`, value: `−${shrinkPct}%` },
    ].map(r => `
      <div class="ratio-card">
        <div class="ratio-value mono">${r.value}</div>
        <div class="ratio-label">${r.label}</div>
      </div>`).join('');
  }
}

function renderGlobalDebt(data) {
  const barsEl = $('debt-bars');
  if (!barsEl) return;
  const d = data.globalDebt;
  if (!d) return;

  const maxSector = Math.max(...d.sectors.map(s => s.valueT));
  const totalTracked = data.assetClasses.reduce((s, a) => s + a.valueT, 0);

  barsEl.innerHTML = d.sectors.map(s => {
    const pct = (s.valueT / maxSector) * 100;
    return `
      <div class="debt-item bar-row">
        <div class="bar-label">
          <span class="bar-name">${s.name}</span>
        </div>
        <div class="bar-container" role="group" aria-label="${s.name} debt bar">
          <div class="bar-fill"
               style="--target-width: ${pct.toFixed(2)}%; background: ${s.color};"
               role="progressbar"
               aria-valuenow="${s.valueT}"
               aria-valuemin="0"
               aria-valuemax="${maxSector}">
          </div>
          <span class="bar-value">${fmtT(s.valueT)}</span>
        </div>
      </div>`;
  }).join('');

  const totalEl = $('debt-total');
  if (totalEl) totalEl.textContent = fmtT(d.totalT);

  const factsEl = $('debt-facts');
  if (factsEl) {
    factsEl.innerHTML = [
      { label: 'debt-to-GDP (IIF measure)',         value: `${d.debtToGdpPct}%`,                    danger: false },
      { label: 'vs. all tracked assets',            value: `${fmt(d.totalT / totalTracked, 2)}×`,   danger: true  },
      { label: 'per person on earth (÷ 8.1B)',      value: `$${fmt(d.totalT / 8.1 * 1000, 0)}K`,   danger: false },
    ].map(r => `
      <div class="ratio-card${r.danger ? ' ratio-card--danger' : ''}">
        <div class="ratio-value mono">${r.value}</div>
        <div class="ratio-label">${r.label}</div>
      </div>`).join('');
  }
}

function renderWealthDistribution(data) {
  const barEl = $('wealth-bar');
  if (!barEl) return;
  const w = data.wealthDistribution;
  if (!w) return;

  const TIER_COLORS = ['#4f81ff', '#a78bfa', '#34d399', '#fbbf24'];

  const stackSegments = w.tiers.map((t, i) => `
    <div class="wealth-segment"
         style="width: ${t.sharePct}%; background: ${TIER_COLORS[i]};"
         title="${t.group}: ${t.sharePct}% of $${w.totalT}T global household wealth">
    </div>`).join('');

  const legendItems = w.tiers.map((t, i) => {
    const adultsFmt = t.adultsM >= 1000
      ? `${(t.adultsM / 1000).toFixed(1)}B`
      : `${t.adultsM}M`;
    const wealthPerAdult = (w.totalT * 1e12 * t.sharePct / 100) / (t.adultsM * 1e6);
    const wealthFmt = wealthPerAdult >= 1e6
      ? `$${fmt(wealthPerAdult / 1e6, 1)}M avg`
      : `$${fmt(wealthPerAdult / 1e3, 0)}K avg`;
    return `
      <div class="wealth-legend-item">
        <span class="wealth-legend-swatch" style="background: ${TIER_COLORS[i]}"></span>
        <span class="wealth-legend-group">${t.group}</span>
        <span class="wealth-legend-pct mono">${t.sharePct}%</span>
        <span class="wealth-legend-adults dim">${adultsFmt} people · ${wealthFmt}</span>
      </div>`;
  }).join('');

  barEl.innerHTML = `
    <div class="wealth-stack" role="img" aria-label="Global wealth distribution stacked bar">
      ${stackSegments}
    </div>
    <div class="wealth-legend" aria-label="Wealth tier legend">${legendItems}</div>`;

  const factsEl = $('wealth-facts');
  if (factsEl) {
    const top1  = w.tiers[0];
    const bot50 = w.tiers[3];
    const top1Wealth  = w.totalT * top1.sharePct / 100;
    const bot50Wealth = w.totalT * bot50.sharePct / 100;
    factsEl.innerHTML = [
      { label: `Top 1% (${top1.adultsM}M people) hold`, value: fmtT(top1Wealth) },
      { label: `Bottom 50% (${(bot50.adultsM/1000).toFixed(1)}B people) hold`, value: fmtT(bot50Wealth), danger: true },
      { label: 'ratio: top 1% wealth per bottom 50%', value: `${fmt(top1Wealth / bot50Wealth, 0)}×`, danger: true },
    ].map(r => `
      <div class="ratio-card${r.danger ? ' ratio-card--danger' : ''}">
        <div class="ratio-value mono">${r.value}</div>
        <div class="ratio-label">${r.label}</div>
      </div>`).join('');
  }
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
    renderCompanyRankings,
    renderWorldGdp,
    renderCryptoAnatomy,
    renderCentralBanks,
    renderDerivatives,
    renderGlobalDebt,
    renderWealthDistribution,
    renderGlobalTrends,
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
    document.querySelectorAll('.bar-row, .gdp-item, .cb-item, .co-item').forEach(el => el.classList.add('animate'));
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
  document.querySelectorAll('.bar-row:not(.animate), .gdp-item:not(.animate), .cb-item:not(.animate), .co-item:not(.animate)').forEach(el => obs.observe(el));
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
    document.querySelectorAll('.bar-row.animate, .gdp-item.animate, .cb-item.animate, .co-item.animate').forEach(el => el.classList.remove('animate'));
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
  initNavMenu();

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
