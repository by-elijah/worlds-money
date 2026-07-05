#!/usr/bin/env node
/**
 * refresh-data.mjs  —  daily market data refresh
 *
 * Tier 1: live fetch from keyless public APIs (CoinGecko, gold-api.com / Yahoo Finance fallback)
 * Tier 2: curated constants — edit the TIER2 object below for monthly updates
 *
 * Exit behaviour: always exits 0 (fail-soft). Failures are logged as GitHub
 * Actions warnings and stale values from the previous run are preserved.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const DATA_DIR   = join(ROOT, 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');
const OUT        = join(DATA_DIR, 'market-data.json');

// ─── Tier 2 constants ────────────────────────────────────────────────────────
// Update these monthly; see README for the exact URLs to check.
const TIER2 = {
  re:   { valueT: 393.3,  asOf: '2025-01-01', source: 'Savills, 2025' },
  bond: { valueT: 156.0,  asOf: '2025-08-01', source: 'BIS, Aug 2025' },
  eq:   { valueT: 135.0,  asOf: '2025-12-01', source: 'Bloomberg/WFE' },
  m2:   { valueT: 101.7,  asOf: '2026-07-01', source: 'StreetStats, Jul 2026' },

  // Physical constant: troy oz per metric tonne — do not change
  TROY_OZ_PER_TONNE: 32150.7,
  goldAboveGroundTonnes: 220000,   // WGC estimate; revisit annually

  derivatives: {
    notionalT:        846,
    grossMarketValueT: 21.8,
    asOf:   '2025-06',
    source: 'BIS, Jun 2025',
  },

  crypto: {
    athT:    4.27,
    athDate: '2025-10',
  },

  countryEquityMarkets: [
    { rank:  1, country: 'United States', region: 'americas', capT: 65.0,  note: 'NYSE + NASDAQ',          badge: null },
    { rank:  2, country: 'China',         region: 'asia',     capT: 11.2,  note: 'Shanghai + Shenzhen + HK', badge: null },
    { rank:  3, country: 'Japan',         region: 'asia',     capT:  6.5,  note: 'TSE',                     badge: null },
    { rank:  4, country: 'India',         region: 'asia',     capT:  5.8,  note: 'BSE + NSE',               badge: { text: '↑ +38%', dir: 'up' } },
    { rank:  5, country: 'United Kingdom',region: 'emea',     capT:  3.7,  note: 'LSE',                     badge: null },
    { rank:  6, country: 'Canada',        region: 'americas', capT:  3.4,  note: 'TSX',                     badge: null },
    { rank:  7, country: 'France',        region: 'emea',     capT:  3.2,  note: 'Euronext Paris',          badge: null },
    { rank:  8, country: 'Saudi Arabia',  region: 'emea',     capT:  2.8,  note: 'Tadawul',                 badge: null },
    { rank:  9, country: 'Germany',       region: 'emea',     capT:  2.4,  note: 'Deutsche Börse',          badge: null },
    { rank: 10, country: 'South Korea',   region: 'asia',     capT:  2.3,  note: 'KRX',                     badge: { text: '↑ +45%', dir: 'up' } },
  ],

  equityFacts: [
    { value: '$65T', label: 'USA market alone' },
    { value:  '48%', label: 'US share of global equity' },
    { value: '2.1×', label: 'equities vs. bonds' },
  ],

  worldGdp: {
    totalT: 126.0,
    asOf: '2026-01-01',
    source: 'IMF WEO, Apr 2026',
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
    totalT: 24.2,
    peakTotalT: 30.5,
    peakYear: '2022',
    asOf: '2026-06-01',
    source: 'Fed / ECB / BoJ / PBoC official releases',
    banks: [
      { name: "People's Bank of China", abbr: 'PBoC', flag: '🇨🇳', balanceSheetT: 6.75 },
      { name: 'Federal Reserve',        abbr: 'Fed',  flag: '🇺🇸', balanceSheetT: 6.74 },
      { name: 'European Central Bank',  abbr: 'ECB',  flag: '🇪🇺', balanceSheetT: 6.73 },
      { name: 'Bank of Japan',          abbr: 'BoJ',  flag: '🇯🇵', balanceSheetT: 3.97 },
    ],
  },

  globalDebt: {
    totalT: 348,
    debtToGdpPct: 330,
    asOf: '2025-12-31',
    source: 'IIF Global Debt Monitor, Feb 2026',
    sectors: [
      { id: 'govt', name: 'Government',          valueT: 106.7, color: '#4f81ff' },
      { id: 'corp', name: 'Non-financial Corps', valueT: 100.6, color: '#a78bfa' },
      { id: 'fin',  name: 'Financial Sector',    valueT:  76.1, color: '#fbbf24' },
      { id: 'hh',   name: 'Households',          valueT:  64.6, color: '#34d399' },
    ],
  },

  wealthDistribution: {
    totalT: 477,
    asOf: '2024-12-31',
    source: 'UBS Global Wealth Report, 2025',
    tiers: [
      { group: 'Top 1%',     adultsM:   60, sharePct: 48.1 },
      { group: 'Next 9%',    adultsM:  540, sharePct: 38.9 },
      { group: 'Middle 40%', adultsM: 2400, sharePct: 11.2 },
      { group: 'Bottom 50%', adultsM: 3000, sharePct:  1.8 },
    ],
  },

  topPrivateCompanies: {
    asOf: '2026-07-04',
    source: 'companiesmarketcap.com',
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
    asOf: '2025-12-31',
    source: 'SWFI, companiesmarketcap.com',
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
    asOf: '2025-12-31',
    source: 'S&P Dow Jones, WGC, Bloomberg, BLS, Federal Reserve',
    assetReturns: {
      years: ['2020', '2021', '2022', '2023', '2024'],
      series: [
        { id: 'sp500', label: 'S&P 500', color: '#34d399', returns: [18.4,  28.7, -18.1,  26.3,  25.0] },
        { id: 'gold',  label: 'Gold',    color: '#fcd34d', returns: [25.8,  -3.7,   2.1,  13.1,  27.2] },
        { id: 'btc',   label: 'Bitcoin', color: '#f97316', returns: [303.0, 60.0, -65.0, 155.0, 121.0] },
        { id: 'bonds', label: 'Bonds',   color: '#a78bfa', returns: [7.5,   -1.5, -13.0,   5.5,   1.7] },
      ],
    },
    longTermReturns: {
      source: 'S&P 500 total return, gold spot, Bloomberg US Agg Bond TR — annual year-end cumulative from $1 base',
      since2010: {
        years: ['2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [1.15,1.18,1.36,1.80,2.05,2.08,2.33,2.84,2.71,3.57,4.23,5.44,4.46,5.63,7.03,7.67],
        gold:  [1.31,1.44,1.52,1.10,1.09,0.98,1.06,1.20,1.18,1.39,1.74,1.68,1.68,1.90,2.41,3.03],
        bonds: [1.07,1.15,1.20,1.17,1.24,1.25,1.28,1.33,1.33,1.44,1.55,1.53,1.33,1.40,1.43,1.48],
      },
      since2000: {
        years: ['2000','2001','2002','2003','2004','2005','2006','2007','2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [0.91,0.80,0.62,0.80,0.89,0.93,1.08,1.14,0.72,0.91,1.05,1.07,1.24,1.64,1.86,1.89,2.12,2.58,2.46,3.24,3.84,4.94,4.05,5.11,6.39,6.97],
        gold:  [0.94,0.95,1.20,1.43,1.51,1.77,2.19,2.89,3.00,3.75,4.90,5.40,5.71,4.15,4.08,3.66,3.97,4.49,4.42,5.23,6.53,6.31,6.29,7.11,9.06,11.42],
        bonds: [1.12,1.21,1.33,1.39,1.45,1.48,1.55,1.66,1.74,1.85,1.97,2.12,2.21,2.16,2.29,2.30,2.37,2.45,2.45,2.66,2.86,2.82,2.45,2.59,2.67,2.78],
      },
      since1990: {
        years: ['1990','1991','1992','1993','1994','1995','1996','1997','1998','1999','2000','2001','2002','2003','2004','2005','2006','2007','2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'],
        sp500: [0.97,1.27,1.36,1.50,1.52,2.09,2.57,3.43,4.41,5.33,4.85,4.27,3.33,4.28,4.75,4.98,5.77,6.09,3.83,4.85,5.58,5.70,6.61,8.75,9.95,10.09,11.30,13.77,13.16,17.31,20.49,26.37,21.60,27.28,34.09,37.16],
        gold:  [1.00,0.90,0.85,1.00,0.98,0.99,0.94,0.74,0.74,0.74,0.70,0.71,0.89,1.06,1.12,1.31,1.63,2.14,2.23,2.78,3.63,4.00,4.24,3.07,3.03,2.71,2.95,3.33,3.28,3.88,4.85,4.68,4.67,5.28,6.72,8.47],
        bonds: [1.09,1.26,1.36,1.49,1.45,1.72,1.78,1.95,2.12,2.10,2.35,2.54,2.81,2.92,3.05,3.12,3.25,3.48,3.66,3.88,4.13,4.45,4.64,4.55,4.82,4.85,4.98,5.15,5.15,5.60,6.02,5.93,5.16,5.44,5.61,5.83],
      },
    },
    rateAndInflation: {
      labels: ["Jan'20","Jul'20","Jan'21","Jul'21","Jan'22","Jul'22","Jan'23","Jul'23","Jan'24","Jul'24","Jan'25","Jul'25"],
      fedFunds: [1.55, 0.09, 0.09, 0.10, 0.08, 2.33, 4.33, 5.33, 5.33, 5.33, 4.33, 3.50],
      cpiYoY:   [2.5,  1.0,  1.4,  5.4,  7.5,  9.1,  6.4,  3.2,  3.1,  2.9,  3.0,  2.4],
    },
  },
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(12000),
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt < retries) {
        const wait = 2000 * (attempt + 1);
        console.warn(`  ↻ retry ${attempt + 1}/${retries} for ${url}: ${err.message} (waiting ${wait}ms)`);
        await delay(wait);
      } else {
        throw err;
      }
    }
  }
}

function ghWarn(source, message) {
  // Emits a GitHub Actions warning annotation; prints normally elsewhere.
  console.log(`::warning title=${source}::${message}`);
}

function loadHistorySnapshot(daysBack) {
  try {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    const snap = join(HISTORY_DIR, `market-data-${d.toISOString().slice(0, 10)}.json`);
    return existsSync(snap) ? JSON.parse(readFileSync(snap, 'utf8')) : null;
  } catch { return null; }
}

function deltaOf(curr, prev) {
  if (prev == null || prev === 0 || curr == null) return null;
  return {
    pct:  parseFloat(((curr - prev) / prev * 100).toFixed(2)),
    absT: parseFloat((curr - prev).toFixed(4)),
  };
}

// ─── Load existing data (for fail-soft merging) ───────────────────────────────
let existing = null;
if (existsSync(OUT)) {
  try {
    existing = JSON.parse(readFileSync(OUT, 'utf8'));
    console.log(`Loaded existing data from ${OUT}`);
  } catch (e) {
    console.warn(`Could not parse existing data: ${e.message}`);
  }
}

const today = new Date().toISOString().slice(0, 10);

// ─── Scaffold result object ───────────────────────────────────────────────────
const result = {
  meta: {
    generatedAt: new Date().toISOString(),
    currency:    'USD',
    unit:        'trillion',
    version:     2,
  },
  assetClasses: [],   // populated at end
  derivatives:  TIER2.derivatives,
  crypto: {
    totalT:      existing?.crypto?.totalT      ?? 3.3,
    athT:        TIER2.crypto.athT,
    athDate:     TIER2.crypto.athDate,
    volume24hB:  existing?.crypto?.volume24hB  ?? 0,
    btc: {
      capT:         existing?.crypto?.btc?.capT         ?? 0,
      dominancePct: existing?.crypto?.btc?.dominancePct ?? 0,
      priceUsd:     existing?.crypto?.btc?.priceUsd     ?? 0,
    },
    eth: {
      capB:         existing?.crypto?.eth?.capB         ?? 0,
      dominancePct: existing?.crypto?.eth?.dominancePct ?? 0,
      priceUsd:     existing?.crypto?.eth?.priceUsd     ?? 0,
    },
    stablecoinsB:  existing?.crypto?.stablecoinsB  ?? 0,
    top5:          existing?.crypto?.top5          ?? [],
    sparklineData: existing?.crypto?.sparklineData ?? [],
  },
  gold: {
    spotUsdPerOz:      existing?.gold?.spotUsdPerOz      ?? 3320,
    aboveGroundTonnes: TIER2.goldAboveGroundTonnes,
    impliedCapT:       existing?.gold?.impliedCapT       ?? 23.5,
    sparklineData:     existing?.gold?.sparklineData     ?? [],
  },
  deltas: existing?.deltas ?? { day: {}, month: {} },
  countryEquityMarkets: TIER2.countryEquityMarkets,
  equityFacts:          TIER2.equityFacts,
  worldGdp:             TIER2.worldGdp,
  centralBanks:         TIER2.centralBanks,
  globalDebt:           TIER2.globalDebt,
  wealthDistribution:   TIER2.wealthDistribution,
  topPrivateCompanies:  TIER2.topPrivateCompanies,
  topStateEntities:     TIER2.topStateEntities,
  marketTrends:         TIER2.marketTrends,
};

const failures = [];
let cryptoStale = false;
let goldStale   = false;

// ─── Tier 1: CoinGecko global ─────────────────────────────────────────────────
console.log('\n[1/3] CoinGecko /global …');
try {
  await delay(300);
  const cgGlobal = await fetchWithRetry('https://api.coingecko.com/api/v3/global');
  const d = cgGlobal.data;
  result.crypto.totalT      = parseFloat((d.total_market_cap.usd / 1e12).toFixed(4));
  result.crypto.volume24hB  = parseFloat((d.total_volume.usd    / 1e9).toFixed(2));
  result.crypto.btc.dominancePct = parseFloat(d.market_cap_percentage.btc.toFixed(4));
  result.crypto.eth.dominancePct = parseFloat(d.market_cap_percentage.eth.toFixed(4));
  result.crypto.btc.capT    = parseFloat(((d.market_cap_percentage.btc / 100) * result.crypto.totalT).toFixed(4));
  result.crypto.eth.capB    = parseFloat(((d.market_cap_percentage.eth / 100) * result.crypto.totalT * 1000).toFixed(2));
  console.log(`  ✓ total: $${result.crypto.totalT.toFixed(3)}T  BTC dom: ${result.crypto.btc.dominancePct.toFixed(1)}%`);
} catch (err) {
  ghWarn('CoinGecko/global', err.message);
  failures.push('CoinGecko /global');
  cryptoStale = true;
  console.log('  → using cached crypto values');
}

// ─── Tier 1: CoinGecko coin markets (top 5 prices + USDT for stablecoin calc) ─
if (!cryptoStale) {
  console.log('\n[2/3] CoinGecko /coins/markets (top 6) …');
  try {
    await delay(600);
    const coins = await fetchWithRetry(
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&order=market_cap_desc&per_page=6&page=1&price_change_percentage=24h'
    );
    const btc  = coins.find(c => c.id === 'bitcoin');
    const eth  = coins.find(c => c.id === 'ethereum');
    const usdt = coins.find(c => c.id === 'tether');

    if (btc) {
      result.crypto.btc.priceUsd = btc.current_price;
      result.crypto.btc.capT     = parseFloat((btc.market_cap / 1e12).toFixed(4));
    }
    if (eth) {
      result.crypto.eth.capB     = parseFloat((eth.market_cap / 1e9).toFixed(2));
      result.crypto.eth.priceUsd = eth.current_price;
    }
    // USDT ≈ 74% of stablecoin market (documented approximation)
    if (usdt) {
      result.crypto.stablecoinsB = parseFloat(((usdt.market_cap / 1e9) / 0.74).toFixed(1));
    }
    // Store top 5 by market cap (whatever CoinGecko returns — may include stablecoins)
    result.crypto.top5 = coins.slice(0, 5).map((c, i) => ({
      rank:          i + 1,
      id:            c.id,
      symbol:        c.symbol.toUpperCase(),
      name:          c.name,
      priceUsd:      c.current_price,
      capB:          parseFloat((c.market_cap / 1e9).toFixed(1)),
      change24hPct:  parseFloat((c.price_change_percentage_24h ?? 0).toFixed(2)),
    }));
    console.log(`  ✓ BTC $${result.crypto.btc.priceUsd.toLocaleString()}  ETH $${result.crypto.eth.priceUsd.toLocaleString()}  stables ~$${result.crypto.stablecoinsB.toFixed(0)}B`);
    console.log(`  top5: ${result.crypto.top5.map(c => c.symbol).join(', ')}`);
  } catch (err) {
    ghWarn('CoinGecko/markets', err.message);
    failures.push('CoinGecko /markets');
    console.log('  → using global-derived estimates');
  }
}

// ─── Tier 1: Gold spot price ──────────────────────────────────────────────────
console.log('\n[3/3] Gold spot price …');
let goldFetched = false;

// Primary: gold-api.com
try {
  await delay(400);
  const raw = await fetchWithRetry('https://api.gold-api.com/price/XAU');
  // Response shape: { price: number, ... }  (verify at build time; see README)
  const spot = raw?.price ?? raw?.Price ?? raw?.ask;
  if (typeof spot !== 'number' || spot <= 0) throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 80)}`);
  result.gold.spotUsdPerOz = parseFloat(spot.toFixed(2));
  result.gold.impliedCapT  = parseFloat((spot * TIER2.goldAboveGroundTonnes * TIER2.TROY_OZ_PER_TONNE / 1e12).toFixed(3));
  goldFetched = true;
  console.log(`  ✓ gold-api.com: $${result.gold.spotUsdPerOz.toLocaleString()}/oz → $${result.gold.impliedCapT.toFixed(2)}T`);
} catch (err) {
  console.warn(`  ↻ gold-api.com failed: ${err.message}`);
}

// Fallback: Yahoo Finance GC=F futures
if (!goldFetched) {
  try {
    await delay(600);
    const yh = await fetchWithRetry(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d'
    );
    const spot = yh?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof spot !== 'number' || spot <= 0) throw new Error('No price in Yahoo response');
    result.gold.spotUsdPerOz = parseFloat(spot.toFixed(2));
    result.gold.impliedCapT  = parseFloat((spot * TIER2.goldAboveGroundTonnes * TIER2.TROY_OZ_PER_TONNE / 1e12).toFixed(3));
    goldFetched = true;
    console.log(`  ✓ Yahoo Finance GC=F: $${result.gold.spotUsdPerOz.toLocaleString()}/oz → $${result.gold.impliedCapT.toFixed(2)}T`);
  } catch (err) {
    ghWarn('Gold/Yahoo', err.message);
    failures.push('Gold spot price');
    goldStale = true;
    console.log('  → using cached gold values');
  }
}

// ─── Sanity bounds ────────────────────────────────────────────────────────────
if (!cryptoStale && (result.crypto.totalT < 0.5 || result.crypto.totalT > 20)) {
  ghWarn('SanityBounds', `Crypto total $${result.crypto.totalT.toFixed(2)}T outside [0.5, 20] — reverting to cache`);
  failures.push('Crypto sanity bounds');
  cryptoStale = true;
  if (existing?.crypto) {
    const saved = existing.crypto;
    result.crypto = { ...saved, sparklineData: result.crypto.sparklineData, athT: TIER2.crypto.athT, athDate: TIER2.crypto.athDate };
  }
}

if (!goldStale && (result.gold.impliedCapT < 10 || result.gold.impliedCapT > 80)) {
  ghWarn('SanityBounds', `Gold cap $${result.gold.impliedCapT.toFixed(1)}T outside [10, 80] — reverting to cache`);
  failures.push('Gold sanity bounds');
  goldStale = true;
  if (existing?.gold) result.gold = existing.gold;
}

// ─── Sparkline histories ──────────────────────────────────────────────────────
if (!cryptoStale) {
  const entry = { date: today, totalT: parseFloat(result.crypto.totalT.toFixed(4)) };
  const history = (result.crypto.sparklineData ?? []).filter(e => e.date !== today);
  history.push(entry);
  result.crypto.sparklineData = history.slice(-90);
}

if (!goldStale) {
  const entry = { date: today, spotUsdPerOz: result.gold.spotUsdPerOz, impliedCapT: result.gold.impliedCapT };
  const history = (result.gold.sparklineData ?? []).filter(e => e.date !== today);
  history.push(entry);
  result.gold.sparklineData = history.slice(-90);
}

// ─── Deltas (compare vs. history snapshots) ───────────────────────────────────
{
  const hist1  = loadHistorySnapshot(1);
  const hist30 = loadHistorySnapshot(30);
  result.deltas = {
    generatedAt: today,
    day: {
      crypto: hist1 ? deltaOf(result.crypto.totalT,     hist1.crypto?.totalT)      : null,
      gold:   hist1 ? deltaOf(result.gold.impliedCapT,  hist1.gold?.impliedCapT)   : null,
    },
    month: {
      crypto: hist30 ? deltaOf(result.crypto.totalT,    hist30.crypto?.totalT)     : null,
      gold:   hist30 ? deltaOf(result.gold.impliedCapT, hist30.gold?.impliedCapT)  : null,
    },
  };
  const d = result.deltas;
  console.log(`\n── Deltas ────────────────────────────────────────────────`);
  console.log(`  Crypto 1d:  ${d.day.crypto   ? `${d.day.crypto.pct > 0 ? '+' : ''}${d.day.crypto.pct}%`   : 'no snapshot'}`);
  console.log(`  Crypto 30d: ${d.month.crypto ? `${d.month.crypto.pct > 0 ? '+' : ''}${d.month.crypto.pct}%` : 'no snapshot'}`);
  console.log(`  Gold   1d:  ${d.day.gold     ? `${d.day.gold.pct > 0 ? '+' : ''}${d.day.gold.pct}%`       : 'no snapshot'}`);
  console.log(`  Gold   30d: ${d.month.gold   ? `${d.month.gold.pct > 0 ? '+' : ''}${d.month.gold.pct}%`   : 'no snapshot'}`);
}

// ─── Build assetClasses array ─────────────────────────────────────────────────
const prevAc = id => existing?.assetClasses?.find(a => a.id === id);

result.assetClasses = [
  { id: 're',    name: 'Real Estate',  sub: 'Global residential + commercial property', ...TIER2.re,   tier: 2, stale: false },
  { id: 'bond',  name: 'Bonds',        sub: 'Global debt securities outstanding',       ...TIER2.bond, tier: 2, stale: false },
  { id: 'eq',    name: 'Equities',     sub: 'Global listed market capitalisation',      ...TIER2.eq,   tier: 2, stale: false },
  { id: 'm2',    name: 'Broad Money',  sub: 'M2 — US + EZ + CN + JP',                  ...TIER2.m2,   tier: 2, stale: false },
  {
    id: 'gold', name: 'Gold', sub: 'All above-ground gold × spot price',
    valueT: result.gold.impliedCapT,
    asOf:   goldStale ? (prevAc('gold')?.asOf ?? today) : today,
    source: goldStale ? (prevAc('gold')?.source ?? 'cached') : 'gold-api.com / WGC',
    tier: 1, stale: goldStale,
  },
  {
    id: 'crypto', name: 'Crypto', sub: 'Total crypto market capitalisation',
    valueT: result.crypto.totalT,
    asOf:   cryptoStale ? (prevAc('crypto')?.asOf ?? today) : today,
    source: cryptoStale ? (prevAc('crypto')?.source ?? 'cached') : 'CoinGecko',
    tier: 1, stale: cryptoStale,
  },
];

// ─── Schema validation ────────────────────────────────────────────────────────
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
try {
  assert(typeof result.meta.generatedAt === 'string', 'meta.generatedAt missing');
  assert(Array.isArray(result.assetClasses) && result.assetClasses.length === 6, 'assetClasses must have exactly 6 entries');
  for (const ac of result.assetClasses) {
    assert(typeof ac.valueT === 'number' && isFinite(ac.valueT) && ac.valueT >= 0, `${ac.id}.valueT invalid: ${ac.valueT}`);
    assert(typeof ac.asOf   === 'string' && ac.asOf.length >= 7,                   `${ac.id}.asOf missing`);
    assert(typeof ac.source === 'string' && ac.source.length > 0,                  `${ac.id}.source missing`);
  }
  assert(typeof result.crypto.totalT === 'number'       && result.crypto.totalT > 0,   'crypto.totalT invalid');
  assert(typeof result.gold.spotUsdPerOz === 'number'   && result.gold.spotUsdPerOz > 0, 'gold.spotUsdPerOz invalid');
  assert(typeof result.gold.impliedCapT === 'number'    && result.gold.impliedCapT > 0,  'gold.impliedCapT invalid');
  assert(Array.isArray(result.countryEquityMarkets) && result.countryEquityMarkets.length === 10, 'need 10 country markets');
  console.log('\n✓ Schema validation passed');
} catch (err) {
  ghWarn('SchemaValidation', err.message);
  console.error(`Schema validation FAILED: ${err.message}`);
  process.exit(1);   // schema violations are fatal — protect the page
}

// ─── Write output ─────────────────────────────────────────────────────────────
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const json = JSON.stringify(result, null, 2);
writeFileSync(OUT, json, 'utf8');
console.log(`\n✓ Written → ${OUT}`);

// ─── History snapshot ─────────────────────────────────────────────────────────
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
const histFile = join(HISTORY_DIR, `market-data-${today}.json`);
writeFileSync(histFile, json, 'utf8');
console.log(`✓ Snapshot → ${histFile}`);

// Prune snapshots older than 90 days
const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
try {
  const snapshots = readdirSync(HISTORY_DIR).filter(f => /^market-data-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const f of snapshots) {
    const d = new Date(f.slice(12, 22));
    if (d.getTime() < cutoff) {
      unlinkSync(join(HISTORY_DIR, f));
      console.log(`  pruned: ${f}`);
    }
  }
} catch {}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n── Summary ──────────────────────────────────────────────');
if (failures.length === 0) {
  console.log('✓ All Tier 1 sources refreshed successfully');
} else {
  console.log(`⚠ ${failures.length} source(s) fell back to cached values:`);
  failures.forEach(f => console.log(`  • ${f}`));
}
console.log(`  Crypto : $${result.crypto.totalT.toFixed(3)}T${cryptoStale ? ' (stale)' : ''}`);
console.log(`  Gold   : $${result.gold.spotUsdPerOz.toLocaleString()}/oz → $${result.gold.impliedCapT.toFixed(2)}T${goldStale ? ' (stale)' : ''}`);
console.log(`  Spark  : ${result.crypto.sparklineData.length} day(s) of history`);
console.log('─────────────────────────────────────────────────────────\n');

process.exit(0);   // always exit 0 — fail-soft
