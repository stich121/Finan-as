import { api } from '../api.js';
import { getState, setState } from '../state.js';
import { formatCurrency, formatMonthLabel, addMonths, el } from '../utils.js';
import { drawTrendChart, drawCategoryBars, drawForecastChart } from '../charts.js';

let container;
let resizeHandler;

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  await load();
}

async function load() {
  const month = getState().selectedMonth;
  let summary, trend, forecast;
  try {
    [summary, trend, forecast] = await Promise.all([
      api.get(`/dashboard/summary?month=${month}`),
      api.get('/dashboard/trend?months=6'),
      api.get('/dashboard/forecast?months=6'),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar dashboard: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  maybeNotify(summary.alerts);

  const picker = el(`
    <div class="month-picker">
      <button id="prev-month">‹</button>
      <div class="label">${formatMonthLabel(month)}</div>
      <button id="next-month">›</button>
    </div>
  `);
  container.appendChild(picker);
  picker.querySelector('#prev-month').addEventListener('click', () => { setState({ selectedMonth: addMonths(month, -1) }); load(); });
  picker.querySelector('#next-month').addEventListener('click', () => { setState({ selectedMonth: addMonths(month, 1) }); load(); });

  const stats = el(`
    <div>
      <div class="finance-hero">
        <div class="hero-balance"><span>Patrimônio líquido</span><strong>${formatCurrency(summary.netWorth)}</strong><small>Saldo ${formatCurrency(summary.availableBalance)} · Cartões ${formatCurrency(summary.creditCardDebt)}</small></div>
        <a href="/reports.php" class="btn small secondary">Ver relatório</a>
      </div>
      <div class="stat-grid dashboard-stats">
        <div class="stat-card"><div class="value" style="color:var(--income)">${formatCurrency(summary.income)}</div><div class="label">Receitas</div></div>
        <div class="stat-card"><div class="value" style="color:var(--expense)">${formatCurrency(summary.expense)}</div><div class="label">Despesas</div></div>
        <div class="stat-card"><div class="value">${formatCurrency(summary.net)}</div><div class="label">Resultado</div></div>
        <div class="stat-card"><div class="value">${summary.savingsRate}%</div><div class="label">Economia</div></div>
      </div>
    </div>
  `);
  container.appendChild(stats);

  if (summary.alerts.length > 0 || summary.uncategorizedCount > 0) {
    container.appendChild(el('<div class="section-title"><h2>Para cuidar agora</h2></div>'));
    const alerts = el('<div class="alerts-list"></div>');
    summary.alerts.forEach((alert) => {
      alerts.appendChild(el(`
        <a href="${alert.href}" class="alert-card ${alert.kind}">
          <div><strong>${escapeHtml(alert.title)}</strong><span>${escapeHtml(alert.message)}</span></div>
          <b>${formatCurrency(alert.amount)}</b>
        </a>
      `));
    });
    if (summary.uncategorizedCount > 0) {
      alerts.appendChild(el(`
        <a href="/transactions.php" class="alert-card">
          <div><strong>Organize seus lançamentos</strong><span>${summary.uncategorizedCount} despesa(s) sem categoria neste mês</span></div>
          <b>Revisar</b>
        </a>
      `));
    }
    container.appendChild(alerts);
  }

  container.appendChild(el(`
    <div class="section-title"><h2>Gasto por categoria</h2></div>
  `));
  const catCard = el(`<div class="card"><canvas class="chart" id="category-chart" style="height:${Math.max(120, summary.spendingByCategory.length * 30)}px"></canvas></div>`);
  container.appendChild(catCard);
  if (summary.spendingByCategory.length === 0) {
    catCard.innerHTML = '<div class="empty-state">Nenhum gasto categorizado neste mês.</div>';
  }

  container.appendChild(el(`<div class="section-title"><h2>Tendência (6 meses)</h2></div>`));
  const trendCard = el(`
    <div class="card">
      <canvas class="chart" id="trend-chart"></canvas>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--text-muted);">
        <span><span class="dot" style="background:#22c55e"></span> Receitas</span>
        <span><span class="dot" style="background:#f87171"></span> Despesas</span>
      </div>
    </div>
  `);
  container.appendChild(trendCard);

  container.appendChild(el(`<div class="section-title"><h2>Previsão dos próximos meses</h2><a href="/recurring.php">Ajustar recorrências</a></div>`));
  const forecastCard = el(`
    <div class="card">
      <canvas class="chart" id="forecast-chart"></canvas>
      <p class="hint">Projeção baseada em parcelas futuras, lançamentos agendados e recorrências cadastradas.</p>
    </div>
  `);
  container.appendChild(forecastCard);

  container.appendChild(el(`
    <div class="quick-actions">
      <a href="/cards.php"><strong>Cartões</strong><span>Faturas, limites e parcelas</span></a>
      <a href="/budgets.php"><strong>Orçamentos</strong><span>Acompanhe seus limites</span></a>
      <a href="/goals.php"><strong>Metas</strong><span>Planeje suas conquistas</span></a>
      <a href="/transactions-import.php"><strong>Importar OFX</strong><span>Atualize seu extrato</span></a>
    </div>
  `));

  function paintCharts() {
    const catCanvas = document.getElementById('category-chart');
    if (catCanvas && summary.spendingByCategory.length > 0) {
      drawCategoryBars(
        catCanvas,
        [...summary.spendingByCategory].sort((a, b) => b.amount - a.amount).map((c) => ({ categoryName: c.categoryName, color: c.color, amount: c.amount }))
      );
    }
    const trendCanvas = document.getElementById('trend-chart');
    if (trendCanvas) drawTrendChart(trendCanvas, trend);
    const forecastCanvas = document.getElementById('forecast-chart');
    if (forecastCanvas) drawForecastChart(forecastCanvas, forecast);
  }

  paintCharts();
  resizeHandler = () => paintCharts();
  window.addEventListener('resize', resizeHandler);
}

function maybeNotify(alerts) {
  if (!alerts.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (localStorage.getItem('finance-notifications') !== 'enabled') return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('finance-last-notification') === today) return;
  const urgent = alerts.find((alert) => alert.kind === 'danger') || alerts[0];
  try {
    new Notification(urgent.title, {
      body: urgent.message,
      icon: '/icons/icon-192.png',
      tag: 'finance-daily-alert',
    });
    localStorage.setItem('finance-last-notification', today);
  } catch {
    /* Alguns navegadores móveis exigem notificação via push/service worker. */
  }
}

export function destroy() {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
}
