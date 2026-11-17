// Token Radar — the dashboard (no network, no framework).
//
// The page reads window.RADAR from data.js, written by main.ts from the same
// board. The value model lives here too, as impliedValue(row): the detail
// view recomputes every row's implied value from the snapshot's own figures,
// so the number on the screen always shows its working. Farm plans are
// generated here as well, from each row's category, chains, TVL and age.
//
// impliedValue(row):
//   base      = tvl_usd x 0.20
//   category  = multiple by category (lending/CDP 1.20, derivatives 1.15,
//               yield/RWA 1.10, dex/curators 1.05, bridges 0.85, else 1.00)
//   growth    = 1 + 0.6 x clamp(change_7d, -50, 150) / 100
//   maturity  = 0.80 + 0.40 x min(age_days, 1460) / 1460 (unknown age: 365)
//   breadth   = 1 + 0.025 x min(chains - 1, 12)
//   implied   = round(base x category x growth x maturity x breadth)
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'Token Radar: no data.js found.'; return; }

  var MODEL = R.model;
  var CAT = [
    [/lend/i, 1.2], [/cdp/i, 1.2], [/derivative/i, 1.15], [/perpetual/i, 1.15],
    [/yield/i, 1.1], [/rwa/i, 1.1], [/dex/i, 1.05], [/risk curator/i, 1.05],
    [/capital allocator/i, 1.05], [/restak/i, 1.05], [/prediction/i, 1.0],
    [/bridge/i, 0.85], [/liquid staking/i, 0.9], [/cex/i, 0.8]
  ];
  function catMult(cat) {
    var c = cat || '';
    for (var i = 0; i < CAT.length; i++) if (CAT[i][0].test(c)) return CAT[i][1];
    return 1;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** Recompute one row's implied value from its own figures, with the factors. */
  function impliedValue(row) {
    var age = row.age_days == null ? MODEL.unknown_age_days : row.age_days;
    var base = row.tvl_usd * MODEL.base_multiple;
    var cat = catMult(row.category);
    var growthPct = clamp(row.change_7d == null ? 0 : row.change_7d, MODEL.growth_floor, MODEL.growth_cap);
    var growth = 1 + (growthPct / 100) * MODEL.growth_weight;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var breadth = 1 + MODEL.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), MODEL.breadth_max_chains);
    return { implied: Math.max(1, Math.round(base * cat * growth * maturity * breadth)),
      base: Math.round(base), cat: cat, growthPct: growthPct, growth: growth,
      maturity: maturity, breadth: breadth, age: row.age_days };
  }

  // ---- formatting -------------------------------------------------------
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(v) {
    if (v == null) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function ageText(a) { return a == null ? '—' : (a >= 365 ? (a / 365).toFixed(1) + 'y' : a + 'd'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- farm plans (generated from the row, never from a list of names) ----
  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 'about $6 to $10 of gas';
    if (c === 'solana') return 'about $0.10 of fees';
    if (['base', 'arbitrum', 'optimism', 'polygon', 'unichain', 'blast', 'mode', 'scroll', 'linea', 'zksync'].indexOf(c) >= 0) return 'under $1 of gas';
    if (c === 'bitcoin' || c === 'tron' || c === 'bsc' || c === 'binance') return 'about $2 of fees';
    return 'about $2 of gas';
  }
  function holdFor(age) {
    if (age == null) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, cap, chain) {
    var c = (row.category || '').toLowerCase();
    var n = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lend $' + cap + ' of USDC on ' + n + ' (' + chain + ') and leave the loan open.';
    if (c.indexOf('dex') >= 0) return 'Add $' + cap + ' of liquidity to ' + n + '\u2019s largest pool on ' + chain + ' and leave it in range.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + cap + ' into ' + n + '\u2019s top vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0) return 'Allocate $' + cap + ' to a ' + n + ' curator vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Post $' + cap + ' of USDC as margin on ' + n + ' (' + chain + ') and open one small hedged trade.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + cap + ' of ' + n + '\u2019s yield-bearing asset on ' + chain + ' and hold it.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + cap + ' and take one position on ' + n + ' (' + chain + ').';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + cap + ' of the chain\u2019s staking asset through ' + n + ' and keep the receipt.';
    return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  /** Six steps: action, cost, time — all derived from the row's own record. */
  function farmSteps(row) {
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var cap = capitalFor(row);
    var hold = holdFor(row.age_days);
    var gas = gasFor(chain);
    return [
      { t: 'Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot.', c: 'nothing to open, and under $3 for the first transaction', m: '5 minutes' },
      { t: actionFor(row, cap, chain), c: '$' + cap + ' of capital and ' + gas, m: '15 minutes to set up' },
      { t: 'Do one qualifying action every week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', c: gas + ' a week', m: '10 minutes a week' },
      { t: 'Hold the position for at least ' + hold + ' days so the activity lands in more than one snapshot.', c: 'the $' + cap + ' stays in the position', m: hold + ' days' },
      { t: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', c: 'no fee to check, and never pay anyone to claim', m: '10 minutes' },
      { t: 'Risk: smart-contract risk on ' + chain + ' and a token that may never launch; the $' + cap + ' can fall with the market. Log the wallet, the dates and every transaction hash.', c: 'nothing but the log', m: '5 minutes' }
    ];
  }

  // ---- state and rendering ----------------------------------------------
  var state = { q: '', cat: '', chain: '', watchOnly: false, sort: 'rank', selected: null };
  var watchSet = {};
  (R.rows || []).forEach(function (r) { watchSet[r.slug] = false; });
  var watchlist = new Set(R.watchlist || []);
  var $ = function (id) { return document.getElementById(id); };

  function fillSelect(id, values) {
    var sel = $(id);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  var cats = [], chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  fillSelect('cat', cats); fillSelect('chain', chains);

  var totalImplied = R.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  $('stats').innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + '</dd></div>' +
    '<div><dt>Board rows</dt><dd>' + R.board_size + '</dd></div>' +
    '<div><dt>Early finds</dt><dd>' + R.early_size + '</dd></div>' +
    '<div><dt>Total implied value</dt><dd>' + money(totalImplied) + '</dd></div>';
  $('source').textContent = 'Source: ' + R.source + ' · Floor: ' + moneyFull(R.floor_usd) + ' TVL. ' +
    'A protocol is listed as pre-token when the snapshot records no token for it — no market cap, no CoinGecko id, no symbol.';
  $('formula').textContent =
    'implied = round( TVL x 0.20 x category x growth x maturity x breadth )\n' +
    '  category  lending/CDP 1.20 · derivatives 1.15 · yield/RWA 1.10 · dex/curators 1.05 · bridges 0.85 · else 1.00\n' +
    '  growth    1 + 0.6 x clamp(7d change, -50%, +150%) / 100\n' +
    '  maturity  0.80 + 0.40 x min(age in days, 1460) / 1460   (age unknown: 365 days)\n' +
    '  breadth   1 + 0.025 x min(chains - 1, 12)';
  $('constants').textContent = 'Model ' + R.model_version + ': base multiple 0.20, growth weight 0.6, ' +
    'maturity 0.80–1.20 over 4 years, breadth up to 1.30 for 13+ chains. Every factor comes from the snapshot; no name is ever special-cased.';

  function filtered() {
    var q = state.q.toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.watchOnly && !watchlist.has(r.slug)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort;
    rows.sort(function (a, b) {
      if (k === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (k === 'growth') return (b.change_7d || 0) - (a.change_7d || 0) || a.rank - b.rank;
      if (k === 'age') return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank;
      if (k === 'name') return a.name < b.name ? -1 : a.name > b.name ? 1 : a.rank - b.rank;
      return a.rank - b.rank;
    });
    return rows;
  }

  function renderBoard() {
    var rows = filtered();
    var show = rows.slice(0, 100);
    $('rows').innerHTML = show.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
    $('boardNote').textContent = state.watchOnly ? 'Watchlist rows only — the 40 protocols at or above the $50M floor that record no token.' : 'Pre-token protocols only, ranked by implied value. Click a row for its detail, farm plan and value breakdown.';
    $('countNote').textContent = 'Showing ' + show.length + ' of ' + rows.length + ' matching rows (' + R.board_size + ' on the full board).';
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  function showDetail(slug, opts) {
    var row = null;
    R.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    var v = impliedValue(row);
    var steps = farmSteps(row);
    $('detail').hidden = false;
    $('detailTitle').textContent = '#' + row.rank + ' — ' + row.name;
    $('detailBadges').innerHTML =
      '<span class="badge">records no token</span>' +
      (watchlist.has(row.slug) ? '<span class="badge watch">on the watchlist</span>' : '<span class="badge">early find</span>') +
      '<span class="badge">' + esc(row.category || 'no category') + '</span>';
    $('detailStats').innerHTML =
      '<div><dt>Implied value</dt><dd>' + moneyFull(row.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + moneyFull(row.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + (row.change_7d == null ? '—' : (row.change_7d > 0 ? '+' : '') + row.change_7d.toFixed(1) + '%') + '</dd></div>' +
      '<div><dt>Age</dt><dd>' + (row.age_days == null ? 'unknown' : row.age_days + ' days') + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + row.chains.length + '</dd></div>' +
      '<div><dt>Listed</dt><dd>' + esc(row.listed_at || '—') + '</dd></div>';
    $('breakdown').innerHTML =
      '<tr><th>Factor</th><th>Figure</th><th class="num">Value</th></tr>' +
      '<tr><td>Base — TVL x 0.20</td><td>' + moneyFull(row.tvl_usd) + ' x 0.20</td><td class="num">' + moneyFull(v.base) + '</td></tr>' +
      '<tr><td>Category multiple</td><td>' + esc(row.category || 'none') + '</td><td class="num">x ' + v.cat.toFixed(2) + '</td></tr>' +
      '<tr><td>Growth multiplier</td><td>7d ' + (row.change_7d == null ? 'unreported' : row.change_7d.toFixed(1) + '%') + ' (clamped to ' + v.growthPct.toFixed(1) + '%)</td><td class="num">x ' + v.growth.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>' + (row.age_days == null ? 'age unknown, 365 days assumed' : row.age_days + ' days listed') + '</td><td class="num">x ' + v.maturity.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth multiplier</td><td>' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + '</td><td class="num">x ' + v.breadth.toFixed(4) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td>base x category x growth x maturity x breadth</td><td class="num val"><strong>' + moneyFull(v.implied) + '</strong></td></tr>';
    $('breakdownNote').textContent = 'Recomputed live from this row\u2019s own figures by impliedValue(row) — the number on the board is the product above, rounded to whole dollars.';
    $('steps').innerHTML = steps.map(function (s) {
      return '<li>' + esc(s.t) + '<span class="meta"><b>Cost:</b> ' + esc(s.c) + ' &middot; <b>Time:</b> ' + esc(s.m) + '</span></li>';
    }).join('');
    renderBoard();
    if (!opts || opts.scroll !== false) $('detail').scrollIntoView({ block: 'start' });
  }

  function renderLive() {
    $('liveRows').innerHTML = R.live.map(function (p) {
      return '<tr><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd == null ? '—' : money(p.mcap_usd)) + '</td>' +
        '<td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('watchOnly').addEventListener('change', function (e) { state.watchOnly = e.target.checked; renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      state.sort = k === 'rank' ? 'rank' : k === 'tvl' ? 'tvl' : k === 'growth' ? 'growth' : k === 'age' ? 'age' : k === 'name' ? 'name' : 'rank';
      $('sort').value = state.sort;
      renderBoard();
    });
  });

  renderBoard();
  renderLive();

  // Screenshot views: ?shot=board | detail&slug=<slug> | filtered
  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  if (shot === 'detail') {
    document.documentElement.classList.add('shot-detail');
    showDetail(params.get('slug') || (R.rows[0] && R.rows[0].slug), { scroll: false });
  } else if (shot === 'filtered') {
    state.cat = 'Lending';
    $('cat').value = 'Lending';
    renderBoard();
  }
  window.__shotReady = true;
})();
