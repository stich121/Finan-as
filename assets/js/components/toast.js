let root = null;

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

export function toast(message, type = 'default', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast${type !== 'default' ? ' ' + type : ''}`;
  el.textContent = message;
  ensureRoot().appendChild(el);
  setTimeout(() => el.remove(), duration);
}

export const toastError = (msg) => toast(msg, 'error', 4000);
export const toastSuccess = (msg) => toast(msg, 'success');
