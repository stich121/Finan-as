import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { el } from '../utils.js';
import { icon } from '../icons.js';

let container;

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  await load();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

async function load() {
  let tags;
  try {
    tags = await api.get('/tags');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  const header = el(`
    <div class="section-title">
      <h2>Tags</h2>
      <button class="btn small" id="new-tag-btn">+ Nova</button>
    </div>
  `);
  container.appendChild(header);
  container.appendChild(el('<p class="hint">Use tags para marcar transações com rótulos livres (ex.: "viagem-2026", "reembolsável"), além das categorias.</p>'));

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  if (tags.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhuma tag criada ainda.</div>';
  } else {
    const wrap = el('<div style="display:flex;flex-wrap:wrap;gap:8px;"></div>');
    tags.forEach((tag) => {
      const chip = el(`
        <button type="button" class="chip" style="cursor:pointer;border-color:${tag.color || 'var(--border)'};">
          <span class="dot" style="background:${tag.color || '#64748b'}"></span> ${escapeHtml(tag.name)}
        </button>
      `);
      chip.addEventListener('click', () => openTagActions(tag));
      wrap.appendChild(chip);
    });
    card.appendChild(wrap);
  }

  header.querySelector('#new-tag-btn').addEventListener('click', () => openTagForm());
}

function openTagActions(tag) {
  const content = el(`
    <div>
      <div class="btn-row">
        <button class="btn danger" id="delete-tag-btn">Excluir tag</button>
      </div>
    </div>
  `);
  const modal = openModal({ title: escapeHtml(tag.name), contentEl: content });
  content.querySelector('#delete-tag-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Excluir tag',
      message: `Excluir a tag "${tag.name}"? Ela será removida das transações que a usam.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.del(`/tags/${tag.id}`);
      modal.close();
      toastSuccess('Tag excluída.');
      await load();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function openTagForm() {
  const form = el(`
    <form id="tag-form">
      <div class="field">
        <label for="tag-name">Nome</label>
        <input id="tag-name" name="name" required maxlength="60" />
      </div>
      <div class="field">
        <label for="tag-color">Cor</label>
        <input id="tag-color" name="color" type="color" value="#38bdf8" />
      </div>
      <div class="field-error" id="tag-form-error" hidden></div>
      <button type="submit" class="btn">Criar tag</button>
    </form>
  `);
  const modal = openModal({ title: 'Nova tag', contentEl: form });
  const errorEl = form.querySelector('#tag-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    try {
      await api.post('/tags', { name: data.get('name'), color: data.get('color') });
      modal.close();
      toastSuccess('Tag criada.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}
