import { clamp } from './math.js';

function el(id) {
  return document.getElementById(id);
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function initRoutes(onRouteChange) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const route = tab.dataset.route;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.toggle('active', screen.id === `screen-${route}`);
      });
      onRouteChange(route);
    });
  });
}

function sumEntries(entries) {
  return entries.reduce(
    (acc, item) => {
      acc.kcal += safeNum(item.kcal);
      acc.p += safeNum(item.p);
      acc.c += safeNum(item.c);
      acc.f += safeNum(item.f);
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

function macroProgress(label, value, goal) {
  if (!goal || goal <= 0) {
    return `<div class="progress-row"><strong>${label}</strong><progress max="1" value="0"></progress><span>${Math.round(value)}g / —</span></div>`;
  }
  const ratio = clamp(value / goal, 0, 1.5);
  return `<div class="progress-row"><strong>${label}</strong><progress max="1" value="${Math.min(1, ratio)}"></progress><span>${Math.round(value)}g / ${Math.round(goal)}g</span></div>`;
}

export function renderPersonsList(persons, todayStatsByPerson = {}) {
  const wrap = el('personsList');
  if (!persons.length) {
    wrap.innerHTML = '<p class="muted">No persons yet. Add one in Settings.</p>';
    return;
  }

  wrap.innerHTML = persons
    .map((p) => {
      const stats = todayStatsByPerson[p.id] || { kcal: 0, p: 0, c: 0, f: 0 };
      const remaining = p.kcalGoal - stats.kcal;
      return `
      <article class="card">
        <h3>${p.name}</h3>
        <p>${Math.round(stats.kcal)} / ${p.kcalGoal} kcal • remaining ${Math.round(remaining)}</p>
        <div class="stat-rows">
          ${macroProgress('P', stats.p, p.macroTargets?.p)}
          ${macroProgress('C', stats.c, p.macroTargets?.c)}
          ${macroProgress('F', stats.f, p.macroTargets?.f)}
        </div>
      </article>`;
    })
    .join('');
}

export function renderPersonPicker(persons, selectedId) {
  const html = persons.length
    ? persons
        .map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`)
        .join('')
    : '<option value="">No persons</option>';
  el('personPicker').innerHTML = html;
  el('addPersonPicker').innerHTML = html;
  const analyticsPicker = el('analyticsPersonPicker');
  if (analyticsPicker) analyticsPicker.innerHTML = html;
  const nutritionPicker = el('nutritionPersonPicker');
  if (nutritionPicker) nutritionPicker.innerHTML = html;
}


export function renderDashboard(person, date, entries) {
  const totals = sumEntries(entries);
  const remaining = person.kcalGoal - totals.kcal;
  el('dashboardSummary').innerHTML = `
    <p><strong>Remaining kcal:</strong> ${Math.round(remaining)}</p>
    <p>Consumed: ${Math.round(totals.kcal)} / Goal: ${person.kcalGoal}</p>
    <div class="stat-rows">
      ${macroProgress('P', totals.p, person.macroTargets?.p)}
      ${macroProgress('C', totals.c, person.macroTargets?.c)}
      ${macroProgress('F', totals.f, person.macroTargets?.f)}
    </div>
    <p class="muted">Date: ${date}</p>
  `;

  el('entriesTableContainer').innerHTML = entries.length
    ? `<table>
      <thead><tr><th>Time</th><th>Food</th><th>Amount</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th>Source</th></tr></thead>
      <tbody>
      ${entries
        .map(
          (e) => `<tr>
          <td>${e.time}</td><td>${e.foodName}</td><td>${e.amountGrams}g</td><td>${e.kcal}</td><td>${e.p}</td><td>${e.c}</td><td>${e.f}</td><td>${e.source}</td>
        </tr>`
        )
        .join('')}
      </tbody>
    </table>`
    : '<p class="muted">No entries for this date.</p>';
}

export function renderDashboardEmpty() {
  el('dashboardSummary').innerHTML = '<p class="muted">No persons available. Add a person in Settings.</p>';
  el('entriesTableContainer').innerHTML = '';
}

export function renderSettingsPersons(persons) {
  const container = el('settingsPersons');
  if (!persons.length) {
    container.innerHTML = '<p class="muted">No persons yet.</p>';
    return;
  }

  container.innerHTML = persons
    .map(
      (p) => `<article class="settings-person-row">
      <div>
        <strong>${p.name}</strong><br />
        <span>${p.kcalGoal} kcal/day</span><br />
        <span class="muted">P:${p.macroTargets?.p ?? '—'} C:${p.macroTargets?.c ?? '—'} F:${p.macroTargets?.f ?? '—'}</span>
      </div>
      <div class="settings-actions">
        <button class="secondary" data-action="edit-person" data-person-id="${p.id}">Edit</button>
        <button class="danger" data-action="delete-person" data-person-id="${p.id}">Delete</button>
      </div>
    </article>`
    )
    .join('');
}

export function fillPersonForm(person) {
  el('personId').value = person?.id || '';
  el('personName').value = person?.name || '';
  el('personKcalGoal').value = person?.kcalGoal || 2000;
  el('personMacroP').value = person?.macroTargets?.p ?? '';
  el('personMacroC').value = person?.macroTargets?.c ?? '';
  el('personMacroF').value = person?.macroTargets?.f ?? '';
  el('cancelEditBtn').hidden = !person;
}

export function readPersonForm() {
  const parseOptional = (value) => {
    if (value === '' || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id: el('personId').value || crypto.randomUUID(),
    name: el('personName').value.trim(),
    kcalGoal: Number(el('personKcalGoal').value),
    macroTargets: {
      p: parseOptional(el('personMacroP').value),
      c: parseOptional(el('personMacroC').value),
      f: parseOptional(el('personMacroF').value)
    }
  };
}


export function renderGenericCategoryFilters(categories, selectedCategory) {
  const wrap = el('genericCategoryFilters');
  if (!wrap) return;

  wrap.innerHTML = categories
    .map((category) => {
      const active = category.value === selectedCategory;
      return `<button type="button" class="filter-chip ${active ? 'active' : ''}" data-action="filter-category" data-category="${category.value}">${category.label}</button>`;
    })
    .join('');
}

function renderFoodList(containerId, items, favoritesSet, emptyText) {
  const wrap = el(containerId);
  if (!items.length) {
    wrap.innerHTML = `<p class="muted">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = items
    .map((item) => {
      const star = favoritesSet.has(item.foodId) ? '★' : '☆';
      return `<button class="suggestion" data-action="pick-food" data-food-id="${item.foodId}">
        <div>
          <strong>${item.label}</strong>
          <div class="muted tiny">${item.groupLabel}</div>
          ${item.isGeneric ? `<div class="muted tiny">Generic built-in (approx.) · ${item.category || 'Uncategorized'}</div>` : ''}
        </div>
        <div class="suggestion-actions">
          <span class="star" data-action="toggle-favorite" data-food-id="${item.foodId}" role="button" aria-label="Toggle favorite">${star}</span>
        </div>
      </button>`;
    })
    .join('');
}

export function renderFavoriteSection(items, favoritesSet) {
  renderFoodList('favoriteList', items, favoritesSet, 'No favorites yet.');
}

export function renderRecentSection(items, favoritesSet) {
  renderFoodList('recentList', items, favoritesSet, 'No recent items yet.');
}

export function renderSuggestions(items, favoritesSet) {
  renderFoodList('addSuggestions', items, favoritesSet, 'No matches. Use quick custom add below.');
}

export function renderPortionPicker(item, options) {
  el('portionFoodName').textContent = item.label;
  el('portionMeta').textContent = `${item.nutrition.kcal100g} kcal / 100g • P${item.nutrition.p100g} C${item.nutrition.c100g} F${item.nutrition.f100g}`;

  const buttons = options
    .map((opt) => `<button type="button" class="portion-btn" data-action="set-portion" data-grams="${opt.grams}">${opt.label}</button>`)
    .join('');
  el('portionPresetButtons').innerHTML = buttons;
  el('portionGrams').value = options[2]?.grams ?? 100;
}

export function readPortionGrams() {
  return Number(el('portionGrams').value);
}

export function setPortionGrams(grams) {
  el('portionGrams').value = Number(grams);
}

export function openPortionDialog() {
  el('portionDialog').showModal();
}

export function closePortionDialog() {
  el('portionDialog').close();
}

export function showAddStatus(message) {
  el('addStatus').textContent = message;
}


export function setScanStatus(message) {
  el('scanStatus').textContent = message;
}

function macroValue(value) {
  return value == null ? 'missing' : `${Math.round(value * 10) / 10}`;
}

export function renderScanResult(product) {
  const wrap = el('scanResult');
  if (!product) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = `<article class="card">
    <div class="row-actions" style="justify-content:space-between;align-items:flex-start;">
      <div>
        <strong>${product.productName}</strong><br />
        <span class="muted">${product.brands || 'Unknown brand'}</span><br />
        <span class="muted tiny">Barcode: ${product.barcode}</span>
      </div>
      ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.productName}" width="72" height="72" style="border-radius:8px;object-fit:cover;" />` : ''}
    </div>
    <p class="muted">Per 100g — kcal: ${macroValue(product.nutrition.kcal100g)}, P: ${macroValue(product.nutrition.p100g)}, C: ${macroValue(product.nutrition.c100g)}, F: ${macroValue(product.nutrition.f100g)}</p>
    <div class="row-actions">
      <button type="button" id="logScannedProductBtn">Log via portion picker</button>
    </div>
  </article>`;
}


export function setAnalyticsStatus(message) {
  const target = el('analyticsStatus');
  if (target) target.textContent = message;
}

export function renderWeightLogs(logs) {
  const wrap = el('weightLogsList');
  if (!wrap) return;
  if (!logs.length) {
    wrap.innerHTML = '<p class="muted">No weight logs yet.</p>';
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Date</th><th>Scale</th><th>Trend</th></tr></thead>
    <tbody>
      ${logs
        .slice(0, 7)
        .map(
          (row) => `<tr><td>${row.date}</td><td>${row.scaleWeight}</td><td>${row.trendWeight == null ? '—' : row.trendWeight}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>`;
}


export function renderInsightMetrics(metrics) {
  const wrap = el('insightMetrics');
  if (!wrap) return;

  const items = [
    { key: 'cal3d', label: '3-day calorie change' },
    { key: 'cal7d', label: '7-day calorie change' },
    { key: 'wt3d', label: '3-day weight change' },
    { key: 'wt7d', label: '7-day weight change' }
  ];

  wrap.innerHTML = items
    .map(({ key, label }) => {
      const value = metrics?.[key] || { text: 'Not enough data' };
      return `<div class="insight-item"><strong>${label}</strong><div>${value.text}</div></div>`;
    })
    .join('');
}


function formatMicronutrientTotal(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}g`;
}

function micronutrientProgress(total, target) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, total / target));
}

export function renderNutritionOverview(items) {
  const wrap = el('nutritionOverviewList');
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = '<p class="muted">No micronutrient data available</p>';
    return;
  }

  wrap.innerHTML = items
    .map((item) => {
      const targetLabel = Number.isFinite(item.target) && item.target > 0 ? `${Math.round(item.target * 100) / 100}g` : '—';
      const percentageLabel = Number.isFinite(item.percentage) ? `${Math.round(item.percentage)}%` : '—';
      const progressValue = micronutrientProgress(item.total, item.target);
      return `<article class="card micronutrient-item">
        <div class="row-actions" style="justify-content:space-between;">
          <strong>${item.label}</strong>
          <span>${formatMicronutrientTotal(item.total)}</span>
        </div>
        <div class="progress-row">
          <progress max="1" value="${progressValue}"></progress>
        </div>
        <p class="muted tiny">Target: ${targetLabel} • ${percentageLabel}</p>
      </article>`;
    })
    .join('');
}
