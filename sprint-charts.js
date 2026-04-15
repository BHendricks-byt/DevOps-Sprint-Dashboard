/**
 * sprint-charts.js
 * Adds Velocity and Sprint Burndown charts to the DevOps Sprint Dashboard.
 *
 * HOW TO USE:
 *   1. Copy this file into your repo (same folder as index.html).
 *   2. In index.html, add the following BEFORE the closing </body> tag:
 *
 *        <script src="sprint-charts.js"></script>
 *
 *   3. Add the two chart containers somewhere in your <body> HTML
 *      (e.g. after the "Team workload" section):
 *
 *        <section id="velocity-section" class="chart-section">
 *          <h2>Team Velocity</h2>
 *          <canvas id="velocityChart"></canvas>
 *        </section>
 *
 *        <section id="burndown-section" class="chart-section">
 *          <h2>Sprint Burndown — <span id="burndown-sprint-name"></span></h2>
 *          <canvas id="burndownChart"></canvas>
 *        </section>
 *
 *   Chart.js is loaded automatically by this script.
 *   The script reads from the same Atlassian MCP proxy the dashboard uses.
 *
 * DATA STRATEGY:
 *   - Velocity: groups all AWI issues by resolution week/sprint, sums story
 *     points (customfield_10016) completed. Falls back to issue count when
 *     story points are absent.
 *   - Burndown: uses the active sprint (customfield_10020 state=active).
 *     Plots total issues/SP at sprint start vs. a daily ideal line vs.
 *     actual remaining (issues not Done) per day since sprint start.
 *     Because Jira's REST API doesn't expose per-day snapshots without
 *     the Analytics add-on, we reconstruct the burndown from issue
 *     resolution dates within the sprint window.
 */

(async function () {
  // ─── 0. Load Chart.js if not already present ───────────────────────────
  if (!window.Chart) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ─── 1. Inject CSS for the chart sections ─────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .sprint-charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin: 32px 0;
    }
    @media (max-width: 900px) {
      .sprint-charts-row { grid-template-columns: 1fr; }
    }
    .sprint-chart-card {
      background: var(--card-bg, #1e2130);
      border: 1px solid var(--border, #2d3147);
      border-radius: 12px;
      padding: 20px 24px 16px;
    }
    .sprint-chart-card h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--text-muted, #7b82a0);
    }
    .sprint-chart-card .chart-subtitle {
      font-size: 12px;
      color: var(--text-muted, #7b82a0);
      margin: 0 0 16px;
    }
    .sprint-chart-card canvas {
      max-height: 220px;
    }
    .chart-legend-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted, #7b82a0);
      margin-right: 14px;
    }
    .chart-legend-pill span {
      width: 10px; height: 10px; border-radius: 2px; display: inline-block;
    }
    #sprint-charts-loading {
      color: var(--text-muted, #7b82a0);
      font-size: 13px;
      text-align: center;
      padding: 24px 0;
    }
  `;
  document.head.appendChild(style);

  // ─── 2. Inject HTML containers ─────────────────────────────────────────
  // Insert after the first <section> or at end of main/body
  const anchor =
    document.querySelector('main') ||
    document.querySelector('.dashboard-content') ||
    document.querySelector('.charts') ||
    document.body;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="sprint-charts-loading">Loading velocity &amp; burndown&hellip;</div>
    <div class="sprint-charts-row" id="sprint-charts-row" style="display:none">
      <div class="sprint-chart-card">
        <h3>Team Velocity</h3>
        <p class="chart-subtitle" id="velocity-subtitle">Story points completed per sprint</p>
        <canvas id="velocityChart"></canvas>
      </div>
      <div class="sprint-chart-card">
        <h3>Sprint Burndown</h3>
        <p class="chart-subtitle" id="burndown-subtitle">Current sprint: —</p>
        <div style="margin-bottom:8px">
          <span class="chart-legend-pill"><span style="background:#4ade80"></span>Ideal</span>
          <span class="chart-legend-pill"><span style="background:#f472b6"></span>Actual</span>
        </div>
        <canvas id="burndownChart"></canvas>
      </div>
    </div>
  `;
  anchor.appendChild(wrapper);

  // ─── 3. Fetch all AWI issues via the Atlassian REST API ────────────────
  // The dashboard runs in the browser under the user's Atlassian session,
  // so we hit the Atlassian REST API directly (same origin auth).
  const CLOUD   = 'ecentive.atlassian.net';
  const PROJECT = 'AWI';
  const API     = `https://api.atlassian.com/ex/jira/6dbe0c12-2050-4a9f-bd70-7cec897e794d/rest/api/3`;
  const FIELDS  = 'summary,status,customfield_10016,customfield_10020,resolutiondate,created';

  async function jqlSearch(jql, startAt = 0, maxResults = 100) {
    const url = `${API}/search?jql=${encodeURIComponent(jql)}&fields=${FIELDS}&startAt=${startAt}&maxResults=${maxResults}`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`Jira API error: ${r.status}`);
    return r.json();
  }

  async function fetchAllIssues(jql) {
    let issues = [], startAt = 0;
    while (true) {
      const data = await jqlSearch(jql, startAt, 100);
      issues = issues.concat(data.issues);
      if (issues.length >= data.total || data.isLast) break;
      startAt += 100;
    }
    return issues;
  }

  // ─── 4. Build velocity data ────────────────────────────────────────────
  /**
   * Groups resolved issues by sprint name (customfield_10020).
   * Falls back to grouping by ISO week of resolution date when sprint info
   * is absent (older issues that were resolved before Sprint 0 was created).
   */
  function buildVelocityData(issues) {
    const buckets = {}; // label → { sp, count }

    for (const issue of issues) {
      if (!issue.fields.resolutiondate) continue; // not done

      const sprints = issue.fields.customfield_10020;
      let label;

      if (sprints && sprints.length > 0) {
        // Use the sprint the issue was in when resolved
        const resolved = sprints.find(s => s.state === 'closed') ||
                         sprints.find(s => s.state === 'active') ||
                         sprints[0];
        label = resolved.name;
      } else {
        // Group by resolution week — ISO week string like "2026-W12"
        const d = new Date(issue.fields.resolutiondate);
        const jan4 = new Date(d.getFullYear(), 0, 4);
        const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
        label = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      }

      if (!buckets[label]) buckets[label] = { sp: 0, count: 0, hasAnyPoints: false };
      const sp = issue.fields.customfield_10016;
      buckets[label].count++;
      if (sp != null) {
        buckets[label].sp += sp;
        buckets[label].hasAnyPoints = true;
      }
    }

    // Sort chronologically
    const labels = Object.keys(buckets).sort();
    const anyPoints = labels.some(l => buckets[l].hasAnyPoints);
    const values = labels.map(l => anyPoints ? buckets[l].sp : buckets[l].count);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

    return { labels, values, avg, unit: anyPoints ? 'SP' : 'issues' };
  }

  // ─── 5. Build burndown data ────────────────────────────────────────────
  /**
   * For the active sprint:
   *  - total = all issues in sprint (SP sum or count)
   *  - ideal line: linear from total → 0 over sprint days
   *  - actual line: for each day from sprint start to today,
   *    count remaining = total minus resolved-by-that-day
   */
  function buildBurndownData(sprintIssues, sprint) {
    const start = new Date(sprint.startDate);
    const end   = new Date(sprint.endDate);
    const today = new Date();
    const cutoff = today < end ? today : end;

    const totalSP = sprintIssues.reduce((sum, i) => sum + (i.fields.customfield_10016 || 0), 0);
    const usePoints = totalSP > 0;
    const total = usePoints
      ? totalSP
      : sprintIssues.length;

    // Build day-by-day labels and actual remaining
    const days = [];
    let d = new Date(start);
    d.setHours(0, 0, 0, 0);
    while (d <= cutoff) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    const totalDays = Math.round((end - start) / 86400000);

    const idealData = days.map((day, i) => {
      const elapsed = Math.round((day - start) / 86400000);
      return Math.max(0, total - (total * elapsed / totalDays));
    });

    const actualData = days.map(day => {
      const endOfDay = new Date(day);
      endOfDay.setHours(23, 59, 59, 999);
      let done = 0;
      for (const issue of sprintIssues) {
        if (!issue.fields.resolutiondate) continue;
        const resolved = new Date(issue.fields.resolutiondate);
        if (resolved <= endOfDay) {
          done += usePoints ? (issue.fields.customfield_10016 || 0) : 1;
        }
      }
      return Math.max(0, total - done);
    });

    const labels = days.map(day => {
      return day.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    });

    return { labels, idealData, actualData, total, unit: usePoints ? 'SP' : 'issues', sprint };
  }

  // ─── 6. Render charts ──────────────────────────────────────────────────
  function renderVelocity(data) {
    const ctx = document.getElementById('velocityChart');
    if (!ctx) return;

    document.getElementById('velocity-subtitle').textContent =
      `${data.unit} completed per sprint · avg ${data.avg} ${data.unit}`;

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: `Completed (${data.unit})`,
            data: data.values,
            backgroundColor: data.values.map(() => 'rgba(96, 165, 250, 0.75)'),
            borderColor: 'rgba(96, 165, 250, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: `Avg (${data.avg} ${data.unit})`,
            data: data.values.map(() => data.avg),
            type: 'line',
            borderColor: 'rgba(251, 191, 36, 0.8)',
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
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.raw)} ${data.unit}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#7b82a0', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#7b82a0', font: { size: 10 }, stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  function renderBurndown(data) {
    const ctx = document.getElementById('burndownChart');
    if (!ctx) return;

    document.getElementById('burndown-subtitle').textContent =
      `${data.sprint.name} · ${data.total} ${data.unit} total`;

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Ideal',
            data: data.idealData,
            borderColor: 'rgba(74, 222, 128, 0.7)',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Actual remaining',
            data: data.actualData,
            borderColor: 'rgba(244, 114, 182, 1)',
            backgroundColor: 'rgba(244, 114, 182, 0.08)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(244, 114, 182, 1)',
            fill: true,
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.raw)} ${data.unit}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#7b82a0', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#7b82a0', font: { size: 10 }, stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  // ─── 7. Main ───────────────────────────────────────────────────────────
  try {
    // Fetch all issues (for velocity history)
    const allIssues = await fetchAllIssues(`project = ${PROJECT} ORDER BY created ASC`);

    // Find active sprint info from any issue that has it
    let activeSprint = null;
    let sprintIssues = [];
    for (const issue of allIssues) {
      const sprints = issue.fields.customfield_10020;
      if (sprints) {
        const active = sprints.find(s => s.state === 'active');
        if (active) {
          activeSprint = active;
          sprintIssues.push(issue);
        }
      }
    }

    // Velocity — all resolved issues grouped
    const velocityData = buildVelocityData(allIssues);

    // Burndown — only if we have an active sprint
    let burndownData = null;
    if (activeSprint) {
      burndownData = buildBurndownData(sprintIssues, activeSprint);
    }

    // Show charts
    document.getElementById('sprint-charts-loading').style.display = 'none';
    document.getElementById('sprint-charts-row').style.display = 'grid';

    if (velocityData.labels.length > 0) {
      renderVelocity(velocityData);
    } else {
      document.getElementById('velocityChart').parentElement.innerHTML +=
        '<p style="color:#7b82a0;font-size:13px">No resolved issues found yet.</p>';
    }

    if (burndownData && activeSprint) {
      renderBurndown(burndownData);
    } else {
      document.getElementById('burndownChart').parentElement.innerHTML +=
        '<p style="color:#7b82a0;font-size:13px">No active sprint found.</p>';
    }

  } catch (err) {
    console.error('[sprint-charts] Error:', err);
    document.getElementById('sprint-charts-loading').textContent =
      '⚠ Could not load sprint charts. Check console for details.';
  }
})();
