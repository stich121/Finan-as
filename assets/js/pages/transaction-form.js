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
  const [accounts, categories, tags] = await Promise.all([
    api.get('/accounts'),
    api.get('/categories'),
    api.get('/tags'),
  ]);

  const isEdit = !!transaction;
  let type = transaction?.type || 'EXPENSE';
  const selectedTagIds = new Set((transaction?.tags || []).map((t) => t.id));

  if (isEdit && type === 'TRANSFER') {
    const content = el('<div><p class="hint">Transferências não podem ser editadas. Exclua e crie uma nova transação.</p></div>');
    openModal({ title: 'Transferência', contentEl: content });
    return;
  }

  const content = el('<div></div>');
  const modal = openModal({ title: isEdit ? 'Editar transação' : 'Nova transação', contentEl: content });

  function categoryOptions(forType) {
    const kind = forType === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const items = categories.filter((c) => c.kind === kind);
    const roots = items.filter((c) => !c.parentId);
    const opt = (c) => `<option value="${c.id}" ${transaction?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
    return roots
      .map((root) => {
        const children = items.filter((c) => c.parentId === root.id);
        if (children.length === 0) return opt(root);
        return `<optgroup label="${escapeHtml(root.name)}">${opt(root)}${children.map(opt).join('')}</optgroup>`;
      })
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
        ${type !== 'TRANSFER' && tags.length > 0 ? `
        <div class="field">
          <label>Tags</label>
          <div id="tx-tags" style="display:flex;flex-wrap:wrap;gap:6px;">
            ${tags.map((t) => `
              <button type="button" class="chip" data-tag-id="${t.id}" style="cursor:pointer;${selectedTagIds.has(t.id) ? `background:${t.color || 'var(--accent)'};color:#05202f;border-color:${t.color || 'var(--accent)'};` : ''}">
                <span class="dot" style="background:${t.color || '#64748b'}"></span> ${escapeHtml(t.name)}
              </button>
            `).join('')}
          </div>
        </div>` : ''}
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

    content.querySelectorAll('#tx-tags .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.tagId;
        const tag = tags.find((t) => t.id === id);
        if (selectedTagIds.has(id)) {
          selectedTagIds.delete(id);
          chip.style.background = '';
          chip.style.color = '';
          chip.style.borderColor = '';
        } else {
          selectedTagIds.add(id);
          chip.style.background = tag?.color || 'var(--accent)';
          chip.style.color = '#05202f';
          chip.style.borderColor = tag?.color || 'var(--accent)';
        }
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
        payload.tagIds = Array.from(selectedTagIds);
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
