import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { getState, setState } from '../state.js';
import { formatCurrency, formatMonthLabel, addMonths, el, categoryOptionsHtml } from '../utils.js';
import { icon } from '../icons.js';

let container;
let categories = [];

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  categories = await api.get('/categories');
  await load();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

async function load() {
  const month = getState().selectedMonth;
  let budgets;
  try {
    budgets = await api.get(`/budgets?month=${month}`);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  container.appendChild(el('<div class="section-title"><h2>Orçamento</h2></div>'));

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

  const addBar = el('<div style="margin-bottom:12px;"><button class="btn small" id="new-budget-btn">+ Definir orçamento</button></div>');
  container.appendChild(addBar);
  addBar.querySelector('#new-budget-btn').addEventListener('click', () => openBudgetForm(month, budgets));

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  if (budgets.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhum orçamento definido para este mês.</div>';
  } else {
    budgets.forEach((b) => {
      const pct = b.amount > 0 ? Math.min(100, Math.round((b.spent / b.amount) * 100)) : 0;
      const over = b.spent > b.amount;
      const row = el(`
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="title" style="font-weight:600;font-size:14px;"><span class="dot" style="background:${b.categoryColor || '#64748b'}"></span> ${escapeHtml(b.categoryName)}</div>
            <button class="btn ghost" data-id="${b.id}">${icon('edit', { size: 16 })}</button>
          </div>
          <div class="subtitle" style="margin-top:4px;">${formatCurrency(b.spent)} de ${formatCurrency(b.amount)}${over ? ' · estourado' : ''}</div>
          <div class="progress-bar ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>
        </div>
      `);
      row.querySelector('button').addEventListener('click', () => openBudgetForm(month, budgets, b));
      card.appendChild(row);
    });
  }
}

function openBudgetForm(month, budgets, budget = null) {
  const usedCategoryIds = budgets.map((b) => b.categoryId);
  const available = categories.filter((c) => c.kind === 'EXPENSE' && (budget?.categoryId === c.id || !usedCategoryIds.includes(c.id)));

  const form = el(`
    <form id="budget-form">
      <div class="field">
        <label for="budget-category">Categoria</label>
        <select id="budget-category" name="categoryId" ${budget ? 'disabled' : ''}>
          ${categoryOptionsHtml(available, budget?.categoryId)}
        </select>
      </div>
      <div class="field">
        <label for="budget-amount">Valor mensal</label>
        <input id="budget-amount" name="amount" type="number" step="0.01" min="0" required value="${budget ? budget.amount : ''}" />
      </div>
      <div class="field-error" id="budget-form-error" hidden></div>
      <button type="submit" class="btn">Salvar</button>
      ${budget ? '<button type="button" class="btn danger" id="delete-budget-btn" style="margin-top:10px;">Excluir orçamento</button>' : ''}
    </form>
  `);

  const modal = openModal({ title: budget ? 'Editar orçamento' : 'Definir orçamento', contentEl: form });
  const errorEl = form.querySelector('#budget-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    try {
      await api.post('/budgets', {
        categoryId: budget ? budget.categoryId : data.get('categoryId'),
        month,
        amount: Number(data.get('amount')),
      });
      modal.close();
      toastSuccess('Orçamento salvo.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  const deleteBtn = form.querySelector('#delete-budget-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      try {
        await api.del(`/budgets/${budget.id}`);
        modal.close();
        toastSuccess('Orçamento excluído.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}

export function destroy() {}
