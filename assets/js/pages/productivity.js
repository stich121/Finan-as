import { api } from '../api.js';
import { getState } from '../state.js';
import { formatCurrency, formatDate, formatMonthLabel, el, categoryOptionsHtml } from '../utils.js';
import { openModal } from '../components/modal.js';
import { toastError, toastSuccess } from '../components/toast.js';

let container;
let data;
let activeTab = 'agenda';

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function render(root) {
  container = root;
  container.innerHTML = '<div class="spinner">Preparando seu planejamento…</div>';
  await load();
}

async function load() {
  try {
    data = await api.get(`/productivity/overview?month=${getState().selectedMonth}`);
    paint();
  } catch (error) {
    container.innerHTML = `<div class="empty-state">Não foi possível carregar o planejamento: ${escapeHtml(error.message)}</div>`;
  }
}

function paint() {
  container.innerHTML = `
    <section class="planning-hero">
      <div><span class="eyebrow">Central financeira</span><h2>Decida hoje com visão do futuro.</h2><p>Agenda, dívidas, assinaturas, patrimônio e organização em um só lugar.</p></div>
      <div class="planning-hero-balance"><span>Patrimônio estimado</span><strong class="money-value">${formatCurrency(data.netWorth.current)}</strong></div>
    </section>
    <div class="stat-grid planning-flow">
      <div class="stat-card"><div class="value money-value">${formatCurrency(data.cashflow.days30)}</div><div class="label">Saldo em 30 dias</div></div>
      <div class="stat-card"><div class="value money-value">${formatCurrency(data.cashflow.days60)}</div><div class="label">Saldo em 60 dias</div></div>
      <div class="stat-card"><div class="value money-value">${formatCurrency(data.cashflow.days90)}</div><div class="label">Saldo em 90 dias</div></div>
    </div>
    <div class="tabs planning-tabs" role="tablist">
      ${[
        ['agenda', 'Agenda'],
        ['organize', 'Organizar'],
        ['debts', 'Dívidas'],
        ['share', 'Compartilhar'],
        ['insights', 'Análises'],
        ['receipts', 'Comprovantes'],
      ].map(([key, label]) => `<button role="tab" data-tab="${key}" class="${activeTab === key ? 'active' : ''}">${label}</button>`).join('')}
    </div>
    <div id="planning-content"></div>
  `;
  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      container.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
      paintTab();
    });
  });
  paintTab();
}

function paintTab() {
  const content = container.querySelector('#planning-content');
  const painters = {
    agenda: paintAgenda,
    organize: paintOrganize,
    debts: paintDebts,
    share: paintShare,
    insights: paintInsights,
    receipts: paintReceipts,
  };
  painters[activeTab](content);
}

function paintAgenda(content) {
  const events = data.calendar.slice(0, 60);
  content.innerHTML = `
    <div class="section-title"><h2>Calendário financeiro · próximos 90 dias</h2><button class="btn small secondary" id="notify-upcoming">Ativar lembretes</button></div>
    <div class="calendar-strip">
      ${events.length ? events.map((event) => `
        <article class="calendar-event ${event.kind}">
          <time><strong>${event.date.slice(8, 10)}</strong><span>${new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</span></time>
          <div class="meta"><strong>${escapeHtml(event.title)}</strong><small>${event.status === 'PENDING' ? 'Pendente' : event.kind === 'invoice' ? 'Fatura' : event.kind === 'recurring' ? 'Recorrente' : 'Confirmado'}</small></div>
          <b class="money-value ${event.amount < 0 ? 'expense' : 'income'}">${formatCurrency(event.amount)}</b>
        </article>
      `).join('') : '<div class="empty-state">Nenhum vencimento ou lançamento futuro encontrado.</div>'}
    </div>
  `;
  content.querySelector('#notify-upcoming').addEventListener('click', enableNotifications);
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toastError('Este navegador não oferece notificações.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  localStorage.setItem('finance-notifications', 'enabled');
  const next = data.calendar.find((event) => event.date >= new Date().toISOString().slice(0, 10));
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
  if (registration?.periodicSync) {
    try {
      await registration.periodicSync.register('finance-reminders', { minInterval: 12 * 60 * 60 * 1000 });
    } catch {
      /* O navegador pode limitar sincronizações em segundo plano. */
    }
  }
  if (next) {
    const options = {
      body: `${next.title} · ${formatCurrency(next.amount)} em ${formatDate(next.date)}`,
      icon: '/icons/icon-192.png',
      data: { url: '/planning.php' },
    };
    if (registration) await registration.showNotification('Próximo compromisso financeiro', options);
    else new Notification('Próximo compromisso financeiro', options);
  }
  toastSuccess('Lembretes ativados neste dispositivo.');
}

function paintOrganize(content) {
  content.innerHTML = `
    <div class="section-title"><h2>Conciliação bancária</h2><button class="btn small secondary" id="split-transaction">Dividir uma compra</button></div>
    <div class="planning-grid">
      ${data.accounts.filter((account) => account.type !== 'CREDIT_CARD').map((account) => `
        <article class="card reconcile-card">
          <span class="dot" style="background:${account.color || '#67e8f9'}"></span>
          <div><strong>${escapeHtml(account.name)}</strong><small>Saldo no app: <span class="money-value">${formatCurrency(account.balance)}</span></small></div>
          <button class="btn small secondary" data-reconcile="${account.id}">Conferir</button>
          <p>${account.lastReconciledAt ? `Última conferência: ${formatDate(account.lastReconciledAt.slice(0, 10))}` : 'Ainda não conciliada'}${account.lastDifference ? ` · diferença ${formatCurrency(account.lastDifference)}` : ''}</p>
        </article>
      `).join('')}
    </div>
    <div class="section-title"><h2>Assinaturas detectadas</h2></div>
    <div class="card">
      ${data.subscriptions.length ? data.subscriptions.map((item) => `
        <div class="list-item"><div class="meta"><div class="title">${escapeHtml(item.merchant)}</div><div class="subtitle">${item.occurrences} cobranças · ${item.confidence}% de confiança</div></div><strong class="money-value">${formatCurrency(item.averageAmount)}/mês</strong></div>
      `).join('') : '<div class="empty-state">Ainda não há histórico suficiente para detectar assinaturas.</div>'}
    </div>
    <div class="section-title"><h2>Fechamento de ${formatMonthLabel(data.month)}</h2></div>
    <div class="card closing-checklist">
      ${data.closing.checklist.map((item) => `<label><input type="checkbox" data-closing="${item.key}" ${item.done ? 'checked' : ''}><span>${escapeHtml(item.label)}</span></label>`).join('')}
      <button class="btn" id="save-closing">Salvar fechamento</button>
    </div>
    <div class="section-title"><h2>Histórico de alterações</h2></div>
    <div class="card">
      ${data.activity.length ? data.activity.map((item) => `
        <div class="list-item"><div class="meta"><div class="title">${escapeHtml(item.description)}</div><div class="subtitle">${new Date(item.createdAt.replace(' ', 'T')).toLocaleString('pt-BR')}</div></div>
        ${item.undoable && !item.undoneAt ? `<button class="btn ghost small" data-undo="${item.id}">Desfazer</button>` : ''}</div>
      `).join('') : '<div class="empty-state">As próximas mudanças aparecerão aqui.</div>'}
    </div>
  `;
  content.querySelectorAll('[data-reconcile]').forEach((button) => button.addEventListener('click', () => openReconcile(button.dataset.reconcile)));
  content.querySelector('#split-transaction').addEventListener('click', openSplitTransaction);
  content.querySelector('#save-closing').addEventListener('click', saveClosing);
  content.querySelectorAll('[data-undo]').forEach((button) => button.addEventListener('click', async () => {
    await api.post(`/productivity/undo/${button.dataset.undo}`, {});
    toastSuccess('Alteração desfeita.');
    await load();
  }));
}

function openReconcile(accountId) {
  const account = data.accounts.find((item) => item.id === accountId);
  const form = el(`
    <form>
      <p class="hint">Informe o saldo exibido no banco. O aplicativo calculará qualquer diferença sem alterar seus lançamentos.</p>
      <div class="field"><label>Saldo no banco</label><input name="statementBalance" type="number" step="0.01" value="${account.balance}" required></div>
      <div class="field"><label>Observação</label><input name="note" maxlength="255"></div>
      <button class="btn">Conciliar</button>
    </form>
  `);
  const modal = openModal({ title: `Conferir ${account.name}`, contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const result = await api.post('/productivity/reconcile', {
      accountId, statementBalance: values.get('statementBalance'), note: values.get('note'),
    });
    modal.close();
    toastSuccess(Math.abs(result.difference) < 0.01 ? 'Saldo conferido.' : `Diferença encontrada: ${formatCurrency(result.difference)}`);
    await load();
  });
}

async function openSplitTransaction() {
  const [transactions, categories] = await Promise.all([
    api.get('/transactions?type=EXPENSE&limit=100'),
    api.get('/categories'),
  ]);
  const expenses = transactions.items || [];
  const expenseCategories = categories.filter((category) => category.kind === 'EXPENSE');
  if (!expenses.length) {
    toastError('Nenhuma despesa disponível para dividir.');
    return;
  }
  const form = el(`
    <form>
      <div class="field"><label>Compra</label><select name="transactionId">${expenses.map((tx) => `<option value="${tx.id}" data-amount="${Math.abs(tx.amount)}">${formatDate(tx.date)} · ${escapeHtml(tx.description || tx.payee || 'Despesa')} · ${formatCurrency(Math.abs(tx.amount))}</option>`).join('')}</select></div>
      <div class="split-grid">
        <div class="field"><label>Categoria 1</label><select name="category1">${categoryOptionsHtml(expenseCategories)}</select></div>
        <div class="field"><label>Valor 1</label><input name="amount1" type="number" min="0.01" step="0.01" required></div>
        <div class="field"><label>Categoria 2</label><select name="category2">${categoryOptionsHtml(expenseCategories)}</select></div>
        <div class="field"><label>Valor 2</label><input name="amount2" type="number" min="0.01" step="0.01" required></div>
      </div>
      <button class="btn">Salvar divisão</button>
    </form>
  `);
  const purchase = form.querySelector('[name="transactionId"]');
  const fillAmounts = () => {
    const amount = Number(purchase.selectedOptions[0].dataset.amount);
    form.querySelector('[name="amount1"]').value = (amount / 2).toFixed(2);
    form.querySelector('[name="amount2"]').value = (amount - amount / 2).toFixed(2);
  };
  fillAmounts();
  purchase.addEventListener('change', fillAmounts);
  const modal = openModal({ title: 'Dividir compra por categorias', contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    await api.post('/productivity/splits', {
      transactionId: values.get('transactionId'),
      items: [
        { categoryId: values.get('category1'), amount: values.get('amount1') },
        { categoryId: values.get('category2'), amount: values.get('amount2') },
      ],
    });
    modal.close();
    toastSuccess('Compra dividida.');
    await load();
  });
}

async function saveClosing() {
  const checklist = data.closing.checklist.map((item) => ({
    ...item,
    done: container.querySelector(`[data-closing="${item.key}"]`).checked,
  }));
  const result = await api.post('/productivity/closing', { month: data.month, checklist });
  toastSuccess(result.closed ? 'Mês fechado com sucesso.' : 'Progresso do fechamento salvo.');
  await load();
}

function paintDebts(content) {
  content.innerHTML = `
    <div class="section-title"><h2>Planejamento de dívidas</h2><button class="btn small" id="new-debt">+ Dívida</button></div>
    <div class="planning-grid">
      ${data.debts.length ? data.debts.map((debt) => `
        <article class="card debt-card ${debt.status === 'PAID' ? 'paid' : ''}">
          <span class="eyebrow">${debt.status === 'PAID' ? 'Quitada' : `${debt.annualRate}% ao ano`}</span>
          <h3>${escapeHtml(debt.name)}</h3>
          <strong class="money-value">${formatCurrency(debt.balance)}</strong>
          <small>Parcela mínima ${formatCurrency(debt.minimumPayment)}</small>
          <p>${debt.projection.payoffPossible ? `Previsão: ${debt.projection.months} meses · juros ${formatCurrency(debt.projection.interest)}` : 'A parcela não cobre os juros mensais.'}</p>
          ${debt.status === 'ACTIVE' ? `<button class="btn small secondary" data-pay-debt="${debt.id}">Atualizar saldo</button>` : ''}
        </article>
      `).join('') : '<div class="empty-state">Cadastre suas dívidas para criar uma estratégia de quitação.</div>'}
    </div>
    <div class="section-title"><h2>Simulador “E se eu economizar?”</h2></div>
    <div class="card savings-simulator">
      <div class="field-row">
        <div class="field"><label>Economia mensal</label><input id="saving-monthly" type="number" min="0" step="10" value="500"></div>
        <div class="field"><label>Prazo em meses</label><input id="saving-months" type="number" min="1" max="600" value="24"></div>
        <div class="field"><label>Rendimento anual (%)</label><input id="saving-rate" type="number" min="0" step="0.1" value="8"></div>
      </div>
      <div class="simulator-result"><span>Valor acumulado</span><strong id="saving-result" class="money-value"></strong><small id="saving-detail"></small></div>
    </div>
  `;
  content.querySelector('#new-debt').addEventListener('click', openDebtForm);
  content.querySelectorAll('[data-pay-debt]').forEach((button) => button.addEventListener('click', () => updateDebt(button.dataset.payDebt)));
  content.querySelectorAll('.savings-simulator input').forEach((input) => input.addEventListener('input', calculateSavings));
  calculateSavings();
}

function calculateSavings() {
  const monthly = Number(container.querySelector('#saving-monthly').value) || 0;
  const months = Number(container.querySelector('#saving-months').value) || 0;
  const rate = (Number(container.querySelector('#saving-rate').value) || 0) / 1200;
  const total = rate > 0 ? monthly * ((Math.pow(1 + rate, months) - 1) / rate) : monthly * months;
  container.querySelector('#saving-result').textContent = formatCurrency(total);
  container.querySelector('#saving-detail').textContent = `${formatCurrency(monthly * months)} guardados · ${formatCurrency(total - monthly * months)} em rendimento estimado`;
}

function openDebtForm() {
  const form = el(`
    <form>
      <div class="field"><label>Nome da dívida</label><input name="name" required></div>
      <div class="field-row"><div class="field"><label>Saldo devedor</label><input name="balance" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Parcela mínima</label><input name="minimumPayment" type="number" min="0.01" step="0.01" required></div></div>
      <div class="field-row"><div class="field"><label>Juros ao ano (%)</label><input name="annualRate" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Dia do vencimento</label><input name="dueDay" type="number" min="1" max="28"></div></div>
      <button class="btn">Criar planejamento</button>
    </form>
  `);
  const modal = openModal({ title: 'Nova dívida', contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    await api.post('/productivity/debts', values);
    modal.close();
    toastSuccess('Dívida adicionada.');
    await load();
  });
}

function updateDebt(id) {
  const debt = data.debts.find((item) => item.id === id);
  const form = el(`<form><div class="field"><label>Novo saldo devedor</label><input name="balance" type="number" min="0" step="0.01" value="${debt.balance}" required></div><label class="privacy-toggle"><input name="paid" type="checkbox"><span><strong>Marcar como quitada</strong></span></label><button class="btn" style="margin-top:16px;">Atualizar</button></form>`);
  const modal = openModal({ title: debt.name, contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    await api.patch(`/productivity/debts/${id}`, { balance: values.get('balance'), status: values.get('paid') ? 'PAID' : 'ACTIVE' });
    modal.close();
    toastSuccess('Dívida atualizada.');
    await load();
  });
}

function paintShare(content) {
  content.innerHTML = `
    <div class="section-title"><h2>Despesas com outras pessoas</h2><button class="btn small" id="new-shared">+ Dividir</button></div>
    <div class="card">
      ${data.sharedExpenses.length ? data.sharedExpenses.map((item) => `
        <div class="list-item"><div class="meta"><div class="title">${escapeHtml(item.description)}</div><div class="subtitle">${escapeHtml(item.personName)} deve ${formatCurrency(item.personAmount)}${item.dueDate ? ` · até ${formatDate(item.dueDate)}` : ''}</div></div>
        <button class="btn small ${item.status === 'PAID' ? 'secondary' : ''}" data-shared-status="${item.id}" data-status="${item.status}">${item.status === 'PAID' ? 'Recebido' : 'Marcar recebido'}</button></div>
      `).join('') : '<div class="empty-state">Nenhuma despesa dividida.</div>'}
    </div>
    <div class="section-title"><h2>Carteiras compartilhadas</h2><button class="btn small secondary" id="new-wallet">+ Carteira</button></div>
    <div class="planning-grid">
      ${data.wallets.length ? data.wallets.map((wallet) => `
        <article class="card shared-wallet-card"><span class="eyebrow">${escapeHtml(wallet.memberName || wallet.memberEmail || 'Uso pessoal')}</span><h3>${escapeHtml(wallet.name)}</h3><strong class="money-value">${formatCurrency(wallet.total)}</strong><button class="btn small secondary" data-wallet-entry="${wallet.id}">Adicionar gasto</button></article>
      `).join('') : '<div class="empty-state">Crie uma carteira para casal, família ou viagem.</div>'}
    </div>
  `;
  content.querySelector('#new-shared').addEventListener('click', openSharedExpense);
  content.querySelector('#new-wallet').addEventListener('click', openWallet);
  content.querySelectorAll('[data-wallet-entry]').forEach((button) => button.addEventListener('click', () => openWalletEntry(button.dataset.walletEntry)));
  content.querySelectorAll('[data-shared-status]').forEach((button) => button.addEventListener('click', async () => {
    await api.patch(`/productivity/shared-expenses/${button.dataset.sharedStatus}`, { status: button.dataset.status === 'PAID' ? 'PENDING' : 'PAID' });
    await load();
  }));
}

function openSharedExpense() {
  const form = el(`<form><div class="field"><label>Descrição</label><input name="description" required></div><div class="field-row"><div class="field"><label>Pessoa</label><input name="personName" required></div><div class="field"><label>E-mail (opcional)</label><input name="personEmail" type="email"></div></div><div class="field-row"><div class="field"><label>Valor total</label><input name="totalAmount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Parte da pessoa</label><input name="personAmount" type="number" min="0.01" step="0.01" required></div></div><div class="field"><label>Vencimento</label><input name="dueDate" type="date"></div><button class="btn">Salvar divisão</button></form>`);
  const modal = openModal({ title: 'Dividir uma despesa', contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await api.post('/productivity/shared-expenses', Object.fromEntries(new FormData(form)));
    modal.close(); toastSuccess('Despesa dividida.'); await load();
  });
}

function openWallet() {
  const form = el(`<form><div class="field"><label>Nome da carteira</label><input name="name" required placeholder="Casa, Família, Viagem…"></div><div class="field-row"><div class="field"><label>Nome do participante</label><input name="memberName"></div><div class="field"><label>E-mail</label><input name="memberEmail" type="email"></div></div><p class="hint">O e-mail identifica o participante. Convites automáticos poderão ser adicionados quando um serviço de e-mail for configurado.</p><button class="btn">Criar carteira</button></form>`);
  const modal = openModal({ title: 'Carteira compartilhada', contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); await api.post('/productivity/wallets', Object.fromEntries(new FormData(form))); modal.close(); toastSuccess('Carteira criada.'); await load();
  });
}

function openWalletEntry(walletId) {
  const form = el(`<form><div class="field"><label>Descrição</label><input name="description" required></div><div class="field-row"><div class="field"><label>Valor</label><input name="amount" type="number" step="0.01" required></div><div class="field"><label>Data</label><input name="entryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div></div><div class="field"><label>Pago por</label><input name="paidBy"></div><button class="btn">Adicionar</button></form>`);
  const modal = openModal({ title: 'Novo gasto compartilhado', contentEl: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); await api.post('/productivity/wallet-entries', { walletId, ...Object.fromEntries(new FormData(form)) }); modal.close(); toastSuccess('Gasto adicionado.'); await load();
  });
}

function paintInsights(content) {
  const current = data.insights.current;
  const previous = data.insights.previous;
  const expenseChange = previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : 0;
  const heatMax = Math.max(1, ...data.insights.heatmap.map((item) => item.amount));
  content.innerHTML = `
    <div class="stat-grid report-stats">
      <div class="stat-card"><div class="value money-value">${formatCurrency(current.expense)}</div><div class="label">Despesas no mês</div></div>
      <div class="stat-card"><div class="value ${expenseChange > 0 ? 'expense' : 'income'}">${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}%</div><div class="label">Vs. mês anterior</div></div>
      <div class="stat-card"><div class="value money-value">${formatCurrency(data.insights.essential.essential)}</div><div class="label">Essenciais</div></div>
      <div class="stat-card"><div class="value money-value">${formatCurrency(data.insights.essential.nonessential)}</div><div class="label">Não essenciais</div></div>
    </div>
    <div class="dashboard-grid">
      <section><div class="section-title"><h2>Mapa de calor dos gastos</h2></div><div class="card"><div class="expense-heatmap">${Array.from({ length: 31 }, (_, index) => { const item = data.insights.heatmap.find((row) => row.day === index + 1); const intensity = item ? Math.max(.12, item.amount / heatMax) : .04; return `<span title="Dia ${index + 1}: ${formatCurrency(item?.amount || 0)}" style="--heat:${intensity}">${index + 1}</span>`; }).join('')}</div></div></section>
      <section><div class="section-title"><h2>Evolução do patrimônio</h2></div><div class="card net-worth-history">${data.netWorth.history.map((item) => `<div><span>${formatDate(item.date)}</span><i style="--height:${Math.max(8, Math.min(100, Math.abs(item.netWorth) / Math.max(1, ...data.netWorth.history.map((point) => Math.abs(point.netWorth))) * 100))}%"></i><strong class="money-value">${formatCurrency(item.netWorth)}</strong></div>`).join('') || '<div class="empty-state">O histórico será construído automaticamente.</div>'}</div></section>
    </div>
    <div class="section-title"><h2>Ranking de estabelecimentos</h2><a href="/tax-report.php">Relatório anual</a></div>
    <div class="card">${data.insights.merchants.map((merchant, index) => `<div class="list-item"><span class="ranking">${index + 1}</span><div class="meta" style="flex:1"><div class="title">${escapeHtml(merchant.name)}</div><div class="subtitle">${merchant.purchases} compra(s)</div></div><strong class="money-value">${formatCurrency(merchant.amount)}</strong></div>`).join('') || '<div class="empty-state">Sem despesas neste mês.</div>'}</div>
    <div class="section-title"><h2>Assistente financeiro</h2></div>
    <div class="card finance-assistant">
      <div id="assistant-answer">Pergunte sobre gastos, saldo futuro, patrimônio, assinaturas ou economia.</div>
      <form id="assistant-form"><input name="question" placeholder="Ex.: Quanto gastei este mês?" required><button class="btn small">Perguntar</button></form>
      <div class="assistant-suggestions"><button>Como está meu saldo futuro?</button><button>Quanto gastei este mês?</button><button>Tenho assinaturas?</button></div>
    </div>
  `;
  const ask = (question) => {
    content.querySelector('#assistant-answer').textContent = answerQuestion(question);
  };
  content.querySelector('#assistant-form').addEventListener('submit', (event) => { event.preventDefault(); ask(new FormData(event.target).get('question')); });
  content.querySelectorAll('.assistant-suggestions button').forEach((button) => button.addEventListener('click', () => ask(button.textContent)));
}

function answerQuestion(question) {
  const text = String(question).toLowerCase();
  if (text.includes('saldo') || text.includes('futuro')) return `Sua projeção é ${formatCurrency(data.cashflow.days30)} em 30 dias, ${formatCurrency(data.cashflow.days60)} em 60 dias e ${formatCurrency(data.cashflow.days90)} em 90 dias.`;
  if (text.includes('assinatura') || text.includes('recorr')) return data.subscriptions.length ? `Encontrei ${data.subscriptions.length} possível(is) assinatura(s), somando aproximadamente ${formatCurrency(data.subscriptions.reduce((sum, item) => sum + item.averageAmount, 0))} por mês.` : 'Ainda não identifiquei assinaturas recorrentes.';
  if (text.includes('patrim')) return `Seu patrimônio líquido estimado é ${formatCurrency(data.netWorth.current)}, com ${formatCurrency(data.netWorth.assets)} em ativos e ${formatCurrency(data.netWorth.liabilities)} em obrigações.`;
  if (text.includes('essencial')) return `Neste mês, ${formatCurrency(data.insights.essential.essential)} foram gastos essenciais e ${formatCurrency(data.insights.essential.nonessential)} não essenciais.`;
  if (text.includes('dívida') || text.includes('divida')) return data.debts.length ? `Você possui ${data.debts.filter((item) => item.status === 'ACTIVE').length} dívida(s) ativa(s), totalizando ${formatCurrency(data.debts.filter((item) => item.status === 'ACTIVE').reduce((sum, item) => sum + item.balance, 0))}.` : 'Nenhuma dívida foi cadastrada.';
  if (text.includes('econom') || text.includes('sobr')) return `O resultado atual do mês é ${formatCurrency(data.insights.current.income - data.insights.current.expense)}. Use o simulador na aba Dívidas para testar uma economia mensal.`;
  return `Neste mês você recebeu ${formatCurrency(data.insights.current.income)} e gastou ${formatCurrency(data.insights.current.expense)}. Seu saldo projetado para 30 dias é ${formatCurrency(data.cashflow.days30)}.`;
}

function paintReceipts(content) {
  content.innerHTML = `
    <div class="section-title"><h2>Comprovantes e OCR</h2></div>
    <div class="card receipt-reader">
      <p class="hint">Selecione uma foto. A leitura acontece no próprio navegador; depois você pode guardar o arquivo e o texto reconhecido.</p>
      <input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
      <button class="btn secondary" id="receipt-read">Ler comprovante</button>
      <div id="ocr-progress" class="hint"></div>
      <textarea id="ocr-text" rows="8" placeholder="O texto reconhecido aparecerá aqui…"></textarea>
      <button class="btn" id="receipt-save">Salvar comprovante</button>
    </div>
    <div class="section-title"><h2>Arquivos recentes</h2></div>
    <div class="card">${data.attachments.map((file) => `<a class="list-item" href="/api/productivity/attachment/${file.id}" target="_blank"><div class="meta"><div class="title">${escapeHtml(file.originalName)}</div><div class="subtitle">${Math.round(file.fileSize / 1024)} KB · ${new Date(file.createdAt.replace(' ', 'T')).toLocaleString('pt-BR')}</div></div><span>Ver</span></a>`).join('') || '<div class="empty-state">Nenhum comprovante salvo.</div>'}</div>
  `;
  content.querySelector('#receipt-read').addEventListener('click', readReceipt);
  content.querySelector('#receipt-save').addEventListener('click', saveReceipt);
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor OCR.'));
    document.head.appendChild(script);
  });
  return window.Tesseract;
}

async function readReceipt() {
  const file = container.querySelector('#receipt-file').files[0];
  if (!file || file.type === 'application/pdf') {
    toastError('Para OCR, selecione uma imagem JPG, PNG ou WEBP.');
    return;
  }
  const progress = container.querySelector('#ocr-progress');
  progress.textContent = 'Carregando leitor…';
  try {
    const tesseract = await loadTesseract();
    const result = await tesseract.recognize(file, 'por', {
      logger: (message) => {
        if (message.progress) progress.textContent = `Lendo… ${Math.round(message.progress * 100)}%`;
      },
    });
    container.querySelector('#ocr-text').value = result.data.text.trim();
    progress.textContent = 'Leitura concluída.';
  } catch (error) {
    progress.textContent = '';
    toastError(error.message);
  }
}

async function saveReceipt() {
  const file = container.querySelector('#receipt-file').files[0];
  if (!file) {
    toastError('Selecione um arquivo.');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ocrText', container.querySelector('#ocr-text').value);
  await api.postForm('/productivity/attachments', formData);
  toastSuccess('Comprovante salvo.');
  await load();
}

export function destroy() {}
