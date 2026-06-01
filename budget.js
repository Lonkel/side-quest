// budget.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt.');
  window.location.href = '/index.html';
}

let budgets = [];
let editingYearMonth = null;

const monthNames = {
  '01': 'Januar', '02': 'Februar', '03': 'März', '04': 'April',
  '05': 'Mai', '06': 'Juni', '07': 'Juli', '08': 'August',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Dezember'
};

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

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const yearInput = document.getElementById('budgetYear');
  const monthInput = document.getElementById('budgetMonth');

  if (yearInput) yearInput.value = String(now.getFullYear());
  if (monthInput) monthInput.value = String(now.getMonth() + 1).padStart(2, '0');

  bindEnterToButton('#budgetYear, #budgetMonth, #budgetAmount', 'addBudgetBtn');
  bindEnterToButton('#editBudgetAmount', 'saveBtn');

  wireStaticEvents();
  loadBudgets();
});

function wireStaticEvents() {
  const backBtn = document.getElementById('backBtn');
  const addBtn = document.getElementById('addBudgetBtn');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const tableBody = document.getElementById('budgetTable');

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `/report.html?report_id=${encodeURIComponent(reportId)}`;
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addBudget();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearForm();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveEdit();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  }

  // Event Delegation: Edit/Delete in der Tabelle
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      const action = button.dataset.action;
      const ym = button.dataset.yearMonth;
      if (!ym) return;

      if (action === 'edit') {
        openEditModal(ym);
      } else if (action === 'delete') {
        deleteBudget(ym);
      }
    });
  }
}

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
  const yearInput = document.getElementById('budgetYear');
  const monthInput = document.getElementById('budgetMonth');
  const amountInput = document.getElementById('budgetAmount');

  if (!yearInput || !monthInput || !amountInput) return;

  const year = yearInput.value;
  const month = monthInput.value.padStart(2, '0');
  const amount = parseFloat(amountInput.value);

  if (!year || !month || isNaN(amount) || amount < 0) {
    alert('Bitte alle Felder ausfüllen und einen gültigen Betrag eingeben.');
    return;
  }

  const yearMonth = `${year}-${month}`;
  const exists = budgets.some((b) => b.year_month === yearMonth);

  if (exists) {
    const overwrite = confirm('Für diesen Monat existiert bereits ein Budget. Überschreiben?');
    if (!overwrite) return;
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
  if (!tbody) return;

  if (!budgets || budgets.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="4">Keine Budgets vorhanden.</td></tr>';
    return;
  }

  const rows = budgets.map((b) => {
    const [year, month] = b.year_month.split('-');
    const monthName = monthNames[month] || month;

    return `
      <tr>
        <td>${year}</td>
        <td>${monthName}</td>
        <td class="text-right"><strong>${formatCurrency(b.budget_amount)}</strong></td>
        <td class="text-right action-buttons">
          <button
            type="button"
            class="icon-btn icon-edit"
            data-action="edit"
            data-year-month="${b.year_month}"
            title="Bearbeiten"
          >✎</button>
          <button
            type="button"
            class="icon-btn icon-delete"
            data-action="delete"
            data-year-month="${b.year_month}"
            title="Löschen"
          >✕</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
}

function openEditModal(yearMonth) {
  const found = budgets.find((b) => b.year_month === yearMonth);
  if (!found) return;

  editingYearMonth = yearMonth;

  const amountInput = document.getElementById('editBudgetAmount');
  const modal = document.getElementById('editModal');

  if (amountInput) amountInput.value = found.budget_amount;
  if (modal) modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('active');
  editingYearMonth = null;
}

async function saveEdit() {
  if (!editingYearMonth) return;

  const amountInput = document.getElementById('editBudgetAmount');
  if (!amountInput) return;

  const amount = parseFloat(amountInput.value);

  if (isNaN(amount) || amount < 0) {
    alert('Bitte einen gültigen Betrag eingeben.');
    return;
  }

  try {
    const { error } = await db
      .from('budget_history')
      .update({ budget_amount: amount })
      .eq('report_id', reportId)
      .eq('year_month', editingYearMonth);

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
  const confirmed = confirm('Budget wirklich löschen?');
  if (!confirmed) return;

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
  const yearInput = document.getElementById('budgetYear');
  const monthInput = document.getElementById('budgetMonth');
  const amountInput = document.getElementById('budgetAmount');

  if (yearInput) yearInput.value = String(now.getFullYear());
  if (monthInput) monthInput.value = String(now.getMonth() + 1).padStart(2, '0');
  if (amountInput) amountInput.value = '';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}
