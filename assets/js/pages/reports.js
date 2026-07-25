import { api } from '../api.js';
import { drawTrendChart, drawCategoryBars } from '../charts.js';
import { formatCurrency, el } from '../utils.js';

let container;
let resizeHandler;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

export async function render(root) {
  container = root;
  container.innerHTML = `
    <div class="section-title"><h2>Análise financeira</h2></div>
    <div class="card report-filter">
      <div class="field"><label>De</label><input id="report-from" type="date" value="${yearStart()}"></div>
      <div class="field"><label>Até</label><input id="report-to" type="date" value="${today()}"></div>
      <button class="btn small" id="report-apply">Atualizar</button>
      <a class="btn small secondary" id="report-export">Exportar CSV</a>
      <a class="btn small secondary" href="/api/reports/backup">Backup JSON</a>
    </div>
    <div id="report-content"></div>
  `;
  container.querySelector('#report-apply').addEventListener('click', load);
  await load();
}

async function load() {
  const from = container.querySelector('#report-from').value;
  const to = container.querySelector('#report-to').value;
  const content = container.querySelector('#report-content');
  container.querySelector('#report-export').href = `/api/reports/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  content.innerHTML = '<div class="spinner">Analisando seus dados…</div>';

  try {
    const report = await api.get(`/reports/overview?from=${from}&to=${to}`);
    content.innerHTML = `
      <div class="stat-grid report-stats">
        <div class="stat-card"><div class="value income">${formatCurrency(report.summary.income)}</div><div class="label">Receitas</div></div>
        <div class="stat-card"><div class="value expense">${formatCurrency(report.summary.expense)}</div><div class="label">Despesas</div></div>
        <div class="stat-card"><div class="value">${formatCurrency(report.summary.net)}</div><div class="label">Resultado</div></div>
        <div class="stat-card"><div class="value">${report.summary.savingsRate}%</div><div class="label">Taxa de economia</div></div>
      </div>
      <div class="dashboard-grid">
        <section><div class="section-title"><h2>Evolução mensal</h2></div><div class="card"><canvas class="chart" id="report-trend"></canvas></div></section>
        <section><div class="section-title"><h2>Despesas por categoria</h2></div><div class="card"><canvas class="chart" id="report-categories" style="height:${Math.max(180, report.categories.length * 30)}px"></canvas></div></section>
      </div>
      <div class="section-title"><h2>Maiores beneficiários</h2></div>
      <div class="card">${report.merchants.map((merchant, index) => `
        <div class="list-item"><div class="ranking">${index + 1}</div><div class="meta" style="flex:1"><div class="title">${escapeHtml(merchant.name)}</div><div class="subtitle">${merchant.purchases} compra(s)</div></div><strong>${formatCurrency(merchant.amount)}</strong></div>
      `).join('') || '<div class="empty-state">Sem despesas no período.</div>'}</div>
    `;

    const paint = () => {
      const trend = content.querySelector('#report-trend');
      const categories = content.querySelector('#report-categories');
      if (trend) drawTrendChart(trend, report.monthly);
      if (categories) drawCategoryBars(categories, report.categories);
    };
    paint();
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = paint;
    window.addEventListener('resize', resizeHandler);
  } catch (err) {
    content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export function destroy() {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
}
