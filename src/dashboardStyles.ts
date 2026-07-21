export const dashboardCss = `
  /* ------------------------------------------------------------------ */
  /* Tobi console — Apple-inspired design system                         */
  /* System type with optical sizing, translucent chrome, spring motion. */
  /* ------------------------------------------------------------------ */

  :root {
    color-scheme: light dark;

    --accent-light: oklch(56% 0.20 264);
    --accent-dark: oklch(74% 0.14 264);
    --accent: light-dark(var(--accent-light), var(--accent-dark));

    --accent-strong-light: oklch(48% 0.21 264);
    --accent-strong-dark: oklch(81% 0.12 264);
    --accent-strong: light-dark(var(--accent-strong-light), var(--accent-strong-dark));

    --on-accent: light-dark(#ffffff, oklch(18% 0.04 264));

    --accent-subtle-light: oklch(96.5% 0.018 264);
    --accent-subtle-dark: oklch(23% 0.045 264);
    --accent-subtle: light-dark(var(--accent-subtle-light), var(--accent-subtle-dark));

    --accent-ring: light-dark(oklch(56% 0.20 264 / 22%), oklch(74% 0.14 264 / 28%));

    --bg-light: oklch(97.7% 0.004 260);
    --bg-dark: oklch(13.5% 0.012 260);
    --bg: light-dark(var(--bg-light), var(--bg-dark));

    --bg-tint-light: oklch(95.5% 0.008 260);
    --bg-tint-dark: oklch(17% 0.016 260);
    --bg-tint: light-dark(var(--bg-tint-light), var(--bg-tint-dark));

    --panel-light: oklch(100% 0 0);
    --panel-dark: oklch(18.5% 0.014 260);
    --panel: light-dark(var(--panel-light), var(--panel-dark));

    --panel-raised-light: oklch(99.4% 0.002 260);
    --panel-raised-dark: oklch(21.5% 0.014 260);
    --panel-raised: light-dark(var(--panel-raised-light), var(--panel-raised-dark));

    --chrome-light: oklch(98% 0.004 260 / 74%);
    --chrome-dark: oklch(15% 0.012 260 / 64%);
    --chrome: light-dark(var(--chrome-light), var(--chrome-dark));

    --chrome-edge-light: oklch(100% 0 0 / 65%);
    --chrome-edge-dark: oklch(100% 0 0 / 7%);
    --chrome-edge: light-dark(var(--chrome-edge-light), var(--chrome-edge-dark));

    --text-light: oklch(22% 0.012 260);
    --text-dark: oklch(94% 0.008 260);
    --text: light-dark(var(--text-light), var(--text-dark));

    --text-secondary-light: oklch(46% 0.012 260);
    --text-secondary-dark: oklch(74% 0.01 260);
    --text-secondary: light-dark(var(--text-secondary-light), var(--text-secondary-dark));

    --text-tertiary-light: oklch(58% 0.012 260);
    --text-tertiary-dark: oklch(62% 0.01 260);
    --text-tertiary: light-dark(var(--text-tertiary-light), var(--text-tertiary-dark));

    --line-light: oklch(90.5% 0.008 260);
    --line-dark: oklch(26% 0.016 260);
    --line: light-dark(var(--line-light), var(--line-dark));

    --line-strong-light: oklch(85% 0.01 260);
    --line-strong-dark: oklch(32% 0.018 260);
    --line-strong: light-dark(var(--line-strong-light), var(--line-strong-dark));

    --amber-bg: light-dark(oklch(96.5% 0.045 82), oklch(25% 0.05 82));
    --amber-text: light-dark(oklch(46% 0.11 78), oklch(85% 0.09 82));
    --amber-line: light-dark(oklch(90% 0.06 82), oklch(34% 0.06 82));

    --green-bg: light-dark(oklch(96% 0.05 145), oklch(23% 0.055 145));
    --green-text: light-dark(oklch(43% 0.11 145), oklch(83% 0.10 145));
    --green-line: light-dark(oklch(89% 0.07 145), oklch(32% 0.07 145));

    --blue-bg: light-dark(oklch(96% 0.045 245), oklch(24% 0.055 245));
    --blue-text: light-dark(oklch(46% 0.13 245), oklch(83% 0.10 245));
    --blue-line: light-dark(oklch(89% 0.06 245), oklch(32% 0.07 245));

    --red-bg: light-dark(oklch(96% 0.045 24), oklch(24% 0.055 24));
    --red-text: light-dark(oklch(46% 0.14 24), oklch(83% 0.10 24));
    --red-line: light-dark(oklch(89% 0.06 24), oklch(32% 0.07 24));

    --shadow-xs: light-dark(0 1px 2px oklch(30% 0.02 260 / 5%), 0 1px 2px oklch(0% 0 0 / 30%));
    --shadow-sm: light-dark(0 1px 2px oklch(30% 0.02 260 / 4%), 0 2px 10px oklch(0% 0 0 / 22%));
    --shadow-md: light-dark(0 12px 32px oklch(30% 0.02 260 / 8%), 0 12px 32px oklch(0% 0 0 / 30%));
    --shadow-lg: light-dark(0 24px 60px oklch(30% 0.02 260 / 12%), 0 24px 60px oklch(0% 0 0 / 34%));

    --ease-spring: cubic-bezier(0.34, 1.45, 0.4, 1);
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

    --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

    accent-color: var(--accent);
    scrollbar-color: light-dark(oklch(80% 0 0), oklch(34% 0 0)) transparent;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --accent: var(--accent-dark);
      --accent-strong: var(--accent-strong-dark);
      --on-accent: oklch(18% 0.04 264);
      --accent-subtle: var(--accent-subtle-dark);
      --accent-ring: oklch(74% 0.14 264 / 28%);
      --bg: var(--bg-dark);
      --bg-tint: var(--bg-tint-dark);
      --panel: var(--panel-dark);
      --panel-raised: var(--panel-raised-dark);
      --chrome: var(--chrome-dark);
      --chrome-edge: var(--chrome-edge-dark);
      --text: var(--text-dark);
      --text-secondary: var(--text-secondary-dark);
      --text-tertiary: var(--text-tertiary-dark);
      --line: var(--line-dark);
      --line-strong: var(--line-strong-dark);
      --shadow-xs: 0 1px 2px oklch(0% 0 0 / 30%);
      --shadow-sm: 0 2px 10px oklch(0% 0 0 / 22%);
      --shadow-md: 0 12px 32px oklch(0% 0 0 / 30%);
      --shadow-lg: 0 24px 60px oklch(0% 0 0 / 34%);
    }
  }

  :root[data-theme="light"] {
    color-scheme: light;
    --accent: var(--accent-light);
    --accent-strong: var(--accent-strong-light);
    --on-accent: #ffffff;
    --accent-subtle: var(--accent-subtle-light);
    --accent-ring: oklch(56% 0.20 264 / 22%);
    --bg: var(--bg-light);
    --bg-tint: var(--bg-tint-light);
    --panel: var(--panel-light);
    --panel-raised: var(--panel-raised-light);
    --chrome: var(--chrome-light);
    --chrome-edge: var(--chrome-edge-light);
    --text: var(--text-light);
    --text-secondary: var(--text-secondary-light);
    --text-tertiary: var(--text-tertiary-light);
    --line: var(--line-light);
    --line-strong: var(--line-strong-light);
    --shadow-xs: 0 1px 2px oklch(30% 0.02 260 / 5%);
    --shadow-sm: 0 1px 2px oklch(30% 0.02 260 / 4%);
    --shadow-md: 0 12px 32px oklch(30% 0.02 260 / 8%);
    --shadow-lg: 0 24px 60px oklch(30% 0.02 260 / 12%);
  }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --accent: var(--accent-dark);
    --accent-strong: var(--accent-strong-dark);
    --on-accent: oklch(18% 0.04 264);
    --accent-subtle: var(--accent-subtle-dark);
    --accent-ring: oklch(74% 0.14 264 / 28%);
    --bg: var(--bg-dark);
    --bg-tint: var(--bg-tint-dark);
    --panel: var(--panel-dark);
    --panel-raised: var(--panel-raised-dark);
    --chrome: var(--chrome-dark);
    --chrome-edge: var(--chrome-edge-dark);
    --text: var(--text-dark);
    --text-secondary: var(--text-secondary-dark);
    --text-tertiary: var(--text-tertiary-dark);
    --line: var(--line-dark);
    --line-strong: var(--line-strong-dark);
    --shadow-xs: 0 1px 2px oklch(0% 0 0 / 30%);
    --shadow-sm: 0 2px 10px oklch(0% 0 0 / 22%);
    --shadow-md: 0 12px 32px oklch(0% 0 0 / 30%);
    --shadow-lg: 0 24px 60px oklch(0% 0 0 / 34%);
  }

  * { box-sizing: border-box; }

  ::selection {
    background-color: var(--accent);
    color: var(--on-accent);
  }

  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    padding: 28px clamp(16px, 4vw, 32px) 56px;
    min-height: 100vh;
    min-height: 100dvh;
    background-color: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    transition: background-color 0.35s var(--ease-out), color 0.35s var(--ease-out);
  }

  /* Ambient layered backdrop — fixed, behind everything */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(52rem 34rem at 10% -8%, light-dark(oklch(56% 0.20 264 / 7%), oklch(74% 0.14 264 / 9%)), transparent 62%),
      radial-gradient(46rem 32rem at 96% 14%, light-dark(oklch(60% 0.12 200 / 6%), oklch(70% 0.10 200 / 7%)), transparent 60%),
      radial-gradient(60rem 40rem at 50% 112%, light-dark(oklch(60% 0.10 145 / 5%), oklch(70% 0.08 145 / 5%)), transparent 60%);
    transition: opacity 0.35s var(--ease-out);
  }

  h1, h2, h3, p, dl, dd, dt, figure { margin: 0; }

  h1 {
    font-size: clamp(24px, 2.6vw, 30px);
    font-weight: 750;
    letter-spacing: -0.022em;
    line-height: 1.12;
    text-wrap: balance;
  }

  h2 {
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.005em;
    color: var(--text-secondary);
    margin-bottom: 18px;
  }

  a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 550;
    transition: color 0.18s var(--ease-out);
  }
  a:hover { color: var(--accent-strong); }

  :is(a, button, input, summary):focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .eyebrow {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    margin-bottom: 3px;
  }

  .muted { color: var(--text-tertiary); font-size: 13.5px; line-height: 1.55; }

  .mono { font-family: var(--font-mono); font-size: 0.92em; font-weight: 550; letter-spacing: -0.01em; }

  /* ----------------------------- toolbar ----------------------------- */

  .toolbar {
    position: sticky;
    top: 12px;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    max-width: 1120px;
    margin: 0 auto 30px;
    padding: 14px 20px;
    background-color: var(--chrome);
    -webkit-backdrop-filter: blur(22px) saturate(170%);
    backdrop-filter: blur(22px) saturate(170%);
    border: 1px solid var(--chrome-edge);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.3s var(--ease-out), background-color 0.35s var(--ease-out), border-color 0.35s var(--ease-out);
  }

  .toolbar.scrolled {
    box-shadow: var(--shadow-md);
  }

  /* Scroll edge fade: content dissolves under the floating chrome */
  .toolbar::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -26px;
    height: 26px;
    pointer-events: none;
    background: linear-gradient(to bottom, var(--bg), transparent);
    opacity: 0;
    transition: opacity 0.3s var(--ease-out);
  }
  .toolbar.scrolled::after { opacity: 0.9; }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .brand h1 { font-size: 22px; white-space: nowrap; }

  .brand .divider {
    width: 1px;
    height: 22px;
    background-color: var(--line-strong);
    flex-shrink: 0;
  }

  .brand .title-block { min-width: 0; }
  .brand .title-block h1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: var(--text-secondary);
    background-color: transparent;
    flex-shrink: 0;
    transition: background-color 0.18s var(--ease-out), color 0.18s var(--ease-out), transform 0.22s var(--ease-spring);
  }
  .back-link:hover {
    background-color: var(--accent-subtle);
    color: var(--accent);
    transform: translateX(-2px);
  }
  .back-link:active { transform: translateX(-2px) scale(0.92); }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-weight: 750;
    font-size: 17px;
    letter-spacing: -0.025em;
    color: var(--text);
    flex-shrink: 0;
  }

  .logo-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    color: var(--on-accent);
    background-image: linear-gradient(150deg, var(--accent), var(--accent-strong));
    box-shadow: var(--shadow-xs), inset 0 1px 0 oklch(100% 0 0 / 22%);
    transition: transform 0.25s var(--ease-spring);
  }
  .logo:hover .logo-mark { transform: rotate(-6deg) scale(1.05); }
  .logo-mark svg { width: 17px; height: 17px; }

  /* ------------------------------ panels ----------------------------- */

  .panel {
    background-color: var(--panel);
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: var(--shadow-sm);
    padding: 24px;
    max-width: 1120px;
    margin: 0 auto;
    transition: background-color 0.35s var(--ease-out), border-color 0.35s var(--ease-out), box-shadow 0.3s var(--ease-out);
  }

  .table-panel {
    padding: 0;
    overflow: hidden;
  }

  .table-container {
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .orders-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
    font-size: 12.5px;
    font-weight: 550;
    color: var(--text-tertiary);
  }
  .orders-meta .mono { color: var(--text-secondary); }

  /* ------------------------------- stats ----------------------------- */

  .stats-strip {
    max-width: 1120px;
    margin: 0 auto 22px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .stat-card {
    background-color: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px 18px 15px;
    box-shadow: var(--shadow-xs);
    display: flex;
    flex-direction: column;
    gap: 7px;
    transition: transform 0.25s var(--ease-spring), box-shadow 0.25s var(--ease-out), border-color 0.25s var(--ease-out), background-color 0.35s var(--ease-out);
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: var(--line-strong);
  }

  .stat-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-tertiary);
  }
  .stat-label svg { color: var(--accent); opacity: 0.85; flex-shrink: 0; width: 14px; height: 14px; }

  .stat-value {
    font-size: clamp(22px, 2.2vw, 27px);
    font-weight: 750;
    letter-spacing: -0.02em;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }
  .stat-value .mono { font-size: 1em; font-weight: 700; }

  .stat-sub {
    font-size: 12px;
    font-weight: 550;
    color: var(--text-tertiary);
  }

  /* ------------------------------- forms ----------------------------- */

  .stack { display: grid; gap: 20px; margin-top: 24px; }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .input-group label {
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-wrapper input {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    padding: 12px 14px 12px 42px;
    font: inherit;
    font-size: 15px;
    letter-spacing: 0.06em;
    background-color: var(--bg-tint);
    color: var(--text);
    transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s var(--ease-out);
  }
  .input-wrapper input::placeholder {
    color: var(--text-tertiary);
    letter-spacing: 0.12em;
  }

  .input-wrapper input:hover { border-color: var(--text-tertiary); }

  .input-wrapper input:focus {
    border-color: var(--accent);
    background-color: var(--panel);
    box-shadow: 0 0 0 4px var(--accent-ring);
    outline: none;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    color: var(--text-tertiary);
    pointer-events: none;
    transition: color 0.2s var(--ease-out);
  }
  .input-wrapper:focus-within .input-icon { color: var(--accent); }

  /* ------------------------------ buttons ---------------------------- */

  button, .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    border: 0;
    border-radius: 11px;
    background-color: var(--accent);
    color: var(--on-accent);
    padding: 9px 18px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.005em;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: var(--shadow-xs), inset 0 1px 0 oklch(100% 0 0 / 16%);
    transition: background-color 0.18s var(--ease-out), transform 0.22s var(--ease-spring), box-shadow 0.22s var(--ease-out), color 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  }

  button:hover, .button:hover {
    background-color: var(--accent-strong);
    box-shadow: var(--shadow-sm), inset 0 1px 0 oklch(100% 0 0 / 16%);
  }

  button:active, .button:active {
    transform: scale(0.965);
    transition-duration: 0.09s;
  }

  button:focus-visible, .button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .button.secondary {
    background-color: var(--accent-subtle);
    color: var(--accent);
    box-shadow: none;
  }
  .button.secondary:hover {
    background-color: light-dark(oklch(92.5% 0.035 264), oklch(28% 0.075 264));
    color: var(--accent-strong);
    box-shadow: none;
  }

  /* ------------------------------- table ----------------------------- */

  table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
  th, td { padding: 15px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    background-color: var(--bg-tint);
    border-bottom: 1px solid var(--line);
  }

  tbody tr {
    transition: background-color 0.16s var(--ease-out);
  }
  tbody tr:hover {
    background-color: light-dark(oklch(98.8% 0.004 260), oklch(21.5% 0.014 260));
  }
  tbody tr:last-child td { border-bottom: none; }

  .order-link {
    font-family: var(--font-mono);
    font-weight: 650;
    font-size: 13.5px;
    letter-spacing: -0.01em;
  }

  .files-badge, .time-badge, .contact-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-weight: 550;
  }
  .contact-badge {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: -0.01em;
    color: var(--text);
    background-color: var(--bg-tint);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 4px 8px;
    white-space: nowrap;
  }
  .files-badge svg, .time-badge svg {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .amount-cell, .pickup-cell {
    font-family: var(--font-mono);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .amount-cell { font-size: 13.5px; font-variant-numeric: tabular-nums; }

  .empty {
    color: var(--text-tertiary);
    text-align: center;
    padding: 56px 24px !important;
    font-weight: 500;
    font-size: 14px;
  }

  /* ------------------------------- login ----------------------------- */

  .login-bg-glow {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(38rem 26rem at 18% 22%, light-dark(oklch(56% 0.20 264 / 10%), oklch(74% 0.14 264 / 12%)), transparent 60%),
      radial-gradient(34rem 26rem at 84% 74%, light-dark(oklch(60% 0.12 200 / 8%), oklch(70% 0.10 200 / 9%)), transparent 58%),
      radial-gradient(30rem 22rem at 70% 12%, light-dark(oklch(60% 0.10 145 / 6%), oklch(70% 0.08 145 / 6%)), transparent 55%);
  }

  .login-wrapper {
    max-width: 420px;
    margin: 9vh auto 0;
    padding: 0 20px;
    position: relative;
  }

  .login-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 22px;
    padding: 0 4px;
  }

  .login-panel {
    background-color: var(--chrome);
    -webkit-backdrop-filter: blur(26px) saturate(170%);
    backdrop-filter: blur(26px) saturate(170%);
    border: 1px solid var(--chrome-edge);
    border-radius: 22px;
    padding: 30px;
    box-shadow: var(--shadow-lg);
  }

  .login-header-content { margin-bottom: 24px; }
  .login-header-content h1 { font-size: 26px; }

  .error-badge {
    display: flex;
    align-items: center;
    gap: 9px;
    background-color: var(--red-bg);
    color: var(--red-text);
    padding: 10px 14px;
    border-radius: 11px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 18px;
    border: 1px solid var(--red-line);
  }
  .error-badge svg { flex-shrink: 0; }

  /* --------------------------- theme toggle -------------------------- */

  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    min-height: auto;
    border-radius: 11px;
    background-color: var(--bg-tint);
    color: var(--text-secondary);
    border: 1px solid var(--line);
    box-shadow: none;
    transition: color 0.2s var(--ease-out), background-color 0.2s var(--ease-out), border-color 0.2s var(--ease-out), transform 0.22s var(--ease-spring);
  }
  .theme-toggle:hover {
    color: var(--text);
    background-color: var(--panel-raised);
    border-color: var(--line-strong);
    box-shadow: none;
  }
  .theme-toggle:active { transform: scale(0.9); }

  .theme-toggle .icon-swap {
    display: grid;
    place-items: center;
  }
  .theme-toggle .icon-swap svg {
    grid-area: 1 / 1;
    transition: transform 0.45s var(--ease-spring), opacity 0.25s var(--ease-out);
  }

  .theme-toggle .sun { opacity: 0; transform: rotate(-75deg) scale(0.55); }
  .theme-toggle .moon { opacity: 1; transform: rotate(0deg) scale(1); }

  :root[data-theme="dark"] .theme-toggle .sun { opacity: 1; transform: rotate(0deg) scale(1); }
  :root[data-theme="dark"] .theme-toggle .moon { opacity: 0; transform: rotate(75deg) scale(0.55); }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle .sun { opacity: 1; transform: rotate(0deg) scale(1); }
    :root:not([data-theme="light"]) .theme-toggle .moon { opacity: 0; transform: rotate(75deg) scale(0.55); }
  }

  /* --------------------------- detail layout ------------------------- */

  .detail-grid {
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
    gap: 22px;
    align-items: start;
  }

  .detail-main-column, .detail-sidebar-column {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-width: 0;
  }

  .detail-grid .panel { width: 100%; margin: 0; }

  .print-options-list {
    display: grid;
    grid-template-columns: 132px 1fr;
    gap: 0 20px;
  }
  .print-options-list dt,
  .print-options-list dd {
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
  }
  .print-options-list dt {
    color: var(--text-tertiary);
    font-weight: 600;
    font-size: 13px;
  }
  .print-options-list dd {
    font-weight: 600;
    color: var(--text);
    font-size: 14.5px;
    letter-spacing: -0.005em;
  }
  .print-options-list dt:last-of-type,
  .print-options-list dd:last-of-type { border-bottom: none; }

  .amount {
    font-family: var(--font-mono);
    font-size: clamp(30px, 3.4vw, 38px);
    font-weight: 750;
    letter-spacing: -0.035em;
    color: var(--text);
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }

  .status-wrapper { margin: 12px 0 22px; }

  .payment-meta {
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-top: 1px solid var(--line);
    padding-top: 18px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }
  .meta-label {
    color: var(--text-tertiary);
    font-weight: 600;
  }

  .payment-link-anchor {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
  }
  .payment-link-anchor svg { transition: transform 0.22s var(--ease-spring); }
  .payment-link-anchor:hover svg { transform: translate(2px, -2px); }

  .pickup-code-box {
    background-color: var(--accent-subtle);
    border: 1px dashed light-dark(oklch(56% 0.20 264 / 45%), oklch(74% 0.14 264 / 40%));
    border-radius: 13px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }
  .pickup-label {
    font-size: 11px;
    font-weight: 650;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .pickup-code {
    font-family: var(--font-mono);
    font-size: 21px;
    font-weight: 750;
    color: var(--accent);
    letter-spacing: 0.06em;
  }

  /* ---------------------------- status track ------------------------- */

  .status-track {
    display: flex;
    align-items: flex-start;
    margin: 4px 2px 2px;
  }

  .track-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    flex: 0 0 auto;
    min-width: 56px;
  }

  .track-node {
    display: grid;
    place-items: center;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    border: 2px solid var(--line-strong);
    background-color: var(--panel);
    color: transparent;
    transition: background-color 0.3s var(--ease-out), border-color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out);
  }
  .track-node svg { width: 13px; height: 13px; }

  .track-step.done .track-node {
    background-color: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .track-step.current .track-node {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-ring);
  }
  .track-step.current.is-live .track-node {
    animation: node-breathe 2.4s var(--ease-out) infinite;
  }

  .track-step.terminal-cancel .track-node {
    background-color: var(--red-bg);
    border-color: var(--red-text);
    color: var(--red-text);
  }
  .track-step.terminal-fail .track-node {
    background-color: var(--amber-bg);
    border-color: var(--amber-text);
    color: var(--amber-text);
  }

  .track-label {
    font-size: 10.5px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary);
    text-align: center;
    max-width: 74px;
    line-height: 1.3;
  }
  .track-step.done .track-label,
  .track-step.current .track-label { color: var(--text-secondary); }
  .track-step.current .track-label { color: var(--accent); font-weight: 700; }

  .track-connector {
    flex: 1 1 auto;
    height: 2px;
    min-width: 14px;
    margin-top: 12.5px;
    border-radius: 1px;
    background-color: var(--line-strong);
    transition: background-color 0.3s var(--ease-out);
  }
  .track-connector.done { background-color: var(--accent); }

  .track-note {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    font-size: 13px;
    font-weight: 550;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track-note svg { color: var(--text-tertiary); flex-shrink: 0; width: 15px; height: 15px; }
  .track-note.is-cancel { color: var(--red-text); }
  .track-note.is-cancel svg { color: var(--red-text); }
  .track-note.is-fail { color: var(--amber-text); }
  .track-note.is-fail svg { color: var(--amber-text); }

  @keyframes node-breathe {
    0%, 100% { box-shadow: 0 0 0 4px var(--accent-ring); }
    50% { box-shadow: 0 0 0 7px var(--accent-ring); }
  }

  /* ------------------------------ files ------------------------------ */

  .file-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
  .file-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--line);
    border-radius: 13px;
    padding: 13px 15px;
    background-color: var(--panel-raised);
    transition: border-color 0.22s var(--ease-out), transform 0.25s var(--ease-spring), box-shadow 0.25s var(--ease-out), background-color 0.35s var(--ease-out);
  }
  .file-list li:hover {
    border-color: light-dark(oklch(56% 0.20 264 / 45%), oklch(74% 0.14 264 / 40%));
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .file-info-group {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
  }
  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background-color: var(--accent-subtle);
    color: var(--accent);
    flex-shrink: 0;
  }
  .file-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .file-name {
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.005em;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-subtext {
    font-size: 12px;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 34px 16px !important;
    border: 1px dashed var(--line-strong) !important;
    background: transparent !important;
    color: var(--text-tertiary);
    font-size: 13.5px;
    font-weight: 550;
  }
  .empty-state:hover { transform: none; box-shadow: none; }
  .empty-state svg { opacity: 0.55; }

  /* --------------------------- status actions ------------------------ */

  .actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .actions form { margin: 0; width: 100%; }
  .actions button {
    width: 100%;
    min-height: 39px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 650;
    text-transform: capitalize;
    letter-spacing: 0;
    background-color: var(--bg-tint);
    color: var(--text);
    border: 1px solid var(--line);
    box-shadow: none;
  }
  .actions button:hover {
    background-color: var(--accent-subtle);
    border-color: light-dark(oklch(56% 0.20 264 / 45%), oklch(74% 0.14 264 / 40%));
    color: var(--accent);
    box-shadow: none;
  }

  .actions button.success-btn {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: var(--green-line);
  }
  .actions button.success-btn:hover {
    background-color: light-dark(oklch(92% 0.07 145), oklch(29% 0.075 145));
    color: var(--green-text);
    border-color: var(--green-text);
  }

  .actions button.danger-btn {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: var(--red-line);
  }
  .actions button.danger-btn:hover {
    background-color: light-dark(oklch(92% 0.07 24), oklch(29% 0.075 24));
    color: var(--red-text);
    border-color: var(--red-text);
  }

  /* ---------------------------- status pills ------------------------- */

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 9999px;
    padding: 4px 11px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-draft,
  .status-payment_link_sent, .status-payment_pending, .status-quote_ready, .status-awaiting_file, .status-awaiting_details {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: var(--amber-line);
  }
  .status-draft .status-dot,
  .status-payment_link_sent .status-dot, .status-payment_pending .status-dot, .status-quote_ready .status-dot, .status-awaiting_file .status-dot, .status-awaiting_details .status-dot {
    background-color: var(--amber-text);
  }

  .status-paid, .status-shop_notified, .status-ready_for_pickup, .status-completed {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: var(--green-line);
  }
  .status-paid .status-dot, .status-shop_notified .status-dot, .status-ready_for_pickup .status-dot, .status-completed .status-dot {
    background-color: var(--green-text);
  }

  .status-printing, .status-accepted {
    background-color: var(--blue-bg);
    color: var(--blue-text);
    border-color: var(--blue-line);
  }
  .status-printing .status-dot, .status-accepted .status-dot {
    background-color: var(--blue-text);
  }
  .status-printing .status-dot {
    animation: dot-pulse 1.6s var(--ease-out) infinite;
  }

  .status-cancelled, .status-failed {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: var(--red-line);
  }
  .status-cancelled .status-dot, .status-failed .status-dot {
    background-color: var(--red-text);
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }

  .payment-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: var(--bg-tint);
    border: 1px solid var(--line);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .payment-captured, .payment-succeeded, .payment-paid {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: var(--green-line);
  }
  .payment-pending, .payment-link_sent, .payment-not_started {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: var(--amber-line);
  }
  .payment-failed, .payment-expired, .payment-cancelled {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: var(--red-line);
  }

  /* ---------------------------- scrollbars --------------------------- */

  ::-webkit-scrollbar { width: 9px; height: 9px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: light-dark(oklch(82% 0 0), oklch(33% 0 0));
    border-radius: 5px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: light-dark(oklch(70% 0 0), oklch(42% 0 0));
    background-clip: content-box;
  }

  /* ------------------------- entrance reveals ------------------------ */

  .reveal {
    animation: rise 0.55s var(--ease-out) both;
    animation-delay: calc(var(--reveal-index, 0) * 55ms);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ------------------------ reduced motion etc ----------------------- */

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    .reveal { animation: none; opacity: 1; }
    .track-step.current.is-live .track-node { animation: none; }
    .status-printing .status-dot { animation: none; }
  }

  @media (prefers-reduced-transparency: reduce) {
    .toolbar, .login-panel {
      background-color: var(--panel);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  @media (prefers-contrast: more) {
    .panel, .toolbar, .login-panel, .stat-card {
      border-color: var(--text-secondary);
    }
  }

  /* ----------------------------- responsive -------------------------- */

  @media (max-width: 900px) {
    .stats-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 840px) {
    body { font-size: 14.5px; }
    .toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      margin-bottom: 22px;
      padding: 12px 16px;
    }
    .brand { justify-content: space-between; }
    .toolbar-actions { gap: 10px; justify-content: flex-end; }
    .detail-grid { grid-template-columns: 1fr; gap: 18px; }
    table { font-size: 13px; }
    th, td { padding: 12px 14px; }
    .print-options-list { grid-template-columns: 108px 1fr; }
    .actions { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 580px) {
    .brand h1 { font-size: 19px; }
    .logo { font-size: 15.5px; }
    .brand .divider { height: 18px; }
    .stats-strip { gap: 10px; }
    .stat-card { padding: 13px 14px 12px; }
    table, thead, tbody, tr, th, td { display: block; }
    thead { display: none; }
    tr { border-bottom: 1px solid var(--line); padding: 14px 16px; position: relative; }
    tr:last-child { border-bottom: none; }
    td { border: 0; padding: 6px 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    td::before {
      content: attr(data-label);
      font-size: 11px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-tertiary);
    }
    td.actions-cell::before { content: none; }
    td.actions-cell { justify-content: flex-end; margin-top: 8px; }
    .file-list li { flex-direction: column; align-items: stretch; gap: 12px; }
    .download-btn { width: 100%; }
    .actions { grid-template-columns: 1fr; }
    .track-label { max-width: 58px; font-size: 9.5px; }
    .track-step { min-width: 46px; }
  }
`;
