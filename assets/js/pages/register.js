import { api, ApiError } from '../api.js';
import { icon } from '../icons.js';

export async function render(container) {
  const wrap = document.createElement('div');
  wrap.className = 'auth-shell';
  wrap.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <div class="logo">${icon('wallet', { size: 30 })}</div>
        <h1>Criar conta</h1>
        <p>Comece a organizar suas finanças</p>
      </div>
      <form id="register-form">
        <div class="field">
          <label for="name">Nome</label>
          <input type="text" id="name" name="name" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="email">E-mail</label>
          <input type="email" id="email" name="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="password">Senha</label>
          <input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required />
          <div class="hint">Mínimo de 8 caracteres.</div>
        </div>
        <div class="field-error" id="form-error" hidden></div>
        <button type="submit" class="btn" id="submit-btn">Criar conta</button>
      </form>
      <div class="auth-switch">Já tem conta? <a href="/login.php">Entrar</a></div>
    </div>
  `;
  container.appendChild(wrap);

  const form = wrap.querySelector('#register-form');
  const errorEl = wrap.querySelector('#form-error');
  const submitBtn = wrap.querySelector('#submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando…';
    try {
      const data = new FormData(form);
      await api.post('/auth/register', {
        name: data.get('name'),
        email: data.get('email'),
        password: data.get('password'),
      });
      window.location.href = '/index.php';
    } catch (err) {
      errorEl.textContent = err instanceof ApiError ? err.message : 'Erro ao criar conta.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Criar conta';
    }
  });
}
