import { icon } from '../icons.js';

export function openModal({ title, contentEl, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const h2 = document.createElement('h2');
  h2.textContent = title || '';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.innerHTML = icon('close', { size: 18 });
  header.append(h2, closeBtn);

  sheet.appendChild(header);
  sheet.appendChild(contentEl);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    if (onClose) onClose();
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return { close, sheet };
}
