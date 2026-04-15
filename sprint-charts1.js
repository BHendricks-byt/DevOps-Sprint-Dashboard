/**
 * sprint-charts.js — DevOps Sprint Dashboard
 *
 * Data is pre-fetched via the Atlassian MCP and baked in below.
 * No browser API calls are made, so there are no CORS issues.
 *
 * To refresh: ask Claude to regenerate this file ("update sprint charts").
 * Claude will re-query Jira via MCP and produce a new version of this file.
 *
 * Generated: 2026-04-15
 */

(function () {
  // ── Baked-in data (refreshed via Claude + Atlassian MCP) ──────────────
  const CHART_DATA = {
    generatedAt: "2026-04-15",
    velocity: {
      labels: ["2026-W13", "2026-W14", "2026-W15", "2026-W16"],
      values: [76, 0, 0, 0],
      avg: 19,
      unit: "SP"
    },
    burndown: {
      sprintName: "DevOps Team Sprint 0",
      sprintStart: "2026-04-07",
      sprintEnd:   "2026-04-20",
      total: 1,
      unit: "issues",
      labels: ["07 Apr","08 Apr","09 Apr","10 Apr","11 Apr","12 Apr","13 Apr","14 Apr","15 Apr"],
      ideal:  [1.03, 0.95, 0.88, 0.80, 0.72, 0.64, 0.57, 0.49, 0.41],
      actual: [1,    1,    1,    1,    1,    1,    1,    1,    1]
    }
  };

  // ── Load Chart.js, then render ─────────────────────────────────────────
  function loadScript(src, cb) {
    if (window.Chart) { cb(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  function init() {
    injectStyles();
    injectHTML();
    renderVelocity(CHART_DATA.velocity);
    renderBurndown(CHART_DATA.burndown);
  }

  // ── Styles ─────────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #sprint-charts-wrapper {
        margin: 32px 16px;
      }
      #sprint-charts-wrapper h2 {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: var(--text-muted, #7b82a0);
        margin: 0 0 16px;
      }
      .sc-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      @media (max-width: 860px) { .sc-row { grid-template-columns: 1fr; } }
      .sc-card {
        background: var(--card-bg, #1a1d2e);
        border: 1px solid var(--border, #2a2d40);
        border-radius: 10px;
        padding: 18px 20px 14px;
      }
      .sc-card-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--text-muted, #7b82a0);
        margin: 0 0 2px;
      }
      .sc-card-sub {
        font-size: 11px;
        color: var(--text-muted, #7b82a0);
        margin: 0 0 14px;
        opacity: .8;
      }
      .sc-legend {
        display: flex;
        gap: 16px;
        margin-bottom: 10px;
      }
      .sc-legend span {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: var(--text-muted, #7b82a0);
      }
      .sc-legend i {
        display: inline-block;
        width: 10px; height: 10px;
        border-radius: 2px;
      }
      .sc-card canvas { max-height: 200px; }
      .sc-generated {
        font-size: 10px;
        color: var(--text-muted, #7b82a0);
        opacity: .5;
        text-align: right;
        margin-top: 6px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── HTML ───────────────────────────────────────────────────────────────
  function injectHTML() {
    const wrap = document.createElement('div');
    wrap.id = 'sprint-charts-wrapper';
    wrap.innerHTML = `
      <h2>Sprint Analytics</h2>
      <div class="sc-row">
        <div class="sc-card">
          <p class="sc-card-title">Team Velocity</p>
          <p class="sc-card-sub" id="sc-vel-sub"></p>
          <canvas id="sc-velocity"></canvas>
        </div>
        <div class="sc-card">
          <p class="sc-card-title">Sprint Burndown</p>
          <p class="sc-card-sub" id="sc-burn-sub"></p>
          <div class="sc-legend">
            <span><i style="background:#4ade80;opacity:.7"></i>Ideal</span>
            <span><i style="background:#f472b6"></i>Actual</span>
          </div>
          <canvas id="sc-burndown"></canvas>
        </div>
      </div>
      <p class="sc-generated">Data as of ${CHART_DATA.generatedAt} · refresh via Claude</p>
    `;

    const tableSection = document.querySelector('table')?.closest('section');
    if (tableSection) {
      tableSection.parentNode.insertBefore(wrap, tableSection);
    } else {
      (document.querySelector('main') || document.body).appendChild(wrap);
    }
  }

  // ── Velocity chart ─────────────────────────────────────────────────────
  function renderVelocity(d) {
    document.getElementById('sc-vel-sub').textContent =
      `Story points completed by week · avg ${d.avg} ${d.unit}`;

    new Chart(document.getElementById('sc-velocity'), {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [
          {
            label: `Completed (${d.unit})`,
            data: d.values,
            backgroundColor: 'rgba(96,165,250,0.65)',
            borderColor: 'rgba(96,165,250,1)',
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: `Avg (${d.avg} ${d.unit})`,
            data: d.values.map(() => d.avg),
            type: 'line',
            borderColor: 'rgba(251,191,36,0.75)',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Math.round(c.raw)}` } }
        },
        scales: {
          x: { ticks: { color: '#7b82a0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { beginAtZero: true, ticks: { color: '#7b82a0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // ── Burndown chart ─────────────────────────────────────────────────────
  function renderBurndown(d) {
    document.getElementById('sc-burn-sub').textContent =
      `${d.sprintName} · ${d.total} ${d.unit} total`;

    new Chart(document.getElementById('sc-burndown'), {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          {
            label: 'Ideal',
            data: d.ideal,
            borderColor: 'rgba(74,222,128,0.65)',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Actual remaining',
            data: d.actual,
            borderColor: 'rgba(244,114,182,1)',
            backgroundColor: 'rgba(244,114,182,0.07)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(244,114,182,1)',
            fill: true,
            tension: 0.25,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} ${d.unit}` } }
        },
        scales: {
          x: { ticks: { color: '#7b82a0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { beginAtZero: true, ticks: { color: '#7b82a0', font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  loadScript(
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    init
  );
})();
