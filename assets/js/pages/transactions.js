import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { openModal } from '../components/modal.js';
import { formatCurrency, formatDate, debounce, el, categoryOptionsHtml } from '../utils.js';
import { openTransactionForm } from './transaction-form.js';
import { icon } from '../icons.js';

let container;
let accounts = [];
let categories = [];
let filters = { accountId: '', categoryId: '', type: '', uncategorizedOnly: false, search: '' };
let page = 1;
const pageSize = 30;
let selectedIds = new Set();
let fab;

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';

  [accounts, categories] = await Promise.all([api.get('/accounts?includeArchived=1'), api.get('/categories')]);

  container.innerHTML = '';
  buildHeader();
  buildFilters();
  container.appendChild(el('<div id="tx-list"></div>'));

  fab = el(`<button class="fab" aria-label="Nova transação">${icon('plus', { size: 26 })}</button>`);
  document.body.appendChild(fab);
  fab.addEventListener('click', () => openTransactionForm({ onSaved: () => loadList() }));

  await loadList();
}

function buildHeader() {
  const header = el(`
    <div class="section-title">
      <h2>Transações</h2>
      <a href="/transactions-import.php" class="btn small secondary">Importar OFX</a>
    </div>
  `);
  container.appendChild(header);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function buildFilters() {
  const wrap = el(`
    <div class="filters">
      <select id="f-account"><option value="">Todas as contas</option>${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
      <select id="f-category"><option value="">Todas as categorias</option>${categoryOptionsHtml(categories)}</select>
      <select id="f-type">
        <option value="">Todos os tipos</option>
        <option value="INCOME">Receita</option>
        <option value="EXPENSE">Despesa</option>
        <option value="TRANSFER">Transferência</option>
      </select>
      <input id="f-search" type="search" placeholder="Buscar…" />
      <label class="chip"><input type="checkbox" id="f-uncategorized" style="margin-right:4px;" />Sem categoria</label>
    </div>
  `);
  container.appendChild(wrap);

  wrap.querySelector('#f-account').addEventListener('change', (e) => { filters.accountId = e.target.value; page = 1; loadList(); });
  wrap.querySelector('#f-category').addEventListener('change', (e) => { filters.categoryId = e.target.value; page = 1; loadList(); });
  wrap.querySelector('#f-type').addEventListener('change', (e) => { filters.type = e.target.value; page = 1; loadList(); });
  wrap.querySelector('#f-uncategorized').addEventListener('change', (e) => { filters.uncategorizedOnly = e.target.checked; page = 1; loadList(); });
  wrap.querySelector('#f-search').addEventListener('input', debounce((e) => { filters.search = e.target.value; page = 1; loadList(); }, 350));
}

async function loadList() {
  const listEl = document.getElementById('tx-list');
  listEl.innerHTML = '<div class="spinner">Carregando…</div>';

  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.type) params.set('type', filters.type);
  if (filters.uncategorizedOnly) params.set('uncategorizedOnly', '1');
  if (filters.search) params.set('search', filters.search);
  params.set('page', page);
  params.set('pageSize', pageSize);

  let result;
  try {
    result = await api.get(`/transactions?${params.toString()}`);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  selectedIds = new Set();
  listEl.innerHTML = '';

  if (result.items.length === 0) {
    listEl.appendChild(el('<div class="card"><div class="empty-state">Nenhuma transação encontrada.</div></div>'));
    return;
  }

  const bulkBar = el(`
    <div class="card" id="bulk-bar" style="display:none;">
      <div class="btn-row">
        <select id="bulk-category" style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px;">
          <option value="">Categorizar em massa…</option>
          ${categoryOptionsHtml(categories)}
        </select>
        <button class="btn small" id="bulk-apply-btn">Aplicar</button>
      </div>
    </div>
  `);
  listEl.appendChild(bulkBar);

  const card = el('<div class="card"></div>');
  listEl.appendChild(card);

  result.items.forEach((tx) => {
    const account = accounts.find((a) => a.id === tx.accountId);
    const category = categories.find((c) => c.id === tx.categoryId);
    const row = el(`
      <div class="list-item">
        <input type="checkbox" class="tx-check" data-id="${tx.id}" style="margin-right:4px;" />
        <div class="meta" style="flex:1;cursor:pointer;">
          <div class="title">${escapeHtml(tx.description || tx.payee || 'Sem descrição')}</div>
          <div class="subtitle">${formatDate(tx.date)} · ${account ? escapeHtml(account.name) : ''}${category ? ' · ' + escapeHtml(category.name) : tx.type !== 'TRANSFER' ? ' · <span style="color:var(--warning)">sem categoria</span>' : ''}</div>
          ${tx.tags && tx.tags.length > 0 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${tx.tags.map((t) => `<span class="chip" style="border-color:${t.color || 'var(--border)'};"><span class="dot" style="background:${t.color || '#64748b'}"></span> ${escapeHtml(t.name)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="amount ${tx.amount < 0 ? 'expense' : 'income'}">${formatCurrency(tx.amount)}</div>
      </div>
    `);
    row.querySelector('.meta').addEventListener('click', () => openTransactionDetail(tx, account, category));
    row.querySelector('.tx-check').addEventListener('change', (e) => {
      if (e.target.checked) selectedIds.add(tx.id); else selectedIds.delete(tx.id);
      bulkBar.style.display = selectedIds.size > 0 ? '' : 'none';
    });
    card.appendChild(row);
  });

  if (result.total > pageSize) {
    const pager = el(`
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn secondary" id="prev-page" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button class="btn secondary" id="next-page" ${page * pageSize >= result.total ? 'disabled' : ''}>Próxima</button>
      </div>
    `);
    listEl.appendChild(pager);
    pager.querySelector('#prev-page').addEventListener('click', () => { page--; loadList(); });
    pager.querySelector('#next-page').addEventListener('click', () => { page++; loadList(); });
  }

  bulkBar.querySelector('#bulk-apply-btn').addEventListener('click', async () => {
    const categoryId = bulkBar.querySelector('#bulk-category').value;
    if (!categoryId || selectedIds.size === 0) return;
    try {
      await api.post('/transactions/bulk-categorize', { ids: Array.from(selectedIds), categoryId, createRule: true });
      toastSuccess('Transações categorizadas.');
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openTransactionDetail(tx, account, category) {
  const content = el(`
    <div>
      <p class="hint">Conta: ${account ? escapeHtml(account.name) : '-'}</p>
      <p class="hint">Categoria atual: ${category ? escapeHtml(category.name) : 'Sem categoria'}</p>
      ${tx.type !== 'TRANSFER' ? `
      <div class="field">
        <label for="quick-category">Categorizar</label>
        <select id="quick-category">
          <option value="">Sem categoria</option>
          ${categoryOptionsHtml(categories.filter((c) => c.kind === tx.type), tx.categoryId)}
        </select>
      </div>
      <label class="chip" style="margin-bottom:14px;display:inline-flex;"><input type="checkbox" id="learn-rule" style="margin-right:4px;" />Lembrar essa categorização</label>
      ` : ''}
      <div class="btn-row">
        ${tx.type !== 'TRANSFER' ? '<button class="btn secondary" id="edit-tx-btn">Editar</button>' : ''}
        <button class="btn danger" id="delete-tx-btn">Excluir</button>
      </div>
    </div>
  `);
  const modal = openModal({ title: 'Detalhes da transação', contentEl: content });

  const quickCategory = content.querySelector('#quick-category');
  if (quickCategory) {
    quickCategory.addEventListener('change', async () => {
      try {
        await api.post(`/transactions/${tx.id}/categorize`, {
          categoryId: quickCategory.value || null,
          createRule: content.querySelector('#learn-rule')?.checked || false,
        });
        toastSuccess('Categoria atualizada.');
        modal.close();
        await loadList();
      } catch (err) {
        toastError(err.message);
      }
    });
  }

  const editBtn = content.querySelector('#edit-tx-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      modal.close();
      openTransactionForm({ transaction: tx, onSaved: () => loadList() });
    });
  }

  content.querySelector('#delete-tx-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Excluir transação',
      message: 'Tem certeza que deseja excluir esta transação? Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.del(`/transactions/${tx.id}`);
      modal.close();
      toastSuccess('Transação excluída.');
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
  });
}

export function destroy() {
  if (fab) { fab.remove(); fab = null; }
}
