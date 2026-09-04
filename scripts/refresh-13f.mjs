#!/usr/bin/env node
/**
 * Fetches real Form 13F institutional-holdings data from SEC EDGAR (free, no API key)
 * for a curated set of well-known funds and writes data/13f-data.json.
 *
 * Runs on its own weekly cadence (see .github/workflows/refresh-13f.yml) — 13F filings
 * only change quarterly, ~45 days after each quarter-end, so a nightly run would just
 * re-derive the same data most days. The script is stateless: every run re-fetches the
 * current AND prior quarter's filing for each fund directly from SEC's own filing
 * history, so there is no local snapshot to keep in sync or let drift.
 *
 * Every number in the output is fetched live from SEC — nothing is hand-typed except
 * the fund universe (which funds to track, by CIK) and the CUSIP->ticker lookup below
 * (13F filings report CUSIP, never a ticker symbol, and there is no free CUSIP->ticker API).
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', '13f-data.json');

// SEC's fair-access policy requires a descriptive User-Agent identifying the requester,
// or it blocks the request outright with a 403. Confirmed live: the exact string content
// matters (an email-shaped UA is required) but a placeholder domain works fine — a
// personal address isn't used here since this script and its output are committed to a
// public repo.
const UA = 'WorldsMoneyDashboard/1.0 research@example.com';

const delay = ms => new Promise(r => setTimeout(r, ms));

function ghWarn(source, message) {
  console.log(`::warning title=${source}::${message}`);
}

async function fetchText(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt < retries) await delay(1500 * (attempt + 1));
      else throw err;
    }
  }
}
async function fetchJson(url, retries = 2) {
  return JSON.parse(await fetchText(url, retries));
}

// ─── Curated fund universe ─────────────────────────────────────────────────────
// CIKs verified live against SEC EDGAR company search — do not add entries without
// confirming via https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&type=13F-HR&output=atom
const FUNDS = [
  { id: 'berkshire',   name: 'Berkshire Hathaway',         manager: 'Warren Buffett',        style: 'value',    cik: '1067983',  deepDive: true },
  { id: 'citadel',     name: 'Citadel Advisors',           manager: 'Ken Griffin',           style: 'quant',    cik: '1423053' },
  { id: 'millennium',  name: 'Millennium Management',      manager: 'Izzy Englander',        style: 'quant',    cik: '1273087' },
  { id: 'bridgewater', name: 'Bridgewater Associates',     manager: 'Ray Dalio (fdr)',       style: 'quant',    cik: '1350694' },
  { id: 'pershing',    name: 'Pershing Square Capital',    manager: 'Bill Ackman',           style: 'activist', cik: '1336528' },
  { id: 'appaloosa',   name: 'Appaloosa Management',       manager: 'David Tepper',          style: 'value',    cik: '1656456' },
  { id: 'tigerglobal', name: 'Tiger Global Management',    manager: 'Chase Coleman',         style: 'growth',   cik: '1167483' },
  { id: 'viking',      name: 'Viking Global Investors',    manager: 'Andreas Halvorsen',     style: 'growth',   cik: '1103804' },
  { id: 'coatue',      name: 'Coatue Management',          manager: 'Philippe Laffont',      style: 'growth',   cik: '1135730' },
  { id: 'point72',     name: 'Point72 Asset Management',   manager: 'Steve Cohen',           style: 'quant',    cik: '1603466' },
  { id: 'elliott',     name: 'Elliott Investment Mgmt',    manager: 'Paul Singer',           style: 'activist', cik: '1791786' },
  { id: 'twosigma',    name: 'Two Sigma Investments',      manager: 'Quant',                 style: 'quant',    cik: '1179392' },
  { id: 'aqr',         name: 'AQR Capital Management',     manager: 'Cliff Asness',          style: 'quant',    cik: '1167557' },
  { id: 'lonepine',    name: 'Lone Pine Capital',          manager: 'Stephen Mandel (fdr)',  style: 'growth',   cik: '1061165' },
  { id: 'tudor',       name: 'Tudor Investment Corp',      manager: 'Paul Tudor Jones',      style: 'quant',    cik: '923093'  },
  { id: 'rentech',     name: 'Renaissance Technologies',   manager: 'Jim Simons (fdr)',      style: 'quant',    cik: '1037389' },
  { id: 'farallon',    name: 'Farallon Capital',           manager: 'Andrew Spokes',         style: 'value',    cik: '909661'  },
  { id: 'duquesne',    name: 'Duquesne Family Office',     manager: 'Stanley Druckenmiller', style: 'growth',   cik: '1536411' },
  { id: 'thirdpoint',  name: 'Third Point',                manager: 'Dan Loeb',              style: 'activist', cik: '1040273' },
  { id: 'soros',       name: 'Soros Fund Management',      manager: 'George Soros',          style: 'growth',   cik: '1029160' },
  { id: 'ark',         name: 'ARK Investment Management',  manager: 'Cathie Wood',           style: 'growth',   cik: '1697748' },
  { id: 'gates',       name: 'Gates Foundation Trust',     manager: 'Bill Gates',            style: 'value',    cik: '1166559' },
  { id: 'harris',      name: 'Harris Associates (Oakmark)',manager: 'Bill Nygren',           style: 'value',    cik: '813917'  },
  { id: 'icahn',       name: 'Icahn Capital',              manager: 'Carl Icahn',            style: 'activist', cik: '921669'  },
];

// Funds with more reported table lines than this are diversified multi-strategy books
// where per-position detail isn't a meaningful signal (and the info table can run to
// tens of thousands of lines) — skip the expensive full parse, keep only their summary.
const DEEP_PARSE_MAX_LINES = 600;

// Hand-maintained CUSIP -> ticker lookup for names likely to appear in concentrated
// books. There is no free CUSIP->ticker API; unmapped CUSIPs fall back to the SEC
// filing's own company name (nameOfIssuer), which is always accurate.
const CUSIP_TICKER = {
  '037833100': 'AAPL', '025816109': 'AXP',  '191216100': 'KO',   '02079K305': 'GOOGL',
  '02079K107': 'GOOG', '060505104': 'BAC',  '166764100': 'CVX',  '674599105': 'OXY',
  'H1467J104': 'CB',   '615369105': 'MCO',  '500754106': 'KHC',  '23918K108': 'DVA',
  '247361702': 'DAL',  '829933100': 'SIRI', '92343E102': 'VRSN', '501044101': 'KR',
  '02005N100': 'ALLY', '526057104': 'LEN',  '526057302': 'LEN',  '530909308': 'LLYVA',
  '530909100': 'LLYVK','650111107': 'NYT',  '14040H105': 'COF',  '546347105': 'LPX',
  '670346105': 'NUE',  '55616P104': 'M',    '62944T105': 'NVR',  '47233W109': 'JEF',
  '23331A109': 'DHI',  '023135106': 'AMZN', '67066G104': 'NVDA',
  '594918104': 'MSFT', '30303M102': 'META', '88160R101': 'TSLA', 'G6683N103': 'NU',
};

// ─── SEC EDGAR helpers ──────────────────────────────────────────────────────────
async function getSubmissions(cik) {
  const padded = String(cik).padStart(10, '0');
  return fetchJson(`https://data.sec.gov/submissions/CIK${padded}.json`);
}

// Picks the most-recently-FILED entry within each of the `nPeriods` most recent
// report periods (not simply "most recent by filing date") so a late-filed amendment
// for an older quarter can't shadow a newer quarter's original filing.
function recentPeriods(filings, nPeriods = 2) {
  const f = filings.filings.recent;
  const idxs = f.form.map((form, i) => i).filter(i => f.form[i].startsWith('13F-HR'));
  const byPeriod = new Map();
  for (const i of idxs) {
    const rd = f.reportDate[i];
    const existing = byPeriod.get(rd);
    if (existing === undefined || f.filingDate[i] > f.filingDate[existing]) byPeriod.set(rd, i);
  }
  const periods = [...byPeriod.keys()].sort((a, b) => b.localeCompare(a)).slice(0, nPeriods);
  return periods.map(rd => {
    const i = byPeriod.get(rd);
    return { accessionNumber: f.accessionNumber[i], filingDate: f.filingDate[i], reportDate: f.reportDate[i] };
  });
}

async function getFilingFiles(cik, accessionNumber) {
  const accNoDash = accessionNumber.replace(/-/g, '');
  const d = await fetchJson(`https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/index.json`);
  return d.directory.item.map(it => it.name);
}

function findInfoTableFilename(files) {
  return files.find(f => f.toLowerCase() !== 'primary_doc.xml' && f.toLowerCase().endsWith('.xml'));
}

async function fetchFilingFile(cik, accessionNumber, filename) {
  const accNoDash = accessionNumber.replace(/-/g, '');
  return fetchText(`https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${filename}`);
}

// Some filers' XML prefixes every element with a namespace alias (e.g. <ns1:value>) —
// confirmed live on Third Point's filings — so every tag lookup here tolerates an
// optional "prefix:" on both the opening and closing tag.
function tagValue(text, tag) {
  const m = text.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<\\/(?:\\w+:)?${tag}>`));
  return m ? m[1] : null;
}
function tagBlocks(text, tag) {
  return [...text.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'g'))].map(m => m[1]);
}

function parseSummary(xml) {
  const value = parseFloat(tagValue(xml, 'tableValueTotal') || '0');
  const entries = parseInt(tagValue(xml, 'tableEntryTotal') || '0', 10);
  return { valueUsd: value, entryTotal: entries };
}

// Dedupes by CUSIP (+ putCall) — a single holding can appear as multiple <infoTable>
// rows when a filing consolidates several reporting entities (e.g. Berkshire's
// insurance subsidiaries), so summing raw rows would double-count positions.
function parseInfoTable(xml) {
  const rows = tagBlocks(xml, 'infoTable');
  const byKey = new Map();
  for (const r of rows) {
    const cusip = tagValue(r, 'cusip');
    if (!cusip) continue;
    const name    = tagValue(r, 'nameOfIssuer') || 'Unknown';
    const value   = parseFloat(tagValue(r, 'value') || '0');
    const shares  = parseFloat(tagValue(r, 'sshPrnamt') || '0');
    const putCall = tagValue(r, 'putCall');
    const key = cusip + (putCall ? `:${putCall}` : '');
    const prev = byKey.get(key) || { name, cusip, putCall, value: 0, shares: 0 };
    prev.value += value;
    prev.shares += shares;
    byKey.set(key, prev);
  }
  return [...byKey.values()].sort((a, b) => b.value - a.value);
}

// SEC's 2023 rule change moved 13F values from thousands to whole dollars, but not
// every filer's submission software follows this consistently — confirmed live: some
// 2026 filings (e.g. Duquesne Family Office) still report both the summary total AND
// every per-holding <value> in thousands. There's no schema flag that reliably says
// which; the working signal is implied price-per-share (value/shares), which should
// land in a normal stock-price range for real value/dollars — the median across all
// positions is used so a couple of exotic prices (e.g. real penny stocks) don't skew it.
function detectScaleFactor(positions) {
  const impliedPrices = positions
    .filter(p => p.shares > 0)
    .map(p => p.value / p.shares)
    .sort((a, b) => a - b);
  if (impliedPrices.length === 0) return 1;
  const median = impliedPrices[Math.floor(impliedPrices.length / 2)];
  return median < 1 ? 1000 : 1;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const results = [];
const failures = [];

// Cross-fund aggregates, built incrementally from every fund we fully parse
// (not just the flagged "deep dive" fund) — this is how "most owned" and
// "consensus buys/sells" get computed without persisting every fund's raw holdings.
const ownership  = new Map(); // cusip -> { name, cusip, count, totalValue }
const netChange  = new Map(); // cusip -> { name, cusip, addCount, reduceCount, netValueDelta }

for (const fund of FUNDS) {
  console.log(`\n── ${fund.name} (CIK ${fund.cik}) ──`);
  try {
    await delay(350);
    const subs = await getSubmissions(fund.cik);
    const periods = recentPeriods(subs, 2);
    if (periods.length === 0) throw new Error('no 13F-HR filings found');
    const current = periods[0];
    const prior = periods[1] || null;

    // Defensive: a CIK that has stopped filing (fund restructured under a new
    // registrant, as happened with Appaloosa and Icahn during development of this
    // script) still returns old filings successfully — don't silently publish them.
    const ageDays = (Date.now() - Date.parse(current.reportDate)) / 86400000;
    if (ageDays > 400) {
      throw new Error(`most recent 13F-HR is from ${current.reportDate} (${Math.round(ageDays)}d old) — CIK likely inactive/superseded`);
    }

    await delay(350);
    const primaryXml = await fetchFilingFile(fund.cik, current.accessionNumber, 'primary_doc.xml');
    const summary = parseSummary(primaryXml);

    const entry = {
      id: fund.id, name: fund.name, manager: fund.manager, style: fund.style, cik: fund.cik,
      valueUsd: summary.valueUsd, reportedLines: summary.entryTotal,
      reportDate: current.reportDate, filingDate: current.filingDate,
      positionsCount: summary.entryTotal, topHolding: null, holdings: null, deep: false,
    };

    if (summary.entryTotal > 0 && summary.entryTotal <= DEEP_PARSE_MAX_LINES) {
      await delay(350);
      const files = await getFilingFiles(fund.cik, current.accessionNumber);
      const infoFile = findInfoTableFilename(files);
      if (infoFile) {
        await delay(350);
        const infoXml = await fetchFilingFile(fund.cik, current.accessionNumber, infoFile);
        let positions = parseInfoTable(infoXml);
        entry.positionsCount = positions.length;
        entry.deep = true;

        // Some filers report values in thousands despite the 2023 dollars rule change
        // (confirmed live on Duquesne's filings) — detect and correct before using
        // these values for anything, including the sanity check below.
        const scale = detectScaleFactor(positions);
        if (scale !== 1) {
          positions = positions.map(p => ({ ...p, value: p.value * scale }));
          ghWarn(`13F/${fund.id}`, `Detected values in thousands (median implied price < $1/share) — applied ×${scale} correction`);
        }

        // Use the (scale-corrected) deduped holdings sum as the authoritative fund
        // value rather than trusting the summary page's own total at face value —
        // it can carry the same unit inconsistency.
        const sum = positions.reduce((s, p) => s + p.value, 0);
        if (summary.valueUsd > 0 && Math.abs(sum - summary.valueUsd * scale) / sum > 0.03) {
          ghWarn(`13F/${fund.id}`, `Deduped holdings sum $${sum.toFixed(0)} differs >3% from filer-reported total $${(summary.valueUsd * scale).toFixed(0)}`);
        }
        entry.valueUsd = sum;

        const top = positions[0];
        entry.topHolding = top ? {
          fundId: fund.id, fundName: fund.name, manager: fund.manager,
          name: top.name, cusip: top.cusip, ticker: CUSIP_TICKER[top.cusip] || null,
          valueUsd: top.value, weightPct: sum ? (top.value / sum * 100) : null,
        } : null;

        // Prior quarter, for both consensus-buy aggregation and (for the deep-dive
        // fund) per-position QoQ deltas.
        let priorPositions = [];
        if (prior) {
          try {
            await delay(350);
            const priorFiles = await getFilingFiles(fund.cik, prior.accessionNumber);
            const priorInfoFile = findInfoTableFilename(priorFiles);
            if (priorInfoFile) {
              await delay(350);
              const priorXml = await fetchFilingFile(fund.cik, prior.accessionNumber, priorInfoFile);
              priorPositions = parseInfoTable(priorXml);
              const priorScale = detectScaleFactor(priorPositions);
              if (priorScale !== 1) priorPositions = priorPositions.map(p => ({ ...p, value: p.value * priorScale }));
            }
          } catch (e) {
            ghWarn(`13F/${fund.id}/prior`, e.message);
          }
        }
        const priorByCusip = new Map(priorPositions.map(p => [p.cusip, p]));

        for (const p of positions) {
          const o = ownership.get(p.cusip) || { name: p.name, cusip: p.cusip, count: 0, totalValue: 0 };
          o.count += 1;
          o.totalValue += p.value;
          ownership.set(p.cusip, o);

          const prevP = priorByCusip.get(p.cusip);
          const d = netChange.get(p.cusip) || { name: p.name, cusip: p.cusip, addCount: 0, reduceCount: 0, netValueDelta: 0 };
          if (!prevP) {
            d.addCount += 1;
            d.netValueDelta += p.value;
          } else {
            const delta = p.value - prevP.value;
            d.netValueDelta += delta;
            if (delta > 0) d.addCount += 1;
            else if (delta < 0) d.reduceCount += 1;
          }
          netChange.set(p.cusip, d);
        }

        if (fund.deepDive) {
          entry.holdings = positions.map(p => {
            const prevP = priorByCusip.get(p.cusip);
            const qoqSharesPct = (prevP && prevP.shares > 0) ? ((p.shares - prevP.shares) / prevP.shares * 100) : null;
            return {
              name: p.name, cusip: p.cusip, ticker: CUSIP_TICKER[p.cusip] || null,
              valueUsd: p.value, weightPct: sum ? (p.value / sum * 100) : null,
              shares: p.shares, qoqSharesPct, isNew: !prevP,
            };
          });
        }
      }
    }

    results.push(entry);
    console.log(`  value $${(entry.valueUsd / 1e9).toFixed(1)}B  lines ${summary.entryTotal}  report ${current.reportDate}${entry.deep ? `  positions ${entry.positionsCount} [deep-parsed]` : ''}`);
  } catch (err) {
    failures.push(`${fund.name}: ${err.message}`);
    console.warn(`  ✗ ${err.message}`);
  }
}

const deepFundsCount = results.filter(r => r.deep).length;

const mostOwned = [...ownership.values()]
  .map(o => ({ ...o, ticker: CUSIP_TICKER[o.cusip] || null }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 15);

const consensusBuys = [...netChange.values()]
  .filter(d => d.addCount >= 2)
  .map(d => ({ ...d, ticker: CUSIP_TICKER[d.cusip] || null }))
  .sort((a, b) => b.addCount - a.addCount)
  .slice(0, 15);

const consensusSells = [...netChange.values()]
  .filter(d => d.reduceCount >= 2)
  .map(d => ({ ...d, ticker: CUSIP_TICKER[d.cusip] || null }))
  .sort((a, b) => b.reduceCount - a.reduceCount)
  .slice(0, 15);

const concentratedBets = results
  .filter(r => r.topHolding && r.topHolding.weightPct != null)
  .map(r => r.topHolding)
  .sort((a, b) => b.weightPct - a.weightPct)
  .slice(0, 12);

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: 'SEC EDGAR (Form 13F filings) — data.sec.gov + www.sec.gov, no API key required',
    fundsTracked: FUNDS.length,
    fundsFullyParsed: deepFundsCount,
    deepParseThresholdLines: DEEP_PARSE_MAX_LINES,
    note: 'Fund universe and CUSIP-ticker map are hand-curated and reviewed periodically; every value, holding, and date is fetched live from SEC EDGAR each run.',
  },
  funds: results.sort((a, b) => b.valueUsd - a.valueUsd),
  concentratedBets,
  mostOwned,
  consensusBuys,
  consensusSells,
  failures,
};

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

// 13f.html falls back to this when fetch fails (e.g. opened via file://) — generated
// directly from `output` so it can never drift from the committed JSON like a
// hand-maintained fallback constant could.
const EMBED_OUT = join(__dirname, '..', 'data', '13f-data.embed.js');
writeFileSync(EMBED_OUT, `window.FALLBACK_13F_DATA = ${JSON.stringify(output)};\n`, 'utf8');

console.log(`\n── Summary ──────────────────────────────────────────────`);
console.log(`✓ Written → ${OUT}`);
console.log(`  Funds tracked: ${FUNDS.length}, fully parsed (≤${DEEP_PARSE_MAX_LINES} lines): ${deepFundsCount}`);
if (failures.length) {
  console.log(`  Failures (${failures.length}):`);
  failures.forEach(f => console.log(`   - ${f}`));
}

// Schema validation — fatal, protects the page from publishing garbage.
function assert(cond, msg) { if (!cond) throw new Error(msg); }
try {
  assert(Array.isArray(output.funds) && output.funds.length >= FUNDS.length - 5, `too many funds failed: ${output.funds.length}/${FUNDS.length}`);
  for (const f of output.funds) {
    assert(typeof f.valueUsd === 'number' && f.valueUsd > 0, `${f.id}.valueUsd invalid`);
    assert(typeof f.reportDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.reportDate), `${f.id}.reportDate invalid`);
  }
  const brk = output.funds.find(f => f.id === 'berkshire');
  assert(brk && brk.deep && Array.isArray(brk.holdings) && brk.holdings.length >= 15, 'Berkshire deep-dive holdings missing/too short');
  console.log('\n✓ Schema validation passed');
} catch (err) {
  ghWarn('SchemaValidation13F', err.message);
  console.error(`Schema validation FAILED: ${err.message}`);
  process.exit(1);
}
