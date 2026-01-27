// report.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt. Bitte über die Startseite öffnen.');
  window.location.href = '/index.html';
}

let expenses = [];
let isLoading = false;
let editingId = null;
let draggedRow = null;
let selectedYear = '2026';
let selectedMonth = '01';
let selectedContent = 'expenses';
let reportTitle = 'Ausgaben Tracker';
let categoryMap = {};
let budgetHistoryMap = {}; // { "2026-01": 1000, "2026-02": 1000, ... }
let categoryPieChart = null; // Chart.js instance für Kreisdiagramm

// Monats-Namen für UI
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

// DOM ready
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('date').valueAsDate = new Date();
  document.getElementById('submitBtn').addEventListener('click', addExpense);
  document.getElementById('resetBtn').addEventListener('click', clearForm);
  document.getElementById('saveBtn').addEventListener('click', saveEdit);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  // Edit Title
  document.getElementById('editTitleBtn').addEventListener('click', openEditTitleModal);
  document.getElementById('saveTitleBtn').addEventListener('click', saveTitle);
  document.getElementById('cancelTitleBtn').addEventListener('click', closeEditTitleModal);

  // Budget Button
  document.getElementById('budgetBtn').addEventListener('click', openBudgetModal);
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('cancelBudgetBtn').addEventListener('click', closeBudgetModal);

  // Year Tab Listeners
  document.querySelectorAll('.year-tab').forEach(btn => {
    btn.addEventListener('click', switchYear);
  });

  // Month Tab Listeners
  document.querySelectorAll('.month-tab').forEach(btn => {
    btn.addEventListener('click', switchMonth);
  });

  // Content Tab Listeners
  document.querySelectorAll('.content-tab').forEach(btn => {
    btn.addEventListener('click', switchContent);
  });

  // Categories Button
  document.getElementById('categoryBtn').addEventListener('click', () => {
    window.location.href = `/categories.html?report_id=${reportId}`;
  });

  loadReport();
  loadBudgetHistory();
  loadCategories();
  loadExpenses();
});

// ===== REPORT TITLE FUNCTIONS =====

async function loadReport() {
  try {
    const { data, error } = await db
      .from('reports')
      .select('name')
      .eq('id', reportId)
      .single();

    if (error) throw error;

    if (data && data.name) {
      reportTitle = data.name;
      document.getElementById('reportTitle').textContent = reportTitle;
    }
  } catch (error) {
    console.error('Fehler beim Laden des Reports:', error);
  }
}

function openEditTitleModal() {
  document.getElementById('editTitleInput').value = reportTitle;
  document.getElementById('editTitleModal').classList.add('active');
  document.getElementById('editTitleInput').focus();
}

function closeEditTitleModal() {
  document.getElementById('editTitleModal').classList.remove('active');
}

async function saveTitle() {
  const newTitle = document.getElementById('editTitleInput').value.trim();

  if (!newTitle) {
    alert('Bitte gib einen Titel ein.');
    return;
  }

  try {
    const { error } = await db
      .from('reports')
      .update({ name: newTitle })
      .eq('id', reportId);

    if (error) throw error;

    reportTitle = newTitle;
    document.getElementById('reportTitle').textContent = reportTitle;
    closeEditTitleModal();
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern: ' + error.message);
  }
}

// ===== BUDGET FUNCTIONS =====

async function loadBudgetHistory() {
  try {
    const { data, error } = await db
      .from('budget_history')
      .select('year_month, budget_amount')
      .eq('report_id', reportId);

    if (error) throw error;

    // Erstelle Map für schnellen Zugriff
    budgetHistoryMap = {};
    (data || []).forEach(row => {
      budgetHistoryMap[row.year_month] = row.budget_amount;
    });
  } catch (error) {
    console.error('Fehler beim Laden der Budget-Historie:', error);
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

  const monthKey = `${selectedYear}-${selectedMonth}`;
  const currentBudget = getBudgetForMonth(selectedYear, selectedMonth);
  const monthName = monthNames[selectedMonth] || selectedMonth;

  document.getElementById('budgetModalMonth').textContent = `${monthName} ${selectedYear}`;
  document.getElementById('budgetInput').value = currentBudget;
  document.getElementById('budgetModal').classList.add('active');
  document.getElementById('budgetInput').focus();
}

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.remove('active');
}

async function saveBudget() {
  const budgetAmount = parseFloat(document.getElementById('budgetInput').value);

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
    // Upsert: Einfügen oder aktualisieren
    const { error } = await db
      .from('budget_history')
      .upsert(
        {
          report_id: reportId,
          year_month: monthKey,
          budget_amount: budgetAmount
        },
        { onConflict: 'report_id,year_month' }
      );

    if (error) throw error;

    // Update lokale Map
    budgetHistoryMap[monthKey] = budgetAmount;

    // Update KPI
    updateSummary();

    closeBudgetModal();
  } catch (error) {
    console.error('Fehler beim Speichern des Budgets:', error);
    alert('Fehler beim Speichern: ' + error.message);
  }
}

// ===== CATEGORY FUNCTIONS =====

async function loadCategories() {
  try {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('report_id', reportId);

    if (error) throw error;

    // Erstelle Map für schnellen Zugriff
    categoryMap = {};
    (data || []).forEach(cat => {
      categoryMap[cat.key] = cat;
    });

    // Aktualisiere Select-Optionen
    updateCategorySelects();
  } catch (error) {
    console.error('Fehler beim Laden der Kategorien:', error);
  }
}

function updateCategorySelects() {
  const selects = ['category', 'editCategory'];
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Behalte "-- Kategorie wählen --"
    const defaultOption = select.querySelector('option[value=""]');
    select.innerHTML = '';
    
    if (defaultOption) {
      select.appendChild(defaultOption);
    }

    // Füge alle Kategorien hinzu
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

// ===== TAB SWITCHING FUNCTIONS =====

function switchYear(e) {
  const year = e.target.dataset.year;
  selectedYear = year;
  selectedMonth = '01';

  document.querySelectorAll('.year-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  const monthTabs = document.getElementById('monthTabs');
  if (year === 'all') {
    monthTabs.style.display = 'none';
  } else {
    monthTabs.style.display = 'flex';
    document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.month-tab[data-month="01"]').classList.add('active');
  }

  renderTable();
  updateSummary();
  if (selectedContent === 'statistics') {
    renderCategoryPieChart();
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
  }
}

function switchContent(e) {
  selectedContent = e.target.dataset.content;

  document.querySelectorAll('.content-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  
  if (selectedContent === 'expenses') {
    document.getElementById('expensesSection').classList.add('active');
  } else if (selectedContent === 'statistics') {
    document.getElementById('statisticsSection').classList.add('active');
    renderCategoryPieChart();
  }
}

// ===== EXPENSE LOADING =====

async function loadExpenses() {
  isLoading = true;

  try {
    const { data, error } = await db
      .from('expenses')
      .select('*')
      .eq('report_id', reportId)
      .order('date', { ascending: false });

    if (error) throw error;

    expenses = data || [];
    renderTable();
    updateSummary();
    isLoading = false;
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    isLoading = false;
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

  return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ===== EXPENSE CRUD OPERATIONS =====

async function addExpense(event) {
  event.preventDefault();

  const date = document.getElementById('date').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert('Bitte alle Felder ausfüllen und einen gültigen Betrag eingeben.');
    return;
  }

  if (isLoading) return;
  isLoading = true;
  document.getElementById('submitBtn').disabled = true;

  try {
    const { error } = await db
      .from('expenses')
      .insert({
        date,
        category,
        amount,
        report_id: reportId
      });

    if (error) throw error;

    clearForm();
    await loadExpenses();
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern: ' + error.message);
    isLoading = false;
    document.getElementById('submitBtn').disabled = false;
  }
}

function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editingId = id;
  document.getElementById('editDate').value = expense.date;
  document.getElementById('editCategory').value = expense.category;
  document.getElementById('editAmount').value = expense.amount;
  document.getElementById('editModal').classList.add('active');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;

  const date = document.getElementById('editDate').value;
  const category = document.getElementById('editCategory').value;
  const amount = parseFloat(document.getElementById('editAmount').value);

  if (!date || !category || isNaN(amount) || amount <= 0) {
    alert('Bitte alle Felder ausfüllen und einen gültigen Betrag eingeben.');
    return;
  }

  if (isLoading) return;
  isLoading = true;

  try {
    const { error } = await db
      .from('expenses')
      .update({
        date,
        category,
        amount
      })
      .eq('id', editingId);

    if (error) throw error;

    closeModal();
    await loadExpenses();
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    alert('Fehler beim Aktualisieren: ' + error.message);
    isLoading = false;
  }
}

async function deleteExpense(id) {
  if (isLoading) return;
  if (!confirm('Wirklich löschen?')) return;

  isLoading = true;

  try {
    const { error } = await db
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await loadExpenses();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    alert('Fehler beim Löschen: ' + error.message);
    isLoading = false;
  }
}

function clearForm(event) {
  if (event) event.preventDefault();
  document.getElementById('date').valueAsDate = new Date();
  document.getElementById('category').value = '';
  document.getElementById('amount').value = '';
}

// ===== TABLE RENDERING & DRAG & DROP =====

function renderTable() {
  const tbody = document.getElementById('expenseTable');
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
        <td>${new Date(expense.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
        <td>
          <span class="status-badge" style="background-color: ${bgColor}; color: ${color};">
            ${label}
          </span>
        </td>
        <td class="text-right"><strong>${formatCurrency(expense.amount)}</strong></td>
        <td class="text-right action-buttons">
          <button class="icon-btn icon-delete" onclick="deleteExpense(${expense.id})" title="Löschen">✕</button>
          <button class="icon-btn icon-edit" onclick="openEditModal(${expense.id})" title="Bearbeiten">✎</button>
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

// ===== PIE CHART RENDERING =====

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

  const sumsByCategory = filtered.reduce((acc, exp) => {
    const catKey = exp.category || 'other';
    acc[catKey] = (acc[catKey] || 0) + exp.amount;
    return acc;
  }, {});

  const labels = [];
  const values = [];
  const backgroundColors = [];
  const borderColors = [];

  Object.entries(sumsByCategory).forEach(([key, total]) => {
    const cat = categoryMap[key];
    const label = cat ? `${cat.icon} ${cat.name}` : key;
    const color = cat ? cat.color : '#a7a9a9';

    labels.push(label);
    values.push(total);
    backgroundColors.push(hexToRgba(color, 0.7));
    borderColors.push(color);
  });

  const totalSum = values.reduce((s, v) => s + v, 0);
  if (totalSum <= 0) {
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
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#f5f5f5',
            font: {
              size: 12
            },
            padding: 15
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const percent = (value / totalSum) * 100;
              const label = context.label || '';
              return `${label}: ${formatCurrency(value)} (${percent.toFixed(1)} %)`;
            }
          },
          titleColor: '#f5f5f5',
          bodyColor: '#f5f5f5',
          backgroundColor: 'rgba(31, 33, 33, 0.8)'
        }
      }
    }
  });
}

// ===== SUMMARY FUNCTIONS =====

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function updateSummary() {
  // Wenn "Gesamt" oder "Übersicht" gewählt ist, KPIs auf 0
  if (selectedYear === 'all' || selectedMonth === 'overview') {
    document.getElementById('totalMonth').textContent = formatCurrency(0);
    document.getElementById('totalMonthWithoutFixedEtf').textContent = formatCurrency(0);
    document.getElementById('budgetMonth').textContent = formatCurrency(0);
    return;
  }

  const monthPrefix = `${selectedYear}-${selectedMonth}`; // z.B. "2026-01"

  // 1. Alle Ausgaben im gewählten Monat
  const monthExpenses = expenses
    .filter(e => e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + e.amount, 0);

  // 2. Ausgaben im Monat ohne Fix & ETF
  const monthExpensesWithoutFixedEtf = expenses
    .filter(e => e.date.startsWith(monthPrefix))
    .filter(e => e.category !== 'fixed' && e.category !== 'etf')
    .reduce((sum, e) => sum + e.amount, 0);

  // 3. Budget für diesen Monat
  const monthlyBudget = getBudgetForMonth(selectedYear, selectedMonth);

  // Update KPI-Elemente
  document.getElementById('totalMonth').textContent = formatCurrency(monthExpenses);
  document.getElementById('totalMonthWithoutFixedEtf').textContent = formatCurrency(monthExpensesWithoutFixedEtf);
  document.getElementById('budgetMonth').textContent = formatCurrency(monthlyBudget);
}

// ===== GLOBAL FUNCTIONS =====

window.deleteExpense = deleteExpense;
window.openEditModal = openEditModal;