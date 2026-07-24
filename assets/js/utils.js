export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function addMonths(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const ACCOUNT_TYPE_LABELS = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CREDIT_CARD: 'Cartão de crédito',
  CASH: 'Dinheiro',
  INVESTMENT: 'Investimento',
};

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function escapeHtmlUtil(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/**
 * Monta <option>/<optgroup> de categorias agrupando subcategorias sob a categoria pai.
 * @param {Array} categories lista de categorias (já filtrada por kind, se necessário)
 * @param {string|null} selectedId id pré-selecionado
 */
export function categoryOptionsHtml(categories, selectedId = null) {
  const ids = new Set(categories.map((c) => c.id));
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId));
  const opt = (c) => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${escapeHtmlUtil(c.name)}</option>`;
  return roots
    .map((root) => {
      const children = root.parentId ? [] : categories.filter((c) => c.parentId === root.id);
      if (children.length === 0) return opt(root);
      return `<optgroup label="${escapeHtmlUtil(root.name)}">${opt(root)}${children.map(opt).join('')}</optgroup>`;
    })
    .join('');
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
