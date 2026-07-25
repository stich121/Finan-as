import { api } from '../api.js';
import { getState } from '../state.js';
import { toastSuccess } from '../components/toast.js';
import { el } from '../utils.js';
import { icon } from '../icons.js';

let container;

export async function render(root) {
  container = root;
  const user = getState().user;

  container.innerHTML = '';
  container.appendChild(el('<div class="section-title"><h2>Ajustes</h2></div>'));

  const profileCard = el(`
    <div class="card">
      <h2>Perfil</h2>
      <p class="hint">${escapeHtml(user.name)}</p>
      <p class="hint">${escapeHtml(user.email)}</p>
    </div>
  `);
  container.appendChild(profileCard);

  const linksCard = el(`
    <div class="card">
      <a href="/accounts.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Contas e cartões</div><div class="subtitle">Saldos, limites e vencimentos</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/budgets.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Orçamentos</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/reports.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Relatórios e exportação</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/categories.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Categorias</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/tags.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Tags</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/rules.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Regras de categorização</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/recurring.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Recorrências</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
      <a href="/goals.php" class="list-item" style="cursor:pointer;"><div class="meta"><div class="title">Metas financeiras</div></div>${icon('chevronRight', { size: 16, className: 'inline-icon' })}</a>
    </div>
  `);
  container.appendChild(linksCard);

  const themeCard = el(`
    <div class="card">
      <h2>Tema</h2>
      <div class="field">
        <select id="theme-select">
          <option value="system" ${user.theme === 'system' ? 'selected' : ''}>Automático</option>
          <option value="light" ${user.theme === 'light' ? 'selected' : ''}>Claro</option>
          <option value="dark" ${user.theme === 'dark' ? 'selected' : ''}>Escuro</option>
        </select>
      </div>
      <p class="hint">A aparência acompanha sua preferência e pode ser alterada a qualquer momento.</p>
    </div>
  `);
  container.appendChild(themeCard);
  themeCard.querySelector('#theme-select').addEventListener('change', async (event) => {
    const theme = event.target.value;
    try {
      await api.patch('/auth/preferences', { theme });
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.resolvedTheme = theme === 'system'
        ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : theme;
      toastSuccess('Tema atualizado.');
    } catch (err) {
      event.target.value = user.theme;
    }
  });

  const notificationSupported = 'Notification' in window;
  const notificationsEnabled = notificationSupported
    && Notification.permission === 'granted'
    && localStorage.getItem('finance-notifications') === 'enabled';
  const notificationCard = el(`
    <div class="card">
      <h2>Alertas no dispositivo</h2>
      <p class="hint">Receba um aviso ao abrir o app quando houver faturas atrasadas ou orçamentos no limite.</p>
      <button class="btn secondary" id="notification-btn" ${notificationSupported ? '' : 'disabled'}>
        ${notificationSupported ? (notificationsEnabled ? 'Desativar alertas' : 'Ativar alertas') : 'Não disponível neste navegador'}
      </button>
    </div>
  `);
  container.appendChild(notificationCard);
  notificationCard.querySelector('#notification-btn').addEventListener('click', async (event) => {
    if (localStorage.getItem('finance-notifications') === 'enabled') {
      localStorage.removeItem('finance-notifications');
      event.target.textContent = 'Ativar alertas';
      toastSuccess('Alertas desativados neste dispositivo.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      localStorage.setItem('finance-notifications', 'enabled');
      event.target.textContent = 'Desativar alertas';
      toastSuccess('Alertas ativados neste dispositivo.');
    }
  });

  const passwordCard = el(`
    <div class="card">
      <h2>Alterar senha</h2>
      <form id="password-form">
        <div class="field">
          <label for="current-password">Senha atual</label>
          <input id="current-password" name="currentPassword" type="password" required />
        </div>
        <div class="field">
          <label for="new-password">Nova senha</label>
          <input id="new-password" name="newPassword" type="password" minlength="8" required />
        </div>
        <div class="field-error" id="password-error" hidden></div>
        <button type="submit" class="btn">Alterar senha</button>
      </form>
    </div>
  `);
  container.appendChild(passwordCard);

  const logoutBtn = el('<button class="btn danger" id="logout-btn">Sair</button>');
  container.appendChild(logoutBtn);

  passwordCard.querySelector('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = passwordCard.querySelector('#password-error');
    errorEl.hidden = true;
    const data = new FormData(e.target);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.get('currentPassword'),
        newPassword: data.get('newPassword'),
      });
      toastSuccess('Senha alterada. Faça login novamente.');
      window.location.href = '/login.php';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      /* noop */
    }
    window.location.href = '/login.php';
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
