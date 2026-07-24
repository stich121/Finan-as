let state = {
  user: null, // { id, name, email, currency, theme, csrfToken }
  csrfToken: null,
  selectedMonth: new Date().toISOString().slice(0, 7),
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
