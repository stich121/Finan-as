import { api } from '../api.js';
import { toastError, toastSuccess } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { formatCurrency, formatDate, el } from '../utils.js';
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
  let goals;
  try {
    goals = await api.get('/goals');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '';
  const header = el(`
    <div class="section-title">
      <h2>Metas financeiras</h2>
      <button class="btn small" id="new-goal-btn">+ Nova</button>
    </div>
  `);
  container.appendChild(header);
  container.appendChild(el('<p class="hint">Guarde dinheiro para um objetivo e acompanhe o progresso.</p>'));

  if (goals.length === 0) {
    container.appendChild(el('<div class="card"><div class="empty-state">Nenhuma meta criada ainda.</div></div>'));
  } else {
    goals.forEach((goal) => container.appendChild(goalCard(goal)));
  }

  header.querySelector('#new-goal-btn').addEventListener('click', () => openGoalForm());
}

function goalCard(goal) {
  const over = goal.currentAmount > goal.targetAmount;
  const card = el(`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="title" style="font-weight:600;font-size:15px;">
            <span class="dot" style="background:${goal.color || '#38bdf8'}"></span> ${escapeHtml(goal.name)}
            ${goal.achievedAt ? `<span class="chip" style="margin-left:6px;border-color:var(--income);color:var(--income);">${icon('check', { size: 11 })} concluída</span>` : ''}
          </div>
          <div class="hint" style="margin-top:2px;">${formatCurrency(goal.currentAmount)} de ${formatCurrency(goal.targetAmount)}${goal.targetDate ? ' · até ' + formatDate(goal.targetDate) : ''}</div>
        </div>
        <button class="btn ghost" data-action="edit">${icon('edit', { size: 16 })}</button>
      </div>
      <div class="progress-bar ${over ? '' : ''}"><div style="width:${goal.progress}%"></div></div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn secondary small" data-action="add">Adicionar valor</button>
        <button class="btn secondary small" data-action="remove">Retirar valor</button>
      </div>
    </div>
  `);

  card.querySelector('[data-action="edit"]').addEventListener('click', () => openGoalForm(goal));
  card.querySelector('[data-action="add"]').addEventListener('click', () => openContributeForm(goal, 1));
  card.querySelector('[data-action="remove"]').addEventListener('click', () => openContributeForm(goal, -1));
  return card;
}

function openContributeForm(goal, sign) {
  const form = el(`
    <form id="contribute-form">
      <div class="field">
        <label for="contribute-amount">Valor a ${sign > 0 ? 'adicionar' : 'retirar'}</label>
        <input id="contribute-amount" name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div class="field-error" id="contribute-error" hidden></div>
      <button type="submit" class="btn">Confirmar</button>
    </form>
  `);
  const modal = openModal({ title: sign > 0 ? 'Adicionar valor à meta' : 'Retirar valor da meta', contentEl: form });
  const errorEl = form.querySelector('#contribute-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const amount = Number(new FormData(form).get('amount')) * sign;
    try {
      await api.post(`/goals/${goal.id}/contribute`, { amount });
      modal.close();
      toastSuccess('Meta atualizada.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

function openGoalForm(goal = null) {
  const isEdit = !!goal;
  const form = el(`
    <form id="goal-form">
      <div class="field">
        <label for="goal-name">Nome</label>
        <input id="goal-name" name="name" required value="${goal ? escapeHtml(goal.name) : ''}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="goal-target">Valor alvo</label>
          <input id="goal-target" name="targetAmount" type="number" step="0.01" min="0.01" required value="${goal ? goal.targetAmount : ''}" />
        </div>
        <div class="field">
          <label for="goal-date">Data alvo (opcional)</label>
          <input id="goal-date" name="targetDate" type="date" value="${goal?.targetDate ? goal.targetDate.slice(0, 10) : ''}" />
        </div>
      </div>
      <div class="field">
        <label for="goal-color">Cor</label>
        <input id="goal-color" name="color" type="color" value="${goal?.color || '#38bdf8'}" />
      </div>
      <div class="field-error" id="goal-form-error" hidden></div>
      <div class="btn-row">
        <button type="submit" class="btn">${isEdit ? 'Salvar' : 'Criar meta'}</button>
      </div>
      ${isEdit ? '<div class="btn-row" style="margin-top:10px;"><button type="button" class="btn danger" id="delete-goal-btn">Excluir meta</button></div>' : ''}
    </form>
  `);

  const modal = openModal({ title: isEdit ? 'Editar meta' : 'Nova meta', contentEl: form });
  const errorEl = form.querySelector('#goal-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      targetAmount: Number(data.get('targetAmount')),
      targetDate: data.get('targetDate') || null,
      color: data.get('color'),
    };
    try {
      if (isEdit) {
        await api.patch(`/goals/${goal.id}`, payload);
      } else {
        await api.post('/goals', payload);
      }
      modal.close();
      toastSuccess('Meta salva.');
      await load();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  if (isEdit) {
    form.querySelector('#delete-goal-btn').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Excluir meta', message: `Excluir a meta "${goal.name}"?`, confirmLabel: 'Excluir' });
      if (!ok) return;
      try {
        await api.del(`/goals/${goal.id}`);
        modal.close();
        toastSuccess('Meta excluída.');
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}
