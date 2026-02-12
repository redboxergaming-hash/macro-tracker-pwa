function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function seriesBounds(points, key) {
  const values = points.map((p) => safeNumber(p[key])).filter((v) => v !== null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  return { min: min - pad, max: max + pad };
}

function yForValue(value, bounds, chartTop, chartHeight) {
  if (value === null || !bounds) return null;
  const ratio = (value - bounds.min) / (bounds.max - bounds.min);
  return chartTop + chartHeight - ratio * chartHeight;
}

function smoothPath(ctx, coords) {
  if (!coords.length) return;
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);

  for (let i = 1; i < coords.length - 1; i += 1) {
    const xc = (coords[i].x + coords[i + 1].x) / 2;
    const yc = (coords[i].y + coords[i + 1].y) / 2;
    ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
  }

  if (coords.length > 1) {
    const last = coords[coords.length - 1];
    const prev = coords[coords.length - 2];
    ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
  }
  ctx.stroke();
}

function drawSeries(ctx, points, key, color, bounds, chartLeft, chartTop, chartWidth, chartHeight) {
  const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;
  const coords = points
    .map((point, i) => {
      const value = safeNumber(point[key]);
      const y = yForValue(value, bounds, chartTop, chartHeight);
      if (y === null) return null;
      return { x: chartLeft + i * step, y, value, date: point.date, key };
    })
    .filter(Boolean);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  smoothPath(ctx, coords);

  coords.forEach((coord) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(coord.x, coord.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });

  return coords;
}

function drawGrid(ctx, chartLeft, chartTop, chartWidth, chartHeight) {
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = chartTop + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
  }
}

function drawLegend(ctx) {
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#0b7fab';
  ctx.fillText('Calories', 12, 16);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('Scale', 78, 16);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('Trend', 124, 16);
}

function drawTooltip(ctx, tooltip, width) {
  if (!tooltip) return;

  const lines = tooltip.lines;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 14;
  const boxHeight = lines.length * 16 + 10;
  const x = Math.min(width - boxWidth - 6, tooltip.x + 10);
  const y = Math.max(6, tooltip.y - boxHeight - 10);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 8);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  lines.forEach((line, idx) => {
    ctx.fillText(line, x + 7, y + 18 + idx * 16);
  });
}

function drawLabels(ctx, points, chartLeft, chartWidth, height) {
  ctx.fillStyle = '#475569';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  points.forEach((point, i) => {
    if (i % 2 !== 0) return;
    const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;
    const x = chartLeft + i * step;
    ctx.fillText(point.date.slice(5), x - 15, height - 10);
  });
}

function buildTooltip(active, points) {
  if (!active) return null;
  const point = points[active.index];
  if (!point) return null;

  const labels = {
    calories: 'Calories',
    scaleWeight: 'Scale',
    trendWeight: 'Trend'
  };

  return {
    x: active.x,
    y: active.y,
    lines: [`${point.date}`, `${labels[active.key]}: ${Math.round(active.value * 10) / 10}`]
  };
}

export function drawWeeklyAnalyticsChart(canvas, points) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width || 320));
  const height = Math.max(220, Math.floor(width * 0.58));
  canvas.width = width;
  canvas.height = height;

  const chartLeft = 36;
  const chartRight = width - 12;
  const chartTop = 22;
  const chartBottom = height - 30;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  const calorieBounds = seriesBounds(points, 'calories');
  const scaleBounds = seriesBounds(points, 'scaleWeight');
  const trendBounds = seriesBounds(points, 'trendWeight');

  const draw = (activePoint = null) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    drawGrid(ctx, chartLeft, chartTop, chartWidth, chartHeight);

    const calorieCoords = drawSeries(ctx, points, 'calories', '#0b7fab', calorieBounds, chartLeft, chartTop, chartWidth, chartHeight);
    const scaleCoords = drawSeries(ctx, points, 'scaleWeight', '#22c55e', scaleBounds, chartLeft, chartTop, chartWidth, chartHeight);
    const trendCoords = drawSeries(ctx, points, 'trendWeight', '#f59e0b', trendBounds, chartLeft, chartTop, chartWidth, chartHeight);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    drawLabels(ctx, points, chartLeft, chartWidth, height);
    drawLegend(ctx);

    const tooltip = buildTooltip(activePoint, points);
    drawTooltip(ctx, tooltip, width);

    return { calorieCoords, scaleCoords, trendCoords };
  };

  const coords = draw();

  const findActive = (clientX, clientY) => {
    const cRect = canvas.getBoundingClientRect();
    const x = clientX - cRect.left;
    const y = clientY - cRect.top;
    const all = [
      ...(coords.calorieCoords || []).map((c) => ({ ...c, key: 'calories' })),
      ...(coords.scaleCoords || []).map((c) => ({ ...c, key: 'scaleWeight' })),
      ...(coords.trendCoords || []).map((c) => ({ ...c, key: 'trendWeight' }))
    ];

    let active = null;
    let best = 20;
    all.forEach((item) => {
      const d = Math.hypot(item.x - x, item.y - y);
      if (d < best) {
        best = d;
        active = item;
      }
    });
    return active;
  };

  if (!canvas.__analyticsTooltipBound) {
    canvas.addEventListener('pointermove', (event) => {
      const active = findActive(event.clientX, event.clientY);
      draw(active);
    });

    canvas.addEventListener('pointerleave', () => draw(null));

    canvas.addEventListener('pointerdown', (event) => {
      const active = findActive(event.clientX, event.clientY);
      draw(active);
    });

    canvas.__analyticsTooltipBound = true;
  }
}
