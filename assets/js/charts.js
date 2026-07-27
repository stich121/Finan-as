const chartInteractions = new WeakMap();
const activeAnimations = new WeakMap();

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || 300;
  const height = rect.height || canvas.clientHeight || 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width, height };
}

function escapeMarkup(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

function formatMonth(month) {
  if (!month || !month.includes('-')) return month || '';
  const [year, number] = month.split('-');
  const label = new Date(Number(year), Number(number) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function ensureTooltip(canvas) {
  const host = canvas.parentElement;
  host.classList.add('interactive-chart-host');
  let tooltip = host.querySelector(':scope > .chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');
    host.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(state, content, anchor) {
  if (!content || !anchor) return;
  const { canvas, tooltip } = state;
  const hostRect = canvas.parentElement.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const canvasLeft = canvasRect.left - hostRect.left;
  const canvasTop = canvasRect.top - hostRect.top;
  const safeX = Math.max(96, Math.min(canvasRect.width - 96, anchor.x));
  const safeY = Math.max(66, Math.min(canvasRect.height - 8, anchor.y));
  tooltip.innerHTML = content;
  tooltip.style.left = `${canvasLeft + safeX}px`;
  tooltip.style.top = `${canvasTop + safeY - 12}px`;
  tooltip.classList.add('visible');
}

function hideTooltip(state) {
  state.tooltip.classList.remove('visible');
}

function activeIndex(state) {
  return state.hoverIndex ?? state.lockedIndex;
}

function refreshInteraction(state, anchor = null) {
  const index = activeIndex(state);
  state.render(index);
  if (index == null) {
    hideTooltip(state);
    return;
  }
  showTooltip(
    state,
    state.tooltipFor(index),
    anchor || state.anchorFor(index)
  );
}

function ensureInteraction(canvas, kind) {
  let state = chartInteractions.get(canvas);
  if (state && state.kind === kind) {
    canvas.classList.add('interactive-chart');
    canvas.tabIndex = 0;
    return state;
  }

  state = {
    kind,
    canvas,
    tooltip: ensureTooltip(canvas),
    hoverIndex: null,
    lockedIndex: null,
    itemCount: 0,
    hitTest: () => null,
    render: () => {},
    tooltipFor: () => '',
    anchorFor: () => null,
  };
  chartInteractions.set(canvas, state);

  canvas.classList.add('interactive-chart');
  canvas.tabIndex = 0;

  canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(canvas, event);
    const index = state.hitTest(point.x, point.y);
    canvas.classList.toggle('has-chart-target', index != null);
    if (state.hoverIndex !== index) {
      state.hoverIndex = index;
      refreshInteraction(state, index == null ? null : point);
    } else if (index != null) {
      showTooltip(state, state.tooltipFor(index), point);
    }
  });

  canvas.addEventListener('pointerleave', () => {
    state.hoverIndex = null;
    canvas.classList.remove('has-chart-target');
    refreshInteraction(state);
  });

  canvas.addEventListener('click', (event) => {
    const point = canvasPoint(canvas, event);
    const index = state.hitTest(point.x, point.y);
    if (index == null) {
      state.lockedIndex = null;
      state.hoverIndex = null;
      refreshInteraction(state);
      return;
    }
    state.lockedIndex = state.lockedIndex === index ? null : index;
    state.hoverIndex = index;
    refreshInteraction(state, point);
  });

  canvas.addEventListener('keydown', (event) => {
    if (!state.itemCount) return;
    const current = activeIndex(state) ?? 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      state.hoverIndex = (current + 1) % state.itemCount;
      refreshInteraction(state);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      state.hoverIndex = (current - 1 + state.itemCount) % state.itemCount;
      refreshInteraction(state);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      state.lockedIndex = current;
      state.hoverIndex = current;
      refreshInteraction(state);
    } else if (event.key === 'Escape') {
      state.lockedIndex = null;
      state.hoverIndex = null;
      refreshInteraction(state);
    }
  });

  return state;
}

function suspendInteraction(canvas) {
  const state = chartInteractions.get(canvas);
  if (!state) return;
  state.hoverIndex = null;
  state.lockedIndex = null;
  state.itemCount = 0;
  state.hitTest = () => null;
  state.render = () => {};
  hideTooltip(state);
  canvas.classList.remove('interactive-chart', 'pie-interactive-chart', 'has-chart-target');
  canvas.removeAttribute('tabindex');
}

function drawGrid(ctx, width, padding, plotH) {
  ctx.strokeStyle = 'rgba(148,163,184,.13)';
  ctx.lineWidth = 1;
  for (let line = 0; line <= 3; line += 1) {
    const y = padding.top + (plotH / 3) * line;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function drawActiveGuide(ctx, point, padding, height, values) {
  if (!point) return;
  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(103,232,249,.48)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(point.x, padding.top);
  ctx.lineTo(point.x, height - padding.bottom);
  ctx.stroke();
  ctx.restore();

  values.forEach(({ y, color }) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#f8fbff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

export function drawTrendChart(canvas, points) {
  const normalized = points.map((point) => ({
    ...point,
    income: Number(point.income) || 0,
    expense: Number(point.expense) || 0,
  }));
  const state = ensureInteraction(canvas, 'trend');
  canvas.setAttribute('aria-label', 'Gráfico interativo de receitas e despesas. Passe o mouse, toque ou use as setas para ver os valores.');
  let geometry = [];

  const render = (selectedIndex = null) => {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    const padding = { top: 16, right: 14, bottom: 28, left: 14 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const values = normalized.flatMap((point) => [point.income, point.expense]);
    const max = Math.max(1, ...values);
    const xStep = normalized.length > 1 ? plotW / (normalized.length - 1) : 0;
    const yFor = (value) => padding.top + plotH - (value / max) * plotH;
    const xFor = (index) => padding.left + index * xStep;
    geometry = normalized.map((point, index) => ({
      x: xFor(index),
      incomeY: yFor(point.income),
      expenseY: yFor(point.expense),
    }));

    drawGrid(ctx, width, padding, plotH);

    const drawLine = (key, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      normalized.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      normalized.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(xFor(index), yFor(point[key]), 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    };

    drawLine('income', '#22c55e');
    drawLine('expense', '#f87171');

    if (selectedIndex != null && geometry[selectedIndex]) {
      drawActiveGuide(ctx, geometry[selectedIndex], padding, height, [
        { y: geometry[selectedIndex].incomeY, color: '#22c55e' },
        { y: geometry[selectedIndex].expenseY, color: '#f87171' },
      ]);
    }

    ctx.fillStyle = '#93a1c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    normalized.forEach((point, index) => {
      if (normalized.length > 8 && index % 2 !== 0) return;
      const [, month] = point.month.split('-');
      ctx.fillText(`${month}/${point.month.slice(2, 4)}`, xFor(index), height - 8);
    });
  };

  state.itemCount = normalized.length;
  state.render = render;
  state.hitTest = (x, y) => {
    if (!geometry.length || y < 5 || y > canvas.clientHeight - 2) return null;
    let nearest = 0;
    let distance = Infinity;
    geometry.forEach((point, index) => {
      const current = Math.abs(x - point.x);
      if (current < distance) {
        nearest = index;
        distance = current;
      }
    });
    const tolerance = geometry.length > 1
      ? Math.max(24, Math.abs(geometry[1].x - geometry[0].x) / 2)
      : canvas.clientWidth;
    return distance <= tolerance ? nearest : null;
  };
  state.tooltipFor = (index) => {
    const point = normalized[index];
    if (!point) return '';
    return `
      <strong>${escapeMarkup(formatMonth(point.month))}</strong>
      <span><i style="background:#22c55e"></i>Receitas <b>${formatCurrency(point.income)}</b></span>
      <span><i style="background:#f87171"></i>Despesas <b>${formatCurrency(point.expense)}</b></span>
      <small>Clique para fixar</small>
    `;
  };
  state.anchorFor = (index) => {
    const point = geometry[index];
    if (!point) return null;
    return { x: point.x, y: Math.min(point.incomeY, point.expenseY) };
  };
  state.lockedIndex = state.lockedIndex < normalized.length ? state.lockedIndex : null;
  render(activeIndex(state));
}

export function drawCategoryBars(canvas, items) {
  suspendInteraction(canvas);
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (items.length === 0) return;

  const max = Math.max(...items.map((item) => item.amount), 1);
  const rowH = Math.min(28, height / items.length);
  const labelW = 96;
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'middle';

  items.forEach((item, index) => {
    const y = index * rowH + rowH / 2;
    ctx.fillStyle = '#e6ebf5';
    ctx.textAlign = 'right';
    const label = item.categoryName.length > 14 ? `${item.categoryName.slice(0, 13)}…` : item.categoryName;
    ctx.fillText(label, labelW - 8, y);
    const barMaxW = width - labelW - 60;
    const barW = (item.amount / max) * barMaxW;
    ctx.fillStyle = item.color || '#38bdf8';
    roundRect(ctx, labelW, y - 7, Math.max(2, barW), 14, 4);
    ctx.fill();
    ctx.fillStyle = '#93a1c2';
    ctx.textAlign = 'left';
    ctx.fillText(formatCompactCurrency(item.amount), labelW + barW + 6, y);
  });
}

export function drawCategoryPie(canvas, items) {
  const validItems = items
    .filter((item) => Number(item.amount) > 0)
    .map((item) => ({ ...item, amount: Number(item.amount) }));
  const total = validItems.reduce((sum, item) => sum + item.amount, 0);
  const state = ensureInteraction(canvas, 'pie');
  canvas.classList.add('pie-interactive-chart');
  canvas.setAttribute('aria-label', 'Gráfico de pizza interativo. Passe o mouse, toque ou use as setas para destacar uma categoria.');
  let slices = [];

  const render = (selectedIndex = null) => {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    slices = [];
    if (total <= 0) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(48, Math.min(width, height) * 0.35);
    let startAngle = -Math.PI / 2;

    validItems.forEach((item, index) => {
      const sliceAngle = (item.amount / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const middle = startAngle + sliceAngle / 2;
      const offset = selectedIndex === index ? 13 : 0;
      const sliceCenterX = centerX + Math.cos(middle) * offset;
      const sliceCenterY = centerY + Math.sin(middle) * offset;

      ctx.save();
      if (selectedIndex === index) {
        ctx.shadowColor = item.color || '#38bdf8';
        ctx.shadowBlur = 19;
      }
      ctx.beginPath();
      ctx.moveTo(sliceCenterX, sliceCenterY);
      ctx.arc(sliceCenterX, sliceCenterY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = item.color || '#38bdf8';
      ctx.fill();
      if (sliceAngle > 0.035) {
        ctx.strokeStyle = 'rgba(8,16,31,.78)';
        ctx.lineWidth = selectedIndex === index ? 3 : 2;
        ctx.stroke();
      }
      ctx.restore();

      slices.push({
        startAngle,
        endAngle,
        middle,
        centerX: sliceCenterX,
        centerY: sliceCenterY,
        radius,
      });
      startAngle = endAngle;
    });
  };

  state.itemCount = validItems.length;
  state.render = render;
  state.hitTest = (x, y) => {
    for (let index = 0; index < slices.length; index += 1) {
      const slice = slices[index];
      const dx = x - slice.centerX;
      const dy = y - slice.centerY;
      if (Math.hypot(dx, dy) > slice.radius + 8) continue;
      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      if (angle >= slice.startAngle && angle <= slice.endAngle) return index;
    }
    return null;
  };
  state.tooltipFor = (index) => {
    const item = validItems[index];
    if (!item) return '';
    const percentage = total > 0 ? (item.amount / total) * 100 : 0;
    const color = escapeMarkup(item.color || '#38bdf8');
    return `
      <strong><i style="background:${color}"></i>${escapeMarkup(item.categoryName)}</strong>
      <span><i style="background:${color}"></i>Valor <b>${formatCurrency(item.amount)}</b></span>
      <span><i style="background:${color}"></i>Participação <b>${percentage.toFixed(1).replace('.', ',')}%</b></span>
      <small>Clique para fixar</small>
    `;
  };
  state.anchorFor = (index) => {
    const slice = slices[index];
    if (!slice) return null;
    return {
      x: slice.centerX + Math.cos(slice.middle) * slice.radius * 0.64,
      y: slice.centerY + Math.sin(slice.middle) * slice.radius * 0.64,
    };
  };
  state.lockedIndex = state.lockedIndex < validItems.length ? state.lockedIndex : null;
  canvas.classList.add('pie-interactive-chart');
  render(activeIndex(state));
}

function renderForecastFrame(canvas, points, progress, selectedIndex = null) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const padding = { top: 18, right: 16, bottom: 28, left: 16 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const values = points.map((point) => point.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const xFor = (index) => padding.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotW);
  const yFor = (value) => padding.top + ((max - value) / range) * plotH;
  const zeroY = yFor(0);

  ctx.strokeStyle = 'rgba(148,163,184,.14)';
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(width - padding.right, zeroY);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
  gradient.addColorStop(0, 'rgba(56,189,248,.35)');
  gradient.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.beginPath();
  points.forEach((point, index) => {
    const visibleValue = index === 0
      ? point.cumulative * progress
      : points[index - 1].cumulative + (point.cumulative - points[index - 1].cumulative) * progress;
    const x = xFor(index);
    const y = yFor(visibleValue);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (points.length) {
    ctx.lineTo(xFor(points.length - 1), zeroY);
    ctx.lineTo(xFor(0), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.cumulative * progress);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const geometry = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.cumulative),
  }));
  if (selectedIndex != null && geometry[selectedIndex]) {
    drawActiveGuide(ctx, geometry[selectedIndex], padding, height, [
      { y: geometry[selectedIndex].y, color: '#38bdf8' },
    ]);
  }

  ctx.fillStyle = '#93a1c2';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  points.forEach((point, index) => {
    const [year, month] = point.month.split('-');
    ctx.fillText(`${month}/${year.slice(2)}`, xFor(index), height - 8);
  });
  return geometry;
}

export function drawForecastChart(canvas, points) {
  const normalized = points.map((point) => ({
    ...point,
    cumulative: Number(point.cumulative) || 0,
  }));
  const previous = activeAnimations.get(canvas);
  if (previous) cancelAnimationFrame(previous);
  const state = ensureInteraction(canvas, 'forecast');
  canvas.setAttribute('aria-label', 'Gráfico interativo de saldo previsto. Passe o mouse, toque ou use as setas para ver cada projeção.');
  let geometry = [];

  state.itemCount = normalized.length;
  state.render = (selectedIndex = null) => {
    const running = activeAnimations.get(canvas);
    if (running) {
      cancelAnimationFrame(running);
      activeAnimations.delete(canvas);
    }
    geometry = renderForecastFrame(canvas, normalized, 1, selectedIndex);
  };
  state.hitTest = (x, y) => {
    if (!geometry.length || y < 4 || y > canvas.clientHeight - 2) return null;
    let nearest = 0;
    let distance = Infinity;
    geometry.forEach((point, index) => {
      const current = Math.abs(x - point.x);
      if (current < distance) {
        nearest = index;
        distance = current;
      }
    });
    const tolerance = geometry.length > 1
      ? Math.max(24, Math.abs(geometry[1].x - geometry[0].x) / 2)
      : canvas.clientWidth;
    return distance <= tolerance ? nearest : null;
  };
  state.tooltipFor = (index) => {
    const point = normalized[index];
    if (!point) return '';
    return `
      <strong>${escapeMarkup(formatMonth(point.month))}</strong>
      <span><i style="background:#38bdf8"></i>Saldo projetado <b>${formatCurrency(point.cumulative)}</b></span>
      <small>Clique para fixar</small>
    `;
  };
  state.anchorFor = (index) => geometry[index] || null;
  state.lockedIndex = state.lockedIndex < normalized.length ? state.lockedIndex : null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startedAt = performance.now();
  const frame = (now) => {
    const rawProgress = reduceMotion ? 1 : Math.min(1, (now - startedAt) / 700);
    const eased = 1 - Math.pow(1 - rawProgress, 3);
    geometry = renderForecastFrame(canvas, normalized, eased, activeIndex(state));
    if (rawProgress < 1) {
      activeAnimations.set(canvas, requestAnimationFrame(frame));
    } else {
      activeAnimations.delete(canvas);
    }
  };
  activeAnimations.set(canvas, requestAnimationFrame(frame));
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function formatCompactCurrency(value) {
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${Math.round(value)}`;
}
