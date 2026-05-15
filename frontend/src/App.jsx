import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const API_BASE = "http://localhost:8000";

// ── Feature 5: Daily Tips ─────────────────────────────────────────────────────
const DAILY_TIPS = [
  { icon: "📊", tip: "Payment history is 35% of your credit score — the single biggest factor." },
  { icon: "💳", tip: "Keep credit utilization below 30%. Below 10% is ideal for an excellent score." },
  { icon: "💸", tip: "The avalanche method (highest APR first) saves the most interest when paying off debt." },
  { icon: "🏦", tip: "A credit utilization drop of 20% can raise your score by 20–30 points within 30 days." },
  { icon: "📅", tip: "Making two half-payments per month instead of one full payment reduces average daily balance." },
  { icon: "🎯", tip: "Keeping old credit cards open (even unused) helps your average account age and score." },
  { icon: "🔒", tip: "A hard inquiry only affects your credit score for 12 months and drops off after 2 years." },
  { icon: "💡", tip: "The 50/30/20 rule: 50% needs, 30% wants, 20% savings — a simple budget that works." },
  { icon: "⚡", tip: "Paying just $10 above the minimum payment can cut years off your debt payoff timeline." },
  { icon: "📈", tip: "Having 2–3 credit cards with low utilization looks better to lenders than 1 maxed card." },
  { icon: "🛡️", tip: "Becoming an authorized user on a parent's old card can instantly boost a thin credit file." },
  { icon: "🔄", tip: "Balance transfers to 0% APR cards can save hundreds — watch for transfer fees (usually 3–5%)." },
  { icon: "📉", tip: "Minimum payments on a $1,500 balance at 24.99% APR can take 7+ years to pay off fully." },
  { icon: "🎓", tip: "Student credit cards are designed for thin files — they're easier to get approved for than regular cards." },
];

const QUICK_PROMPTS = [
  { label: "💳  Pay off debt",       text: "I have credit card debt I want to pay off. Can you help me make a plan?" },
  { label: "📊  Analyze statement",  text: "__DEMO__" },
  { label: "🏗️  Build my credit",   text: "I'm trying to build my credit score from scratch. Where do I start?" },
];

const TOOL_META = {
  calculate_payoff_timeline:         { icon: "📅", label: "Payoff calculator" },
  calculate_credit_utilization:      { icon: "📊", label: "Utilization check" },
  calculate_minimum_payment_cost:    { icon: "⚠️", label: "Min. payment analysis" },
  calculate_financial_health_score:  { icon: "💯", label: "Health score" },
  visualize_spending_categories:     { icon: "🥧", label: "Spending breakdown" },
  calculate_budget_breakdown:        { icon: "💰", label: "Budget plan" },
  compare_payoff_scenarios:          { icon: "⚖️", label: "What-if comparison" },
};

const THINKING_STAGES = ["Thinking…", "Analyzing your question…", "Running calculations…", "Crafting advice…"];

const SUGGESTIONS_MAP = {
  calculate_payoff_timeline:        ["What if I increased my payment?", "Show minimum payment impact", "Should I do a balance transfer?"],
  calculate_credit_utilization:     ["How do I lower my utilization fast?", "What score impact should I expect?", "How much should I pay down?"],
  calculate_minimum_payment_cost:   ["What's the fastest payoff strategy?", "How much would I save paying double?", "Avalanche vs snowball method?"],
  calculate_financial_health_score: ["How do I improve my health score?", "What's dragging my score down?", "Show me a budget plan"],
  visualize_spending_categories:    ["Where am I overspending?", "Help me cut my spending", "Make me a budget"],
  calculate_budget_breakdown:       ["How do I stick to the 50/30/20 rule?", "Where should I cut to save more?", "What's a realistic savings goal?"],
  compare_payoff_scenarios:         ["What if I paid even more?", "Should I do a balance transfer?", "How much interest will I save?"],
};

function getSuggestions(toolsUsed, text) {
  for (const tool of toolsUsed) {
    if (SUGGESTIONS_MAP[tool]) return SUGGESTIONS_MAP[tool];
  }
  const t = text.toLowerCase();
  if (t.includes("credit score")) return ["How do I improve my score?", "What card should I apply for?", "What's a good utilization ratio?"];
  if (t.includes("budget") || t.includes("spending")) return ["Help me make a monthly budget", "Where am I overspending?", "What's the 50/30/20 rule?"];
  if (t.includes("debt") || t.includes("balance")) return ["Fastest way to pay off debt?", "Should I consolidate?", "How much interest am I paying?"];
  return ["Tell me more", "What should I prioritize?", "Any other tips?"];
}

function fmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtBytes(b) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}
function fmtDollar(v) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
const MD_COMPONENTS = {
  p:      ({ children }) => <p className="md-p">{children}</p>,
  li:     ({ children }) => <li className="md-li">{children}</li>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em:     ({ children }) => <em className="md-em">{children}</em>,
  code:   ({ children }) => <code className="md-code">{children}</code>,
  h3:     ({ children }) => <h3 className="md-h3">{children}</h3>,
  ul:     ({ children }) => <ul className="md-ul">{children}</ul>,
  ol:     ({ children }) => <ol className="md-ol">{children}</ol>,
};

function PennyMarkdown({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{content}</ReactMarkdown>;
}

// ── Payoff chart ──────────────────────────────────────────────────────────────
function PayoffChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 280, H = 100;
  const PAD = { top: 10, right: 10, bottom: 22, left: 46 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const maxBal = data[0].balance;
  const maxMo  = data[data.length - 1].month;
  const x = (mo)  => PAD.left + (mo / maxMo) * iW;
  const y = (bal) => PAD.top  + iH - (bal / maxBal) * iH;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(d.balance)}`).join(" ");
  const area = `${line} L ${x(maxMo)} ${y(0) + 1} L ${x(0)} ${y(0) + 1} Z`;
  const fmt$ = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
  return (
    <div className="payoff-chart">
      <span className="chart-label">Balance over time</span>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Payoff chart">
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={PAD.left} y1={PAD.top + iH * (1 - t)} x2={W - PAD.right} y2={PAD.top + iH * (1 - t)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#cg)" />
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {[0, 0.5, 1].map(t => (
          <text key={t} x={PAD.left - 4} y={PAD.top + iH * (1 - t) + 3}
            fill="rgba(255,255,255,0.3)" fontSize="7" textAnchor="end">{fmt$(maxBal * t)}</text>
        ))}
        <text x={x(0)}     y={H - 4} fill="rgba(255,255,255,0.3)" fontSize="7" textAnchor="middle">0</text>
        <text x={x(maxMo)} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize="7" textAnchor="middle">{maxMo}mo</text>
      </svg>
    </div>
  );
}

// ── Feature 1: Health Score Card ──────────────────────────────────────────────
function HealthScoreCard({ data }) {
  if (!data || data.score == null) return null;
  const { score, grade, label, breakdown } = data;

  // Semicircle gauge
  const R = 54, CX = 70, CY = 70;
  const circumference = Math.PI * R; // half circle
  const arcLen = (score / 100) * circumference;
  const arcColor = score >= 80 ? "#34d399" : score >= 65 ? "#fbbf24" : score >= 50 ? "#fb923c" : "#f87171";

  return (
    <div className="health-score-card bubble-enter">
      <div className="hsc-top">
        <div className="hsc-gauge-wrap">
          <svg width="140" height="80" viewBox="0 0 140 80">
            {/* background arc */}
            <path
              d={`M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`}
              fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10"
              strokeLinecap="round"
            />
            {/* colored arc */}
            <path
              d={`M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`}
              fill="none" stroke={arcColor} strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          <div className="hsc-score-center">
            <span className="hsc-score-num" style={{ color: arcColor }}>{score}</span>
            <span className="hsc-score-grade" style={{ color: arcColor }}>{grade}</span>
          </div>
        </div>
        <div className="hsc-right">
          <div className="hsc-label">{label} Financial Health</div>
          <div className="hsc-sub">Score: {score} / 100</div>
        </div>
      </div>
      <div className="hsc-breakdown">
        {breakdown.map(item => (
          <div key={item.category} className="hsc-row">
            <div className="hsc-row-top">
              <span className="hsc-cat">{item.category}</span>
              <span className="hsc-pts">{item.points}/{item.max}</span>
            </div>
            <div className="hsc-bar-bg">
              <div className="hsc-bar-fill" style={{ width: `${(item.points / item.max) * 100}%`, backgroundColor: arcColor }} />
            </div>
            <span className="hsc-status">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feature 2: Spending Pie Chart ─────────────────────────────────────────────
const PIE_COLORS = ["#818cf8","#a78bfa","#34d399","#fbbf24","#f87171","#60a5fa","#fb923c","#e879f9"];

function SpendingPieChart({ data }) {
  if (!data || !data.categories || data.categories.length === 0) return null;
  const { total, categories } = data;

  // Build donut slices
  const R = 50, CX = 60, CY = 60, stroke = 18;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const slices = categories.map((cat, i) => {
    const frac = cat.amount / total;
    const dashLen = frac * circ;
    const slice = { ...cat, frac, dashLen, offset, color: PIE_COLORS[i % PIE_COLORS.length] };
    offset += dashLen;
    return slice;
  });

  return (
    <div className="spending-pie-card bubble-enter">
      <div className="spc-title">Spending Breakdown</div>
      <div className="spc-body">
        <div className="spc-donut-wrap">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {slices.map((s, i) => (
              <circle key={i} cx={CX} cy={CY} r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${s.dashLen} ${circ - s.dashLen}`}
                strokeDashoffset={-s.offset + circ / 4}
                strokeLinecap="butt"
              />
            ))}
            <text x={CX} y={CY - 5} textAnchor="middle" fill="var(--text)" fontSize="11" fontWeight="700">
              {fmtDollar(total).replace(".00", "")}
            </text>
            <text x={CX} y={CY + 9} textAnchor="middle" fill="var(--text-3)" fontSize="8">total</text>
          </svg>
        </div>
        <div className="spc-legend">
          {slices.map((s, i) => (
            <div key={i} className="spc-legend-row">
              <span className="spc-dot" style={{ background: s.color }} />
              <span className="spc-leg-label">{s.label}</span>
              <span className="spc-leg-pct">{s.pct}%</span>
              <span className="spc-leg-amt">{fmtDollar(s.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature 3: Budget Breakdown ───────────────────────────────────────────────
function BudgetBreakdown({ data }) {
  if (!data || !data.monthly_income) return null;
  const { monthly_income, needs, wants, savings } = data;
  const bars = [
    { label: "Needs", pct: needs.pct, amount: needs.target, color: "var(--indigo)", sub: `${needs.pct}% of income` },
    { label: "Wants", pct: wants.pct, amount: wants.target, color: "var(--violet)", sub: `${wants.pct}% of income` },
    { label: "Savings", pct: savings.pct, amount: savings.target, color: "var(--green)", sub: `${savings.pct}% of income` },
  ];
  return (
    <div className="budget-breakdown-card bubble-enter">
      <div className="bbd-title">50/30/20 Budget Plan</div>
      <div className="bbd-income">Based on {fmtDollar(monthly_income)}/mo income</div>
      {bars.map(b => (
        <div key={b.label} className="bbd-row">
          <div className="bbd-row-top">
            <span className="bbd-label">{b.label}</span>
            <span className="bbd-amount" style={{ color: b.color }}>{fmtDollar(b.amount)}</span>
          </div>
          <div className="bbd-bar-bg">
            <div className="bbd-bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
          </div>
          <span className="bbd-sub">{b.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ── Feature 4: What-If Comparison ────────────────────────────────────────────
function MiniPayoffChart({ data, color }) {
  if (!data || data.length < 2) return null;
  const W = 130, H = 60;
  const PAD = { top: 6, right: 6, bottom: 16, left: 32 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const maxBal = data[0].balance;
  const maxMo  = data[data.length - 1].month;
  const x = mo  => PAD.left + (mo / maxMo) * iW;
  const y = bal => PAD.top  + iH - (bal / maxBal) * iH;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(d.balance)}`).join(" ");
  const area = `${line} L ${x(maxMo)} ${y(0) + 1} L ${x(0)} ${y(0) + 1} Z`;
  const fmt$ = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      <defs>
        <linearGradient id={`mcg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#mcg-${color})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x={PAD.left - 2} y={PAD.top + 3} fill="rgba(255,255,255,0.3)" fontSize="6" textAnchor="end">{fmt$(maxBal)}</text>
      <text x={x(0)}     y={H - 3} fill="rgba(255,255,255,0.3)" fontSize="6" textAnchor="middle">0</text>
      <text x={x(maxMo)} y={H - 3} fill="rgba(255,255,255,0.3)" fontSize="6" textAnchor="middle">{maxMo}mo</text>
    </svg>
  );
}

function WhatIfComparison({ data }) {
  if (!data || !data.scenario_a) return null;
  const { scenario_a: a, scenario_b: b } = data;
  return (
    <div className="whatif-card bubble-enter">
      <div className="wic-title">Payment Comparison</div>
      <div className="wic-cols">
        {[{ s: a, label: "Current", color: "#818cf8" }, { s: b, label: "Boosted", color: "#34d399" }].map(({ s, label, color }) => (
          <div key={label} className="wic-col">
            <div className="wic-col-label" style={{ color }}>{label}</div>
            <div className="wic-payment" style={{ color }}>{fmtDollar(s.payment)}<span className="wic-mo">/mo</span></div>
            <MiniPayoffChart data={s.balance_history} color={color} />
            <div className="wic-stat"><span className="wic-stat-k">Payoff</span><span>{s.years}yr ({s.months}mo)</span></div>
            <div className="wic-stat"><span className="wic-stat-k">Interest</span><span style={{ color: "#f87171" }}>{fmtDollar(s.total_interest)}</span></div>
          </div>
        ))}
      </div>
      {b.total_interest != null && a.total_interest != null && (
        <div className="wic-savings">
          You save <strong style={{ color: "#34d399" }}>{fmtDollar(a.total_interest - b.total_interest)}</strong> in interest and {a.months - b.months} months by boosting your payment.
        </div>
      )}
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); };
  return (
    <button className={`copy-btn ${done ? "copy-btn--done" : ""}`} onClick={copy}>
      {done
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
      <span>{done ? "Copied!" : "Copy"}</span>
    </button>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ message, isNew, onSuggestion }) {
  const isUser = message.role === "user";
  const chips  = (message.tools_used ?? []).map(t => TOOL_META[t]).filter(Boolean);
  const chart  = message.tool_results?.calculate_payoff_timeline?.balance_history;
  const healthScore  = message.tool_results?.calculate_financial_health_score;
  const budgetData   = message.tool_results?.calculate_budget_breakdown;
  const spendingCats = message.tool_results?.visualize_spending_categories;
  const whatIfData   = message.tool_results?.compare_payoff_scenarios;
  const suggs  = message.suggestions ?? [];

  return (
    <div className={`bubble-row ${isUser ? "user-row" : "penny-row"} ${isNew ? "bubble-enter" : ""}`}>
      {!isUser && <div className="avatar-wrap"><div className="avatar">🪙</div></div>}
      <div className="bubble-col">
        <div className={`bubble ${isUser ? "user-bubble" : "penny-bubble"}`}>
          {isUser
            ? <div className="message-content"><p>{message.content}</p></div>
            : <PennyMarkdown content={message.content || "…"} />
          }
          {message.streaming && <span className="stream-cursor" />}
          {!isUser && !message.streaming && <CopyButton text={message.content} />}
        </div>

        {chart && !message.streaming && <PayoffChart data={chart} />}
        {healthScore && !message.streaming && <HealthScoreCard data={healthScore} />}
        {spendingCats && !message.streaming && <SpendingPieChart data={spendingCats} />}
        {budgetData && !message.streaming && <BudgetBreakdown data={budgetData} />}
        {whatIfData && !message.streaming && <WhatIfComparison data={whatIfData} />}

        {chips.length > 0 && (
          <div className="tool-chips">
            {chips.map((c, i) => <span key={i} className="tool-chip">{c.icon} {c.label}</span>)}
          </div>
        )}

        {suggs.length > 0 && !message.streaming && (
          <div className="suggestions">
            {suggs.map((s, i) => (
              <button key={i} className="suggestion-btn" onClick={() => onSuggestion(s)}>{s}</button>
            ))}
          </div>
        )}

        {message.ts && <span className={`ts ${isUser ? "ts-right" : "ts-left"}`}>{fmt(message.ts)}</span>}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator({ stage }) {
  return (
    <div className="bubble-row penny-row bubble-enter">
      <div className="avatar-wrap"><div className="avatar">🪙</div></div>
      <div className="bubble-col">
        <div className="bubble penny-bubble typing-bubble">
          <div className="wave"><span/><span/><span/><span/><span/></div>
          <span className="thinking-label">{stage}</span>
        </div>
      </div>
    </div>
  );
}

// ── Feature 5: Daily Tip card ─────────────────────────────────────────────────
function DailyTip() {
  const tip = DAILY_TIPS[Math.floor(Date.now() / 86400000) % DAILY_TIPS.length];
  return (
    <div className="daily-tip-card">
      <span className="dt-icon">{tip.icon}</span>
      <div className="dt-body">
        <span className="dt-label">Tip of the day</span>
        <span className="dt-text">{tip.tip}</span>
      </div>
    </div>
  );
}

// ── Welcome page ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "📄",
    title: "Statement Analysis",
    desc: "Upload a credit card statement (PDF or image) and get an instant breakdown of your spending categories, patterns, and red flags.",
  },
  {
    icon: "📅",
    title: "Debt Payoff Planner",
    desc: "Enter your balance, APR, and monthly payment — Penny calculates exactly how long it takes and how much interest you'll pay, with a visual chart.",
  },
  {
    icon: "📊",
    title: "Credit Score Guidance",
    desc: "Understand your credit utilization ratio, what's dragging your score down, and the fastest ways to improve it.",
  },
  {
    icon: "💰",
    title: "Budgeting & Savings",
    desc: "Get personalized budgeting advice tailored to your income and goals — no finance jargon, just clear actionable steps.",
  },
];

// Feature 6: WelcomePage accepts sessions + onContinueLastChat
function WelcomePage({ onPrompt, profileFilled, onOpenProfile, sessions, profile, onContinueLastChat }) {
  const hasHistory = sessions.length > 0;
  return (
    <div className="welcome-page">

      {/* Feature 6: Welcome back banner */}
      {hasHistory && (
        <div className="welcome-back-banner">
          <span className="wb-text">
            {profile?.goal
              ? `Welcome back! Still working on: ${profile.goal}?`
              : "Welcome back! Ready to pick up where you left off?"}
          </span>
          <button className="wb-continue-btn" onClick={onContinueLastChat}>
            Continue last chat
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="wp-hero">
        <div className="wp-coin">🪙</div>
        <h1 className="wp-title">Hi, I'm Penny</h1>
        <p className="wp-sub">
          Your AI financial advisor built for college students and young adults.
          Ask me anything about credit, debt, and budgeting — I'll give you clear,
          jargon-free advice backed by real calculations.
        </p>
        {!profileFilled ? (
          <button className="wp-profile-cta" onClick={onOpenProfile}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Set up my financial profile for personalized advice
            <span className="wp-cta-badge">Recommended</span>
          </button>
        ) : (
          <div className="wp-profile-filled">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Profile saved — Penny knows your financial details
            <button className="wp-profile-edit" onClick={onOpenProfile}>Edit</button>
          </div>
        )}
      </div>

      {/* Feature 5: Daily tip above feature grid */}
      <DailyTip />

      {/* Feature grid */}
      <div className="wp-section-label">What I can do</div>
      <div className="wp-features">
        {FEATURES.map(f => (
          <div key={f.title} className="wp-feature-card">
            <span className="wp-feature-icon">{f.icon}</span>
            <div>
              <h3 className="wp-feature-title">{f.title}</h3>
              <p className="wp-feature-desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick start */}
      <div className="wp-section-label">Quick start</div>
      <div className="wp-prompts">
        {QUICK_PROMPTS.map(p => (
          <button key={p.label} className="wp-prompt-btn" onClick={() => onPrompt(p.text)}>
            {p.label}
            <svg className="wp-prompt-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        ))}
      </div>

      <p className="wp-footer">
        Your data stays in this browser · No account required · Powered by GPT-4o
      </p>
    </div>
  );
}

// ── Scroll-to-bottom ──────────────────────────────────────────────────────────
function ScrollToBottom({ onClick }) {
  return (
    <button className="scroll-btn" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      Latest
    </button>
  );
}

// ── File chip ─────────────────────────────────────────────────────────────────
function FileChip({ file, onDismiss }) {
  return (
    <div className="file-chip">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      <span className="file-chip-name">{file.name}</span>
      <span className="file-chip-size">{fmtBytes(file.size)}</span>
      <button className="file-chip-dismiss" onClick={onDismiss}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ sessions, onSelect, onDelete, onClose }) {
  return (
    <div className="history-panel bubble-enter">
      <div className="history-hdr">
        <span>Recent Chats</span>
        <button className="history-close" onClick={onClose}>✕</button>
      </div>
      {sessions.length === 0
        ? <p className="history-empty">No saved chats yet</p>
        : sessions.map(s => (
          <div key={s.id} className="history-item">
            <button className="history-title-btn" onClick={() => onSelect(s)}>
              <span className="history-title">{s.title}</span>
              <span className="history-date">{new Date(s.createdAt).toLocaleDateString()}</span>
            </button>
            <button className="history-del" onClick={() => onDelete(s.id)} title="Delete">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        ))
      }
    </div>
  );
}

// ── Financial Profile panel ───────────────────────────────────────────────────
const EMPTY_PROFILE = { income: "", balance: "", creditLimit: "", apr: "", rent: "", goal: "" };

function loadProfile() {
  try { return JSON.parse(localStorage.getItem("penny-profile") || "null") || EMPTY_PROFILE; }
  catch { return EMPTY_PROFILE; }
}

function ProfilePanel({ profile, onSave, onClose }) {
  const [form, setForm] = useState({ ...profile });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const hasData = Object.values(form).some(v => v !== "");

  return (
    <div className="profile-panel bubble-enter">
      <div className="history-hdr">
        <span>My Financial Profile</span>
        <button className="history-close" onClick={onClose}>✕</button>
      </div>
      <p className="profile-sub">Share your details so Penny can give you personalized advice.</p>

      <div className="profile-fields">
        <label className="profile-label">
          Monthly take-home income
          <div className="profile-input-wrap">
            <span className="profile-affix">$</span>
            <input className="profile-input" type="number" min="0" placeholder="e.g. 2400"
              value={form.income} onChange={e => set("income", e.target.value)} />
          </div>
        </label>

        <label className="profile-label">
          Credit card balance
          <div className="profile-input-wrap">
            <span className="profile-affix">$</span>
            <input className="profile-input" type="number" min="0" placeholder="e.g. 1500"
              value={form.balance} onChange={e => set("balance", e.target.value)} />
          </div>
        </label>

        <label className="profile-label">
          Credit limit
          <div className="profile-input-wrap">
            <span className="profile-affix">$</span>
            <input className="profile-input" type="number" min="0" placeholder="e.g. 3000"
              value={form.creditLimit} onChange={e => set("creditLimit", e.target.value)} />
          </div>
        </label>

        <label className="profile-label">
          Credit card APR
          <div className="profile-input-wrap profile-input-wrap--suffix">
            <input className="profile-input" type="number" min="0" max="100" step="0.01" placeholder="e.g. 24.99"
              value={form.apr} onChange={e => set("apr", e.target.value)} />
            <span className="profile-affix profile-affix--right">%</span>
          </div>
        </label>

        <label className="profile-label">
          Monthly rent / housing
          <div className="profile-input-wrap">
            <span className="profile-affix">$</span>
            <input className="profile-input" type="number" min="0" placeholder="e.g. 850"
              value={form.rent} onChange={e => set("rent", e.target.value)} />
          </div>
        </label>

        <label className="profile-label">
          Primary financial goal
          <select className="profile-select" value={form.goal} onChange={e => set("goal", e.target.value)}>
            <option value="">Select a goal…</option>
            <option value="Pay off credit card debt">Pay off credit card debt</option>
            <option value="Build my credit score">Build my credit score</option>
            <option value="Create a monthly budget">Create a monthly budget</option>
            <option value="Save more money">Save more money</option>
            <option value="Understand my credit">Understand my credit</option>
          </select>
        </label>
      </div>

      <div className="profile-actions">
        <button className="profile-save-btn" onClick={() => onSave(form)}>Save Profile</button>
        {hasData && (
          <button className="profile-clear-btn" onClick={() => { setForm(EMPTY_PROFILE); onSave(EMPTY_PROFILE); }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Session storage helpers ───────────────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem("penny-sessions") || "[]"); }
  catch { return []; }
}
function saveSessions(sessions) {
  localStorage.setItem("penny-sessions", JSON.stringify(sessions.slice(0, 10)));
}

// ── Export helper ─────────────────────────────────────────────────────────────
function exportChat(messages) {
  const lines = ["# Penny.io Conversation", new Date().toLocaleDateString(), ""];
  messages.forEach(m => {
    if (m.role === "user") lines.push(`**You:** ${m.content}`, "");
    else if (m.role === "assistant") lines.push(`**Penny:** ${m.content}`, "");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "penny-chat.md"; a.click();
  URL.revokeObjectURL(url);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [error,         setError]         = useState(null);
  const [stagedFile,    setStagedFile]    = useState(null);
  const [newestId,      setNewestId]      = useState(null);
  const [showScroll,    setShowScroll]    = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [showProfile,   setShowProfile]   = useState(false);
  const [profile,       setProfile]       = useState(loadProfile);
  const [sessions,      setSessions]      = useState(loadSessions);

  // Feature 7: dark/light mode
  const [theme, setTheme] = useState(() => localStorage.getItem('penny-theme') || 'dark');

  // Feature 8: voice input
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  // Feature 10: onboarding tooltip
  const [showTooltip, setShowTooltip] = useState(
    () => !localStorage.getItem('penny-onboarded') && !Object.values(loadProfile()).some(v => v !== '')
  );

  const profileFilled = Object.values(profile).some(v => v !== "");

  const bottomRef   = useRef(null);
  const chatRef     = useRef(null);
  const fileRef     = useRef(null);
  // Feature 9: separate textareaRef
  const textareaRef = useRef(null);
  const stageTimer  = useRef(null);
  const sessionId   = useRef(Date.now().toString());

  // Feature 7: persist theme
  useEffect(() => {
    localStorage.setItem('penny-theme', theme);
  }, [theme]);

  // Feature 9: auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  // thinking stage cycling
  useEffect(() => {
    if (loading) {
      setThinkingStage(0);
      let i = 0;
      stageTimer.current = setInterval(() => { i = (i + 1) % THINKING_STAGES.length; setThinkingStage(i); }, 2200);
    } else {
      clearInterval(stageTimer.current);
    }
    return () => clearInterval(stageTimer.current);
  }, [loading]);

  // auto-scroll when not scrolled up
  useEffect(() => {
    if (!showScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // persist to localStorage
  useEffect(() => {
    if (messages.length === 0) return;
    const title = messages.find(m => m.role === "user")?.content?.slice(0, 45) || "New Chat";
    const newSession = { id: sessionId.current, title, messages, createdAt: Number(sessionId.current), updatedAt: Date.now() };
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId.current);
      const updated  = [newSession, ...filtered];
      saveSessions(updated);
      return updated;
    });
  }, [messages]);

  function handleScroll() {
    const el = chatRef.current;
    if (el) setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }

  function buildProfileContext(p) {
    const parts = [];
    if (p.income)      parts.push(`monthly take-home income: $${p.income}`);
    if (p.balance)     parts.push(`credit card balance: $${p.balance}`);
    if (p.creditLimit) parts.push(`credit limit: $${p.creditLimit}`);
    if (p.apr)         parts.push(`APR: ${p.apr}%`);
    if (p.rent)        parts.push(`monthly rent: $${p.rent}`);
    if (p.goal)        parts.push(`primary financial goal: ${p.goal}`);
    if (parts.length === 0) return null;
    return `[My financial profile — use this context to personalize your advice: ${parts.join(", ")}]`;
  }

  function historyFor(msgs) {
    const base = msgs
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));
    const ctx = buildProfileContext(profile);
    if (!ctx) return base;
    return [
      { role: "user",      content: ctx },
      { role: "assistant", content: "Got it! I have your financial profile and will use it to give you personalized advice." },
      ...base,
    ];
  }

  // Feature 10: dismiss tooltip
  function dismissTooltip() {
    setShowTooltip(false);
    localStorage.setItem('penny-onboarded', '1');
  }

  // Feature 8: voice input toggle
  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Voice input not supported in this browser. Try Chrome."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = 'en-US';
    r.onresult = e => { setInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start(); setListening(true);
  }

  // ── Streaming send ──────────────────────────────────────────────────────────
  async function sendStreaming(text, existingMessages) {
    const id = Date.now().toString();
    const replyMsg = { id, role: "assistant", content: "", streaming: true, ts: Date.now(), tools_used: [], tool_results: {}, suggestions: [] };
    setMessages(prev => { setNewestId(id); return [...prev, replyMsg]; });
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyFor(existingMessages) }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Server error");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6));

          if (ev.type === "token") {
            setMessages(prev => prev.map(m => m.id === id ? { ...m, content: m.content + ev.content } : m));
          } else if (ev.type === "tool_call") {
            setThinkingStage(THINKING_STAGES.indexOf("Running calculations…") >= 0 ? THINKING_STAGES.indexOf("Running calculations…") : 2);
          } else if (ev.type === "done") {
            setMessages(prev => prev.map(m => {
              if (m.id !== id) return m;
              const suggs = getSuggestions(ev.tools_used, m.content);
              return { ...m, streaming: false, tools_used: ev.tools_used, tool_results: ev.tool_results, suggestions: suggs };
            }));
          }
        }
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== id));
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(overrideText) {
    const text = (overrideText ?? input).trim();

    // demo shortcut
    if (text === "__DEMO__") { await runDemo(); return; }

    if (stagedFile) { await doUpload(stagedFile); setStagedFile(null); return; }
    if (!text || loading) return;

    // Feature 10: dismiss tooltip on first message
    dismissTooltip();

    setInput("");
    setError(null);
    const userMsg  = { role: "user", content: text, ts: Date.now() };
    const updated  = [...messages, userMsg];
    setMessages(updated);
    setNewestId(null);
    await sendStreaming(text, updated);
  }

  async function runDemo() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/demo`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).detail || "Demo failed");
      const data = await res.json();
      const userMsg  = { ...data.user_message, ts: Date.now() };
      const replyMsg = { role: "assistant", content: data.reply, tools_used: data.tools_used ?? [],
        tool_results: {}, suggestions: getSuggestions(data.tools_used ?? [], data.reply), ts: Date.now() };
      setMessages(prev => { setNewestId("demo-reply"); return [...prev, userMsg, { ...replyMsg, id: "demo-reply" }]; });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function doUpload(file) {
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("messages", JSON.stringify(historyFor(messages)));
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
      const data = await res.json();
      const userMsg  = { ...data.user_message, ts: Date.now() };
      const replyMsg = { role: "assistant", content: data.reply, tools_used: data.tools_used ?? [],
        tool_results: {}, suggestions: getSuggestions(data.tools_used ?? [], data.reply), ts: Date.now() };
      const id = Date.now().toString();
      setMessages(prev => { setNewestId(id); return [...prev, userMsg, { ...replyMsg, id }]; });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function saveProfile(p) {
    setProfile(p);
    localStorage.setItem("penny-profile", JSON.stringify(p));
    setShowProfile(false);
  }

  function clearChat() {
    sessionId.current = Date.now().toString();
    setMessages([]); setError(null); setInput(""); setStagedFile(null); setNewestId(null);
  }

  function loadSession(s) {
    sessionId.current = s.id;
    setMessages(s.messages);
    setShowHistory(false);
    setError(null);
  }

  function deleteSession(id) {
    setSessions(prev => { const updated = prev.filter(s => s.id !== id); saveSessions(updated); return updated; });
    if (sessionId.current === id) clearChat();
  }

  // Feature 6: continue last chat
  function onContinueLastChat() {
    if (sessions.length > 0) loadSession(sessions[0]);
  }

  return (
    <div className={`app${theme === 'light' ? ' light-mode' : ''}`}>
      <div className={`progress-bar ${loading ? "progress-active" : ""}`} />

      <header className="header">
        <div className="header-left">
          <div className={`logo-icon ${loading ? "logo-thinking" : ""}`}>🪙</div>
          <div className="logo-text">
            <span className="logo-name">Penny<span className="logo-dot">.io</span></span>
            <span className={`logo-status ${loading ? "status-thinking" : "status-online"}`}>
              <span className="status-indicator" />
              {loading ? THINKING_STAGES[thinkingStage] : "Online · AI Financial Advisor"}
            </span>
          </div>
        </div>
        <div className="header-right">
          {messages.length > 0 && (
            <button className="icon-btn" onClick={() => exportChat(messages)} title="Export chat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          )}

          {/* Feature 7: Theme toggle */}
          <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark'
              ? /* Moon */ <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
              : /* Sun */  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            }
          </button>

          <div style={{ position: "relative" }}>
            <button className={`icon-btn ${profileFilled ? "icon-btn--active" : ""}`}
              onClick={() => { setShowProfile(p => !p); setShowHistory(false); dismissTooltip(); }}
              title="My financial profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {profileFilled && <span className="profile-dot" />}
            </button>
            {/* Feature 10: Onboarding tooltip */}
            {showTooltip && (
              <div className="onboard-tooltip">
                <div className="onboard-arrow" />
                👆 Fill in your profile for personalized advice
                <button className="onboard-dismiss" onClick={dismissTooltip}>Got it</button>
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={() => { setShowHistory(h => !h); setShowProfile(false); }} title="Chat history">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
          </button>
          <button className="clear-btn" onClick={clearChat}>+ New Chat</button>
        </div>
      </header>

      {showProfile && (
        <ProfilePanel profile={profile} onSave={saveProfile} onClose={() => setShowProfile(false)} />
      )}

      {showHistory && (
        <HistoryPanel sessions={sessions} onSelect={loadSession} onDelete={deleteSession} onClose={() => setShowHistory(false)} />
      )}

      {profileFilled && !showProfile && (
        <div className="profile-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Profile active
          {profile.goal && <span className="profile-banner-goal">· {profile.goal}</span>}
          <button className="profile-banner-edit" onClick={() => setShowProfile(true)}>Edit</button>
        </div>
      )}

      <main className="chat-area" ref={chatRef} onScroll={handleScroll}>
        {messages.length === 0
          ? <WelcomePage
              onPrompt={text => sendMessage(text)}
              profileFilled={profileFilled}
              onOpenProfile={() => setShowProfile(true)}
              sessions={sessions}
              profile={profile}
              onContinueLastChat={onContinueLastChat}
            />
          : <>
              <div className="date-divider"><span>Today</span></div>
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id ?? i} message={msg} isNew={msg.id === newestId} onSuggestion={t => sendMessage(t)} />
              ))}
            </>
        }
        {loading && !messages.some(m => m.streaming) && <TypingIndicator stage={THINKING_STAGES[thinkingStage]} />}
        {error && <div className="error-banner">⚠️ {error}</div>}
        <div ref={bottomRef} />
      </main>

      {showScroll && <ScrollToBottom onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setShowScroll(false); }} />}

      <footer className="input-area">
        {stagedFile && <FileChip file={stagedFile} onDismiss={() => setStagedFile(null)} />}
        <div className={`input-row ${loading ? "input-loading" : ""}`}>
          <button className="attach-btn" onClick={() => fileRef.current?.click()} disabled={loading} title="Upload statement">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { setStagedFile(f); e.target.value = ""; }}} />

          {/* Feature 8: Voice input mic button */}
          <button
            className={`attach-btn mic-btn${listening ? ' mic-btn--active' : ''}`}
            onClick={toggleVoice}
            disabled={loading}
            title={listening ? "Stop listening" : "Voice input"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* Feature 9: auto-resize textarea with textareaRef */}
          <textarea
            ref={textareaRef}
            className="text-input"
            placeholder={stagedFile ? "Press Send to upload, or add a message…" : "Ask Penny about your finances…"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            disabled={loading}
          />
          <button className="send-btn" onClick={() => sendMessage()} disabled={loading || (!input.trim() && !stagedFile)}>
            {loading ? <div className="send-spinner" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
          </button>
        </div>
        <p className="input-hint"><kbd>Enter</kbd> send · <kbd>⇧ Enter</kbd> new line · 📎 upload statement</p>
      </footer>
    </div>
  );
}
