import { genericFoods } from './src/genericFoods.js';
import { computeNutritionFromPer100g } from './src/math.js';
import { drawWeeklyAnalyticsChart } from './src/analyticsChart.js';
import { lookupOpenFoodFacts, normalizeCachedProduct } from './src/offClient.js';
import { startBarcodeScanner, stopBarcodeScanner } from './src/scanner.js';
import {
  addEntry,
  addWeightLog,
  deleteAllData,
  deletePersonCascade,
  exportAllData,
  getCachedProduct,
  getEntriesForPersonDate,
  getEntriesForPersonDateRange,
  getWeightLogsByPerson,
  getWeightLogsInRange,
  getFavorites,
  getLastPortion,
  getPersons,
  getRecents,
  upsertCachedProduct,
  importAllData,
  isFavorite,
  seedSampleData,
  toggleFavorite,
  upsertPerson
} from './src/storage.js';
import {
  closePortionDialog,
  fillPersonForm,
  initRoutes,
  openPortionDialog,
  readPersonForm,
  readPortionGrams,
  renderDashboard,
  renderDashboardEmpty,
  renderPersonPicker,
  renderPersonsList,
  renderPortionPicker,
  renderSettingsPersons,
  renderSuggestions,
  renderFavoriteSection,
  renderRecentSection,
  renderGenericCategoryFilters,
  renderScanResult,
  renderWeightLogs,
  renderInsightMetrics,
  renderNutritionOverview,
  setAnalyticsStatus,
  setPortionGrams,
  setScanStatus,
  showAddStatus
} from './src/ui.js';

const CHATGPT_PHOTO_PROMPT = `Look at this meal photo. List the foods you can clearly identify.
If uncertain, ask clarifying questions.
Do NOT guess portion sizes.
Ask me for grams or pieces for each item.
Also ask whether oil, butter, or sauce was used.
Output as a checklist.`;

const state = {
  route: 'persons',
  persons: [],
  selectedPersonId: null,
  selectedDate: new Date().toISOString().slice(0, 10),
  suggestions: [],
  favoritesByPerson: {},
  recentsByPerson: {},
  activeFood: null,
  scannedProduct: null,
  weightLogsByPerson: {},
  analyticsDate: new Date().toISOString().slice(0, 10),
  analyticsRange: '1W',
  analyticsPoints: [],
  nutritionDate: new Date().toISOString().slice(0, 10),
  selectedGenericCategory: 'all'
};



const GENERIC_FOOD_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'Fruits', label: 'Fruits' },
  { value: 'Vegetables', label: 'Vegetables' },
  { value: 'Meat', label: 'Meat' },
  { value: 'Dairy', label: 'Dairy' },
  { value: 'Grains', label: 'Grains' },
  { value: 'Drinks', label: 'Drinks' }
];

const MICRONUTRIENT_CONFIG = [
  { key: 'saturatedFat100g', label: 'Saturated fat', target: 20 },
  { key: 'monounsaturatedFat100g', label: 'Monounsaturated fat', target: null },
  { key: 'polyunsaturatedFat100g', label: 'Polyunsaturated fat', target: null },
  { key: 'omega3Fat100g', label: 'Omega-3', target: 1.6 },
  { key: 'omega6Fat100g', label: 'Omega-6', target: 17 },
  { key: 'transFat100g', label: 'Trans fat', target: 2 }
];

function computeEntryMicronutrients(nutritionPer100g, grams) {
  const result = {};
  const safeGrams = Number(grams);
  for (const item of MICRONUTRIENT_CONFIG) {
    const per100g = Number(nutritionPer100g?.micronutrients?.[item.key]);
    if (Number.isFinite(per100g) && Number.isFinite(safeGrams)) {
      result[item.key] = Math.round(((per100g * safeGrams) / 100) * 100) / 100;
    } else {
      result[item.key] = null;
    }
  }
  return result;
}

function aggregateMicronutrients(entries) {
  const totals = MICRONUTRIENT_CONFIG.map((item) => ({ ...item, total: 0, hasData: false }));

  entries.forEach((entry) => {
    totals.forEach((item) => {
      const value = Number(entry?.micronutrients?.[item.key]);
      if (Number.isFinite(value)) {
        item.total += value;
        item.hasData = true;
      }
    });
  });

  return totals
    .filter((item) => item.hasData)
    .map((item) => ({
      ...item,
      percentage: Number.isFinite(item.target) && item.target > 0 ? (item.total / item.target) * 100 : null
    }));
}

function foodFromGeneric(item) {
  return {
    foodId: item.id,
    label: item.name,
    nutrition: { kcal100g: item.kcal100g, p100g: item.p100g, c100g: item.c100g, f100g: item.f100g },
    pieceGramHint: item.pieceGramHint,
    sourceType: 'generic',
    isGeneric: true,
    groupLabel: 'Built-in generic',
    category: item.category || null
  };
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function shiftIsoDate(isoDate, deltaDays) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function buildWeeklyDateRange(endDate) {
  return Array.from({ length: 7 }, (_, i) => shiftIsoDate(endDate, i - 6));
}

function safeMetric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function buildWeeklyAnalyticsPoints(personId, endDate) {
  const days = buildWeeklyDateRange(endDate);
  const startDate = days[0];

  const [entries, weightLogs] = await Promise.all([
    getEntriesForPersonDateRange(personId, startDate, endDate),
    getWeightLogsInRange(personId, startDate, endDate)
  ]);

  const caloriesByDate = new Map();
  entries.forEach((entry) => {
    const current = caloriesByDate.get(entry.date) || 0;
    const kcal = Number(entry.kcal);
    caloriesByDate.set(entry.date, current + (Number.isFinite(kcal) ? kcal : 0));
  });

  const weightByDate = new Map();
  weightLogs.forEach((log) => {
    weightByDate.set(log.date, log);
  });

  return days.map((date) => {
    const log = weightByDate.get(date);
    const calories = caloriesByDate.get(date);
    return {
      date,
      calories: safeMetric(calories),
      scaleWeight: safeMetric(log?.scaleWeight),
      trendWeight: safeMetric(log?.trendWeight)
    };
  });
}

function renderAnalyticsChart(points) {
  const canvas = document.getElementById('analyticsChart');
  if (!canvas) return;
  drawWeeklyAnalyticsChart(canvas, points);
}

function formatChange(value, unit) {
  if (value === null) return 'Not enough data';
  const rounded = unit === 'kg' ? Math.round(value * 10) / 10 : Math.round(value);
  if (rounded > 0) return `increase ${rounded}${unit}`;
  if (rounded < 0) return `decrease ${Math.abs(rounded)}${unit}`;
  return `no change 0${unit}`;
}

function pointByDate(points, date) {
  return points.find((p) => p.date === date) || null;
}

function computeChange(points, endDate, dayWindow, key) {
  const startDate = shiftIsoDate(endDate, -(dayWindow - 1));
  const start = pointByDate(points, startDate);
  const end = pointByDate(points, endDate);
  const startValue = Number(start?.[key]);
  const endValue = Number(end?.[key]);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
  return endValue - startValue;
}

function calculateInsightMetrics(points, endDate) {
  const cal3d = computeChange(points, endDate, 3, 'calories');
  const cal7d = computeChange(points, endDate, 7, 'calories');
  const wt3d = computeChange(points, endDate, 3, 'scaleWeight');
  const wt7d = computeChange(points, endDate, 7, 'scaleWeight');

  return {
    cal3d: { text: formatChange(cal3d, '') },
    cal7d: { text: formatChange(cal7d, '') },
    wt3d: { text: formatChange(wt3d, 'kg') },
    wt7d: { text: formatChange(wt7d, 'kg') }
  };
}


function getTotalsByPerson(entriesByPerson) {
  return Object.fromEntries(
    Object.entries(entriesByPerson).map(([personId, entries]) => {
      const sum = entries.reduce(
        (acc, e) => ({
          kcal: acc.kcal + Number(e.kcal || 0),
          p: acc.p + Number(e.p || 0),
          c: acc.c + Number(e.c || 0),
          f: acc.f + Number(e.f || 0)
        }),
        { kcal: 0, p: 0, c: 0, f: 0 }
      );
      return [personId, sum];
    })
  );
}

async function ensureSeedDataIfNeeded() {
  state.persons = await getPersons();
  if (!state.persons.length) {
    await seedSampleData();
    state.persons = await getPersons();
  }
}

function normalizeSelection() {
  const hasSelected = state.persons.some((p) => p.id === state.selectedPersonId);
  if (!hasSelected) {
    state.selectedPersonId = state.persons[0]?.id || null;
  }
}

async function loadPersonScopedCaches() {
  if (!state.selectedPersonId) return;
  const personId = state.selectedPersonId;
  state.favoritesByPerson[personId] = await getFavorites(personId);
  state.recentsByPerson[personId] = await getRecents(personId);
}

function sectionItems(personId) {
  const favorites = (state.favoritesByPerson[personId] || []).map((item) => ({
    ...item,
    isGeneric: item.sourceType === 'generic',
    groupLabel: 'Favorite'
  }));

  const recents = (state.recentsByPerson[personId] || []).map((item) => ({
    ...item,
    isGeneric: item.sourceType === 'generic',
    groupLabel: 'Recent'
  }));

  return { favorites, recents };
}

function buildSuggestionPool(personId) {
  const { favorites, recents } = sectionItems(personId);
  const generic = genericFoods
    .filter((item) => state.selectedGenericCategory === 'all' || item.category === state.selectedGenericCategory)
    .map((item) => ({ ...foodFromGeneric(item), groupLabel: 'Built-in generic' }));

  const dedup = new Map();
  [...favorites, ...recents, ...generic].forEach((item) => {
    if (!dedup.has(item.foodId)) dedup.set(item.foodId, item);
  });
  return [...dedup.values()];
}

function filterSuggestions(query, personId) {
  const { favorites, recents } = sectionItems(personId);
  const pool = buildSuggestionPool(personId);
  const q = query.trim().toLowerCase();
  const filtered = q ? pool.filter((item) => item.label.toLowerCase().includes(q)) : pool;
  state.suggestions = filtered.slice(0, 30);
  const favoritesSet = new Set((state.favoritesByPerson[personId] || []).map((f) => f.foodId));
  renderFavoriteSection(favorites, favoritesSet);
  renderRecentSection(recents.slice(0, 20), favoritesSet);
  renderSuggestions(state.suggestions, favoritesSet);
}

async function loadAndRender() {
  state.persons = await getPersons();
  normalizeSelection();
  await loadPersonScopedCaches();

  document.getElementById('datePicker').value = state.selectedDate;
  const nutritionDatePicker = document.getElementById('nutritionDatePicker');
  if (nutritionDatePicker) nutritionDatePicker.value = state.nutritionDate;
  document.getElementById('addTime').value = document.getElementById('addTime').value || nowTime();
  const weightDateInput = document.getElementById('weightDateInput');
  if (weightDateInput) weightDateInput.value = state.analyticsDate;

  const entriesByPerson = {};
  for (const person of state.persons) {
    entriesByPerson[person.id] = await getEntriesForPersonDate(person.id, state.selectedDate);
  }

  renderPersonsList(state.persons, getTotalsByPerson(entriesByPerson));
  renderPersonPicker(state.persons, state.selectedPersonId);
  renderSettingsPersons(state.persons);
  renderGenericCategoryFilters(GENERIC_FOOD_CATEGORIES, state.selectedGenericCategory);

  const person = state.persons.find((p) => p.id === state.selectedPersonId);
  if (person) {
    renderDashboard(person, state.selectedDate, entriesByPerson[person.id] || []);
    filterSuggestions(document.getElementById('foodSearchInput').value || '', person.id);

    const logs = await getWeightLogsByPerson(person.id);
    state.weightLogsByPerson[person.id] = logs;
    renderWeightLogs(logs);

    const analyticsPoints = await buildWeeklyAnalyticsPoints(person.id, state.analyticsDate);
    state.analyticsPoints = analyticsPoints;
    renderAnalyticsChart(analyticsPoints);
    renderInsightMetrics(calculateInsightMetrics(analyticsPoints, state.analyticsDate));

    const nutritionEntries = await getEntriesForPersonDate(person.id, state.nutritionDate);
    renderNutritionOverview(aggregateMicronutrients(nutritionEntries));
  } else {
    renderDashboardEmpty();
    renderWeightLogs([]);
    state.analyticsPoints = [];
    renderAnalyticsChart([]);
    renderInsightMetrics(null);
    renderNutritionOverview([]);
  }
}

async function handlePersonSave(e) {
  e.preventDefault();
  const person = readPersonForm();
  if (!person.name) {
    window.alert('Please provide a name.');
    return;
  }
  if (!Number.isFinite(person.kcalGoal) || person.kcalGoal < 800) {
    window.alert('Please provide a valid daily kcal goal (>= 800).');
    return;
  }

  await upsertPerson(person);
  state.selectedPersonId = person.id;
  fillPersonForm(null);
  await loadAndRender();
}

async function handleSettingsActions(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const personId = button.dataset.personId;
  const action = button.dataset.action;
  const person = state.persons.find((p) => p.id === personId);
  if (!person) return;

  if (action === 'edit-person') {
    fillPersonForm(person);
    document.getElementById('personName').focus();
    return;
  }

  if (action === 'delete-person') {
    const ok = window.confirm(`Delete ${person.name}? This will permanently delete all their entries.`);
    if (!ok) return;
    await deletePersonCascade(person.id);
    if (state.selectedPersonId === person.id) state.selectedPersonId = null;
    fillPersonForm(null);
    await loadAndRender();
  }
}

function buildPortionOptions(item, lastUsed) {
  const options = [
    { label: '30g', grams: 30 },
    { label: '50g', grams: 50 },
    { label: '100g', grams: 100 },
    { label: '200g', grams: 200 }
  ];
  if (item.pieceGramHint) options.push({ label: `1 piece (~${item.pieceGramHint}g)`, grams: item.pieceGramHint });
  if (lastUsed) options.push({ label: `Last used (${lastUsed}g)`, grams: lastUsed });
  return options;
}

async function openPortionForItem(item) {
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }
  const lastPortionKey = `${personId}:${item.foodId}`;
  const last = await getLastPortion(lastPortionKey);
  state.activeFood = { ...item, personId, lastPortionKey };
  renderPortionPicker(item, buildPortionOptions(item, last));
  openPortionDialog();
}

async function logActiveFood() {
  const grams = readPortionGrams();
  if (!Number.isFinite(grams) || grams <= 0) {
    window.alert('Please enter a valid gram amount.');
    return;
  }

  const active = state.activeFood;
  if (!active) return;
  const usedPersonId = document.getElementById('addPersonPicker').value || active.personId;
  const entryDate = state.selectedDate;
  const time = document.getElementById('addTime').value || nowTime();
  const macros = computeNutritionFromPer100g(active.nutrition, grams);

  const source =
    active.sourceType === 'favorite'
      ? 'Favorite'
      : active.sourceType === 'generic'
        ? 'Manual (Generic built-in)'
        : active.sourceType === 'barcode'
          ? 'Barcode (Open Food Facts)'
          : active.sourceType === 'photo-manual'
            ? 'Photo (manual via ChatGPT)'
            : 'Manual (Custom)';

  try {
    await addEntry({
      personId: usedPersonId,
      date: entryDate,
      time,
      foodId: active.foodId,
      foodName: active.label,
      amountGrams: grams,
      ...macros,
      micronutrients: computeEntryMicronutrients(active.nutrition, grams),
      source,
      lastPortionKey: active.lastPortionKey,
      recentItem: {
        foodId: active.foodId,
        label: active.label,
        nutrition: active.nutrition,
        pieceGramHint: active.pieceGramHint,
        sourceType: active.sourceType === 'favorite' ? 'generic' : active.sourceType
      }
    });
  } catch (error) {
    console.error(error);
    showAddStatus('Could not log entry. Please use non-negative values.');
    return;
  }

  showAddStatus(`Logged ${active.label} (${grams}g).`);
  closePortionDialog();
  await loadAndRender();
}

async function handleAddSuggestionClick(e) {
  const actionTarget = e.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const foodId = actionTarget.dataset.foodId;
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!foodId || !personId) return;

  const item = buildSuggestionPool(personId).find((s) => s.foodId === foodId);
  if (!item) return;

  if (action === 'toggle-favorite') {
    const turnedOn = await toggleFavorite(personId, {
      foodId: item.foodId,
      label: item.label,
      nutrition: item.nutrition,
      pieceGramHint: item.pieceGramHint,
      sourceType: item.sourceType === 'favorite' ? 'generic' : item.sourceType
    });
    showAddStatus(turnedOn ? 'Added to favorites.' : 'Removed from favorites.');
    await loadPersonScopedCaches();
    filterSuggestions(document.getElementById('foodSearchInput').value || '', personId);
    return;
  }

  if (action === 'pick-food') {
    const favorited = await isFavorite(personId, item.foodId);
    const sourceType = favorited ? 'favorite' : item.sourceType;
    await openPortionForItem({ ...item, sourceType });
  }
}

async function handleCustomFoodSubmit(e) {
  e.preventDefault();
  const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    window.alert('Create/select a person first.');
    return;
  }

  const label = document.getElementById('customName').value.trim();
  if (!label) return;

  const nutrition = {
    kcal100g: Number(document.getElementById('customKcal').value),
    p100g: Number(document.getElementById('customP').value),
    c100g: Number(document.getElementById('customC').value),
    f100g: Number(document.getElementById('customF').value)
  };

  const hasInvalidNutrition = [nutrition.kcal100g, nutrition.p100g, nutrition.c100g, nutrition.f100g].some(
    (value) => !Number.isFinite(value) || value < 0
  );
  if (hasInvalidNutrition) {
    window.alert('Please enter non-negative numbers for kcal and macros.');
    return;
  }

  const selectedSource = document.getElementById('customSource').value || 'custom';

  await openPortionForItem({
    foodId: `custom:${label.toLowerCase().replace(/\s+/g, '_')}`,
    label,
    nutrition,
    pieceGramHint: null,
    sourceType: selectedSource,
    isGeneric: false,
    groupLabel: selectedSource === 'photo-manual' ? 'Photo (manual via ChatGPT)' : 'Custom'
  });
}


async function handleBarcodeDetected(barcode) {
  if (!barcode) return;

  setScanStatus(`Scanned: ${barcode}`);

  const cachedRaw = await getCachedProduct(barcode);
  const cached = normalizeCachedProduct(cachedRaw);
  if (cached) {
    state.scannedProduct = cached;
    renderScanResult(cached);
  }

  if (!navigator.onLine) {
    if (!cached) {
      setScanStatus('Needs internet for first lookup.');
      renderScanResult(null);
    } else {
      setScanStatus('Loaded from local cache (offline).');
    }
    return;
  }

  try {
    const product = await lookupOpenFoodFacts(barcode);
    await upsertCachedProduct(product);
    state.scannedProduct = product;
    renderScanResult(product);
    setScanStatus(cached ? 'Updated from Open Food Facts.' : 'Product loaded from Open Food Facts.');
  } catch (error) {
    if (!cached) {
      setScanStatus('Could not find product. You can use manual add instead.');
      renderScanResult(null);
    } else {
      setScanStatus('Using cached product (network lookup failed).');
    }
  }
}

function toScannedFoodItem(product) {
  return {
    foodId: `barcode:${product.barcode}`,
    label: product.brands ? `${product.productName} (${product.brands})` : product.productName,
    nutrition: {
      kcal100g: product.nutrition.kcal100g,
      p100g: product.nutrition.p100g,
      c100g: product.nutrition.c100g,
      f100g: product.nutrition.f100g,
      micronutrients: product.nutrition.micronutrients || null
    },
    pieceGramHint: null,
    sourceType: 'barcode',
    isGeneric: false,
    groupLabel: 'Barcode (Open Food Facts)'
  };
}


async function handleSaveWeightLog() {
  const personId = document.getElementById('analyticsPersonPicker').value || state.selectedPersonId;
  if (!personId) {
    setAnalyticsStatus('Please add/select a person first.');
    return;
  }

  const date = document.getElementById('weightDateInput').value || new Date().toISOString().slice(0, 10);
  const weightValue = Number(document.getElementById('weightValueInput').value);
  if (!Number.isFinite(weightValue) || weightValue <= 0) {
    setAnalyticsStatus('Enter a valid positive weight.');
    return;
  }

  await addWeightLog(personId, date, weightValue);
  const logs = await getWeightLogsByPerson(personId);
  state.weightLogsByPerson[personId] = logs;
  renderWeightLogs(logs);

  const analyticsPoints = await buildWeeklyAnalyticsPoints(personId, state.analyticsDate);
  state.analyticsPoints = analyticsPoints;
  renderAnalyticsChart(analyticsPoints);

  const inRange = await getWeightLogsInRange(personId, '0000-01-01', '9999-12-31');
  setAnalyticsStatus(`Saved weight for ${date}. Total logs: ${inRange.length}.`);
}


function showSettingsDataStatus(message) {
  const el = document.getElementById('settingsDataStatus');
  if (el) el.textContent = message;
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExportData() {
  const payload = await exportAllData();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJsonFile(`macro-tracker-export-${stamp}.json`, payload);
  showSettingsDataStatus('Export complete. JSON downloaded.');
}

async function handleImportDataFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);

  const required = ['persons', 'entries', 'productsCache', 'favorites', 'recents'];
  const hasShape = required.every((key) => Array.isArray(parsed[key]));
  if (!Array.isArray(parsed.weightLogs)) parsed.weightLogs = [];
  if (!hasShape) {
    window.alert('Invalid import file format.');
    return;
  }

  const summary = await importAllData(parsed);
  state.selectedPersonId = null;
  fillPersonForm(null);
  await loadAndRender();
  showSettingsDataStatus(
    `Import complete. Persons: ${summary.persons}, Entries: ${summary.entries}, Favorites: ${summary.favorites}, Recents: ${summary.recents}, Weight logs: ${summary.weightLogs}.`
  );
}

async function handleDeleteAllData() {
  const ok = window.confirm('Delete ALL app data on this device? This cannot be undone.');
  if (!ok) return;
  await deleteAllData();
  state.selectedPersonId = null;
  state.favoritesByPerson = {};
  state.recentsByPerson = {};
  state.weightLogsByPerson = {};
  fillPersonForm(null);
  await loadAndRender();
  showSettingsDataStatus('All data deleted.');
}


function setPhotoStatus(message) {
  const el = document.getElementById('photoStatus');
  if (el) el.textContent = message;
}

async function handleCopyPhotoPrompt() {
  try {
    await navigator.clipboard.writeText(CHATGPT_PHOTO_PROMPT);
    setPhotoStatus('Prompt copied. Open ChatGPT, upload the photo, paste prompt, then return to log manually.');
  } catch (error) {
    console.error(error);
    setPhotoStatus('Could not copy automatically. Please copy the prompt manually.');
  }
}

function handlePhotoSelected(file) {
  if (!file) return;
  const preview = document.getElementById('photoPreview');
  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.hidden = false;
    setPhotoStatus('Photo preview ready. Use “Copy ChatGPT Prompt” and follow instructions below.');
  };
  reader.readAsDataURL(file);
}


async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  } catch (error) {
    console.error('Service worker registration failed:', error);
  }
}

function wireEvents() {
  initRoutes((route) => {
    state.route = route;
    if (route !== 'scan') {
      stopBarcodeScanner();
    }
  });

  document.getElementById('personPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('datePicker').addEventListener('change', async (e) => {
    state.selectedDate = e.target.value;
    await loadAndRender();
  });

  document.getElementById('addPersonPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('analyticsPersonPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('nutritionPersonPicker').addEventListener('change', async (e) => {
    state.selectedPersonId = e.target.value || null;
    await loadAndRender();
  });

  document.getElementById('nutritionDatePicker').addEventListener('change', async (e) => {
    state.nutritionDate = e.target.value;
    await loadAndRender();
  });

  document.getElementById('weightDateInput').addEventListener('change', async (e) => {
    state.analyticsDate = e.target.value;
    if (!state.selectedPersonId) return;
    const points = await buildWeeklyAnalyticsPoints(state.selectedPersonId, state.analyticsDate);
    state.analyticsPoints = points;
    renderAnalyticsChart(points);
    renderInsightMetrics(calculateInsightMetrics(points, state.analyticsDate));
  });

  document.getElementById('analyticsRangeToggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('.range-btn');
    if (!btn) return;
    state.analyticsRange = btn.dataset.range;
    document.querySelectorAll('#analyticsRangeToggle .range-btn').forEach((b) => b.classList.toggle('active', b === btn));

    if (!state.selectedPersonId) return;
    const points = await buildWeeklyAnalyticsPoints(state.selectedPersonId, state.analyticsDate);
    state.analyticsPoints = points;
    renderAnalyticsChart(points);
    renderInsightMetrics(calculateInsightMetrics(points, state.analyticsDate));
    if (state.analyticsRange !== '1W') {
      setAnalyticsStatus('Range toggle placeholder: showing 1W dataset for now.');
    }
  });

  document.getElementById('saveWeightBtn').addEventListener('click', async () => {
    try {
      await handleSaveWeightLog();
    } catch (error) {
      console.error(error);
      setAnalyticsStatus('Failed to save weight log.');
    }
  });

  document.getElementById('foodSearchInput').addEventListener('input', (e) => {
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    filterSuggestions(e.target.value, personId);
  });

  document.getElementById('genericCategoryFilters').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action="filter-category"]');
    if (!button) return;
    state.selectedGenericCategory = button.dataset.category || 'all';
    renderGenericCategoryFilters(GENERIC_FOOD_CATEGORIES, state.selectedGenericCategory);
    const personId = document.getElementById('addPersonPicker').value || state.selectedPersonId;
    if (!personId) return;
    filterSuggestions(document.getElementById('foodSearchInput').value || '', personId);
  });

  document.getElementById('addSuggestions').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('favoriteList').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('recentList').addEventListener('click', handleAddSuggestionClick);
  document.getElementById('customFoodForm').addEventListener('submit', handleCustomFoodSubmit);

  document.getElementById('startScanBtn').addEventListener('click', async () => {
    const video = document.getElementById('scannerVideo');
    try {
      await startBarcodeScanner(video, handleBarcodeDetected, () => {});
      setScanStatus('Scanner active. Point camera at an EAN/UPC barcode.');
    } catch (error) {
      console.error(error);
      setScanStatus('Unable to start scanner. Check camera permission.');
    }
  });

  document.getElementById('stopScanBtn').addEventListener('click', () => {
    stopBarcodeScanner();
    setScanStatus('Scanner stopped.');
  });

  document.getElementById('scanResult').addEventListener('click', async (e) => {
    const btn = e.target.closest('#logScannedProductBtn');
    if (!btn || !state.scannedProduct) return;
    await openPortionForItem(toScannedFoodItem(state.scannedProduct));
  });

  document.getElementById('copyPromptBtn').addEventListener('click', handleCopyPhotoPrompt);
  document.getElementById('photoInput').addEventListener('change', (e) => {
    handlePhotoSelected(e.target.files?.[0]);
  });

  document.getElementById('portionPresetButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="set-portion"]');
    if (!btn) return;
    setPortionGrams(Number(btn.dataset.grams));
  });
  document.getElementById('confirmPortionBtn').addEventListener('click', logActiveFood);
  document.getElementById('cancelPortionBtn').addEventListener('click', closePortionDialog);

  document.getElementById('personForm').addEventListener('submit', handlePersonSave);
  document.getElementById('cancelEditBtn').addEventListener('click', () => fillPersonForm(null));
  document.getElementById('settingsPersons').addEventListener('click', handleSettingsActions);

  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    try {
      await handleExportData();
    } catch (error) {
      console.error(error);
      showSettingsDataStatus('Export failed.');
    }
  });

  document.getElementById('importDataInput').addEventListener('change', async (e) => {
    try {
      await handleImportDataFile(e.target.files?.[0]);
    } catch (error) {
      console.error(error);
      window.alert('Import failed. Please check the JSON file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('deleteAllDataBtn').addEventListener('click', async () => {
    try {
      await handleDeleteAllData();
    } catch (error) {
      console.error(error);
      showSettingsDataStatus('Delete all failed.');
    }
  });

  document.getElementById('seedBtn').addEventListener('click', async () => {
    const ok = window.confirm('Reset to sample data? This replaces current persons and entries.');
    if (!ok) return;
    await seedSampleData();
    fillPersonForm(null);
    await loadAndRender();
  });

  window.addEventListener('resize', () => {
    renderAnalyticsChart(state.analyticsPoints || []);
  });

  const installDialog = document.getElementById('installDialog');
  document.getElementById('installHintBtn').addEventListener('click', () => installDialog.showModal());
  document.getElementById('closeInstallDialog').addEventListener('click', () => installDialog.close());
}

await registerServiceWorker();
wireEvents();
fillPersonForm(null);
await ensureSeedDataIfNeeded();
await loadAndRender();
