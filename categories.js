// categories.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt.');
  window.location.href = '/index.html';
}

let categories = [];

// KEINE hart codierten Standard-Kategorien mehr
// Alle Kategorien kommen ausschließlich aus der Tabelle "categories" für dieses report_id

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `/report.html?report_id=${reportId}`;
  });

  document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
  document.getElementById('newIcon').addEventListener('focus', openEmojiPicker);

  loadCategories();
});

async function loadCategories() {
  try {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('DB Error:', error);
      throw error;
    }

    categories = data || [];
    renderCategories();
  } catch (error) {
    console.error('Fehler beim Laden der Kategorien:', error);
    alert('Fehler beim Laden der Kategorien: ' + error.message);
  }
}

function renderCategories() {
  const tbody = document.getElementById('categoryTable');

  if (!categories || categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-message">Keine Kategorien angelegt.</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(cat => `
    <tr>
      <td class="icon-cell">
        <input 
          type="text" 
          value="${cat.icon || '📌'}" 
          onchange="updateCategory('${cat.id}', 'icon', this.value)"
          style="width: 40px; padding: 6px 4px; text-align: center; font-size: 18px; border: 1px solid rgba(94, 82, 64, 0.2); border-radius: 6px; background-color: var(--color-surface); color: var(--color-text);"
          maxlength="2"
        />
      </td>
      <td>
        <input 
          type="text" 
          value="${cat.key}" 
          onchange="updateCategory('${cat.id}', 'key', this.value)"
          style="width: 100%; padding: 6px 8px; border: 1px solid rgba(94, 82, 64, 0.2); border-radius: 6px; background-color: var(--color-surface); color: var(--color-text);"
        />
      </td>
      <td>
        <input 
          type="t
