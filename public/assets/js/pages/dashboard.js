import { api } from '../api.js';
import { getState, setState } from '../state.js';
import { formatCurrency, formatMonthLabel, addMonths, el } from '../utils.js';
import { drawTrendChart, drawCategoryBars } from '../charts.js';

let container;
let resizeHandler;

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  await load();
}

async function load() {
  const month = getState().selectedMonth;
  let summary, trend;
  try {
    [summary, trend] = await Promise.all([
      api.get(`/dashboard/summary?month=${month}`),
      api.get('/dashboard/trend?months=6'),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar dashboard: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';

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
    <div class="stat-grid">
      <div class="stat-card"><div class="value">${formatCurrency(summary.totalBalance)}</div><div class="label">Saldo total</div></div>
      <div class="stat-card"><div class="value" style="color:var(--income)">${formatCurrency(summary.income)}</div><div class="label">Receitas</div></div>
      <div class="stat-card"><div class="value" style="color:var(--expense)">${formatCurrency(summary.expense)}</div><div class="label">Despesas</div></div>
    </div>
  `);
  container.appendChild(stats);

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
  }

  paintCharts();
  resizeHandler = () => paintCharts();
  window.addEventListener('resize', resizeHandler);
}

export function destroy() {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
}
