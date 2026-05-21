export const dashboardCss = `
  :root {
    color-scheme: light dark;

    
    --accent-light: oklch(58% 0.23 268);
    --accent-dark: oklch(72% 0.17 268);
    --accent: light-dark(var(--accent-light), var(--accent-dark));

    --accent-hover-light: oklch(50% 0.23 268);
    --accent-hover-dark: oklch(78% 0.15 268);
    --accent-hover: light-dark(var(--accent-hover-light), var(--accent-hover-dark));

    --accent-subtle-light: oklch(96% 0.015 268);
    --accent-subtle-dark: oklch(22% 0.04 268);
    --accent-subtle: light-dark(var(--accent-subtle-light), var(--accent-subtle-dark));

    --bg-light: oklch(98% 0.005 250);
    --bg-dark: oklch(12% 0.015 250);
    --bg: light-dark(var(--bg-light), var(--bg-dark));

    --panel-light: oklch(100% 0 0);
    --panel-dark: oklch(18% 0.02 250);
    --panel: light-dark(var(--panel-light), var(--panel-dark));

    --text-light: oklch(24% 0.015 250);
    --text-dark: oklch(93% 0.01 250);
    --text: light-dark(var(--text-light), var(--text-dark));

    --text-muted-light: oklch(52% 0.015 250);
    --text-muted-dark: oklch(72% 0.01 250);
    --text-muted: light-dark(var(--text-muted-light), var(--text-muted-dark));

    --line-light: oklch(92% 0.01 250);
    --line-dark: oklch(24% 0.02 250);
    --line: light-dark(var(--line-light), var(--line-dark));

    --amber-bg: light-dark(oklch(96% 0.04 80), oklch(24% 0.05 80));
    --amber-text: light-dark(oklch(48% 0.12 80), oklch(84% 0.10 80));

    --green-bg: light-dark(oklch(95% 0.05 140), oklch(22% 0.06 140));
    --green-text: light-dark(oklch(42% 0.12 140), oklch(82% 0.11 140));

    --blue-bg: light-dark(oklch(95% 0.05 240), oklch(24% 0.06 240));
    --blue-text: light-dark(oklch(45% 0.14 240), oklch(82% 0.11 240));

    --red-bg: light-dark(oklch(95% 0.05 20), oklch(24% 0.06 20));
    --red-text: light-dark(oklch(45% 0.14 20), oklch(82% 0.11 20));

    --shadow-light: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.04);
    --shadow-dark: 0 1px 3px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.18);
    --shadow: light-dark(var(--shadow-light), var(--shadow-dark));

    --scrollbar-track: light-dark(oklch(96% 0 0), oklch(16% 0 0));
    --scrollbar-thumb: light-dark(oklch(82% 0 0), oklch(32% 0 0));

    accent-color: var(--accent);
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --accent: var(--accent-dark);
      --accent-hover: var(--accent-hover-dark);
      --accent-subtle: var(--accent-subtle-dark);
      --bg: var(--bg-dark);
      --panel: var(--panel-dark);
      --text: var(--text-dark);
      --text-muted: var(--text-muted-dark);
      --line: var(--line-dark);
      --shadow: var(--shadow-dark);
    }
  }

  :root[data-theme="light"] {
    color-scheme: light;
    --accent: var(--accent-light);
    --accent-hover: var(--accent-hover-light);
    --accent-subtle: var(--accent-subtle-light);
    --bg: var(--bg-light);
    --panel: var(--panel-light);
    --text: var(--text-light);
    --text-muted: var(--text-muted-light);
    --line: var(--line-light);
    --shadow: var(--shadow-light);
  }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --accent: var(--accent-dark);
    --accent-hover: var(--accent-hover-dark);
    --accent-subtle: var(--accent-subtle-dark);
    --bg: var(--bg-dark);
    --panel: var(--panel-dark);
    --text: var(--text-dark);
    --text-muted: var(--text-muted-dark);
    --line: var(--line-dark);
    --shadow: var(--shadow-dark);
  }

  * { box-sizing: border-box; outline-color: var(--accent); }

  body {
    margin: 0;
    min-height: 100vh;
    background-color: var(--bg);
    color: var(--text);
    font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
    padding: 32px 24px;
    line-height: 1.5;
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3, p { margin: 0; }
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
  h2 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }

  a { color: var(--accent); text-decoration: none; font-weight: 600; transition: color 0.2s ease; }
  a:hover { color: var(--accent-hover); }

  .eyebrow { color: var(--text-muted); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 auto 32px;
    max-width: 1120px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brand h1 { font-size: 24px; font-weight: 800; }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand .divider {
    width: 1px;
    height: 24px;
    background-color: var(--line);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.03em;
    color: var(--text);
  }
  .logo svg {
    color: var(--accent);
  }

  .panel {
    background-color: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 24px;
    max-width: 1120px;
    margin: 0 auto;
    transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .table-panel {
    padding: 0;
    overflow: hidden;
  }

  .table-container {
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .stack { display: grid; gap: 20px; margin-top: 24px; }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .input-group label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-wrapper input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px 12px 40px;
    font: inherit;
    background-color: var(--bg);
    color: var(--text);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .input-wrapper input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
    outline: none;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    color: var(--text-muted);
    pointer-events: none;
  }

  button, .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
    border: 0;
    border-radius: 8px;
    background-color: var(--accent);
    color: #ffffff;
    padding: 10px 18px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s;
  }

  button:hover, .button:hover {
    background-color: var(--accent-hover);
  }

  button:active, .button:active {
    transform: scale(0.98);
  }

  button:focus-visible, .button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .button.secondary {
    background-color: var(--accent-subtle);
    color: var(--accent);
  }
  .button.secondary:hover {
    background-color: light-dark(oklch(91% 0.03 268), oklch(28% 0.08 268));
  }

  table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
  th, td { padding: 16px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: light-dark(oklch(97% 0.005 250), oklch(15% 0.02 250));
  }

  tbody tr {
    transition: background-color 0.15s ease;
  }
  tbody tr:hover {
    background-color: light-dark(oklch(99% 0 0), oklch(21% 0.01 250));
  }
  tbody tr:last-child td { border-bottom: none; }

  .order-link {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 14px;
  }

  .files-badge, .time-badge, .contact-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .contact-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text);
    background-color: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    white-space: nowrap;
  }
  .files-badge svg, .time-badge svg {
    color: var(--text-muted);
    opacity: 0.8;
  }

  .amount-cell, .pickup-cell, .mono {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
  }
  .amount-cell {
    font-size: 14px;
  }

  .empty { color: var(--text-muted); text-align: center; padding: 48px; font-weight: 500; }

  .login-bg-glow {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 30%, light-dark(oklch(94% 0.05 268 / 50%), oklch(15% 0.08 268 / 25%)), transparent 50%),
                radial-gradient(circle at 80% 70%, light-dark(oklch(96% 0.03 140 / 40%), oklch(14% 0.06 140 / 20%)), transparent 55%);
    z-index: -1;
    pointer-events: none;
  }

  .login-wrapper {
    max-width: 440px;
    margin: 8vh auto 0;
    position: relative;
  }

  .login-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 0 4px;
  }

  .login-panel {
    background: light-dark(rgba(255, 255, 255, 0.7), rgba(24, 25, 28, 0.7));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.08));
    border-radius: 16px;
    padding: 32px;
    box-shadow: var(--shadow);
  }

  .login-header-content {
    margin-bottom: 24px;
  }

  .error-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--red-bg);
    color: var(--red-text);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
    border: 1px solid light-dark(oklch(90% 0.05 20), oklch(35% 0.06 20));
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    min-height: auto;
    border-radius: 50%;
    background-color: var(--panel);
    color: var(--text-muted);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    transition: color 0.2s, background-color 0.2s, border-color 0.2s;
  }
  .theme-toggle:hover {
    color: var(--text);
    background-color: var(--bg);
  }
  .theme-toggle svg {
    transition: transform 0.3s ease;
  }
  .theme-toggle:active svg {
    transform: rotate(15deg) scale(0.9);
  }

  .theme-toggle .sun { display: none; }
  .theme-toggle .moon { display: block; }

  :root[data-theme="dark"] .theme-toggle .sun { display: block; }
  :root[data-theme="dark"] .theme-toggle .moon { display: none; }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle .sun { display: block; }
    :root:not([data-theme="light"]) .theme-toggle .moon { display: none; }
  }

  .detail-grid {
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
    gap: 24px;
  }

  .detail-main-column, .detail-sidebar-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .detail-grid .panel { width: 100%; margin: 0; }

  .print-options-list {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 16px 20px;
    margin: 0;
  }
  .print-options-list dt {
    color: var(--text-muted);
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
  }
  .print-options-list dd {
    margin: 0;
    font-weight: 700;
    color: var(--text);
    font-size: 15px;
  }

  .amount {
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1.1;
  }

  .status-wrapper {
    margin: 12px 0 24px;
  }

  .payment-meta {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--line);
    padding-top: 20px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .meta-label {
    color: var(--text-muted);
    font-weight: 600;
  }

  .payment-link-anchor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }

  .pickup-code-box {
    background-color: var(--accent-subtle);
    border: 1px dashed var(--accent);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }
  .pickup-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pickup-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 0.05em;
  }

  .file-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .file-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px 16px;
    background-color: light-dark(oklch(99.5% 0 0), oklch(20% 0.01 250));
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .file-list li:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }

  .file-info-group {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background-color: var(--bg);
    color: var(--accent);
    flex-shrink: 0;
  }
  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .file-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-subtext {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px !important;
    border: 1px dashed var(--line) !important;
    background: transparent !important;
    color: var(--text-muted);
  }
  .empty-state svg {
    opacity: 0.5;
  }

  .actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
  .actions form { margin: 0; width: 100%; }
  .actions button {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
    background-color: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
  }
  .actions button:hover {
    background-color: var(--panel);
    border-color: var(--accent);
    color: var(--accent);
  }

  .actions button.success-btn {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: transparent;
  }
  .actions button.success-btn:hover {
    background-color: light-dark(oklch(91% 0.06 140), oklch(30% 0.08 140));
    color: var(--green-text);
  }

  .actions button.danger-btn {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: transparent;
  }
  .actions button.danger-btn:hover {
    background-color: light-dark(oklch(91% 0.06 20), oklch(30% 0.08 20));
    color: var(--red-text);
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: light-dark(oklch(70% 0 0), oklch(40% 0 0));
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 9999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid transparent;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .status-payment_link_sent, .status-payment_pending, .status-quote_ready, .status-awaiting_file, .status-awaiting_details {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: light-dark(oklch(90% 0.05 80), oklch(35% 0.06 80));
  }
  .status-payment_link_sent .status-dot, .status-payment_pending .status-dot, .status-quote_ready .status-dot, .status-awaiting_file .status-dot, .status-awaiting_details .status-dot {
    background-color: var(--amber-text);
  }

  .status-paid, .status-shop_notified, .status-ready_for_pickup, .status-completed {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: light-dark(oklch(88% 0.06 140), oklch(33% 0.08 140));
  }
  .status-paid .status-dot, .status-shop_notified .status-dot, .status-ready_for_pickup .status-dot, .status-completed .status-dot {
    background-color: var(--green-text);
  }

  .status-printing, .status-accepted {
    background-color: var(--blue-bg);
    color: var(--blue-text);
    border-color: light-dark(oklch(88% 0.06 240), oklch(33% 0.08 240));
  }
  .status-printing .status-dot, .status-accepted .status-dot {
    background-color: var(--blue-text);
  }

  .status-cancelled, .status-failed {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: light-dark(oklch(88% 0.06 20), oklch(33% 0.08 20));
  }
  .status-cancelled .status-dot, .status-failed .status-dot {
    background-color: var(--red-text);
  }

  .payment-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: var(--bg);
    border: 1px solid var(--line);
  }
  .payment-captured, .payment-succeeded, .payment-paid {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: transparent;
  }
  .payment-pending {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: transparent;
  }
  .payment-failed {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: transparent;
  }

  @media (max-width: 840px) {
    body { padding: 24px 16px; }
    .toolbar { flex-direction: column; align-items: stretch; gap: 16px; margin-bottom: 24px; }
    .brand { justify-content: space-between; }
    .toolbar-actions { gap: 10px; justify-content: flex-end; }
    .detail-grid { grid-template-columns: 1fr; gap: 20px; }
    table { font-size: 13px; }
    th, td { padding: 12px 14px; }
    .print-options-list { grid-template-columns: 110px 1fr; gap: 12px 16px; }
    .actions { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 580px) {
    .brand h1 { font-size: 20px; }
    .logo { font-size: 16px; }
    .brand .divider { height: 18px; }
    table, thead, tbody, tr, th, td { display: block; }
    thead { display: none; }
    tr { border-bottom: 1px solid var(--line); padding: 14px 6px; position: relative; }
    td { border: 0; padding: 6px 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    td::before {
      content: attr(data-label);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    td.actions-cell::before { content: none; }
    td.actions-cell { justify-content: flex-end; margin-top: 8px; }
    .file-list li { flex-direction: column; align-items: stretch; gap: 12px; }
    .download-btn { width: 100%; }
    .actions { grid-template-columns: 1fr; }
  }
`;
