import { api } from '../api.js';
import { formatCurrency, formatDate } from '../utils.js';

let container;
let report;

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function render(root) {
  container = root;
  const year = new Date().getFullYear();
  container.innerHTML = `
    <div class="section-title"><h2>Relatório auxiliar para Imposto de Renda</h2></div>
    <div class="card report-filter">
      <div class="field"><label>Ano</label><input id="tax-year" type="number" min="2000" max="2100" value="${year}"></div>
      <button class="btn small" id="tax-load">Atualizar</button>
      <button class="btn small secondary" id="tax-export">Exportar CSV</button>
    </div>
    <p class="hint">Relatório informativo baseado nos lançamentos cadastrados. Ele não substitui documentos oficiais nem orientação contábil.</p>
    <div id="tax-content"></div>
  `;
  container.querySelector('#tax-load').addEventListener('click', load);
  container.querySelector('#tax-export').addEventListener('click', exportCsv);
  await load();
}

async function load() {
  const year = container.querySelector('#tax-year').value;
  const content = container.querySelector('#tax-content');
  content.innerHTML = '<div class="spinner">Consolidando o ano…</div>';
  try {
    report = await api.get(`/productivity/tax-report?year=${encodeURIComponent(year)}`);
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="value income money-value">${formatCurrency(report.income)}</div><div class="label">Receitas</div></div>
        <div class="stat-card"><div class="value expense money-value">${formatCurrency(report.expense)}</div><div class="label">Despesas</div></div>
        <div class="stat-card"><div class="value money-value">${formatCurrency(report.income - report.expense)}</div><div class="label">Resultado</div></div>
      </div>
      <div class="section-title"><h2>Lançamentos de ${report.year}</h2></div>
      <div class="card tax-table-wrap">
        <table><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th>Valor</th></tr></thead>
        <tbody>${report.transactions.map((item) => `<tr><td>${formatDate(item.date)}</td><td>${escapeHtml(item.description || item.payee || '')}</td><td>${escapeHtml(item.account_name)}</td><td>${escapeHtml(item.category_name || 'Sem categoria')}</td><td class="money-value">${formatCurrency(item.amount)}</td></tr>`).join('')}</tbody></table>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function exportCsv() {
  if (!report) return;
  const safe = (value) => {
    const text = String(value ?? '').replaceAll('"', '""');
    return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`;
  };
  const rows = [['Data', 'Descrição', 'Beneficiário', 'Conta', 'Categoria', 'Essencial', 'Valor']];
  report.transactions.forEach((item) => rows.push([
    item.date, item.description, item.payee, item.account_name, item.category_name,
    item.is_essential ? 'Sim' : 'Não', item.amount,
  ]));
  const csv = `\uFEFF${rows.map((row) => row.map(safe).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-anual-${report.year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function destroy() {}
