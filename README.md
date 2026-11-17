# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kholilnurwahid98-hub/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kholilnurwahid98-hub/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every protocol in a sealed DefiLlama snapshot that records no token yet by what its launch would be worth, and shows how to farm each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Then open `out/dashboard/index.html` in a desktop browser. No network is needed: the page reads `out/data.js` beside it.

## The value model (radar-2)

`impliedValue` in `lib/model.ts` scores every protocol from the snapshot's own figures only — never from a list of names:

```
implied = round( TVL x 0.20 x category x growth x maturity x breadth )
  category  lending/CDP 1.20 · derivatives 1.15 · yield/RWA 1.10 · dex/curators 1.05 · bridges 0.85 · else 1.00
  growth    1 + 0.6 x clamp(7d change, -50%, +150%) / 100
  maturity  0.80 + 0.40 x min(age in days, 1460) / 1460   (age unknown: 365 days)
  breadth   1 + 0.025 x min(chains - 1, 12)
```

The board ranks every protocol that records no token and is not a wrapped, staked or bridged product of a token that already trades: the 40-protocol watchlist is the floor, and the early rows below it are the radar's own finds (198 rows in all). Protocols whose token already trades are kept apart in a separate reference table at their market cap, never ranked. Each row carries a six-step farm plan with costs and times, generated from the protocol's category, chains, TVL and age.

A protocol "records no token" when the snapshot carries no market cap, no CoinGecko id and no symbol for it — that is DefiLlama's record, not proof. The implied value is this entry's own claim, not a prediction of whether or when a token is issued.

## Layout

- `main.ts` — the program: reads the snapshot, writes `board.json`, `data.js` and `dossier.json`
- `lib/model.ts` — the value model, the farm plans and the board builder
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a detail view and a filtered view
- `vendor/makefun-board.ts` — the make.fun dossier library, copied from the kit unchanged

---

<sub>Entered on [make.fun](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
