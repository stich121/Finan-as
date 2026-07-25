import { api } from '../api.js';
import { openModal } from '../components/modal.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { formatCurrency, formatDate, formatMonthLabel, el } from '../utils.js';

let container;
let accounts = [];

const STATUS_LABELS = {
  OPEN: 'Aberta',
  CLOSED: 'Fechada',
  PAID: 'Paga',
  OVERDUE: 'Atrasada',
};

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function render(root) {
  container = root;
  await load();
}

async function load() {
  container.innerHTML = '<div class="spinner">Carregando cartões…</div>';
  let cards;
  try {
    [cards, accounts] = await Promise.all([api.get('/cards'), api.get('/accounts')]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar cartões: ${escapeHtml(err.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-title"><h2>Seus cartões</h2><a class="btn small secondary" href="/accounts.php">Gerenciar</a></div>
    <div id="cards-grid" class="credit-card-grid"></div>
    <div id="invoice-history"></div>
  `;
  const grid = container.querySelector('#cards-grid');
  if (cards.length === 0) {
    grid.innerHTML = '<div class="card empty-state">Cadastre uma conta do tipo “Cartão de crédito” para controlar limites, parcelas e faturas.<br><br><a class="btn small" href="/accounts.php">Cadastrar cartão</a></div>';
    return;
  }

  cards.forEach((card) => {
    const usedPercent = card.creditLimit > 0 ? Math.min(100, (card.usedLimit / card.creditLimit) * 100) : 0;
    const invoice = card.currentInvoice;
    const node = el(`
      <article class="credit-card" style="--card-color:${card.color || '#38bdf8'}" data-card-id="${card.id}">
        <div class="credit-card-top">
          <div><span class="eyebrow">${escapeHtml(card.institution || 'Cartão de crédito')}</span><h2>${escapeHtml(card.name)}</h2></div>
          <span class="status-badge ${invoice?.status?.toLowerCase() || ''}">${invoice ? STATUS_LABELS[invoice.status] : 'Sem fatura'}</span>
        </div>
        <div class="invoice-value">
          <span>${invoice ? 'Fatura atual' : 'Nenhum lançamento'}</span>
          <strong>${formatCurrency(invoice?.remainingAmount || 0)}</strong>
          <small>${invoice ? `Vence em ${formatDate(invoice.dueDate)}` : `Fecha dia ${card.closingDay}`}</small>
        </div>
        <div class="limit-row"><span>Limite disponível</span><strong>${formatCurrency(card.availableLimit)}</strong></div>
        <div class="progress-bar ${usedPercent >= 90 ? 'over' : ''}"><div style="width:${usedPercent}%"></div></div>
        <div class="credit-card-actions">
          <button class="btn small secondary" data-action="history">Ver faturas</button>
          ${invoice && invoice.remainingAmount > 0 ? '<button class="btn small" data-action="pay">Pagar fatura</button>' : ''}
        </div>
      </article>
    `);
    node.querySelector('[data-action="history"]').addEventListener('click', () => loadHistory(card));
    node.querySelector('[data-action="pay"]')?.addEventListener('click', () => openPayment(card, invoice));
    grid.appendChild(node);
  });

  await loadHistory(cards[0]);
}

async function loadHistory(card) {
  const host = container.querySelector('#invoice-history');
  host.innerHTML = '<div class="spinner">Carregando faturas…</div>';
  try {
    const invoices = await api.get(`/cards/${card.id}/invoices`);
    host.innerHTML = `<div class="section-title"><h2>Faturas · ${escapeHtml(card.name)}</h2></div>`;
    const cardEl = el('<div class="card"></div>');
    if (invoices.length === 0) {
      cardEl.innerHTML = '<div class="empty-state">As faturas aparecerão quando você lançar compras neste cartão.</div>';
    } else {
      invoices.forEach((invoice) => {
        const row = el(`
          <button class="invoice-row" type="button">
            <div class="meta"><div class="title">${formatMonthLabel(invoice.cycleMonth)}</div><div class="subtitle">${invoice.itemCount} lançamento(s) · vence ${formatDate(invoice.dueDate)}</div></div>
            <div class="invoice-row-end"><span class="status-badge ${invoice.status.toLowerCase()}">${STATUS_LABELS[invoice.status]}</span><strong>${formatCurrency(invoice.remainingAmount)}</strong></div>
          </button>
        `);
        row.addEventListener('click', () => openInvoice(card, invoice));
        cardEl.appendChild(row);
      });
    }
    host.appendChild(cardEl);
  } catch (err) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function openInvoice(card, invoice) {
  const content = el('<div><div class="spinner">Carregando detalhes…</div></div>');
  const modal = openModal({ title: `Fatura de ${formatMonthLabel(invoice.cycleMonth)}`, contentEl: content });
  try {
    const detail = await api.get(`/cards/${card.id}/invoices/${invoice.id}`);
    content.innerHTML = `
      <div class="invoice-summary">
        <div><span>Total</span><strong>${formatCurrency(detail.invoice.total)}</strong></div>
        <div><span>Pago</span><strong>${formatCurrency(detail.invoice.paidAmount)}</strong></div>
        <div><span>Restante</span><strong>${formatCurrency(detail.invoice.remainingAmount)}</strong></div>
      </div>
      <div class="invoice-items">
        ${detail.items.map((item) => `
          <div class="list-item">
            <div class="meta"><div class="title">${escapeHtml(item.description || item.payee || 'Compra')}</div><div class="subtitle">${formatDate(item.date)}${item.categoryName ? ` · ${escapeHtml(item.categoryName)}` : ''}${item.installmentCount ? ` · ${item.installmentNumber}/${item.installmentCount}` : ''}</div></div>
            <strong>${formatCurrency(item.amount)}</strong>
          </div>
        `).join('') || '<div class="empty-state">Nenhum lançamento.</div>'}
      </div>
      ${detail.invoice.remainingAmount > 0 ? '<button class="btn" id="invoice-pay-btn" style="margin-top:14px;">Pagar esta fatura</button>' : ''}
    `;
    content.querySelector('#invoice-pay-btn')?.addEventListener('click', () => {
      modal.close();
      openPayment(card, detail.invoice);
    });
  } catch (err) {
    content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function openPayment(card, invoice) {
  const eligible = accounts.filter((account) => account.type !== 'CREDIT_CARD' && !account.archived);
  const form = el(`
    <form>
      <p class="hint">Saldo restante da fatura: <strong>${formatCurrency(invoice.remainingAmount)}</strong></p>
      <div class="field"><label>Conta usada no pagamento</label><select name="fromAccountId" required>${eligible.map((account) => `<option value="${account.id}">${escapeHtml(account.name)} · ${formatCurrency(account.balance)}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label>Valor</label><input name="amount" type="number" min="0.01" max="${invoice.remainingAmount}" step="0.01" value="${invoice.remainingAmount}" required></div>
        <div class="field"><label>Data</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div>
      </div>
      <div class="field-error" hidden></div>
      <button class="btn" type="submit">Confirmar pagamento</button>
    </form>
  `);
  const modal = openModal({ title: `Pagar · ${card.name}`, contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await api.post(`/cards/${card.id}/invoices/${invoice.id}/pay`, {
        fromAccountId: data.get('fromAccountId'),
        amount: Number(data.get('amount')),
        date: data.get('date'),
      });
      modal.close();
      toastSuccess('Pagamento registrado.');
      await load();
    } catch (err) {
      const error = form.querySelector('.field-error');
      error.hidden = false;
      error.textContent = err.message;
      toastError(err.message);
    }
  });
}

export function destroy() {}
