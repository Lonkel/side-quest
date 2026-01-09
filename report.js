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
}

function switchMonth(e) {
  selectedMonth = e.target.dataset.month;

  document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');

  renderTable();
  updateSummary();
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

// ===== SUMMARY FUNCTIONS =====

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function updateSummary() {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);

  const todayExpenses = expenses
    .filter(e => e.date === today)
    .reduce((sum, e) => sum + e.amount, 0);

  const monthExpenses = expenses
    .filter(e => e.date.startsWith(currentMonth))
    .reduce((sum, e) => sum + e.amount, 0);

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const avgPerDay = monthExpenses / daysInMonth;

  document.getElementById('totalToday').textContent = formatCurrency(todayExpenses);
  document.getElementById('totalMonth').textContent = formatCurrency(monthExpenses);
  document.getElementById('avgPerDay').textContent = formatCurrency(avgPerDay);
}

// ===== GLOBAL FUNCTIONS =====

window.deleteExpense = deleteExpense;
window.openEditModal = openEditModal;
