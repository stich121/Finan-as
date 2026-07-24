import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { formatCurrency, ACCOUNT_TYPE_LABELS, el } from '../utils.js';
import { icon } from '../icons.js';

let container;

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  await load();
}

async function load() {
  let accounts;
  try {
    accounts = await api.get('/accounts?includeArchived=1');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar contas: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';

  const header = el(`
    <div class="section-title">
      <h2>Contas</h2>
      <button class="btn small" id="new-account-btn">+ Nova conta</button>
    </div>
  `);
  container.appendChild(header);

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  if (accounts.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhuma conta cadastrada ainda.</div>';
  } else {
    accounts.forEach((acc) => {
      const item = el(`
        <div class="list-item">
          <div class="meta">
            <div class="title">${acc.archived ? `<span class="inline-icon">${icon('archive', { size: 14 })}</span> ` : ''}${escapeHtml(acc.name)}</div>
            <div class="subtitle">${ACCOUNT_TYPE_LABELS[acc.type] || acc.type}${acc.institution ? ' · ' + escapeHtml(acc.institution) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="amount ${acc.balance < 0 ? 'expense' : 'income'}">${formatCurrency(acc.balance)}</div>
            <button class="btn ghost" data-action="edit" data-id="${acc.id}">${icon('edit', { size: 16 })}</button>
          </div>
        </div>
      `);
      card.appendChild(item);
    });
  }

  card.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = accounts.find((a) => a.id === btn.dataset.id);
      openAccountForm(acc);
    });
  });

  header.querySelector('#new-account-btn').addEventListener('click', () => openAccountForm(null));
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function openAccountForm(account) {
  const isEdit = !!account;
  const form = el(`
    <form id="account-form">
      <div class="field">
        <label for="acc-name">Nome</label>
        <input id="acc-name" name="name" required value="${account ? escapeHtml(account.name) : ''}" />
      </div>
      <div class="field">
        <label for="acc-type">Tipo</label>
        <select id="acc-type" name="type">
          ${Object.entries(ACCOUNT_TYPE_LABELS)
            .map(([value, label]) => `<option value="${value}" ${account?.type === value ? 'selected' : ''}>${label}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="acc-institution">Instituição (opcional)</label>
        <input id="acc-institution" name="institution" value="${account ? escapeHtml(account.institution || '') : ''}" />
      </div>
      ${!isEdit ? `
      <div class="field">
        <label for="acc-balance">Saldo inicial</label>
        <input id="acc-balance" name="balance" type="number" step="0.01" value="0" />
      </div>` : ''}
      <div class="field-error" id="acc-form-error" hidden></div>
      <div class="btn-row">
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Criar conta'}</button>
      </div>
      ${isEdit ? `
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" class="btn secondary" id="adjust-balance-btn">Ajustar saldo</button>
        <button type="button" class="btn secondary" id="toggle-archive-btn">${account.archived ? 'Reativar' : 'Arquivar'}</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" class="btn danger" id="delete-account-btn">Excluir conta</button>
      </div>` : ''}
    </form>
  `);

  const modal = openModal({ title: isEdit ? 'Editar conta' : 'Nova conta', contentEl: form });
  const errorEl = form.querySelector('#acc-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      type: data.get('type'),
      institution: data.get('institution') || null,
    };
    if (!isEdit) payload.balance = Number(data.get('balance') || 0);

    try {
      if (isEdit) {
        await api.patch(`/accounts/${account.id}`, payload);
      } else {
        await api.post('/accounts', payload);
      }
      modal.close();
      toastSuccess('Conta salva.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  if (isEdit) {
    form.querySelector('#adjust-balance-btn').addEventListener('click', () => {
      modal.close();
      openAdjustBalanceForm(account);
    });
    form.querySelector('#toggle-archive-btn').addEventListener('click', async () => {
      try {
        await api.patch(`/accounts/${account.id}`, { archived: !account.archived });
        modal.close();
        toastSuccess(account.archived ? 'Conta reativada.' : 'Conta arquivada.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
    form.querySelector('#delete-account-btn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir conta',
        message: `Excluir "${account.name}"? Todas as transações relacionadas também serão removidas.`,
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      try {
        await api.del(`/accounts/${account.id}`);
        modal.close();
        toastSuccess('Conta excluída.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}

function openAdjustBalanceForm(account) {
  const form = el(`
    <form id="adjust-form">
      <p class="hint">Saldo atual: ${formatCurrency(account.balance)}</p>
      <div class="field">
        <label for="new-balance">Novo saldo</label>
        <input id="new-balance" name="balance" type="number" step="0.01" value="${account.balance}" required />
      </div>
      <div class="field-error" id="adjust-error" hidden></div>
      <button type="submit" class="btn">Ajustar</button>
    </form>
  `);
  const modal = openModal({ title: 'Ajustar saldo', contentEl: form });
  const errorEl = form.querySelector('#adjust-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      await api.post(`/accounts/${account.id}/adjust-balance`, {
        balance: Number(new FormData(form).get('balance')),
      });
      modal.close();
      toastSuccess('Saldo ajustado.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

export function destroy() {}
