import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { formatCurrency, formatDate, el } from '../utils.js';

let container;
let accounts = [];
let categories = [];
let preview = null;

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  [accounts, categories] = await Promise.all([api.get('/accounts'), api.get('/categories')]);
  preview = null;
  paintUpload();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function paintUpload() {
  container.innerHTML = '';
  container.appendChild(el('<div class="section-title"><h2>Importar extrato OFX</h2></div>'));

  const card = el(`
    <div class="card">
      <form id="upload-form">
        <div class="field">
          <label for="ofx-account">Conta de destino</label>
          <select id="ofx-account" name="accountId">${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="ofx-file">Arquivo .ofx / .qfx</label>
          <input id="ofx-file" name="file" type="file" accept=".ofx,.qfx,application/xml,text/xml,text/plain" required />
        </div>
        <div class="field-error" id="upload-error" hidden></div>
        <button type="submit" class="btn" id="upload-btn">Analisar arquivo</button>
      </form>
    </div>
  `);
  container.appendChild(card);

  const form = card.querySelector('#upload-form');
  const errorEl = card.querySelector('#upload-error');
  const uploadBtn = card.querySelector('#upload-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const fileInput = card.querySelector('#ofx-file');
    if (!fileInput.files[0]) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Analisando…';

    const formData = new FormData();
    formData.append('accountId', card.querySelector('#ofx-account').value);
    formData.append('file', fileInput.files[0]);

    try {
      preview = await api.postForm('/ofx/preview', formData);
      paintPreview();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Analisar arquivo';
    }
  });
}

function paintPreview() {
  container.innerHTML = '';
  container.appendChild(el(`<div class="section-title"><h2>Confirmar importação</h2></div>`));
  container.appendChild(el(`<p class="hint">${preview.transactions.length} transações encontradas. Desmarque as que não quer importar.</p>`));

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  preview.transactions.forEach((tx) => {
    const kind = tx.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const catOptions = categories
      .filter((c) => c.kind === kind)
      .map((c) => `<option value="${c.id}" ${tx.suggestedCategoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');

    const row = el(`
      <div class="list-item" style="align-items:flex-start;">
        <input type="checkbox" class="row-check" data-row="${tx.rowId}" ${tx.duplicate ? '' : 'checked'} style="margin-top:4px;margin-right:6px;" />
        <div class="meta" style="flex:1;">
          <div class="title">${escapeHtml(tx.description || tx.payee || 'Sem descrição')} ${tx.duplicate ? '<span class="chip" style="margin-left:6px;">duplicada</span>' : ''}</div>
          <div class="subtitle">${formatDate(tx.date)}</div>
          <select class="row-category" data-row="${tx.rowId}" style="margin-top:6px;width:100%;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px;">
            <option value="">Sem categoria</option>
            ${catOptions}
          </select>
        </div>
        <div class="amount ${tx.amount < 0 ? 'expense' : 'income'}">${formatCurrency(tx.amount)}</div>
      </div>
    `);
    card.appendChild(row);
  });

  const actions = el(`
    <div class="btn-row" style="margin-top:16px;">
      <button class="btn secondary" id="cancel-import-btn">Cancelar</button>
      <button class="btn" id="confirm-import-btn">Importar selecionadas</button>
    </div>
  `);
  container.appendChild(actions);

  actions.querySelector('#cancel-import-btn').addEventListener('click', () => {
    preview = null;
    paintUpload();
  });

  actions.querySelector('#confirm-import-btn').addEventListener('click', async () => {
    const rowIds = Array.from(card.querySelectorAll('.row-check:checked')).map((c) => c.dataset.row);
    const categoryOverrides = {};
    card.querySelectorAll('.row-category').forEach((sel) => {
      if (sel.value) categoryOverrides[sel.dataset.row] = sel.value;
      else categoryOverrides[sel.dataset.row] = null;
    });

    if (rowIds.length === 0) {
      toastError('Selecione ao menos uma transação.');
      return;
    }

    try {
      const result = await api.post('/ofx/confirm', {
        stagingId: preview.stagingId,
        rowIds,
        categoryOverrides,
      });
      toastSuccess(`${result.imported} transações importadas.`);
      window.location.href = '/transactions.php';
    } catch (err) {
      toastError(err.message);
    }
  });
}

export function destroy() {}
