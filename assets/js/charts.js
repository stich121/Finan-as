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

export function drawTrendChart(canvas, points) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 16, right: 12, bottom: 26, left: 12 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = points.flatMap((p) => [p.income, p.expense]);
  const max = Math.max(1, ...values);

  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const yFor = (v) => padding.top + plotH - (v / max) * plotH;
  const xFor = (i) => padding.left + i * xStep;

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const y = padding.top + (plotH / 3) * g;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  function drawLine(key, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xFor(i);
      const y = yFor(p[key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(xFor(i), yFor(p[key]), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine('income', '#22c55e');
  drawLine('expense', '#f87171');

  ctx.fillStyle = '#93a1c2';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  points.forEach((p, i) => {
    if (points.length > 8 && i % 2 !== 0) return;
    const [, m] = p.month.split('-');
    ctx.fillText(m + '/' + p.month.slice(2, 4), xFor(i), height - 8);
  });
}

export function drawCategoryBars(canvas, items) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  if (items.length === 0) return;

  const max = Math.max(...items.map((i) => i.amount), 1);
  const rowH = Math.min(28, height / items.length);
  const labelW = 96;

  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'middle';

  items.forEach((item, i) => {
    const y = i * rowH + rowH / 2;
    ctx.fillStyle = '#e6ebf5';
    ctx.textAlign = 'right';
    const label = item.categoryName.length > 14 ? item.categoryName.slice(0, 13) + '…' : item.categoryName;
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
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const validItems = items.filter((item) => Number(item.amount) > 0);
  const total = validItems.reduce((sum, item) => sum + Number(item.amount), 0);
  if (total <= 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(48, Math.min(width, height) * 0.38);
  let startAngle = -Math.PI / 2;

  validItems.forEach((item) => {
    const sliceAngle = (Number(item.amount) / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = item.color || '#38bdf8';
    ctx.fill();

    if (sliceAngle > 0.035) {
      ctx.strokeStyle = 'rgba(8, 16, 31, 0.68)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    startAngle = endAngle;
  });
}

const activeAnimations = new WeakMap();

export function drawForecastChart(canvas, points) {
  const previous = activeAnimations.get(canvas);
  if (previous) cancelAnimationFrame(previous);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startedAt = performance.now();

  const frame = (now) => {
    const progress = reduceMotion ? 1 : Math.min(1, (now - startedAt) / 700);
    const eased = 1 - Math.pow(1 - progress, 3);
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

    ctx.strokeStyle = 'rgba(255,255,255,.10)';
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
        ? point.cumulative * eased
        : points[index - 1].cumulative + (point.cumulative - points[index - 1].cumulative) * eased;
      const x = xFor(index);
      const y = yFor(visibleValue);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
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
      const y = yFor(point.cumulative * eased);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = '#93a1c2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    points.forEach((point, index) => {
      const [year, month] = point.month.split('-');
      ctx.fillText(`${month}/${year.slice(2)}`, xFor(index), height - 8);
    });

    if (progress < 1) {
      activeAnimations.set(canvas, requestAnimationFrame(frame));
    } else {
      activeAnimations.delete(canvas);
    }
  };
  activeAnimations.set(canvas, requestAnimationFrame(frame));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatCompactCurrency(v) {
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(1) + 'k';
  return 'R$ ' + Math.round(v);
}
