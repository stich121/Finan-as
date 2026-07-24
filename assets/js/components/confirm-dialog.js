import { openModal } from './modal.js';

export function confirmDialog({ title = 'Confirmar', message, confirmLabel = 'Confirmar', danger = true }) {
  return new Promise((resolve) => {
    const content = document.createElement('div');

    const p = document.createElement('p');
    p.style.color = 'var(--text-muted)';
    p.style.fontSize = '14px';
    p.textContent = message;
    content.appendChild(p);

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.style.marginTop = '18px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Cancelar';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = `btn ${danger ? 'danger' : ''}`.trim();
    okBtn.textContent = confirmLabel;

    row.append(cancelBtn, okBtn);
    content.appendChild(row);

    const modal = openModal({ title, contentEl: content, onClose: () => resolve(false) });

    cancelBtn.addEventListener('click', () => {
      resolve(false);
      modal.close();
    });
    okBtn.addEventListener('click', () => {
      resolve(true);
      modal.close();
    });
  });
}
