import { api, ApiError } from '../api.js';

export async function render(container) {
  const wrap = document.createElement('div');
  wrap.className = 'auth-shell';
  wrap.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <div class="logo">💰</div>
        <h1>Finanças</h1>
        <p>Controle financeiro pessoal</p>
      </div>
      <form id="login-form">
        <div class="field">
          <label for="email">E-mail</label>
          <input type="email" id="email" name="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="password">Senha</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required />
        </div>
        <div class="field-error" id="form-error" hidden></div>
        <button type="submit" class="btn" id="submit-btn">Entrar</button>
      </form>
      <div class="auth-switch">Ainda não tem conta? <a href="/register.php">Criar conta</a></div>
    </div>
  `;
  container.appendChild(wrap);

  const form = wrap.querySelector('#login-form');
  const errorEl = wrap.querySelector('#form-error');
  const submitBtn = wrap.querySelector('#submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando…';
    try {
      const data = new FormData(form);
      await api.post('/auth/login', {
        email: data.get('email'),
        password: data.get('password'),
      });
      window.location.href = '/index.php';
    } catch (err) {
      errorEl.textContent = err instanceof ApiError ? err.message : 'Erro ao entrar.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });
}
