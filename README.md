# The World's Money, to Scale

A macro dashboard comparing the total value of every major asset class on Earth — real estate, bonds, equities, broad money, gold — against the entire crypto market, plus a ranked league of the world's 10 largest national stock markets.

**Live site:** `https://<your-org>.github.io/<repo-name>/worlds-money/`

---

## Architecture at a glance

```
worlds-money/
├── index.html              # semantic shell — no hardcoded figures
├── assets/
│   ├── styles.css          # both themes, all tokens, bar animations
│   └── app.js              # fetches data/market-data.json, renders page
├── data/
│   ├── market-data.json    # THE dataset — regenerated daily by CI
│   └── history/            # dated snapshots: market-data-YYYY-MM-DD.json
├── scripts/
│   └── refresh-data.mjs    # Node 20+ refresh script (no heavy deps)
└── .github/workflows/
    └── refresh.yml         # daily cron → run script → commit → deploy
```

**Separation of data and layout:** Every number rendered on the page comes from `data/market-data.json`. Zero figures are hardcoded in `index.html` or `app.js` (the only exception is the `FALLBACK_DATA` constant in `app.js`, which mirrors the initial JSON and is used only when the file is opened directly via `file://`).

---

## Data dictionary

### `meta`
| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | ISO-8601 | When the JSON was last written by the refresh script |
| `currency` | `"USD"` | All values in US dollars |
| `unit` | `"trillion"` | All `valueT` / `capT` fields are trillions of USD |
| `version` | number | Schema version (currently `2`) |

### `assetClasses[]`
| Field | Description |
|-------|-------------|
| `id` | `re` \| `bond` \| `eq` \| `m2` \| `gold` \| `crypto` |
| `name` | Display name |
| `sub` | One-line description of what's included |
| `valueT` | Total value in USD trillions |
| `asOf` | Date of the underlying estimate (ISO date) |
| `source` | Human-readable source name |
| `tier` | `1` = fetched daily from live API · `2` = curated constant |
| `stale` | `true` when a Tier 1 fetch failed; last known value is preserved |

### `crypto`
| Field | Description |
|-------|-------------|
| `totalT` | Total crypto market cap (trillions) |
| `athT` | All-time high (trillions) |
| `athDate` | Month of ATH (YYYY-MM) |
| `volume24hB` | 24h trading volume (billions) |
| `btc.capT` | Bitcoin market cap (trillions) |
| `btc.dominancePct` | BTC % of total crypto |
| `btc.priceUsd` | BTC spot price |
| `eth.capB` | Ethereum market cap (billions) |
| `eth.dominancePct` | ETH % of total crypto |
| `stablecoinsB` | Estimated stablecoin total (billions) — USDT-based approximation |
| `sparklineData[]` | `{date, totalT}` — last 90 days; drives the in-page sparkline |

### `gold`
| Field | Description |
|-------|-------------|
| `spotUsdPerOz` | Gold spot price in USD/troy oz |
| `aboveGroundTonnes` | Total above-ground gold stock (WGC; revise annually) |
| `impliedCapT` | `spot × tonnes × 32150.7 / 1e12` |

### `derivatives`
BIS OTC + exchange-traded derivatives. **Not included in any wealth total.** Shown as a ghost bar for context only.

### `countryEquityMarkets[]`
Top-10 national stock markets by total market cap. Fields: `rank`, `country`, `region` (`americas`|`asia`|`emea`), `capT`, `note`, `badge`.

---

## Tiered freshness

| Tier | What | How often | Source |
|------|------|-----------|--------|
| 1 | Crypto totals, BTC/ETH prices, gold spot | Daily (CI cron) | CoinGecko (keyless) + gold-api.com / Yahoo Finance fallback |
| 2 | Real estate, bonds, equities, M2, country league | Monthly (manual) | Savills, BIS, Bloomberg/WFE, StreetStats, Visual Capitalist |

Tier 1 values carry the refresh date. Tier 2 values carry their publication date.

---

## Local development

**Requirements:** Node.js ≥ 20, no other dependencies.

```bash
# Run the refresh script against live APIs
node scripts/refresh-data.mjs

# Serve the site locally (uses npx — installs serve on demand)
npm run dev
# → http://localhost:3000
```

Opening `index.html` directly as `file://` also works — `app.js` falls back to its embedded `FALLBACK_DATA` constant if `fetch('data/market-data.json')` fails.

---

## Deployment (GitHub Pages)

1. Push this directory to a GitHub repo.
2. In **Settings → Pages**, set Source to **GitHub Actions**.
3. The workflow `.github/workflows/refresh.yml` will:
   - Run daily at 06:15 UTC
   - Call `scripts/refresh-data.mjs`
   - Commit changed `data/market-data.json` + history snapshot
   - Deploy the site via `actions/deploy-pages`

To trigger manually: **Actions → Refresh market data → Run workflow**.

### Optional secrets
| Secret | Purpose |
|--------|---------|
| `GOLD_API_KEY` | Higher-rate tier for gold-api.com (not required for MVP) |

---

## Monthly 10-minute Tier 2 update ritual

Open `scripts/refresh-data.mjs` and update the `TIER2` object. Exact URLs to check:

| Field | URL | What to look for |
|-------|-----|-----------------|
| `re.valueT` | [savills.com/research_articles/229130/253671-0](https://www.savills.com/research_articles/229130/253671-0) | "Total value of global real estate" headline figure |
| `bond.valueT` | [stats.bis.org/statx/toc/DT.html](https://stats.bis.org/statx/toc/DT.html) → *Debt securities statistics* | "Total debt securities outstanding" — all sectors, all countries |
| `eq.valueT` | [world-exchanges.org/our-work/statistics](https://www.world-exchanges.org/our-work/statistics) → *Monthly reports* | "Total domestic market cap" row |
| `m2.valueT` | Search "StreetStats M2 global" or check Fed H.6 + ECB + PBoC + BoJ latest releases | Sum US + Eurozone + China + Japan M2 |
| `countryEquityMarkets` | [visualcapitalist.com/largest-stock-markets-world](https://www.visualcapitalist.com/largest-stock-markets-world/) | Ranked table, Bloomberg/WFE sourced |
| `goldAboveGroundTonnes` | [gold.org/goldhub/research/how-much-gold-has-been-mined](https://www.gold.org/goldhub/research/how-much-gold-has-been-mined) | Revise annually |
| `crypto.athT` + `crypto.athDate` | CoinGecko global chart | All-time peak total market cap |

After editing, run `node scripts/refresh-data.mjs` locally to verify the schema check passes, then commit.

---

## Adding a new asset class (< 10 lines)

1. **JSON schema**: add an entry to `assetClasses[]` in `data/market-data.json` and to the `TIER2` object (or Tier 1 fetch block) in `scripts/refresh-data.mjs`.
2. **CSS**: add `.bar-fill--<id>` and `.hero-item--<id>` / `.panel--<id>` colour rules in `assets/styles.css`.
3. **App**: add the `id` to the `ASSET_ORDER` array at the top of `assets/app.js`.
4. **Schema check**: update the `assert(... length === 6 ...)` count in `refresh-data.mjs`.

---

## Fail-soft behaviour

If a Tier 1 API fetch fails:

- The previous value is preserved from the last successful run.
- `stale: true` is set on that asset class entry.
- The UI renders a dotted underline on stale values with a "Using last known value" tooltip.
- The script exits `0` — the build never breaks, the page never goes blank.
- GitHub Actions emits a `::warning::` annotation per failed source.

---

## Quality gates

```bash
# 1. Script runs and produces valid JSON
node scripts/refresh-data.mjs

# 2. Simulate API outage: point CoinGecko to a bad URL in the script,
#    re-run — script should exit 0, JSON should keep old crypto values with stale:true

# 3. Serve the page and verify both themes render, bars animate
npm run dev

# 4. grep to confirm no figures are hardcoded in HTML or app.js
# (FALLBACK_DATA in app.js is expected — it mirrors the JSON)
grep -E '\$[0-9]+\.?[0-9]*(T|B|k)' index.html    # should return nothing
```
