import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { el, categoryOptionsHtml } from '../utils.js';
import { icon } from '../icons.js';

let container;
let categories = [];

const FIELD_LABELS = { DESCRIPTION: 'Descrição', PAYEE: 'Beneficiário', MEMO: 'Memo' };
const TYPE_LABELS = { CONTAINS: 'contém', STARTS_WITH: 'começa com', REGEX: 'regex', EQUALS: 'é igual a' };

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
  let rules;
  try {
    rules = await api.get('/rules');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  const header = el(`
    <div class="section-title">
      <h2>Regras de categorização</h2>
      <button class="btn small" id="new-rule-btn">+ Nova</button>
    </div>
  `);
  container.appendChild(header);
  container.appendChild(el('<p class="hint">A primeira regra habilitada que combinar com a transação (por prioridade) categoriza automaticamente.</p>'));

  const card = el('<div class="card"></div>');
  container.appendChild(card);

  if (rules.length === 0) {
    card.innerHTML = '<div class="empty-state">Nenhuma regra cadastrada.</div>';
  } else {
    rules.forEach((rule) => {
      const category = categories.find((c) => c.id === rule.categoryId);
      const row = el(`
        <div class="list-item">
          <div class="meta">
            <div class="title">${FIELD_LABELS[rule.matchField]} ${TYPE_LABELS[rule.matchType]} "${escapeHtml(rule.pattern)}"</div>
            <div class="subtitle">→ ${category ? escapeHtml(category.name) : '?'} · prioridade ${rule.priority}${rule.enabled ? '' : ' · desabilitada'}</div>
          </div>
          <button class="btn ghost" data-id="${rule.id}">${icon('edit', { size: 16 })}</button>
        </div>
      `);
      row.querySelector('button').addEventListener('click', () => openRuleForm(rule));
      card.appendChild(row);
    });
  }

  header.querySelector('#new-rule-btn').addEventListener('click', () => openRuleForm(null));
}

function openRuleForm(rule) {
  const isEdit = !!rule;
  const form = el(`
    <form id="rule-form">
      <div class="field">
        <label for="rule-category">Categoria</label>
        <select id="rule-category" name="categoryId">
          ${categoryOptionsHtml(categories, rule?.categoryId)}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="rule-field">Campo</label>
          <select id="rule-field" name="matchField">
            ${Object.entries(FIELD_LABELS).map(([v, l]) => `<option value="${v}" ${rule?.matchField === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="rule-type">Condição</label>
          <select id="rule-type" name="matchType">
            ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${rule?.matchType === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="rule-pattern">Padrão</label>
        <input id="rule-pattern" name="pattern" required value="${rule ? escapeHtml(rule.pattern) : ''}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="rule-priority">Prioridade</label>
          <input id="rule-priority" name="priority" type="number" value="${rule?.priority ?? 0}" />
        </div>
        <div class="field">
          <label for="rule-enabled">Habilitada</label>
          <select id="rule-enabled" name="enabled">
            <option value="1" ${rule?.enabled !== false ? 'selected' : ''}>Sim</option>
            <option value="0" ${rule?.enabled === false ? 'selected' : ''}>Não</option>
          </select>
        </div>
      </div>
      <div class="field-error" id="rule-form-error" hidden></div>
      <div class="btn-row">
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Criar regra'}</button>
      </div>
      ${isEdit ? '<div class="btn-row" style="margin-top:10px;"><button type="button" class="btn danger" id="delete-rule-btn">Excluir</button></div>' : ''}
    </form>
  `);

  const modal = openModal({ title: isEdit ? 'Editar regra' : 'Nova regra', contentEl: form });
  const errorEl = form.querySelector('#rule-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const payload = {
      categoryId: data.get('categoryId'),
      matchField: data.get('matchField'),
      matchType: data.get('matchType'),
      pattern: data.get('pattern'),
      priority: Number(data.get('priority')),
      enabled: data.get('enabled') === '1',
    };
    try {
      if (isEdit) {
        await api.patch(`/rules/${rule.id}`, payload);
      } else {
        await api.post('/rules', payload);
      }
      modal.close();
      toastSuccess('Regra salva.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  if (isEdit) {
    form.querySelector('#delete-rule-btn').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Excluir regra', message: 'Excluir esta regra de categorização?', confirmLabel: 'Excluir' });
      if (!ok) return;
      try {
        await api.del(`/rules/${rule.id}`);
        modal.close();
        toastSuccess('Regra excluída.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}

export function destroy() {}
