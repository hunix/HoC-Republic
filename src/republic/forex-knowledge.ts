/**
 * Republic Platform — Forex Knowledge Seeding
 *
 * Seeds 22 structured knowledge items into the Republic's education system:
 *   - 12 comprehensive Forex trading courses
 *   - 5 book summaries with key trading lessons
 *   - 5 critical data sets (correlations, seasonality, calendar, etc.)
 *
 * Designed to make every citizen Forex-aware and the specialist
 * citizens fully equipped to trade at a professional level.
 */
// oxlint-disable eslint(curly)

import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitNationalEvent } from "./event-sourcing.js";

const logger = createSubsystemLogger("republic:forex-knowledge");

// ─── Types ──────────────────────────────────────────────────────

export interface ForexKnowledgeItem {
  id: string;
  type: "course" | "book" | "dataset" | "insight";
  title: string;
  category: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  summary: string;
  keyLessons: string[];
  tags: string[];
  seededAt: string;
}

// ─── Knowledge Database ──────────────────────────────────────────

export const FOREX_KNOWLEDGE: ForexKnowledgeItem[] = [
  // ── Courses (12) ────────────────────────────────────────────────
  {
    id: "forex-course-001",
    type: "course",
    title: "Forex Fundamentals: The Foundation",
    category: "Fundamentals",
    level: "beginner",
    summary: "Complete introduction to the Forex market — the world's largest (>$7.5 trillion/day) and most liquid financial market. Covers what currencies are, why rates change, how brokers work, and the mechanics of entering your first trade.",
    keyLessons: [
      "Forex = Foreign Exchange: buying one currency while selling another simultaneously",
      "Currency pairs: base/quote (e.g., EUR/USD = how many USD per 1 EUR)",
      "Pip = Percentage In Point: smallest price move (0.0001 for most pairs, 0.01 for JPY)",
      "Lot sizes: Standard (100k units), Mini (10k), Micro (1k) — choose based on account size",
      "Leverage: 50:1 or 100:1 amplifies both gains AND losses — use with strict risk rules",
      "Spread = broker's fee = difference between bid and ask price",
      "Market opens Sunday 5pm ET (Wellington NZ) and closes Friday 5pm ET",
      "No central exchange — decentralized OTC market run by interbank network",
    ],
    tags: ["basics", "pips", "lots", "leverage", "spread", "currency-pairs"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-002",
    type: "course",
    title: "Currency Pairs Deep Dive & Correlation",
    category: "Fundamentals",
    level: "beginner",
    summary: "Master the 28 major/minor pairs, understand which economies drive each currency, and learn to use correlation tables to avoid overexposure. EUR/USD alone accounts for ~25% of all Forex volume.",
    keyLessons: [
      "Majors (highest liquidity): EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD",
      "Safe-haven currencies: JPY and CHF strengthen during global risk-off events",
      "Commodity currencies: AUD, NZD, CAD move with commodity prices (gold, iron ore, oil)",
      "EUR/USD and USD/CHF have ~-90% correlation — trading both = doubling exposure",
      "AUD/USD and NZD/USD have ~+90% correlation — use for confirmation only",
      "EUR/USD and GBP/USD ~+80% correlation — diversify by trading only one at a time",
      "JPY crosses (AUD/JPY, GBP/JPY) amplify risk-on/risk-off moves",
      "USD/CAD moves inversely to crude oil — monitor WTI for signal confirmation",
    ],
    tags: ["pairs", "correlation", "majors", "safe-haven", "commodity-currencies"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-003",
    type: "course",
    title: "Technical Analysis for Forex Traders",
    category: "Technical Analysis",
    level: "intermediate",
    summary: "Master the core TA toolkit used by professional FX traders: trend identification, support/resistance, chart patterns, and how to combine indicators correctly without over-fitting.",
    keyLessons: [
      "Trend is your friend: Always identify the higher timeframe (D1/W1) trend before entering",
      "Support/Resistance: Previous highs/lows, round numbers (1.2000, 1.2500), and session highs",
      "The 200 EMA acts as dynamic support/resistance on the daily chart — respected by institutions",
      "EMA crossovers: 20/50 EMA golden/death cross signals trend change",
      "Trendlines require at least 3 touch points to be statistically valid",
      "Price always moves from one liquidity pool to the next — find them on the chart",
      "Head & Shoulders (reversal), Double Top/Bottom (reversal), Flags/Pennants (continuation)",
      "Volume is key: breakouts on low volume often fail; high volume breakouts tend to hold",
      "Indicator confluence > single indicator: combine RSI + EMA + S/R for high-probability setups",
    ],
    tags: ["trendlines", "support-resistance", "patterns", "indicators", "confluence"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-004",
    type: "course",
    title: "Candlestick Mastery for Forex",
    category: "Technical Analysis",
    level: "intermediate",
    summary: "The 30 most powerful candlestick patterns with their Forex-specific win rates and best usage contexts. Japanese candlesticks encode 4 critical data points in a single visual — master them.",
    keyLessons: [
      "Doji (open ≈ close) = indecision — powerful reversal signal at key support/resistance",
      "Pin Bar (long wick, small body) = rejection of price level — one of the best setups in FX",
      "Engulfing candle: bullish engulfing at support = high probability long; bearish at resistance = short",
      "Inside bar = consolidation/indecision; breakout of inside bar mother candle sets direction",
      "Three White Soldiers / Three Black Crows = strong sustained momentum signals",
      "Morning Star / Evening Star = 3-candle reversal patterns, most powerful on D1 timeframe",
      "Hammer at support = bullish reversal; Shooting Star at resistance = bearish reversal",
      "Always read candles in context: a doji alone means nothing, but a doji at a major S/R level is significant",
    ],
    tags: ["candlesticks", "pin-bar", "engulfing", "doji", "patterns", "price-action"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-005",
    type: "course",
    title: "Fundamental Analysis & Macro Forex",
    category: "Fundamentals",
    level: "intermediate",
    summary: "Understand how macroeconomic data drives currencies. Central banks, interest rates, inflation, and geopolitics are the engine behind every major FX move. Technical traders who ignore fundamentals miss the biggest moves.",
    keyLessons: [
      "Interest rate differentials are the most powerful long-term driver of FX rates",
      "NFP (Non-Farm Payrolls, 1st Friday of month): highest volatility event for USD pairs — ±50-100 pips common",
      "CPI above expectation = bullish currency (central bank may raise rates); below = bearish",
      "Central bank language ('hawkish' vs 'dovish') moves markets more than the data itself",
      "GDP, PMI, Retail Sales, Trade Balance all have varying market impact — tier 1 events move most",
      "Risk-on: investors buy equities, sell JPY/CHF; Risk-off: buy JPY/CHF, sell AUD/NZD",
      "Currency manipulation: interventions by Bank of Japan or Swiss National Bank can cause 200+ pip moves instantly",
      "Geopolitical events (wars, elections) cause CHF and JPY to spike as safe havens",
    ],
    tags: ["fundamental-analysis", "interest-rates", "NFP", "central-banks", "macro"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-006",
    type: "course",
    title: "Risk Management: The Professional's Edge",
    category: "Risk Management",
    level: "intermediate",
    summary: "The single most important difference between professional traders and retail losers is risk management. This course covers every aspect: position sizing, stop placement, R ratio, and portfolio-level risk.",
    keyLessons: [
      "The 2% Rule: Never risk more than 2% of capital on a single trade — absolute maximum",
      "R-Multiple: Express all trades as multiples of your risk. 1R = initial stop size",
      "Kelly Criterion: optimal_f = (W/L × win_rate - loss_rate) / (W/L) — use fractional Kelly (25-50%)",
      "Stop Loss placement: beyond structure (swing high/low + spread + buffer) — not at round numbers",
      "Risk/Reward Ratio: Minimum 1:2 (risk 1R to make 2R). 1:3 is professional standard",
      "Correlation risk: if you have 3 USD shorts correlated at 80%, your real risk is ~2.4× expected",
      "Maximum drawdown recovery: -25% drawdown requires +33% to recover; -50% requires +100% — avoid deep DDs",
      "Trade journal: log every trade with setup, entry, risk, result — review weekly for edge identification",
      "Position sizing formula: Units = (Account × Risk%) / (Stop Pips × Pip Value)",
    ],
    tags: ["risk-management", "position-sizing", "stop-loss", "kelly", "drawdown", "R-multiple"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-007",
    type: "course",
    title: "Trading Psychology: The Inner Game",
    category: "Psychology",
    level: "intermediate",
    summary: "70% of traders who fail do so not from lack of strategy but from psychological failures. This course covers the full behavioural science behind trading decisions and how to rewire your responses for consistency.",
    keyLessons: [
      "Fear of missing out (FOMO) causes late entries with poor risk/reward — the market will always present new opportunities",
      "Loss aversion: humans feel losses ~2.5x more intensely than equal gains — this distorts decision-making",
      "Revenge trading after a loss is the #1 account killer — implement cooling-off periods",
      "Streaks have no predictive value: a losing streak doesn't make the next trade more likely to win",
      "Confirmation bias: we automatically look for evidence that confirms our existing position",
      "Trading plan must be written before the session — in-session decisions are emotion-driven",
      "Detach from individual trade outcomes. Focus only on executing the process consistently",
      "Daily max loss rule: if down 3R in a day, close platform and stop — protect your capital",
    ],
    tags: ["psychology", "discipline", "FOMO", "bias", "emotional-control", "journaling"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-008",
    type: "course",
    title: "Session Trading: The Forex Clock",
    category: "Strategy",
    level: "intermediate",
    summary: "Each of the four Forex sessions has distinct characteristics: volatility, participating pairs, and institutional activity. Trading with session flow dramatically improves signal quality.",
    keyLessons: [
      "Asian Session (00:00-09:00 UTC): low volatility, tight ranges, best for AUD/JPY, NZD/JPY",
      "London Session (08:00-17:00 UTC): highest volatility, 35% of all Forex volume happens here",
      "New York Session (13:00-22:00 UTC): 25% of volume, highest impact during NY-London overlap",
      "London-NY Overlap (13:00-17:00 UTC): maximum liquidity and volatility — best trading hours",
      "The London open at 08:00 UTC often creates strong momentum breakouts of the Asian range",
      "Spreads are wider during off-hours (late NY, Asian) — factor into position sizing",
      "NFP (1st Friday): avoid trading EUR/USD from 30 min before 13:30 UTC until spike settles",
      "End of month position squaring (last 2 trading days) causes unusual moves — reduce size",
    ],
    tags: ["sessions", "london", "new-york", "asian", "volatility", "overlap"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-009",
    type: "course",
    title: "ICT & Smart Money Concepts (SMC)",
    category: "Advanced Strategy",
    level: "advanced",
    summary: "Inner Circle Trader (ICT) methodology focuses on how institutional 'smart money' moves markets. SMC traders learn to read order blocks, fair value gaps, and liquidity pools to trade alongside institutions not against them.",
    keyLessons: [
      "Order Blocks: the last bearish candle before a large bullish move (or vice versa) — institutions accumulate here",
      "Fair Value Gaps (FVGs): 3-candle pattern where the middle candle creates a gap — price often returns to fill it",
      "Liquidity pools: stop clusters above swing highs / below swing lows — smart money sweeps these before reversing",
      "Breaker Blocks: failed order blocks that then become supply/demand zones",
      "Equal Highs/Lows: retail traders see these as resistances; institutions use them as buy-side/sell-side liquidity",
      "Asian range = manipulation zone; London = expansion after manipulation; NY = consolidation or continuation",
      "HTF (higher timeframe) order blocks on W1/D1 are the strongest — only trade with them, not against",
      "The 'kill zones': Specific daily windows (London Open, NY Open, 4-hour FVG fills) for highest probability entries",
    ],
    tags: ["ICT", "smart-money", "order-blocks", "FVG", "liquidity", "institutional"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-010",
    type: "course",
    title: "Carry Trading: Earning While You Sleep",
    category: "Strategy",
    level: "advanced",
    summary: "The carry trade exploits interest rate differentials between currencies. You borrow low-yield (JPY, CHF) and invest in high-yield (AUD, NZD, USD). In stable markets, you collect positive swap (rollover) every day.",
    keyLessons: [
      "Positive carry = earning the interest rate difference when long high-yield / short low-yield",
      "Primary pairs: AUD/JPY (AUD 4.35% vs JPY 0.10%), NZD/JPY, GBP/JPY",
      "Carry trades unwind violently during risk-off events — position size small and use stops",
      "Carry is a long-term strategy — best during stable macro environments (low VIX)",
      "The optimal time to enter carry is after a risk-off selloff when yields are still attractive",
      "Carry trade entry filter: ADX > 20 (trending), no high-impact news in 48h, equity markets stable",
      "Overnight rollover: positions held past 17:00 ET accrue/debit swap — check broker's swap table",
      "G10 carry basket: systematic diversification across 4-6 carry pairs reduces individual volatility",
    ],
    tags: ["carry-trade", "interest-rates", "swap", "AUD-JPY", "NZD-JPY", "risk-on-off"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-011",
    type: "course",
    title: "Algorithmic Forex Trading",
    category: "Algorithmic",
    level: "advanced",
    summary: "How to design, code, and deploy mechanical Forex trading systems. Covers backtesting methodology, walk-forward optimization, overfitting detection, and live deployment on OANDA and MetaTrader.",
    keyLessons: [
      "Walk-forward testing: divide data into IS (in-sample) for optimization, OOS (out-of-sample) for validation",
      "Out-of-sample performance matters: IS edge must survive OOS — if not, the system is overfit",
      "Equity curve trading: monitor the equity curve as a meta-signal; stop trading a system when it breaks its own trend",
      "Parameter stability: good systems perform similarly across a range of parameter values (robust, not curve-fit)",
      "Execution reality: slippage, spread, latency all erode backtest returns — assume 20-30% haircut",
      "Monte Carlo simulation: randomly shuffle trade order 10,000 times to estimate true drawdown range",
      "Position sizing is often the highest-leverage improvement to a system — Kelly beats fixed-size",
      "OANDA v20 REST API enables programmatic order placement with live data feeds",
    ],
    tags: ["algorithmic", "backtesting", "walk-forward", "OANDA-API", "monte-carlo", "automation"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-course-012",
    type: "course",
    title: "Multi-Timeframe Analysis (MTA)",
    category: "Strategy",
    level: "advanced",
    summary: "Top-down analysis is how professional traders build trade ideas. Start Monthly → Weekly → Daily → H4 → H1 to align all timeframes before pulling the trigger. This dramatically filters out low-quality setups.",
    keyLessons: [
      "Monthly/Weekly: determine the trend and major structure — only trade in this direction",
      "Daily: identify the setup (pattern, key level, indicator signal) — where will price go this week?",
      "H4: refine entry zone and look for confirmation candles near key daily levels",
      "H1/M30: time precise entry, set stop below structure, target next major D1 level",
      "Higher timeframe structure always wins over lower — a D1 resistance beats an H1 support",
      "Only trade in direction of W1 trend unless at major W1 reversal level with strong H4+D1 signal",
      "The 'three-timeframe rule': bullish on at least 2 of 3 timeframes for a buy trade",
      "Trade location matters: entering near D1 support with W1 trend = best risk-reward location",
    ],
    tags: ["multi-timeframe", "top-down", "MTA", "timeframes", "trade-location"],
    seededAt: new Date().toISOString(),
  },

  // ── Books (5) ────────────────────────────────────────────────────
  {
    id: "forex-book-001",
    type: "book",
    title: "Trading in the Zone — Mark Douglas",
    category: "Psychology",
    level: "intermediate",
    summary: "The definitive trading psychology book. Douglas explains why traders with good strategies still lose — and how to fix your mental framework to think in probabilities, accept uncertainty, and execute with discipline. Required reading for any serious trader.",
    keyLessons: [
      "Think in probabilities: any individual trade is a coin flip within your edge — stop caring about outcomes",
      "The market is neutral — it doesn't know you exist. All meaning is created in your own mind",
      "A random distribution of wins and losses will occur over any sample — your job is to take all valid setups",
      "Five Fundamental Truths: (1) anything can happen (2) random distribution of wins/losses (3) an edge is simply higher probability (4) every moment is unique (5) you don't need to know what happens next to make money",
      "Trader beliefs create the 'map' through which they see the market — limiting beliefs = limiting performance",
      "The goal: be as consistent as a casino, not as a gambler",
      "Objectivity requires that you stop needing any particular trade to work out before executing",
    ],
    tags: ["psychology", "probability", "mindset", "consistency", "mark-douglas"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-book-002",
    type: "book",
    title: "The Disciplined Trader — Mark Douglas",
    category: "Psychology",
    level: "intermediate",
    summary: "Douglas's earlier and more introspective work examining the behavioural patterns that undermine trader performance. Explores childhood conditioning, unconscious beliefs, and how to reprogram recurring self-sabotage patterns.",
    keyLessons: [
      "Most destructive trading patterns have roots in early life experiences — self-awareness is step one",
      "The market offers unlimited freedom (you can do anything) — which paradoxically paralyzes most traders",
      "Discipline isn't willpower: it's having rules that match your beliefs about how markets work",
      "Losses are feedback, not failure — the market is showing you information, not punishing you",
      "Self-sabotage pattern: many traders unconsciously recreate familiar emotional states even if painful",
      "Three stages of development: mechanical (follow rules), subjective (develop intuition), intuitive (mastery)",
    ],
    tags: ["psychology", "behavioural", "discipline", "self-awareness", "mark-douglas"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-book-003",
    type: "book",
    title: "Currency Trading for Dummies — Brian Dolan",
    category: "Fundamentals",
    level: "beginner",
    summary: "The most accessible and comprehensive primer on Forex trading. Covers everything from basic concepts through practical strategy, risk management, and how to evaluate brokers. An excellent starting point before more advanced material.",
    keyLessons: [
      "The Forex market is a 24/5 decentralized global network — there is no single exchange",
      "Your broker IS your counterparty in most retail Forex — pick a regulated broker carefully",
      "Understanding the fundamental drivers: central banks, economic data releases, geopolitical risk",
      "Technical analysis works in Forex because millions of traders look at the same charts",
      "Start with demo account for minimum 3 months before risking real capital",
      "Keep a trading journal from day one — it's the difference between learning and just experiencing",
    ],
    tags: ["fundamentals", "beginner", "brokers", "demo", "practical"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-book-004",
    type: "book",
    title: "Reminiscences of a Stock Operator — Edwin Lefèvre",
    category: "Strategy",
    level: "intermediate",
    summary: "Fictionalized biography of Jesse Livermore, one of history's greatest speculators. Though written in 1923 and focused on stocks, every lesson applies directly to Forex. The most quoted book in professional trading.",
    keyLessons: [
      "'The market is never wrong, opinions often are.' — Your opinion of value matters less than what price does",
      "The big money is made by sitting, not trading. Let your winners run — get out of your winners too early and you leave money on the table",
      "'It never was my thinking that made big money for me. It was always my sitting.' — Patience is the rarest skill",
      "Cut losses quickly and ruthlessly — Livermore was ruined multiple times by violating this",
      "Trade with the path of least resistance — the trend that already exists",
      "The tape (price action) tells all — no need to predict; just react to what price does",
      "Timing is everything — the right trade at the wrong time is still a losing trade",
    ],
    tags: ["mindset", "patience", "jesse-livermore", "classics", "speculation"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-book-005",
    type: "book",
    title: "Market Wizards — Jack Schwager",
    category: "Strategy",
    level: "advanced",
    summary: "Interviews with 17 of the world's best traders: Paul Tudor Jones, Ed Seykota, Michael Marcus, Linda Raschke, and more. Recurring themes reveal universal truths about what separates consistently profitable traders from everyone else.",
    keyLessons: [
      "All successful traders have a defined, tested edge — and they stick to it absolutely",
      "Risk management is non-negotiable: every wizard had some version of 'never risk too much on one idea'",
      "Paul Tudor Jones: 'I'm always thinking about losing money rather than making money.' Risk-first mindset",
      "Ed Seykota (trend follower): 'The trend is your friend until the end when it bends'",
      "Michael Marcus: the biggest losses always came from 'one more trade' after a large gain",
      "All these traders developed their own style — there is no single correct way to trade",
      "The psychological commonality: they ALL accept losses as the cost of doing business",
      "No system works in all market conditions — recognize when your edge is in and out of favour",
    ],
    tags: ["interviews", "mindset", "paul-tudor-jones", "trend-following", "edge", "advanced"],
    seededAt: new Date().toISOString(),
  },

  // ── Data Sets (5) ────────────────────────────────────────────────
  {
    id: "forex-data-001",
    type: "dataset",
    title: "Currency Correlation Matrix (28 pairs)",
    category: "Data",
    level: "intermediate",
    summary: "Real correlation coefficients for all 28 tracked pairs averaged over 12 months. Use this to avoid over-exposure and to find confirmation trades.",
    keyLessons: [
      "EUR/USD + USD/CHF: -0.89 (near-perfect negative) — don't trade both simultaneously",
      "EUR/USD + GBP/USD: +0.82 (strong positive) — confirmation, not diversification",
      "AUD/USD + NZD/USD: +0.93 (very strong) — treat as same position",
      "AUD/USD + USD/CAD: -0.78 (commodity currencies vs USD)",
      "EUR/JPY + GBP/JPY: +0.91 — both JPY crosses move together",
      "USD/JPY + EUR/JPY: +0.71 — partial overlap",
      "NZD/USD + AUD/USD: highest correlation in the market",
      "Safe-haven pairs (USD/JPY, USD/CHF) tend to correlate during risk events",
    ],
    tags: ["correlation", "risk-management", "pairs", "data", "portfolio"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-data-002",
    type: "dataset",
    title: "Pip Volatility by Session & Pair",
    category: "Data",
    level: "intermediate",
    summary: "Average daily pip ranges per pair broken down by trading session. Critical for realistic stop placement and profit targeting.",
    keyLessons: [
      "EUR/USD: Daily avg 70-120 pips. London session: 50-80 pips. Asian: 20-40 pips",
      "GBP/USD: Daily avg 90-160 pips (highest volatility major). London: 70-120 pips",
      "GBP/JPY: Daily avg 120-200 pips — most volatile major cross. Wide spreads compensate",
      "USD/JPY: Daily avg 60-100 pips. Spikes during BoJ interventions (200+ pips)",
      "AUD/USD: Daily avg 50-80 pips. Moves 20-40 pips during Sydney/Tokyo session",
      "USD/CHF: Daily avg 60-90 pips. SNB intervention risk can cause 300+ pip gaps",
      "OANDA spread reference: EUR/USD ~0.5 pips, GBP/USD ~0.9 pips, AUD/JPY ~1.5 pips",
      "NFP release: EUR/USD can move 100-200 pips within 60 seconds — widen stops or stand aside",
    ],
    tags: ["volatility", "pip-range", "sessions", "position-sizing", "data"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-data-003",
    type: "dataset",
    title: "Seasonality: Best Months per Currency Pair (20yr data)",
    category: "Data",
    level: "advanced",
    summary: "Statistical edge from 20 years of monthly data. Some currency pairs have strong seasonal biases driven by fiscal year-ends, commodity cycles, and portfolio rebalancing.",
    keyLessons: [
      "USD/JPY: tends to rise Jan-March (fiscal year-end in Japan, repatriation flows reversed)",
      "AUD/USD: historically strong Feb-April (strong Chinese demand for iron ore seasonally)",
      "EUR/USD: often weak in Sept-Oct (European fiscal pressures, rising USD demand)",
      "GBP/USD: Q4 historically volatile (UK fiscal year prep, year-end risk management)",
      "NZD/USD: peaks seasonally in June-August (southern hemisphere winter dairy demand)",
      "USD/CAD: tends to rise (CAD weaker) in winter when oil demand falters",
      "Seasonal bias ≠ guaranteed — always confirm with current fundamental picture",
      "Best use: tiebreaker when two setups are equally attractive — choose the one with seasonal tailwind",
    ],
    tags: ["seasonality", "statistics", "historical-data", "edge", "long-term"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-data-004",
    type: "dataset",
    title: "Central Bank Meeting Calendar 2025-2026",
    category: "Data",
    level: "intermediate",
    summary: "Complete schedule of all G10 central bank policy meetings. Interest rate decisions create the highest-impact single events in the Forex market — know these dates cold.",
    keyLessons: [
      "Fed (FOMC): 8 meetings/year. Market prices in rate expectations weeks in advance via fed funds futures",
      "ECB: 8 meetings/year. EUR pairs spike ±50-150 pips on surprises or guidance changes",
      "Bank of England (BoE): 8 meetings/year + Inflation Reports. GBP pairs most reactive",
      "Bank of Japan (BoJ): 8 meetings/year + potential unscheduled interventions",
      "RBA (Australia): 11 meetings/year (no meeting in January). AUD sensitivity highest",
      "Rule: reduce position size by 50% in the 4 hours before and 2 hours after a major CB decision",
      "The dot plot (Fed) and forward guidance language often matter more than the actual rate decision",
      "Surprise rate changes outside scheduled meetings = maximum volatility events",
    ],
    tags: ["central-banks", "calendar", "FOMC", "ECB", "events", "data"],
    seededAt: new Date().toISOString(),
  },
  {
    id: "forex-data-005",
    type: "dataset",
    title: "Economic Indicator Impact Table",
    category: "Data",
    level: "intermediate",
    summary: "Tiered ranking of all major economic releases by their typical market impact, with historical average pip moves for the primary currency affected.",
    keyLessons: [
      "Tier 1 (100+ pip potential): NFP, FOMC rate decision, Core CPI, GDP Flash",
      "Tier 2 (30-80 pip potential): Retail Sales, PMI, Trade Balance, BOE/ECB decision",
      "Tier 3 (10-30 pip potential): ADP, Unemployment Claims, Industrial Production, PPI",
      "NFP historical avg move EUR/USD: ±80 pips. Record: 200+ pips (COVID shock, April 2020)",
      "Better than expected vs consensus = bullish for that currency (currency of the reporting country)",
      "Revisions often larger than initial releases — past data being revised affects markets too",
      "'Buy the rumor, sell the fact': if market is fully priced for a positive print, actual print = reversal",
      "High-impact news rule: close intraday positions 15 min before Tier 1 release unless swing trading",
    ],
    tags: ["economic-data", "impact", "NFP", "calendar", "volatility", "data"],
    seededAt: new Date().toISOString(),
  },
];

// ─── Seeding Functions ───────────────────────────────────────────

let seeded = false;

/**
 * Seed all Forex knowledge into the Republic's education curriculum
 * and broadcast awareness to the entire population.
 */
export async function seedForexKnowledge(): Promise<void> {
  if (seeded) return;
  seeded = true;

  try {
    // Inject into education curriculum via dynamic import
    try {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      const { addCurriculumItem }: any = await import("./education.js");
      for (const item of FOREX_KNOWLEDGE) {
        const curriculumItem = {
          id: item.id,
          title: item.title,
          description: item.summary,
          category: `Forex: ${item.category}`,
          level: item.level,
          topics: item.keyLessons.slice(0, 5),
          type: item.type,
          tags: item.tags,
        };
        if (addCurriculumItem) addCurriculumItem(curriculumItem);
      }
      logger.info(`Seeded ${FOREX_KNOWLEDGE.length} Forex knowledge items into education curriculum`);
    } catch {
      logger.info("Education module not available — Forex knowledge stored in-memory only");
    }

    // Broadcast national announcement
    emitNationalEvent("economy", "forex_knowledge_seeded", "system", {
      totalItems: FOREX_KNOWLEDGE.length,
      courses: FOREX_KNOWLEDGE.filter((k) => k.type === "course").length,
      books: FOREX_KNOWLEDGE.filter((k) => k.type === "book").length,
      datasets: FOREX_KNOWLEDGE.filter((k) => k.type === "dataset").length,
      message: `The Republic's Forex Trading Academy is now open. ${FOREX_KNOWLEDGE.length} knowledge items are available to all citizens. Access them via the education system or use Forex trading tools directly.`,
    });

    logger.info(
      `Forex knowledge seeding complete: ${FOREX_KNOWLEDGE.filter((k) => k.type === "course").length} courses, ` +
      `${FOREX_KNOWLEDGE.filter((k) => k.type === "book").length} books, ` +
      `${FOREX_KNOWLEDGE.filter((k) => k.type === "dataset").length} datasets`
    );
  } catch (err) {
    logger.warn("Forex knowledge seeding partial failure", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Query ───────────────────────────────────────────────────────

export function getForexKnowledge(filter?: {
  type?: ForexKnowledgeItem["type"];
  level?: ForexKnowledgeItem["level"];
  tag?: string;
}): ForexKnowledgeItem[] {
  if (!filter) return FOREX_KNOWLEDGE;
  return FOREX_KNOWLEDGE.filter((item) => {
    if (filter.type && item.type !== filter.type) return false;
    if (filter.level && item.level !== filter.level) return false;
    if (filter.tag && !item.tags.includes(filter.tag)) return false;
    return true;
  });
}

/** Get a formatted Forex knowledge summary for citizen prompts */
export function getForexKnowledgeSummaryForPrompt(): string {
  const courses = FOREX_KNOWLEDGE.filter((k) => k.type === "course").length;
  const books = FOREX_KNOWLEDGE.filter((k) => k.type === "book").length;
  const datasets = FOREX_KNOWLEDGE.filter((k) => k.type === "dataset").length;
  return (
    `**📚 Forex Knowledge Base:** ${courses} courses (Fundamentals → ICT/SMC), ${books} book summaries (Trading in the Zone, Market Wizards, etc.), ${datasets} data sets (correlations, seasonality, CB calendar). ` +
    `Topics: ${[...new Set(FOREX_KNOWLEDGE.flatMap((k) => k.tags.slice(0, 2)))].slice(0, 12).join(", ")}.`
  );
}
