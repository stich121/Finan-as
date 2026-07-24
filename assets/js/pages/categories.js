import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { el } from '../utils.js';
import { icon } from '../icons.js';

let container;
let activeTab = 'EXPENSE';
let allCategories = [];

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Carregando…</div>';
  await load();
}

async function load() {
  try {
    allCategories = await api.get('/categories');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }
  paint();
}

function buildTree(kind) {
  const items = allCategories.filter((c) => c.kind === kind);
  const roots = items.filter((c) => !c.parentId);
  const children = (parentId) => items.filter((c) => c.parentId === parentId);
  return { roots, children };
}

function paint() {
  container.innerHTML = '';

  const header = el(`
    <div class="section-title">
      <h2>Categorias</h2>
      <button class="btn small" id="new-cat-btn">+ Nova</button>
    </div>
  `);
  container.appendChild(header);

  const tabs = el(`
    <div class="tabs">
      <button data-kind="EXPENSE" class="${activeTab === 'EXPENSE' ? 'active' : ''}">Despesas</button>
      <button data-kind="INCOME" class="${activeTab === 'INCOME' ? 'active' : ''}">Receitas</button>
    </div>
  `);
  container.appendChild(tabs);
  tabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.kind;
      paint();
    });
  });

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  const { roots, children } = buildTree(activeTab);
  if (roots.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhuma categoria aqui ainda.</div>';
  } else {
    roots.forEach((cat) => {
      card.appendChild(categoryRow(cat, 0, true));
      children(cat.id).forEach((child) => card.appendChild(categoryRow(child, 1, false)));
    });
  }

  header.querySelector('#new-cat-btn').addEventListener('click', () => openCategoryForm(null));
}

function categoryRow(cat, depth, isParent) {
  const row = el(`
    <div class="list-item" style="padding-left:${depth * 18 + 8}px">
      <div class="meta">
        <div class="title"><span class="dot" style="background:${cat.color || '#64748b'}"></span> ${escapeHtml(cat.name)}</div>
      </div>
      <div style="display:flex;gap:4px;">
        ${isParent ? `<button class="btn ghost" data-action="add-sub" title="Nova subcategoria">${icon('plus', { size: 16 })}</button>` : ''}
        <button class="btn ghost" data-action="edit">${icon('edit', { size: 16 })}</button>
      </div>
    </div>
  `);
  row.querySelector('[data-action="edit"]').addEventListener('click', () => openCategoryForm(cat));
  const addSubBtn = row.querySelector('[data-action="add-sub"]');
  if (addSubBtn) {
    addSubBtn.addEventListener('click', () => openCategoryForm(null, cat));
  }
  return row;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function openCategoryForm(category, presetParent = null) {
  const isEdit = !!category;
  const kind = category?.kind || presetParent?.kind || activeTab;
  const presetParentId = category?.parentId ?? presetParent?.id ?? '';
  const parentOptions = allCategories
    .filter((c) => c.kind === kind && !c.parentId && c.id !== category?.id)
    .map((c) => `<option value="${c.id}" ${presetParentId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('');

  const form = el(`
    <form id="cat-form">
      <div class="field">
        <label for="cat-name">Nome</label>
        <input id="cat-name" name="name" required value="${category ? escapeHtml(category.name) : ''}" />
      </div>
      <div class="field">
        <label for="cat-kind">Tipo</label>
        <select id="cat-kind" name="kind">
          <option value="EXPENSE" ${kind === 'EXPENSE' ? 'selected' : ''}>Despesa</option>
          <option value="INCOME" ${kind === 'INCOME' ? 'selected' : ''}>Receita</option>
        </select>
      </div>
      <div class="field">
        <label for="cat-parent">Categoria pai (opcional)</label>
        <select id="cat-parent" name="parentId">
          <option value="">Nenhuma</option>
          ${parentOptions}
        </select>
      </div>
      <div class="field">
        <label for="cat-color">Cor</label>
        <input id="cat-color" name="color" type="color" value="${category?.color || '#38bdf8'}" />
      </div>
      <div class="field-error" id="cat-form-error" hidden></div>
      <div class="btn-row">
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Criar categoria'}</button>
      </div>
      ${isEdit ? '<div class="btn-row" style="margin-top:10px;"><button type="button" class="btn danger" id="delete-cat-btn">Excluir</button></div>' : ''}
    </form>
  `);

  const modalTitle = isEdit ? 'Editar categoria' : presetParent ? `Nova subcategoria de "${presetParent.name}"` : 'Nova categoria';
  const modal = openModal({ title: modalTitle, contentEl: form });
  const errorEl = form.querySelector('#cat-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      kind: data.get('kind'),
      parentId: data.get('parentId') || null,
      color: data.get('color'),
    };
    try {
      if (isEdit) {
        await api.patch(`/categories/${category.id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      activeTab = payload.kind;
      modal.close();
      toastSuccess('Categoria salva.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  if (isEdit) {
    form.querySelector('#delete-cat-btn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir categoria',
        message: `Excluir "${category.name}"? Transações associadas ficarão sem categoria.`,
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      try {
        await api.del(`/categories/${category.id}`);
        modal.close();
        toastSuccess('Categoria excluída.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}

export function destroy() {}
