// report.js

const reportId = new URLSearchParams(window.location.search).get('report_id');
const now = new Date();
const currentYear = String(now.getFullYear());
const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

if (!reportId) {
  alert('Kein Bericht ausgewählt. Bitte über die Startseite öffnen.');
  window.location.href = '/index.html';
}

console.log('DEBUG reportId:', reportId);

let expenses = [];
let isFetching = false;   // nur für loadExpenses
let isMutating = false;   // für add/edit/delete
let editingId = null;
let draggedRow = null;
let selectedYear = currentYear;
let selectedMonth = currentMonth;
let selectedContent = 'expenses';
let reportTitle = 'Ausgaben Tracker';
let categoryMap = {};
let budgetHistoryMap = {}; // { "2026-01": 1000, ... }
let categoryPieChart = null;
let netBudgetChart = null;

// Plugin zeichnet Verbindungslinien von Endwert -> Startwert der nächsten Bar
const netBudgetConnectorPlugin = {
  id: 'netBudgetConnector',
  afterDatasetsDraw(chart, args, opts) {
    const datasetIndex = opts.datasetIndex ?? 0;
    const meta = chart.getDatasetMeta(datasetIndex);
    const bars = meta.data;
    const ctx = chart.ctx;

    if (!bars || bars.length < 1) return;

    // Daten der Bars: [[start, end], ...]
    const rawData = chart.data.datasets[datasetIndex].data || [];
    if (!rawData.length) return;

    // Levels berechnen: levels[0] = Startlevel vor erster Bar
    const levels = [];
    const firstVal = rawData[0];
    if (Array.isArray(firstVal) && firstVal.length === 2) {
      levels.push(firstVal[0]); // Start vor erster Bar
    } else {
      return; // Datenformat unerwartet
    }
    rawData.forEach(([start, end]) => {
      levels.push(end);
    });

    const yScale = chart.scales.y;
    if (!yScale) return;

    ctx.save();
    ctx.strokeStyle = opts.color || '#000000';
    ctx.lineWidth  = opts.lineWidth || 3;

    for (let i = 0; i < bars.length - 1; i++) {
      const current = bars[i];
      const next = bars[i + 1];

      const c = current.getProps(['x', 'width'], true);
      const n = next.getProps(['x', 'width'], true);

      // Endlevel des aktuellen Balkens, Startlevel des nächsten
      const endLevelCurrent   = levels[i + 1];
      const startLevelNext    = levels[i + 1]; // gleicher Level, da nächste Bar bei diesem Level startet

      const currentRightX = c.x + c.width / 2;
      const nextLeftX     = n.x - n.width / 2;

      const currentY = yScale.getPixelForValue(endLevelCurrent);
      const nextY    = yScale.getPixelForValue(startLevelNext);

      ctx.beginPath();
      ctx.moveTo(currentRightX, currentY);
      ctx.lineTo(nextLeftX, nextY);
      ctx.stroke();
    }

    ctx.restore();
  }
};

Chart.register(netBudgetConnectorPlugin);
// Monatsnamen
const monthNames = {
  '01': 'Januar',
  '02': 'Februar',
  '03': 'März',
  '04': 'April',
  '05': 'Mai',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'August',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Dezember'
};

document.addEventListener('DOMContentLoaded', initReport);

// ===== ENTER-HANDLING =====

function bindEnterToButton(inputSelectorOrList, buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  const inputs = typeof inputSelectorOrList === 'string'
    ? document.querySelectorAll(inputSelectorOrList)
    : inputSelectorOrList;

  if (!inputs || !inputs.length) return;

  inputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        button.click();
      }
    });
  });
}

// ===== INIT =====

function initReport() {
  // Formular-Felder
  const dateInput = document.getElementById('date');
  if (dateInput) dateInput.valueAsDate = new Date();

  const submitBtn = document.getElementById('submitBtn');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (submitBtn) submitBtn.addEventListener('click', addExpense);
  if (resetBtn) resetBtn.addEventListener('click', clearForm);
  if (saveBtn) saveBtn.addEventListener('click', saveEdit);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Titel-Modal
  const editTitleBtn = document.getElementById('editTitleBtn');
  const saveTitleBtn = document.getElementById('saveTitleBtn');
  const cancelTitleBtn = document.getElementById('cancelTitleBtn');

  if (editTitleBtn) editTitleBtn.addEventListener('click', openEditTitleModal);
  if (saveTitleBtn) saveTitleBtn.addEventListener('click', saveTitle);
  if (cancelTitleBtn) cancelTitleBtn.addEventListener('click', closeEditTitleModal);

  // Month Tabs
  document.querySelectorAll('.month-tab').forEach(btn => {
    btn.addEventListener('click', switchMonth);
  });

  // Content Tabs
  document.querySelectorAll('.content-tab').forEach(btn => {
    btn.addEventListener('click', switchContent);
  });

  // Navigation zu Kategorien / Budget
  const categoryBtn = document.getElementById('categoryBtn');
  const budgetBtn = document.getElementById('budgetBtn');

  if (categoryBtn) {
    categoryBtn.addEventListener('click', () => {
      window.location.href = `/categories.html?report_id=${encodeURIComponent(reportId)}`;
    });
  }
  if (budgetBtn) {
    budgetBtn.addEventListener('click', () => {
      window.location.href = `/budget.html?report_id=${encodeURIComponent(reportId)}`;
    });
  }

  // Budget-Modal Buttons (optional)
  const budgetOpenBtn = document.getElementById('openBudgetModalBtn');
  const budgetSaveBtn = document.getElementById('saveBudgetBtn');
  const budgetCancelBtn = document.getElementById('cancelBudgetBtn');

  if (budgetOpenBtn) budgetOpenBtn.addEventListener('click', openBudgetModal);
  if (budgetSaveBtn) budgetSaveBtn.addEventListener('click', saveBudget);
  if (budgetCancelBtn) budgetCancelBtn.addEventListener('click', closeBudgetModal);

  // Event Delegation für Edit/Delete in der Ausgaben-Tabelle
  const expenseTableBody = document.getElementById('expenseTable');
  if (expenseTableBody) {
    expenseTableBody.addEventListener('click', handleExpenseTableClick);
  }

  // Enter-Handling
  bindEnterToButton('#date, #category, #amount', 'submitBtn');
  bindEnterToButton('#editDate, #editCategory, #editAmount', 'saveBtn');
  bindEnterToButton('#editTitleInput', 'saveTitleBtn');
  bindEnterToButton('#budgetInput', 'saveBudgetBtn');

  loadReport();
  loadBudgetHistory();
  loadCategories();
  loadExpenses();
}

// ===== REPORT TITLE =====

async function loadReport() {
  try {
    const { data, error } = await db
      .from('reports')
      .select('name, id')
      .eq('id', reportId)
      .single();

    if (error) {
      console.error('Fehler beim Laden des Reports:', error);
      return;
    }

    console.log('DEBUG loadReport data:', data);

    if (data && data.name) {
      reportTitle = data.name;
      const titleEl = document.getElementById('reportTitle');
      if (titleEl) titleEl.textContent = reportTitle;
    }
  } catch (error) {
    console.error('Fehler beim Laden des Reports (catch):', error);
  }
}

function openEditTitleModal() {
  const input = document.getElementById('editTitleInput');
  const modal = document.getElementById('editTitleModal');
  if (!input || !modal) return;

  input.value = reportTitle;
  modal.classList.add('active');
  input.focus();
}

function closeEditTitleModal() {
  const modal = document.getElementById('editTitleModal');
  if (modal) modal.classList.remove('active');
}

async function saveTitle() {
  const input = document.getElementById('editTitleInput');
  if (!input) return;

  const newTitle = input.value.trim();
  if (!newTitle) {
    alert('Bitte gib einen Titel ein.');
    return;
  }

  try {
    const { data, error } = await db
      .from('reports')
      .update({ name: newTitle })
      .eq('id', reportId)
      .select('id, name')
      .single();

    if (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern: ' + error.message);
      return;
    }

    console.log('DEBUG saveTitle updated:', data);

    reportTitle = newTitle;
    const titleEl = document.getElementById('reportTitle');
    if (titleEl) titleEl.textContent = reportTitle;
    closeEditTitleModal();
  } catch (error) {
    console.error('Fehler beim Speichern (catch):', error);
    alert('Fehler beim Speichern: ' + error.message);
  }
}

// ===== BUDGET =====

async function loadBudgetHistory() {
  try {
    const { data, error } = await db
      .from('budget_history')
      .select('year_month, budget_amount, report_id')
      .eq('report_id', reportId);

    if (error) {
      console.error('Fehler beim Laden der Budget-Historie:', error);
      return;
    }

    console.log('DEBUG loadBudgetHistory rows:', data);

    budgetHistoryMap = {};
    (data || []).forEach(row => {
      budgetHistoryMap[row.year_month] = row.budget_amount;
    });
  } catch (error) {
    console.error('Fehler beim Laden der Budget-Historie (catch):', error);
  }
}

function getBudgetForMonth(year, month) {
  const key = `${year}-${month}`;
  return budgetHistoryMap[key] || 0;
}

function openBudgetModal() {
  if (selectedYear === 'all' || selectedMonth === 'overview') {
    alert('Bitte wählen Sie einen spezifischen Monat aus.');
    return;
  }

  const monthName = monthNames[selectedMonth] || selectedMonth;
  const currentBudget = getBudgetForMonth(selectedYear, selectedMonth);

  const labelEl = document.getElementById('budgetModalMonth');
  const input = document.getElementById('budgetInput');
  const modal = document.getElementById('budgetModal');

  if (!labelEl || !input || !modal) return;

  labelEl.textContent = `${monthName} ${selectedYear}`;
  input.value = currentBudget;
  modal.classList.add('active');
  input.focus();
}

function closeBudgetModal() {
  const modal = document.getElementById('budgetModal');
  if (modal) modal.classList.remove('active');
}

async function saveBudget() {
  const input = document.getElementById('budgetInput');
  if (!input) return;

  const budgetAmount = parseFloat(input.value);
  if (isNaN(budgetAmount) || budgetAmount < 0) {
    alert('Bitte geben Sie einen gültigen Betrag ein.');
    return;
  }

  if (selectedYear === 'all' || selectedMonth === 'overview') {
    alert('Ungültiger Monat ausgewählt.');
    return;
  }

  const monthKey = `${selectedYear}-${selectedMonth}`;

  try {
    const { data, error } = await db
      .from('budget_history')
      .upsert(
        {
          report_id: reportId,
          year_month: monthKey,
          budget_amount: budgetAmount
        },
        { onConflict: 'report_id,year_month' }
      )
      .select('report_id, year_month, budget_amount');

    if (error) {
      console.error('Fehler beim Speichern des Budgets:', error);
      alert('Fehler beim Speichern: ' + error.message);
      return;
    }

    console.log('DEBUG saveBudget upsert result:', data);

    budgetHistoryMap[monthKey] = budgetAmount;
    updateSummary();
    renderNetBudgetChart();
    closeBudgetModal();
  } catch (error) {
    console.error('Fehler beim Speichern des Budgets (catch):', error);
    alert('Fehler beim Speichern: ' + error.message);
  }
}

// ===== KATEGORIEN =====

async function loadCategories() {
  try {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('report_id', reportId);

    if (error) {
      console.error('Fehler beim Laden der Kategorien:', error);
      return;
    }

    console.log('DEBUG loadCategories rows:', data);

    categoryMap = {};
    (data || []).forEach(cat => {
      categoryMap[cat.key] = cat;
    });

    updateCategorySelects();
  } catch (error) {
    console.error('Fehler beim Laden der Kategorien (catch):', error);
  }
}

function updateCategorySelects() {
  const ids = ['category', 'editCategory'];

  ids.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;

    const defaultOption = select.querySelector('option[value=""]');
    select.innerHTML = '';

    if (defaultOption) {
      select.appendChild(defaultOption);
    }

    Object.values(categoryMap).forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.key;
      option.textContent = `${cat.icon} ${cat.name}`;
      select.appendChild(option);
    });
  });
}

function getCategoryLabel(category) {
  const cat = categoryMap[category];
  if (cat) {
    return `${cat.icon} ${cat.name}`;
  }
  return category;
}

function getCategoryColor(category) {
  const cat = categoryMap[category];
  return cat?.color || '#a7a9a9';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ===== YEAR TABS DYNAMISCH =====

function renderYearTabs() {
  const yearTabs = document.getElementById('yearTabs');
  if (!yearTabs) return;

  // Alle Jahre aus den Ausgaben sammeln
  const yearsSet = new Set();

  expenses.forEach(exp => {
    if (exp.date && typeof exp.date === 'string' && exp.date.length >= 4) {
      yearsSet.add(exp.date.slice(0, 4)); // "YYYY"
    }
  });

  // Sicherstellen, dass das aktuelle Jahr immer dabei ist
  yearsSet.add(currentYear);

  // Sortiert (neueste zuerst)
  const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));

  // Vorhandene Buttons komplett ersetzen
  yearTabs.innerHTML = '';

  // Jahr-Buttons erzeugen
  years.forEach(year => {
    const btn = document.createElement('button');
    btn.className = 'year-tab';
    btn.dataset.year = year;
    btn.textContent = year;

    if (year === selectedYear) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', switchYear);
    yearTabs.appendChild(btn);
  });

  // "Gesamt"-Button anhängen
  const allBtn = document.createElement('button');
  allBtn.className = 'year-tab';
  allBtn.dataset.year = 'all';
  allBtn.textContent = 'Gesamt';

  if (selectedYear === 'all') {
    allBtn.classList.add('active');
  }

  allBtn.addEventListener('click', switchYear);
  yearTabs.appendChild(allBtn);
}

// ===== TAB-WECHSEL =====

function switchYear(e) {
  const year = e.target.dataset.year;
  selectedYear = year;
  selectedMonth = '01';

  document.querySelectorAll('.year-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  const monthTabs = document.getElementById('monthTabs');
  if (year === 'all') {
    if (monthTabs) monthTabs.style.display = 'none';
    selectedMonth = 'overview';
  } else {
    if (monthTabs) monthTabs.style.display = 'flex';
    const targetMonth = (year === currentYear) ? currentMonth : '01';
    selectedMonth = targetMonth;

    document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
    const monthBtn = document.querySelector(`.month-tab[data-month="${targetMonth}"]`);
    if (monthBtn) monthBtn.classList.add('active');
  }

  renderTable();
  updateSummary();
  if (selectedContent === 'statistics') {
    renderCategoryPieChart();
    renderNetBudgetChart();
  }
}

function switchMonth(e) {
  selectedMonth = e.target.dataset.month;

  document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  renderTable();
  updateSummary();
  if (selectedContent === 'statistics') {
    renderCategoryPieChart();
    renderNetBudgetChart();
  }
}

function switchContent(e) {
  selectedContent = e.target.dataset.content;

  document.querySelectorAll('.content-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));

  if (selectedContent === 'expenses') {
    const sec = document.getElementById('expensesSection');
    if (sec) sec.classList.add('active');
  } else if (selectedContent === 'statistics') {
    const sec = document.getElementById('statisticsSection');
    if (sec) sec.classList.add('active');
    renderCategoryPieChart();
    renderNetBudgetChart();
  }
}

// ===== EXPENSES LADEN =====

async function loadExpenses() {
  if (isFetching) return;
  isFetching = true;

  try {
    const { data, error } = await db
      .from('expenses')
      .select('*')
      .eq('report_id', reportId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Fehler beim Laden:', error);
      return;
    }

    console.log('DEBUG loadExpenses rows:', data);

    expenses = data || [];
    renderTable();
    updateSummary();
    renderYearTabs();
    renderNetBudgetChart();
  } catch (error) {
    console.error('Fehler beim Laden (catch):', error);
  } finally {
    isFetching = false;
  }
}

function getFilteredExpenses() {
  let filtered = expenses;

  if (selectedYear !== 'all') {
    filtered = filtered.filter(e => e.date.startsWith(selectedYear));
  }

  if (selectedYear !== 'all' && selectedMonth !== 'overview') {
    filtered = filtered.filter(e => e.date.startsWith(`${selectedYear}-${selectedMonth}`));
  }

  return filtered.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ===== CRUD: ADD / EDIT / DELETE =====

async function addExpense(event) {
  if (event) event.preventDefault();

  const dateInput = document.getElementById('date');
  const categoryInput = document.getElementById('category');
  const amountInput = document.getElementById('amount');
  const submitBtn = document.getElementById('submitBtn');

  if (!dateInput || !categoryInput || !amountInput || !submitBtn) return;

  const date = dateInput.value;
  const category = categoryInput.value;
  const amount = parseFloat(amountInput.value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert('Bitte alle Felder ausfüllen und einen gültigen Betrag eingeben.');
    return;
  }

  if (isMutating) return;
  isMutating = true;
  submitBtn.disabled = true;

  const optimisticExpense = {
    id: `temp_${Date.now()}`,
    date,
    category,
    amount,
    report_id: reportId
  };

  expenses.unshift(optimisticExpense);
  renderTable();
  updateSummary();
  clearForm();

  try {
    const { data, error } = await db
      .from('expenses')
      .insert({ date, category, amount, report_id: reportId })
      .select();

    if (error) {
      expenses = expenses.filter(e => e.id !== optimisticExpense.id);
      renderTable();
      updateSummary();
      throw error;
    }

    const newExpense = data[0];
    const idx = expenses.findIndex(e => e.id === optimisticExpense.id);
    if (idx !== -1) {
      expenses[idx] = newExpense;
      renderTable();
      renderYearTabs();
      renderNetBudgetChart();
    }
  } catch (error) {
    alert('Fehler beim Speichern: ' + error.message);
  } finally {
    isMutating = false;
    submitBtn.disabled = false;
  }
}

function openEditModal(id) {
  const expense = expenses.find(e => String(e.id) === String(id));
  if (!expense) return;

  editingId = expense.id;

  const dateInput = document.getElementById('editDate');
  const categoryInput = document.getElementById('editCategory');
  const amountInput = document.getElementById('editAmount');
  const modal = document.getElementById('editModal');

  if (!dateInput || !categoryInput || !amountInput || !modal) return;

  dateInput.value = expense.date;
  categoryInput.value = expense.category;
  amountInput.value = expense.amount;
  modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('active');
  editingId = null;
}

async function saveEdit(event) {
  if (event) event.preventDefault();

  if (editingId == null) {
    alert('Fehler: Keine Ausgabe zum Bearbeiten ausgewählt.');
    return;
  }

  const numericId = Number(editingId);
  if (!Number.isFinite(numericId)) {
    alert('Fehler: Ungültige Ausgaben-ID (kein numerischer Wert).');
    return;
  }

  const dateInput = document.getElementById('editDate');
  const categoryInput = document.getElementById('editCategory');
  const amountInput = document.getElementById('editAmount');

  if (!dateInput || !categoryInput || !amountInput) return;

  const date = dateInput.value;
  const category = categoryInput.value;
  const amount = parseFloat(amountInput.value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert('Bitte alle Felder ausfüllen.');
    return;
  }

  if (isMutating) return;
  isMutating = true;

  const idx = expenses.findIndex(e => Number(e.id) === numericId);
  if (idx === -1) {
    isMutating = false;
    alert('Fehler: Ausgabe nicht gefunden.');
    return;
  }

  const prev = { ...expenses[idx] };

  expenses[idx] = { ...prev, date, category, amount };
  renderTable();
  updateSummary();
  renderNetBudgetChart();

  try {
    const { error } = await db
      .from('expenses')
      .update({ date, category, amount })
      .eq('id', numericId);

    if (error) {
      expenses[idx] = prev;
      renderTable();
      updateSummary();
      renderNetBudgetChart();
      throw error;
    }
  } catch (error) {
    alert('Fehler beim Aktualisieren: ' + error.message);
    await loadExpenses();
  } finally {
    isMutating = false;
    closeModal();
  }
}

async function deleteExpense(id) {
  if (!confirm('Wirklich löschen?')) return;
  if (isMutating) return;
  isMutating = true;

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    isMutating = false;
    alert('Fehler: Ungültige Ausgaben-ID (kein numerischer Wert).');
    return;
  }

  const toDelete = expenses.find(e => Number(e.id) === numericId);
  expenses = expenses.filter(e => Number(e.id) !== numericId);
  renderTable();
  updateSummary();
  renderYearTabs();
  renderNetBudgetChart();

  try {
    const { error } = await db
      .from('expenses')
      .delete()
      .eq('id', numericId);

    if (error) {
      if (toDelete) expenses.unshift(toDelete);
      renderTable();
      updateSummary();
      throw error;
    }
  } catch (error) {
    alert('Fehler beim Löschen: ' + error.message);
  } finally {
    isMutating = false;
  }
}

function clearForm(event) {
  if (event) event.preventDefault();

  const dateInput = document.getElementById('date');
  const categoryInput = document.getElementById('category');
  const amountInput = document.getElementById('amount');

  if (dateInput) dateInput.valueAsDate = new Date();
  if (categoryInput) categoryInput.value = '';
  if (amountInput) amountInput.value = '';
}

// ===== TABLE & DRAG&DROP =====

function renderTable() {
  const tbody = document.getElementById('expenseTable');
  if (!tbody) return;

  const filtered = getFilteredExpenses();

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="5">Keine Ausgaben für diesen Zeitraum vorhanden.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(expense => {
    const cat = categoryMap[expense.category];
    const label = cat ? `${cat.icon} ${cat.name}` : expense.category;
    const color = cat ? cat.color : '#a7a9a9';
    const bgColor = hexToRgba(color, 0.15);

    return `
      <tr draggable="true" data-id="${expense.id}">
        <td style="text-align: center; cursor: grab;">
          <span class="icon-drag">⋮⋮</span>
        </td>
        <td>${new Date(expense.date + 'T00:00:00').toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })}</td>
        <td>
          <span class="status-badge" style="background-color: ${bgColor}; color: ${color};">
            ${label}
          </span>
        </td>
        <td class="text-right"><strong>${formatCurrency(expense.amount)}</strong></td>
        <td class="text-right action-buttons">
          <button
            type="button"
            class="icon-btn icon-delete"
            data-action="delete"
            data-id="${expense.id}"
            title="Löschen"
          >✕</button>
          <button
            type="button"
            class="icon-btn icon-edit"
            data-action="edit"
            data-id="${expense.id}"
            title="Bearbeiten"
          >✎</button>
        </td>
      </tr>
    `;
  }).join('');

  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('drop', handleDrop);
    row.addEventListener('dragend', handleDragEnd);
  });
}

function handleExpenseTableClick(e) {
  const button = e.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === 'delete') {
    deleteExpense(id);
  } else if (action === 'edit') {
    openEditModal(id);
  }
}

function handleDragStart(e) {
  draggedRow = this;
  this.classList.add('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  if (this !== draggedRow) {
    this.style.opacity = '0.7';
  }
}

function handleDrop(e) {
  e.preventDefault();
  if (this !== draggedRow) {
    const allRows = Array.from(document.querySelectorAll('#expenseTable tr'));
    const draggedIndex = allRows.indexOf(draggedRow);
    const targetIndex = allRows.indexOf(this);

    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedRow, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedRow, this);
    }
  }
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  const allRows = document.querySelectorAll('#expenseTable tr');
  allRows.forEach(row => row.style.opacity = '1');
  draggedRow = null;
}

// ===== PIE CHART =====

function renderCategoryPieChart() {
  const canvas = document.getElementById('categoryPieChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const filtered = getFilteredExpenses();

  if (!filtered || filtered.length === 0) {
    if (categoryPieChart) {
      categoryPieChart.destroy();
      categoryPieChart = null;
    }
    return;
  }

  // Beträge pro Kategorie sauber aufsummieren (alles in Number casten)
  const sumsByCategory = filtered.reduce((acc, exp) => {
    const catKey = exp.category || 'other';
    const amount = Number(exp.amount) || 0; // Supabase liefert 0.00 → Number(0.00) passt
    acc[catKey] = (acc[catKey] || 0) + amount;
    return acc;
  }, {});

  const labels = [];
  const values = [];
  const backgroundColors = [];

  Object.entries(sumsByCategory).forEach(([key, total]) => {
    const cat = categoryMap[key];
    const label = cat ? cat.name : key;
    const color = cat ? cat.color : '#a7a9a9';

    labels.push(label);
    values.push(Number(total) || 0);
    backgroundColors.push(color);
  });

  const totalSum = values.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(totalSum) || totalSum <= 0) {
    if (categoryPieChart) {
      categoryPieChart.destroy();
      categoryPieChart = null;
    }
    return;
  }

  if (categoryPieChart) {
    categoryPieChart.destroy();
  }

  categoryPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors,
        borderColor: '#1f2121',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Canvas-Größe über CSS steuern
      layout: {
        padding: {
          top: 40,
          right: 120,   // Platz für Labels
          bottom: 40,
          left: 120
        }
      },
      // Outlabels-Plugin-Option, verkleinert den Pie in der Mitte
      zoomOutPercentage: 60,
      plugins: {
        legend: {
          display: false
        },
        outlabels: {
          // ctx.percent kommt direkt vom Plugin, nicht selbst rechnen
          text: (ctx) => {
            const label = ctx.chart.data.labels[ctx.dataIndex];
            const percent = ((ctx.percent || 0)*100).toFixed(1); // ctx.percent ist schon 0–100.[web:258]
            return `${label} ${percent}%`;
          },
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 4,
          lineColor: '#cccccc',
          lineWidth: 1.5,
          stretch: 45,  // Labels weiter nach außen
          font: {
            resizable: true,
            minSize: 10,
            maxSize: 14
          }
        }
      }
    }
  });
}
// ===== SUMMARY =====

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function updateSummary() {
  const totalMonthEl = document.getElementById('totalMonth');                    // Ausgaben Monat
  const totalWithoutEl = document.getElementById('totalMonthWithoutFixedEtf');  // Ausgaben ohne Fix/ETF
  const remainingEl = document.getElementById('remainingBudget');               // Restliches Budget

  if (!totalMonthEl || !totalWithoutEl || !remainingEl) {
    return;
  }

  // Übersicht / Gesamtjahr: KPIs auf 0
  if (selectedYear === 'all' || selectedMonth === 'overview') {
    totalMonthEl.textContent = formatCurrency(0);
    totalWithoutEl.textContent = formatCurrency(0);
    remainingEl.textContent = formatCurrency(0);
    remainingEl.style.color = '#f5f5f5';
    return;
  }

  const monthPrefix = `${selectedYear}-${selectedMonth}`;

  const monthExpenses = expenses
    .filter(e => e.date && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const monthExpensesWithoutFixedEtf = expenses
    .filter(e => e.date && e.date.startsWith(monthPrefix))
    .filter(e => e.category !== 'fixed' && e.category !== 'etf')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const monthlyBudget = getBudgetForMonth(selectedYear, selectedMonth);
  const remainingBudget = monthlyBudget - monthExpensesWithoutFixedEtf;

  totalMonthEl.textContent = formatCurrency(monthExpenses);
  totalWithoutEl.textContent = formatCurrency(monthExpensesWithoutFixedEtf);
  remainingEl.textContent = formatCurrency(remainingBudget);
  remainingEl.style.color = remainingBudget < 0 ? '#ff4757' : '#2ed573';
}

// ===== CHARTS: NETTOBUDGET =====

// Liefert für das aktuelle selectedYear die Monats-Schritte fürs Waterfall-Chart
function getNetBudgetSeriesForYear() {
  const ymSet = new Set();

  // Jahr-Monat-Keys einsammeln, gefiltert nach selectedYear (oder alle)
  expenses.forEach(exp => {
    if (!exp.date || typeof exp.date !== 'string') return;
    const [y, m] = exp.date.split('-');
    if (!y || !m) return;

    if (selectedYear === 'all' || y === selectedYear) {
      ymSet.add(`${y}-${m}`);
    }
  });

  const keys = Array.from(ymSet).sort(); // z. B. "2025-01", "2025-02", ...

  const labels = [];
  const data = [];
  let cumulative = 0;

  keys.forEach(key => {
    const [y, m] = key.split('-');
    const monthPrefix = `${y}-${m}`;

    // variable Ausgaben (ohne fixed/etf)
    const monthExpensesWithoutFixedEtf = expenses
      .filter(e => e.date && e.date.startsWith(monthPrefix))
      .filter(e => e.category !== 'fixed' && e.category !== 'etf')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Budget aus budgetHistoryMap
    const monthlyBudget = getBudgetForMonth(y, m);
    const net = monthlyBudget - monthExpensesWithoutFixedEtf;

    const start = cumulative;
    cumulative += net;

    // Floating Bar: [von, bis]
    data.push([start, cumulative]);

    const monthLabel = monthNames[m] || m;
    labels.push(selectedYear === 'all' ? `${monthLabel.slice(0, 3)} ${y}` : monthLabel);
  });

  return { labels, data, total: cumulative };
}

function renderNetBudgetChart() {
  const canvas = document.getElementById('netBudgetChart');
  const valueEl = document.getElementById('netBudgetValue');
  const section = document.getElementById('netBudgetSection');

  if (!canvas || !valueEl || !section) return;

  const { labels, data, total } = getNetBudgetSeriesForYear();

  // Wenn es keine Daten gibt → alles zurücksetzen
  if (!labels.length) {
    if (netBudgetChart) {
      netBudgetChart.destroy();
      netBudgetChart = null;
    }
    valueEl.textContent = formatCurrency(0);
    valueEl.style.color = '#f5f5f5';
    return;
  }

  // Titelwert + Farbe
  valueEl.textContent = formatCurrency(total);
  valueEl.style.color = total < 0 ? '#ff4757' : '#2ed573';

  const ctx = canvas.getContext('2d');

  if (netBudgetChart) {
    netBudgetChart.destroy();
  }

  // Farben pro Schritt (blau für +, rot für -)
  const barColors = data.map(([start, end]) =>
    (end - start) < 0 ? '#ff4757' : '#2e86de'
  );

  // Linie über den Balken (nimmt die Endwerte)
  const lineValues = data.map(([start, end]) => end);

    netBudgetChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          // Waterfall-Balken
          label: 'Nettobudget',
          data,                      // [[start, end], ...] => Floating Bars
          backgroundColor: barColors,
          borderColor: '#000000',    // optional: Rahmen um Balken
          borderWidth: 1,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
        // hier konfigurieren wir das Plugin
        netBudgetConnector: {
          datasetIndex: 0,        // Balken-Dataset
          color: '#000000',       // Linienfarbe
          lineWidth: 3            // dicke Linie
        }
      },
      scales: {
        x: {
          stacked: false
        },
        y: {
          ticks: {
            callback: (value) => formatCurrency(Number(value) || 0)
          }
        }
      }
    }
  });
 }
