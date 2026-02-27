// budget.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt.');
  window.location.href = '/index.html';
}

let budgets = [];

const monthNames = {
  '01': 'Januar', '02': 'Februar', '03': 'März', '04': 'April',
  '05': 'Mai', '06': 'Juni', '07': 'Juli', '08': 'August',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Dezember'
};

window.addEventListener('DOMContentLoaded', () => {
  // Aktuellen Monat vorausfüllen
  const now = new Date();
  document.getElementById('budgetYear').value = String(now.getFullYear());
  document.getElementById('budgetMonth').value = String(now.getMonth() + 1).padStart(2, '0');

  // Buttons - exakt wie categories.js
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `/report.html?report_id=${reportId}`;
  });

  document.getElementById('addBudgetBtn').addEventListener('click', addBudget);
  document.getElementById('resetBtn').addEventListener('click', clearForm);
  document.getElementById('saveBtn').addEventListener('click', saveEdit);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  loadBudgets();
});

async function loadBudgets() {
  try {
    const { data, error } = await db
      .from('budget_history')
      .select('*')
      .eq('report_id', reportId)
      .order('year_month', { ascending: false });

    if (error) {
      console.error('Fehler beim Laden:', error);
      throw error;
    }

    budgets = data || [];
    renderTable();
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    alert('Fehler beim Laden: ' + error.message);
  }
}

async function addBudget() {
  const year = document.getElementById('budgetYear').value;
  const month = document.getElementById('budgetMonth').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);

  if (!year || !month || isNaN(amount) || amount < 0) {
    alert('Bitte alle Felder ausfüllen und einen gültigen Betrag eingeben.');
    return;
  }

  const yearMonth = `${year}-${month}`;
  const exists = budgets.some(b => b.year_month === yearMonth);

  if (exists) {
    if (!confirm('Für diesen Monat existiert bereits ein Budget. Überschreiben?')) return;
  }

  try {
    const { error } = await db
      .from('budget_history')
      .upsert(
        { report_id: reportId, year_month: yearMonth, budget_amount: amount },
        { onConflict: 'report_id,year_month' }
      );

    if (error) {
      console.error('Fehler beim Speichern:', error);
      throw error;
    }

    clearForm();
    await loadBudgets();
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern: ' + error.message);
  }
}

function renderTable() {
  const tbody = document.getElementById('budgetTable');

  if (!budgets || budgets.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="4">Keine Budgets vorhanden.</td></tr>';
    return;
  }

  tbody.innerHTML = budgets.map(b => {
    const parts = b.year_month.split('-');
    const year = parts[0];
    const month = parts[1];
    const monthName = monthNames[month] || month;

    return `
      <tr>
        <td>${year}</td>
        <td>${monthName}</td>
        <td class="text-right"><strong>${formatCurrency(b.budget_amount)}</strong></td>
        <td class="text-right action-buttons">
          <button class="icon-btn icon-edit" onclick="openEditModal('${b.year_month}')" title="Bearbeiten">✎</button>
          <button class="icon-btn icon-delete" onclick="deleteBudget('${b.year_month}')" title="Löschen">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditModal(yearMonth) {
  const found = budgets.find(b => b.year_month === yearMonth);
  if (!found) return;

  window._editingYearMonth = yearMonth;
  document.getElementById('editBudgetAmount').value = found.budget_amount;
  document.getElementById('editModal').classList.add('active');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  window._editingYearMonth = null;
}

async function saveEdit() {
  const yearMonth = window._editingYearMonth;
  if (!yearMonth) return;

  const amount = parseFloat(document.getElementById('editBudgetAmount').value);

  if (isNaN(amount) || amount < 0) {
    alert('Bitte einen gültigen Betrag eingeben.');
    return;
  }

  try {
    const { error } = await db
      .from('budget_history')
      .update({ budget_amount: amount })
      .eq('report_id', reportId)
      .eq('year_month', yearMonth);

    if (error) {
      console.error('Fehler beim Aktualisieren:', error);
      throw error;
    }

    closeModal();
    await loadBudgets();
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    alert('Fehler beim Aktualisieren: ' + error.message);
  }
}

async function deleteBudget(yearMonth) {
  if (!confirm('Budget wirklich löschen?')) return;

  try {
    const { error } = await db
      .from('budget_history')
      .delete()
      .eq('report_id', reportId)
      .eq('year_month', yearMonth);

    if (error) {
      console.error('Fehler beim Löschen:', error);
      throw error;
    }

    await loadBudgets();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    alert('Fehler beim Löschen: ' + error.message);
  }
}

function clearForm() {
  const now = new Date();
  document.getElementById('budgetYear').value = String(now.getFullYear());
  document.getElementById('budgetMonth').value = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('budgetAmount').value = '';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

window.openEditModal = openEditModal;
window.deleteBudget = deleteBudget;
