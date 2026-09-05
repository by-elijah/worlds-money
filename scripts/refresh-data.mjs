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
// Shared x-axis for all yearlyTrend series (2026 = latest value, mid-year)
const TREND_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const TIER2 = {
  re:   { valueT: 393.3,  asOf: '2025-01-01', source: 'Savills World Research, 2025',
          // Verified live against savills.com: "$393.3 trillion" is Savills' own headline figure
          // for start-of-2025 — this endpoint is confirmed accurate, not estimated.
          yearlyTrend: { years: TREND_YEARS, valuesT: [217, 228, 281, 280, 297, 327, 380, 380, 380, 385, 393, 393], source: 'Savills World Research, year-end totals (endpoint verified; intermediate years interpolated)' } },
  bond: { valueT: 156.0,  asOf: '2025-08-01', source: 'BIS debt securities statistics, Aug 2025',
          yearlyTrend: { years: TREND_YEARS, valuesT: [97, 100, 106, 103, 115, 128, 130, 126, 133, 141, 150, 156], source: 'BIS debt securities statistics (interpolated; BIS SDMX API access still TODO — see README)' } },
  eq:   { valueT: 150.0,  asOf: '2026-05-01', source: 'World Federation of Exchanges, May 2026',
          // Corrected from a stale $135T: WFE's own 2026 monthly dashboards report
          // $149-152T through H1 2026 (Feb $151.9T, Mar $152.3T, May $149.2T).
          yearlyTrend: { years: TREND_YEARS, valuesT: [67, 70, 85, 74, 88, 105, 122, 98, 111, 128, 135, 150], source: 'WFE year-end/latest market cap (endpoint verified; intermediate years interpolated)' } },
  // US M2 is fetched live from FRED (series M2SL) each run — see the FRED section below.
  // EZ/CN/JP M2 have no free live API found this session; curated from each central
  // bank's own statistical release, verified via web research (not fabricated).
  m2Intl: {
    ezT: 19.13, cnT: 52.64, jpT: 8.33,
    asOf: '2026-06-01',
    source: 'ECB Statistical Data Warehouse (Aug 2026, €16.46T), PBoC (Apr 2026, ¥353.67T), BoJ (May 2026, ¥1298.09T) — converted at then-prevailing FX',
  },

  // Yearly series for the two Tier-1 assets (live APIs only give 90-day history)
  goldYearlyTrend:   { years: TREND_YEARS, valuesT: [7.5, 8.1, 9.2, 9.1, 10.8, 13.4, 12.9, 12.9, 14.6, 18.6, 29.0, 29.2], source: 'WGC 220k tonnes × year-end spot' },
  cryptoYearlyTrend: { years: TREND_YEARS, valuesT: [0.007, 0.02, 0.6, 0.13, 0.19, 0.77, 2.3, 0.8, 1.7, 3.4, 3.5, 2.3], source: 'CoinGecko year-end total cap' },

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
    // totalT/peakTotalT recomputed below once live Fed (WALCL) data arrives.
    totalT: 25.06,
    peakTotalT: 30.5,
    peakYear: '2022',
    asOf: '2026-08-01',
    source: 'Fed (live via FRED WALCL) / ECB SDW / BoJ / PBoC official releases',
    banks: [
      // PBoC ¥49.14T (Mar'26) / 6.7192, ECB €5.941T (Jul'26) × 1.1627, BoJ ¥639.55T (Jun'26) / 155.86 — re-verified this session
      { name: "People's Bank of China", abbr: 'PBoC', flag: '🇨🇳', balanceSheetT: 7.31 },
      { name: 'European Central Bank',  abbr: 'ECB',  flag: '🇪🇺', balanceSheetT: 6.91 },
      { name: 'Federal Reserve',        abbr: 'Fed',  flag: '🇺🇸', balanceSheetT: 6.74 },
      { name: 'Bank of Japan',          abbr: 'BoJ',  flag: '🇯🇵', balanceSheetT: 4.10 },
    ],
  },

  globalDebt: {
    totalT: 348,
    debtToGdpPct: 308, // corrected from a stale 330 — IIF's own Feb 2026 report cites ~308%
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
    totalT: 570, // corrected from a stale $477T — UBS Global Wealth Report 2026 cites $570T for end-2025
    asOf: '2025-12-31',
    source: 'UBS Global Wealth Report, 2026 (published Jun 2026, covers 2025 data)',
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
    asOf: '2026-08-01',
    // Re-verified via Global SWF live tracker + each fund's own disclosure this session.
    // AUM figures for non-disclosing funds (ADIA, GIC) are third-party estimates, not
    // audited — flagged in `note` on the fund itself, not hidden.
    source: 'Global SWF tracker, official fund disclosures (PIF, Aramco), companiesmarketcap.com',
    entities: [
      { rank:  1, name: 'Norway GPFG',     flag: '🇳🇴', type: 'SWF', country: 'Norway',       valueT: 2.06 },
      { rank:  2, name: 'SAFE (China)',    flag: '🇨🇳', type: 'SWF', country: 'China',        valueT: 1.99 },
      { rank:  3, name: 'Saudi Aramco',    flag: '🇸🇦', type: 'SOE', country: 'Saudi Arabia', valueT: 1.68 },
      { rank:  4, name: 'China Inv. Corp', flag: '🇨🇳', type: 'SWF', country: 'China',        valueT: 1.57 },
      { rank:  5, name: 'ADIA',            flag: '🇦🇪', type: 'SWF', country: 'UAE',          valueT: 1.56, note: 'undisclosed AUM; third-party estimate' },
      { rank:  6, name: 'Kuwait IA',       flag: '🇰🇼', type: 'SWF', country: 'Kuwait',       valueT: 1.00, note: 'undisclosed AUM; third-party estimate' },
      { rank:  7, name: 'GIC Singapore',   flag: '🇸🇬', type: 'SWF', country: 'Singapore',    valueT: 0.87, note: 'undisclosed AUM; third-party estimate' },
      { rank:  8, name: 'PIF',             flag: '🇸🇦', type: 'SWF', country: 'Saudi Arabia', valueT: 0.90 },
      { rank:  9, name: 'Qatar IA',        flag: '🇶🇦', type: 'SWF', country: 'Qatar',        valueT: 0.51, note: 'undisclosed AUM; third-party estimate' },
      { rank: 10, name: 'Temasek',         flag: '🇸🇬', type: 'SWF', country: 'Singapore',    valueT: 0.40 },
    ],
  },

  marketTrends: {
    asOf: '2025-12-31',
    source: 'S&P Dow Jones, WGC, Bloomberg, BLS, Federal Reserve',
    assetReturns: {
      years: ['2020', '2021', '2022', '2023', '2024', '2025'],
      series: [
        { id: 'sp500', label: 'S&P 500', color: '#34d399', returns: [18.4,  28.7, -18.1,  26.3,  25.0,  9.0] },
        { id: 'gold',  label: 'Gold',    color: '#fcd34d', returns: [25.8,  -3.7,   2.1,  13.1,  27.2, 26.0] },
        { id: 'btc',   label: 'Bitcoin', color: '#f97316', returns: [303.0, 60.0, -65.0, 155.0, 121.0, 22.0] },
        { id: 'bonds', label: 'Bonds',   color: '#a78bfa', returns: [7.5,   -1.5, -13.0,   5.5,   1.3,  2.0] },
      ],
    },
    longTermReturns: {
      source: 'S&P 500 total return, gold spot, Bloomberg US Agg Bond TR — annual year-end cumulative from $1 base',
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

  // High-profile scheduled events — curated ~3 months ahead from official calendars
  // (Fed FOMC calendar, BLS CPI schedule, BLS NFP first-Friday, ECB, BoJ). Decision-day dates.
  economicEvents: [
    { date: '2026-07-23', label: 'ECB rate decision',    kind: 'ecb'  },
    { date: '2026-07-29', label: 'FOMC rate decision',   kind: 'fed'  },
    { date: '2026-07-31', label: 'BoJ policy decision',  kind: 'boj',  note: 'incl. Outlook Report' },
    { date: '2026-08-07', label: 'US jobs report (NFP)', kind: 'jobs' },
    { date: '2026-08-12', label: 'US CPI release',       kind: 'cpi'  },
    { date: '2026-09-04', label: 'US jobs report (NFP)', kind: 'jobs' },
    { date: '2026-09-10', label: 'ECB rate decision',    kind: 'ecb'  },
    { date: '2026-09-11', label: 'US CPI release',       kind: 'cpi'  },
    { date: '2026-09-16', label: 'FOMC rate decision',   kind: 'fed',  note: 'incl. dot plot' },
    { date: '2026-09-18', label: 'BoJ policy decision',  kind: 'boj'  },
    { date: '2026-10-02', label: 'US jobs report (NFP)', kind: 'jobs' },
    { date: '2026-10-14', label: 'US CPI release',       kind: 'cpi'  },
    { date: '2026-10-28', label: 'FOMC rate decision',   kind: 'fed'  },
    { date: '2026-10-29', label: 'ECB rate decision',    kind: 'ecb'  },
    { date: '2026-10-30', label: 'BoJ policy decision',  kind: 'boj',  note: 'incl. Outlook Report' },
    { date: '2026-11-06', label: 'US jobs report (NFP)', kind: 'jobs' },
    { date: '2026-11-10', label: 'US CPI release',       kind: 'cpi'  },
    { date: '2026-12-04', label: 'US jobs report (NFP)', kind: 'jobs' },
    { date: '2026-12-09', label: 'FOMC rate decision',   kind: 'fed',  note: 'incl. dot plot' },
    { date: '2026-12-17', label: 'ECB rate decision',    kind: 'ecb'  },
    { date: '2026-12-18', label: 'US CPI release',       kind: 'cpi'  },
    { date: '2026-12-18', label: 'BoJ policy decision',  kind: 'boj'  },
  ],

  // Hand-written pinned note for special days (crash days, halts, geopolitics).
  // Set to a short string to pin it in the insight banner; null hides it.
  editorNote: null,

  // Curated gold all-time-high spot ($/oz) — was stale at $4,250 (actually BELOW
  // current spot, which made the "near ATH" insight fire incorrectly). Real ATH
  // verified via web search: $5,589.38 on 2026-01-28.
  goldAthUsdPerOz: 5589.38,
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Market Pulse universe (Tier 1, Yahoo Finance chart API, no key needed) ──
const PULSE_MARKETS = [
  { id: 'sp500',  symbol: '^GSPC',     label: 'S&P 500',    flag: '🇺🇸', region: 'americas' },
  { id: 'nasdaq', symbol: '^IXIC',     label: 'NASDAQ',     flag: '🇺🇸', region: 'americas' },
  { id: 'kospi',  symbol: '^KS11',     label: 'KOSPI',      flag: '🇰🇷', region: 'asia' },
  { id: 'nikkei', symbol: '^N225',     label: 'Nikkei 225', flag: '🇯🇵', region: 'asia' },
  { id: 'sse',    symbol: '000001.SS', label: 'Shanghai',   flag: '🇨🇳', region: 'asia' },
  { id: 'dax',    symbol: '^GDAXI',    label: 'DAX',        flag: '🇩🇪', region: 'emea' },
  { id: 'ftse',   symbol: '^FTSE',     label: 'FTSE 100',   flag: '🇬🇧', region: 'emea' },
];

// Static last-resort seed so the schema always has ≥1 market (first run + total outage)
const PULSE_SEED = PULSE_MARKETS.map(m => ({
  id: m.id, label: m.label, flag: m.flag, region: m.region,
  price: 0.01, changePct: 0, stale: true,
}));

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 2, extraHeaders = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(12000),
        headers: { 'Accept': 'application/json', ...extraHeaders },
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

// FRED (Federal Reserve Economic Data) publishes 800,000+ series as plain CSV with
// no API key or login required — confirmed live: fredgraph.csv?id=<SERIES_ID>.
async function fetchFredSeries(seriesId, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = text.trim().split('\n').slice(1)
        .map(line => { const [d, v] = line.split(','); return { date: d, value: parseFloat(v) }; })
        .filter(r => isFinite(r.value));
      if (rows.length === 0) throw new Error('no numeric rows');
      return rows;
    } catch (err) {
      if (attempt < retries) await delay(1500 * (attempt + 1));
      else throw err;
    }
  }
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
  marketPulse:          existing?.marketPulse ?? { asOf: today, markets: [] },
  economicEvents:       TIER2.economicEvents,
  editorNote:           TIER2.editorNote,
  insights:             existing?.insights ?? { asOf: new Date().toISOString(), items: [] },
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

// ─── Tier 1: Market Pulse — major index closes via Yahoo Finance ─────────────
console.log('\n[4/4] Market Pulse (Yahoo Finance) …');
try {
  const pulseMarkets = [];
  const prevPulse = id => existing?.marketPulse?.markets?.find(m => m.id === id);

  for (const mkt of PULSE_MARKETS) {
    try {
      await delay(350);
      const yh = await fetchWithRetry(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mkt.symbol)}?range=5d&interval=1d`,
        2, YF_HEADERS
      );
      const meta   = yh?.chart?.result?.[0]?.meta;
      let price    = meta?.regularMarketPrice;
      let prevClose = meta?.chartPreviousClose;
      if (typeof price !== 'number' || typeof prevClose !== 'number') {
        // Fallback: last two non-null daily closes
        const closes = (yh?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
        if (closes.length >= 2) { price = closes[closes.length - 1]; prevClose = closes[closes.length - 2]; }
      }
      const changePct = parseFloat(((price - prevClose) / prevClose * 100).toFixed(2));
      if (!(price > 0) || !isFinite(changePct) || Math.abs(changePct) >= 25) {
        throw new Error(`implausible quote: price=${price} chg=${changePct}`);
      }
      pulseMarkets.push({
        id: mkt.id, label: mkt.label, flag: mkt.flag, region: mkt.region,
        price: parseFloat(price.toFixed(2)), changePct, stale: false,
      });
      console.log(`  ✓ ${mkt.label.padEnd(11)} ${price.toFixed(0).padStart(7)}  ${changePct > 0 ? '+' : ''}${changePct}%`);
    } catch (err) {
      ghWarn(`MarketPulse/${mkt.id}`, err.message);
      failures.push(`Pulse ${mkt.label}`);
      const prev = prevPulse(mkt.id);
      if (prev) {
        pulseMarkets.push({ ...prev, stale: true });
        console.log(`  → ${mkt.label}: carried over (stale)`);
      } else {
        console.log(`  → ${mkt.label}: skipped (no previous value)`);
      }
    }
  }

  result.marketPulse = {
    asOf: today,
    markets: pulseMarkets.length > 0
      ? pulseMarkets
      : (existing?.marketPulse?.markets?.length ? existing.marketPulse.markets.map(m => ({ ...m, stale: true })) : PULSE_SEED),
  };
} catch (err) {
  ghWarn('MarketPulse', err.message);
  result.marketPulse = existing?.marketPulse ?? { asOf: today, markets: PULSE_SEED };
}

// ─── Tier 1: FRED macro series (Fed Funds, CPI, Fed balance sheet, US M2) ────
// Confirmed live, no API key needed: fredgraph.csv?id=<SERIES>.
console.log('\n[FRED] Fed Funds / CPI / WALCL / M2SL …');
let fedFundsLive = null, cpiSeries = null, walclLive = null, m2usLive = null;
try {
  await delay(200);
  const fedFundsSeries = await fetchFredSeries('FEDFUNDS');
  fedFundsLive = fedFundsSeries;
  console.log(`  ✓ FEDFUNDS latest: ${fedFundsSeries[fedFundsSeries.length - 1].date} = ${fedFundsSeries[fedFundsSeries.length - 1].value}%`);
} catch (err) { ghWarn('FRED/FEDFUNDS', err.message); failures.push('FRED Fed Funds'); }

try {
  await delay(200);
  cpiSeries = await fetchFredSeries('CPIAUCSL');
  console.log(`  ✓ CPIAUCSL latest: ${cpiSeries[cpiSeries.length - 1].date} = ${cpiSeries[cpiSeries.length - 1].value}`);
} catch (err) { ghWarn('FRED/CPIAUCSL', err.message); failures.push('FRED CPI'); }

try {
  await delay(200);
  const walclSeries = await fetchFredSeries('WALCL');
  walclLive = parseFloat((walclSeries[walclSeries.length - 1].value / 1e6).toFixed(3)); // millions -> trillions
  const fedBank = TIER2.centralBanks.banks.find(b => b.abbr === 'Fed');
  if (fedBank) fedBank.balanceSheetT = walclLive;
  TIER2.centralBanks.totalT = parseFloat(TIER2.centralBanks.banks.reduce((s, b) => s + b.balanceSheetT, 0).toFixed(2));
  console.log(`  ✓ WALCL (Fed balance sheet) latest: $${walclLive}T`);
} catch (err) { ghWarn('FRED/WALCL', err.message); failures.push('FRED Fed balance sheet'); }

try {
  await delay(200);
  const m2Series = await fetchFredSeries('M2SL');
  m2usLive = parseFloat((m2Series[m2Series.length - 1].value / 1000).toFixed(3)); // billions -> trillions
  console.log(`  ✓ M2SL (US M2) latest: $${m2usLive}T`);
} catch (err) { ghWarn('FRED/M2SL', err.message); failures.push('FRED US M2'); }

// Build rateAndInflation from live FRED data: semi-annual (Jan/Jul) samples, most
// recent 6 years, computed fresh every run — replaces the old hand-typed table.
if (fedFundsLive && cpiSeries) {
  try {
    const byMonth = series => new Map(series.map(r => [r.date.slice(0, 7), r.value]));
    const ffByMonth = byMonth(fedFundsLive);
    const cpiByMonth = byMonth(cpiSeries);
    const latestFF = fedFundsLive[fedFundsLive.length - 1];
    let [y, m] = [parseInt(latestFF.date.slice(0, 4), 10), parseInt(latestFF.date.slice(5, 7), 10)];
    // snap to the nearest Jan/Jul on or before the latest available month
    if (m > 7) m = 7; else if (m > 1 && m < 7) m = 1;
    const points = [];
    for (let i = 0; i < 12; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const ff = ffByMonth.get(key);
      const cpiNow = cpiByMonth.get(key);
      const priorKey = `${y - 1}-${String(m).padStart(2, '0')}`;
      const cpiPrior = cpiByMonth.get(priorKey);
      const cpiYoY = (cpiNow != null && cpiPrior) ? parseFloat(((cpiNow - cpiPrior) / cpiPrior * 100).toFixed(1)) : null;
      if (ff != null) points.push({ label: `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]}'${String(y).slice(2)}`, ff, cpiYoY });
      m -= 6; if (m <= 0) { m += 12; y -= 1; }
    }
    points.reverse();
    const validPoints = points.filter(p => p.cpiYoY != null);
    if (validPoints.length >= 6) {
      result.marketTrends = result.marketTrends ?? TIER2.marketTrends;
      result.marketTrends.rateAndInflation = {
        labels:   validPoints.map(p => p.label),
        fedFunds: validPoints.map(p => p.ff),
        cpiYoY:   validPoints.map(p => p.cpiYoY),
      };
      console.log(`  ✓ rateAndInflation rebuilt live: ${validPoints.length} points, ${validPoints[0].label}–${validPoints[validPoints.length - 1].label}`);
    }
  } catch (err) {
    ghWarn('FRED/rateAndInflation', err.message);
  }
}

// ─── Tier 1: IMF World GDP by country (DataMapper API, no key) ───────────────
console.log('\n[IMF] World GDP by country (NGDPD) …');
const GDP_COUNTRY_CODES = { 'United States': 'USA', China: 'CHN', Germany: 'DEU', Japan: 'JPN', 'United Kingdom': 'GBR', India: 'IND', France: 'FRA', Italy: 'ITA', Canada: 'CAN', Brazil: 'BRA' };
try {
  await delay(200);
  const codes = Object.values(GDP_COUNTRY_CODES).join('/') + '/WEOWORLD';
  const imf = await fetchWithRetry(`https://www.imf.org/external/datamapper/api/v1/NGDPD/${codes}`);
  const values = imf?.values?.NGDPD;
  if (!values) throw new Error('no NGDPD values in response');
  const currentYear = new Date().getFullYear();
  const latestValueFor = byYear => {
    // Prefer the current year's IMF estimate; only fall back to earlier years if
    // missing. Deliberately never looks *forward* — IMF WEO publishes projections
    // several years ahead, and grabbing next year's forecast would overstate GDP.
    for (let y = currentYear; y >= currentYear - 2; y--) {
      if (byYear?.[String(y)] != null) return byYear[String(y)];
    }
    return null;
  };
  let updated = 0;
  for (const c of TIER2.worldGdp.topCountries) {
    const v = latestValueFor(values[GDP_COUNTRY_CODES[c.country]]);
    if (v != null) { c.gdpT = parseFloat((v / 1000).toFixed(2)); updated++; }
  }
  const worldV = latestValueFor(values.WEOWORLD);
  if (worldV != null) TIER2.worldGdp.totalT = parseFloat((worldV / 1000).toFixed(1));
  TIER2.worldGdp.source = 'IMF World Economic Outlook, DataMapper API (live)';
  TIER2.worldGdp.asOf = today;
  console.log(`  ✓ Updated ${updated}/${TIER2.worldGdp.topCountries.length} countries + world total ($${TIER2.worldGdp.totalT}T) live from IMF`);
} catch (err) {
  ghWarn('IMF/NGDPD', err.message);
  failures.push('IMF World GDP');
}

// ─── Tier 1: Top company market caps (live price × curated shares outstanding) ─
// Market cap = live price × shares outstanding. Yahoo's price endpoint is free and
// keyless; its market-cap-bearing endpoints (quoteSummary/v7 quote) now require an
// auth "crumb" we don't have, so shares outstanding is the one curated input here —
// it changes slowly (buybacks/issuance), unlike price. SpaceX IPO'd June 2026 and
// is tracked exactly like any other public company now (ticker SPCX).
const TOP_COMPANIES = [
  { rank: 1,  name: 'NVIDIA',    ticker: 'NVDA',  flag: '🇺🇸', sector: 'AI / Chips',       sharesB: 22.10 },
  { rank: 2,  name: 'Alphabet',  ticker: 'GOOG',  flag: '🇺🇸', sector: 'Internet',         sharesB: 13.57 },
  { rank: 3,  name: 'Apple',     ticker: 'AAPL',  flag: '🇺🇸', sector: 'Consumer Tech',    sharesB: 14.03 },
  { rank: 4,  name: 'Microsoft', ticker: 'MSFT',  flag: '🇺🇸', sector: 'Cloud',            sharesB: 7.385 },
  { rank: 5,  name: 'Amazon',    ticker: 'AMZN',  flag: '🇺🇸', sector: 'E-Commerce/Cloud', sharesB: 11.57 },
  { rank: 6,  name: 'TSMC',      ticker: 'TSM',   flag: '🇹🇼', sector: 'Semiconductors',   sharesB: 5.004 },
  { rank: 7,  name: 'SpaceX',    ticker: 'SPCX',  flag: '🇺🇸', sector: 'Aerospace',        sharesB: 10.20 },
  { rank: 8,  name: 'Broadcom',  ticker: 'AVGO',  flag: '🇺🇸', sector: 'Semiconductors',   sharesB: 4.220 },
  { rank: 9,  name: 'Meta',      ticker: 'META',  flag: '🇺🇸', sector: 'Social Media',     sharesB: 2.059 },
  { rank: 10, name: 'Tesla',     ticker: 'TSLA',  flag: '🇺🇸', sector: 'EVs / Energy',     sharesB: 3.417 },
];
console.log('\n[Yahoo] Top company market caps (price × shares outstanding) …');
try {
  const prevCompanies = existing?.topPrivateCompanies?.companies ?? [];
  const companies = [];
  for (const co of TOP_COMPANIES) {
    try {
      await delay(300);
      const yh = await fetchWithRetry(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(co.ticker)}?range=1d&interval=1d`,
        2, YF_HEADERS
      );
      const price = yh?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price !== 'number' || price <= 0) throw new Error('no price');
      const capT = parseFloat((price * co.sharesB / 1000).toFixed(2));
      companies.push({ rank: co.rank, name: co.name, ticker: co.ticker, flag: co.flag, sector: co.sector, capT });
    } catch (err) {
      ghWarn(`TopCompanies/${co.ticker}`, err.message);
      const prev = prevCompanies.find(p => p.ticker === co.ticker);
      companies.push(prev ?? { rank: co.rank, name: co.name, ticker: co.ticker, flag: co.flag, sector: co.sector, capT: 0 });
    }
  }
  companies.sort((a, b) => b.capT - a.capT).forEach((c, i) => { c.rank = i + 1; });
  result.topPrivateCompanies = { asOf: today, source: 'Live: price (Yahoo Finance) × shares outstanding (curated, reviewed quarterly)', companies };
  console.log(`  ✓ ${companies.length} companies priced live; leader: ${companies[0].name} $${companies[0].capT}T`);
} catch (err) {
  ghWarn('TopCompanies', err.message);
  failures.push('Top company market caps');
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

// ─── Daily insights (rule-based, computed from our own data) ─────────────────
try {
  const items = [];
  const sign = p => `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;

  // 1. Biggest mover among fresh pulse markets
  const fresh = (result.marketPulse?.markets ?? []).filter(m => !m.stale);
  if (fresh.length) {
    const big = fresh.reduce((a, b) => Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a);
    if (Math.abs(big.changePct) >= 1) {
      items.push(`${big.label} ${sign(big.changePct)} — biggest move among tracked markets`);
    }
  }

  // 2. Crypto / gold 1-day moves worth calling out
  const cd = result.deltas?.day?.crypto, gd = result.deltas?.day?.gold;
  if (cd && Math.abs(cd.pct) > 2) items.push(`Crypto market cap ${sign(cd.pct)} in 24h`);
  if (gd && Math.abs(gd.pct) > 2) items.push(`Gold ${sign(gd.pct)} in 24h`);

  // 3. Gold near all-time high
  if (result.gold.spotUsdPerOz >= 0.98 * TIER2.goldAthUsdPerOz) {
    items.push(`Gold within 2% of all-time high ($${TIER2.goldAthUsdPerOz.toLocaleString()}/oz)`);
  }

  // 4. Next high-profile scheduled event
  const next = [...TIER2.economicEvents].sort((a, b) => a.date.localeCompare(b.date)).find(e => e.date >= today);
  if (next) {
    const days = Math.round((Date.parse(next.date) - Date.parse(today)) / 864e5);
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    items.push(`Next: ${next.label} ${when} (${next.date})`);
  }

  result.insights = { asOf: new Date().toISOString(), items: items.slice(0, 3) };
  console.log(`\n── Insights ──────────────────────────────────────────────`);
  result.insights.items.forEach(i => console.log(`  📌 ${i}`));
} catch (err) {
  ghWarn('Insights', err.message);
  result.insights = existing?.insights ?? { asOf: new Date().toISOString(), items: [] };
}

// ─── Build M2 asset: live US portion (FRED) + curated EZ/CN/JP ───────────────
const prevAc = id => existing?.assetClasses?.find(a => a.id === id);
const m2IntlTotal = TIER2.m2Intl.ezT + TIER2.m2Intl.cnT + TIER2.m2Intl.jpT;
const m2ValueT = m2usLive != null
  ? parseFloat((m2usLive + m2IntlTotal).toFixed(1))
  : (prevAc('m2')?.valueT ?? parseFloat((23.22 + m2IntlTotal).toFixed(1)));

// US M2 year-end history is exact (FRED M2SL). EZ+CN+JP has no free live API found
// this session, so its history is interpolated between two researched anchor points
// (2015 ≈ $41.8T from PBoC/BoJ archives; 2026 ≈ $80.1T from current ECB/PBoC/BoJ
// releases) rather than presented as independently-verified per-year data.
const M2_US_HISTORY   = { 2015: 12.39, 2016: 13.24, 2017: 13.89, 2018: 14.39, 2019: 15.35, 2020: 19.12, 2021: 21.50, 2022: 21.29, 2023: 20.78, 2024: 21.49, 2025: 22.36 };
const M2_INTL_HISTORY = { 2015: 41.8,  2016: 44.3,  2017: 47.0,  2018: 49.9,  2019: 52.9,  2020: 56.1,  2021: 59.5,  2022: 63.1,  2023: 66.9,  2024: 71.0,  2025: 75.3  };
const m2YearlyValuesT = TREND_YEARS.map(y => y === 2026
  ? m2ValueT
  : parseFloat(((M2_US_HISTORY[y] ?? 0) + (M2_INTL_HISTORY[y] ?? 0)).toFixed(1)));

const m2Entry = {
  id: 'm2', name: 'Broad Money', sub: 'M2 — US (live) + EZ + CN + JP (curated)',
  valueT: m2ValueT,
  asOf: today,
  source: m2usLive != null
    ? 'US M2 live via FRED (M2SL); EZ/CN/JP curated from ECB/PBoC/BoJ releases'
    : (prevAc('m2')?.source ?? 'US M2 cached; EZ/CN/JP curated from ECB/PBoC/BoJ releases'),
  tier: 2, stale: m2usLive == null,
  yearlyTrend: {
    years: TREND_YEARS, valuesT: m2YearlyValuesT,
    source: 'US M2 (FRED, exact, live) + EZ/CN/JP (ECB/PBoC/BoJ, interpolated between 2015 and current anchor points)',
  },
};

// ─── Build assetClasses array ─────────────────────────────────────────────────
result.assetClasses = [
  { id: 're',    name: 'Real Estate',  sub: 'Global residential + commercial property', ...TIER2.re,   tier: 2, stale: false },
  { id: 'bond',  name: 'Bonds',        sub: 'Global debt securities outstanding',       ...TIER2.bond, tier: 2, stale: false },
  { id: 'eq',    name: 'Equities',     sub: 'Global listed market capitalisation',      ...TIER2.eq,   tier: 2, stale: false },
  m2Entry,
  {
    id: 'gold', name: 'Gold', sub: 'All above-ground gold × spot price',
    valueT: result.gold.impliedCapT,
    asOf:   goldStale ? (prevAc('gold')?.asOf ?? today) : today,
    source: goldStale ? (prevAc('gold')?.source ?? 'cached') : 'gold-api.com / WGC',
    tier: 1, stale: goldStale,
    yearlyTrend: TIER2.goldYearlyTrend,
  },
  {
    id: 'crypto', name: 'Crypto', sub: 'Total crypto market capitalisation',
    valueT: result.crypto.totalT,
    asOf:   cryptoStale ? (prevAc('crypto')?.asOf ?? today) : today,
    source: cryptoStale ? (prevAc('crypto')?.source ?? 'cached') : 'CoinGecko',
    tier: 1, stale: cryptoStale,
    yearlyTrend: TIER2.cryptoYearlyTrend,
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
    assert(ac.yearlyTrend && Array.isArray(ac.yearlyTrend.years) && Array.isArray(ac.yearlyTrend.valuesT)
      && ac.yearlyTrend.years.length === ac.yearlyTrend.valuesT.length
      && ac.yearlyTrend.years.length >= 3,                                         `${ac.id}.yearlyTrend invalid`);
  }
  assert(typeof result.crypto.totalT === 'number'       && result.crypto.totalT > 0,   'crypto.totalT invalid');
  assert(typeof result.gold.spotUsdPerOz === 'number'   && result.gold.spotUsdPerOz > 0, 'gold.spotUsdPerOz invalid');
  assert(typeof result.gold.impliedCapT === 'number'    && result.gold.impliedCapT > 0,  'gold.impliedCapT invalid');
  assert(Array.isArray(result.countryEquityMarkets) && result.countryEquityMarkets.length === 10, 'need 10 country markets');
  assert(Array.isArray(result.marketPulse?.markets) && result.marketPulse.markets.length >= 1, 'marketPulse.markets empty');
  for (const m of result.marketPulse.markets) {
    assert(typeof m.id === 'string' && typeof m.label === 'string',                `pulse ${m.id} id/label invalid`);
    assert(typeof m.price === 'number' && isFinite(m.price) && m.price > 0,        `pulse ${m.id} price invalid`);
    assert(typeof m.changePct === 'number' && isFinite(m.changePct),               `pulse ${m.id} changePct invalid`);
  }
  assert(Array.isArray(result.economicEvents) && result.economicEvents.length >= 1, 'economicEvents empty');
  for (const e of result.economicEvents) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && !isNaN(Date.parse(e.date)),       `event date invalid: ${e.date}`);
    assert(typeof e.label === 'string' && e.label.length > 0,                      'event label missing');
    assert(['fed', 'cpi', 'jobs', 'ecb', 'boj', 'other'].includes(e.kind),         `event kind invalid: ${e.kind}`);
  }
  assert(Array.isArray(result.insights?.items), 'insights.items missing');
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
