import { api } from '../api.js';
import { getState, setState } from '../state.js';
import { formatCurrency, formatMonthLabel, addMonths, el } from '../utils.js';
import { drawTrendChart, drawCategoryBars, drawCategoryPie, drawForecastChart } from '../charts.js';

let container;
let resizeHandler;
const CATEGORY_CHART_KEY = 'finance-category-chart-view';

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
  const results = await Promise.allSettled([
    api.get(`/dashboard/summary?month=${month}`),
    api.get('/dashboard/trend?months=6'),
    api.get('/dashboard/forecast?months=6'),
  ]);
  const failedSections = [];
  if (results[0].status === 'rejected') failedSections.push('resumo');
  if (results[1].status === 'rejected') failedSections.push('tendência');
  if (results[2].status === 'rejected') failedSections.push('previsão');

  const summary = results[0].status === 'fulfilled' ? results[0].value : {
    netWorth: 0,
    availableBalance: 0,
    creditCardDebt: 0,
    income: 0,
    expense: 0,
    net: 0,
    savingsRate: 0,
    uncategorizedCount: 0,
    spendingByCategory: [],
    alerts: [],
  };
  const trend = results[1].status === 'fulfilled' ? results[1].value : [];
  const forecast = results[2].status === 'fulfilled' ? results[2].value : [];

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

  if (failedSections.length > 0) {
    container.appendChild(el(`
      <div class="alert-card warning" role="status">
        <div><strong>Alguns dados estão temporariamente indisponíveis</strong><span>Não foi possível carregar: ${failedSections.join(', ')}. As demais áreas continuam funcionando.</span></div>
      </div>
    `));
  }

  const stats = el(`
    <div data-widget="summary">
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
    const alerts = el('<div class="alerts-list" data-widget="alerts"></div>');
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

  const savedCategoryChart = localStorage.getItem(CATEGORY_CHART_KEY);
  let categoryChartView = savedCategoryChart === 'pie' ? 'pie' : 'bar';
  const hasCategorySpending = summary.spendingByCategory.length > 0;
  const categorySectionTitle = el(`
    <div class="section-title category-chart-heading" data-widget="categories">
      <h2>Gastos por categoria</h2>
      ${hasCategorySpending ? `
        <div class="chart-view-toggle" role="group" aria-label="Tipo do gráfico de gastos por categoria">
          <button type="button" data-chart-view="bar" aria-pressed="${categoryChartView === 'bar'}">Colunas</button>
          <button type="button" data-chart-view="pie" aria-pressed="${categoryChartView === 'pie'}">Pizza</button>
        </div>
      ` : ''}
    </div>
  `);
  container.appendChild(categorySectionTitle);
  const catCard = el(`
    <div class="card category-chart-card" data-widget="categories">
      <canvas class="chart" id="category-chart"></canvas>
      <div class="category-chart-legend" id="category-chart-legend" aria-label="Legenda do gráfico"></div>
    </div>
  `);
  container.appendChild(catCard);
  if (!hasCategorySpending) {
    catCard.innerHTML = '<div class="empty-state">Nenhum gasto categorizado neste mês.</div>';
  }

  container.appendChild(el(`<div class="section-title" data-widget="trend"><h2>Tendência (6 meses)</h2></div>`));
  const trendCard = el(`
    <div class="card" data-widget="trend">
      <canvas class="chart" id="trend-chart"></canvas>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--text-muted);">
        <span><span class="dot" style="background:#22c55e"></span> Receitas</span>
        <span><span class="dot" style="background:#f87171"></span> Despesas</span>
      </div>
    </div>
  `);
  container.appendChild(trendCard);

  container.appendChild(el(`<div class="section-title" data-widget="forecast"><h2>Previsão dos próximos meses</h2><a href="/recurring.php">Ajustar recorrências</a></div>`));
  const forecastCard = el(`
    <div class="card" data-widget="forecast">
      <canvas class="chart" id="forecast-chart"></canvas>
      <p class="hint">Projeção baseada em parcelas futuras, lançamentos agendados e recorrências cadastradas.</p>
    </div>
  `);
  container.appendChild(forecastCard);

  container.appendChild(el(`
    <div class="quick-actions" data-widget="quick">
      <a href="/cards.php"><strong>Cartões</strong><span>Faturas, limites e parcelas</span></a>
      <a href="/budgets.php"><strong>Orçamentos</strong><span>Acompanhe seus limites</span></a>
      <a href="/goals.php"><strong>Metas</strong><span>Planeje suas conquistas</span></a>
      <a href="/transactions-import.php"><strong>Importar OFX</strong><span>Atualize seu extrato</span></a>
    </div>
  `));

  const hiddenWidgets = new Set(JSON.parse(localStorage.getItem('finance-hidden-widgets') || '[]'));
  container.querySelectorAll('[data-widget]').forEach((element) => {
    element.hidden = hiddenWidgets.has(element.dataset.widget);
  });

  const categoryItems = [...summary.spendingByCategory]
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({ categoryName: c.categoryName, color: c.color, amount: Number(c.amount) }));

  function paintCategoryChart() {
    const catCanvas = document.getElementById('category-chart');
    if (!catCanvas || categoryItems.length === 0) return;

    const legend = document.getElementById('category-chart-legend');
    const isPie = categoryChartView === 'pie';
    catCanvas.style.height = isPie ? '280px' : `${Math.max(120, categoryItems.length * 30)}px`;
    catCanvas.setAttribute('aria-label', isPie ? 'Gráfico de pizza dos gastos por categoria' : 'Gráfico de colunas dos gastos por categoria');

    if (legend) {
      legend.hidden = !isPie;
      if (isPie) {
        const total = categoryItems.reduce((sum, item) => sum + item.amount, 0);
        legend.innerHTML = categoryItems.map((item) => `
          <div class="category-legend-item">
            <span class="dot" style="background:${item.color || '#38bdf8'}"></span>
            <span class="category-legend-name">${escapeHtml(item.categoryName)}</span>
            <strong>${total > 0 ? Math.round((item.amount / total) * 100) : 0}%</strong>
            <small>${formatCurrency(item.amount)}</small>
          </div>
        `).join('');
      }
    }

    if (isPie) drawCategoryPie(catCanvas, categoryItems);
    else drawCategoryBars(catCanvas, categoryItems);
  }

  function updateCategoryToggle() {
    categorySectionTitle.querySelectorAll('[data-chart-view]').forEach((button) => {
      const active = button.dataset.chartView === categoryChartView;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
    });
  }

  categorySectionTitle.querySelectorAll('[data-chart-view]').forEach((button) => {
    button.addEventListener('click', () => {
      categoryChartView = button.dataset.chartView === 'pie' ? 'pie' : 'bar';
      localStorage.setItem(CATEGORY_CHART_KEY, categoryChartView);
      updateCategoryToggle();
      paintCategoryChart();
    });
  });
  updateCategoryToggle();

  function paintCharts() {
    paintCategoryChart();
    const trendCanvas = document.getElementById('trend-chart');
    if (trendCanvas) drawTrendChart(trendCanvas, trend);
    const forecastCanvas = document.getElementById('forecast-chart');
    if (forecastCanvas) drawForecastChart(forecastCanvas, forecast);
  }

  paintCharts();
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
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
