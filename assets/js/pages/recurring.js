import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { formatCurrency, formatDate, el, categoryOptionsHtml } from '../utils.js';
import { icon } from '../icons.js';

let container;
let accounts = [];
let categories = [];

const FREQ_LABELS = { WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal', YEARLY: 'Anual' };

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  [accounts, categories] = await Promise.all([api.get('/accounts'), api.get('/categories')]);
  await load();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

async function load() {
  let items;
  try {
    items = await api.get('/recurring');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  const header = el(`
    <div class="section-title">
      <h2>Recorrências</h2>
      <button class="btn small" id="new-recurring-btn">+ Nova</button>
    </div>
  `);
  container.appendChild(header);

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  if (items.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhuma recorrência cadastrada.</div>';
  } else {
    items.forEach((r) => {
      const account = accounts.find((a) => a.id === r.accountId);
      const row = el(`
        <div class="list-item">
          <div class="meta">
            <div class="title">${escapeHtml(r.description)}</div>
            <div class="subtitle">${FREQ_LABELS[r.frequency]} · próxima em ${formatDate(r.nextRunDate)} · ${account ? escapeHtml(account.name) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="amount ${r.type === 'EXPENSE' ? 'expense' : 'income'}">${formatCurrency(r.type === 'EXPENSE' ? -r.amount : r.amount)}</div>
            <button class="btn ghost" data-action="post" data-id="${r.id}" title="Lançar agora">${icon('play', { size: 16 })}</button>
            <button class="btn ghost" data-action="edit" data-id="${r.id}">${icon('edit', { size: 16 })}</button>
          </div>
        </div>
      `);
      row.querySelector('[data-action="post"]').addEventListener('click', () => postNext(r));
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(r));
      card.appendChild(row);
    });
  }

  header.querySelector('#new-recurring-btn').addEventListener('click', () => openForm(null));
}

async function postNext(recurring) {
  const ok = await confirmDialog({
    title: 'Lançar transação',
    message: `Lançar a próxima ocorrência de "${recurring.description}" (${formatDate(recurring.nextRunDate)})?`,
    confirmLabel: 'Lançar',
    danger: false,
  });
  if (!ok) return;
  try {
    await api.post(`/recurring/${recurring.id}/post`, {});
    toastSuccess('Transação lançada.');
    await load();
  } catch (err) {
    toastError(err.message);
  }
}

function openForm(recurring) {
  const isEdit = !!recurring;
  let type = recurring?.type || 'EXPENSE';

  const content = el('<div></div>');
  const modal = openModal({ title: isEdit ? 'Editar recorrência' : 'Nova recorrência', contentEl: content });

  function paint() {
    content.innerHTML = `
      <form id="recurring-form">
        <div class="tabs">
          <button type="button" data-type="EXPENSE" class="${type === 'EXPENSE' ? 'active' : ''}">Despesa</button>
          <button type="button" data-type="INCOME" class="${type === 'INCOME' ? 'active' : ''}">Receita</button>
        </div>
        <div class="field">
          <label for="rec-description">Descrição</label>
          <input id="rec-description" name="description" required value="${recurring ? escapeHtml(recurring.description) : ''}" />
        </div>
        <div class="field">
          <label for="rec-account">Conta</label>
          <select id="rec-account" name="accountId">${accounts.map((a) => `<option value="${a.id}" ${recurring?.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="rec-category">Categoria</label>
          <select id="rec-category" name="categoryId">
            <option value="">Sem categoria</option>
            ${categoryOptionsHtml(categories.filter((c) => c.kind === type), recurring?.categoryId)}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="rec-amount">Valor</label>
            <input id="rec-amount" name="amount" type="number" step="0.01" min="0" required value="${recurring ? recurring.amount : ''}" />
          </div>
          <div class="field">
            <label for="rec-frequency">Frequência</label>
            <select id="rec-frequency" name="frequency">
              ${Object.entries(FREQ_LABELS).map(([v, l]) => `<option value="${v}" ${recurring?.frequency === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="rec-start">Início</label>
            <input id="rec-start" name="startDate" type="date" required value="${recurring ? recurring.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="field">
            <label for="rec-end">Fim (opcional)</label>
            <input id="rec-end" name="endDate" type="date" value="${recurring?.endDate ? recurring.endDate.slice(0, 10) : ''}" />
          </div>
        </div>
        <div class="field-error" id="recurring-form-error" hidden></div>
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Criar'}</button>
        ${isEdit ? '<button type="button" class="btn danger" id="delete-recurring-btn" style="margin-top:10px;">Excluir</button>' : ''}
      </form>
    `;

    content.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => { type = btn.dataset.type; paint(); });
    });

    const form = content.querySelector('#recurring-form');
    const errorEl = content.querySelector('#recurring-form-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const data = new FormData(form);
      const payload = {
        description: data.get('description'),
        accountId: data.get('accountId'),
        categoryId: data.get('categoryId') || null,
        type,
        amount: Number(data.get('amount')),
        frequency: data.get('frequency'),
        startDate: data.get('startDate'),
        endDate: data.get('endDate') || null,
      };
      try {
        if (isEdit) {
          await api.patch(`/recurring/${recurring.id}`, payload);
        } else {
          await api.post('/recurring', payload);
        }
        modal.close();
        toastSuccess('Recorrência salva.');
        await load();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    const deleteBtn = content.querySelector('#delete-recurring-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Excluir recorrência', message: 'Excluir esta recorrência?', confirmLabel: 'Excluir' });
        if (!ok) return;
        try {
          await api.del(`/recurring/${recurring.id}`);
          modal.close();
          toastSuccess('Recorrência excluída.');
          await load();
        } catch (err) {
          toastError(err.message);
        }
      });
    }
  }

  paint();
}

export function destroy() {}
