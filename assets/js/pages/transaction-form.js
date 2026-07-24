import { api } from '../api.js';
import { openModal } from '../components/modal.js';
import { toastSuccess } from '../components/toast.js';
import { el } from '../utils.js';

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

export async function openTransactionForm({ transaction = null, defaultAccountId = null, onSaved }) {
  const [accounts, categories] = await Promise.all([
    api.get('/accounts'),
    api.get('/categories'),
  ]);

  const isEdit = !!transaction;
  let type = transaction?.type || 'EXPENSE';

  if (isEdit && type === 'TRANSFER') {
    const content = el('<div><p class="hint">Transferências não podem ser editadas. Exclua e crie uma nova transação.</p></div>');
    openModal({ title: 'Transferência', contentEl: content });
    return;
  }

  const content = el('<div></div>');
  const modal = openModal({ title: isEdit ? 'Editar transação' : 'Nova transação', contentEl: content });

  function categoryOptions(forType) {
    const kind = forType === 'INCOME' ? 'INCOME' : 'EXPENSE';
    return categories
      .filter((c) => c.kind === kind)
      .map((c) => `<option value="${c.id}" ${transaction?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
  }

  function accountOptions(excludeId) {
    return accounts
      .filter((a) => a.id !== excludeId)
      .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
      .join('');
  }

  function paintForm() {
    content.innerHTML = `
      ${!isEdit ? `
      <div class="tabs">
        <button type="button" data-type="EXPENSE" class="${type === 'EXPENSE' ? 'active' : ''}">Despesa</button>
        <button type="button" data-type="INCOME" class="${type === 'INCOME' ? 'active' : ''}">Receita</button>
        <button type="button" data-type="TRANSFER" class="${type === 'TRANSFER' ? 'active' : ''}">Transferência</button>
      </div>` : ''}
      <form id="tx-form">
        <div class="field">
          <label for="tx-account">${type === 'TRANSFER' ? 'Conta de origem' : 'Conta'}</label>
          <select id="tx-account" name="accountId">${accounts.map((a) => `<option value="${a.id}" ${(transaction?.accountId || defaultAccountId) === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
        </div>
        ${type === 'TRANSFER' ? `
        <div class="field">
          <label for="tx-transfer-account">Conta de destino</label>
          <select id="tx-transfer-account" name="transferAccountId">${accountOptions(transaction?.accountId || defaultAccountId)}</select>
        </div>` : ''}
        <div class="field-row">
          <div class="field">
            <label for="tx-amount">Valor</label>
            <input id="tx-amount" name="amount" type="number" step="0.01" min="0" required value="${transaction ? Math.abs(transaction.amount) : ''}" />
          </div>
          <div class="field">
            <label for="tx-date">Data</label>
            <input id="tx-date" name="date" type="date" required value="${transaction ? transaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10)}" />
          </div>
        </div>
        ${type !== 'TRANSFER' ? `
        <div class="field">
          <label for="tx-category">Categoria</label>
          <select id="tx-category" name="categoryId">
            <option value="">Sem categoria</option>
            ${categoryOptions(type)}
          </select>
        </div>` : ''}
        <div class="field">
          <label for="tx-description">Descrição</label>
          <input id="tx-description" name="description" value="${transaction ? escapeHtml(transaction.description || '') : ''}" />
        </div>
        <div class="field">
          <label for="tx-payee">Beneficiário/Pagador (opcional)</label>
          <input id="tx-payee" name="payee" value="${transaction ? escapeHtml(transaction.payee || '') : ''}" />
        </div>
        <div class="field-error" id="tx-form-error" hidden></div>
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Adicionar'}</button>
      </form>
    `;

    content.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        type = btn.dataset.type;
        paintForm();
      });
    });

    const form = content.querySelector('#tx-form');
    const errorEl = content.querySelector('#tx-form-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const data = new FormData(form);
      const payload = {
        accountId: data.get('accountId'),
        type,
        amount: Number(data.get('amount')),
        date: data.get('date'),
        description: data.get('description') || null,
        payee: data.get('payee') || null,
      };
      if (type === 'TRANSFER') {
        payload.transferAccountId = data.get('transferAccountId');
      } else {
        payload.categoryId = data.get('categoryId') || null;
      }

      try {
        if (isEdit) {
          await api.patch(`/transactions/${transaction.id}`, payload);
        } else {
          await api.post('/transactions', payload);
        }
        modal.close();
        toastSuccess('Transação salva.');
        if (onSaved) onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  paintForm();
}
