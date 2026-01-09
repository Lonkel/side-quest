// categories.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt.');
  window.location.href = '/index.html';
}

let categories = [];

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = `/report.html?report_id=${reportId}`;
  });

  document.getElementById('addCategoryBtn').addEventListener('click', addCategory);

  loadCategories();
});

async function loadCategories() {
  try {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    categories = data || [];
    renderCategories();
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    alert('Fehler beim Laden der Kategorien: ' + error.message);
  }
}

function renderCategories() {
  const tbody = document.getElementById('categoryTable');

  if (!categories || categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-message">Keine Kategorien angelegt. Füge deine erste hinzu!</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(cat => `
    <tr>
      <td class="icon-cell">${cat.icon || '📌'}</td>
      <td><input type="text" value="${cat.key}" onchange="updateCategory('${cat.id}', 'key', this.value)" style="width: 100%; padding: 6px 8px;" /></td>
      <td><input type="text" value="${cat.name}" onchange="updateCategory('${cat.id}', 'name', this.value)" style="width: 100%; padding: 6px 8px;" /></td>
      <td>
        <input 
          type="color" 
          value="${cat.color || '#32b8c6'}" 
          onchange="updateCategory('${cat.id}', 'color', this.value)"
          style="width: 50px; height: 40px; border: 1px solid rgba(94, 82, 64, 0.2); border-radius: 6px; cursor: pointer;"
        />
      </td>
      <td class="actions">
        <button class="btn-delete" onclick="deleteCategory('${cat.id}')">Löschen</button>
      </td>
    </tr>
  `).join('');
}

async function addCategory() {
  const icon = document.getElementById('newIcon').value || '📌';
  const key = document.getElementById('newKey').value.trim();
  const name = document.getElementById('newName').value.trim();
  const color = document.getElementById('newColor').value;

  if (!key || !name) {
    alert('Bitte Key und Name ausfüllen.');
    return;
  }

  try {
    const { error } = await db
      .from('categories')
      .insert({
        report_id: reportId,
        icon,
        key,
        name,
        color
      });

    if (error) throw error;

    document.getElementById('newIcon').value = '';
    document.getElementById('newKey').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newColor').value = '#32b8c6';

    await loadCategories();
  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error);
    alert('Fehler beim Hinzufügen: ' + error.message);
  }
}

window.updateCategory = async (id, field, value) => {
  try {
    const { error } = await db
      .from('categories')
      .update({ [field]: value })
      .eq('id', id);

    if (error) throw error;

    await loadCategories();
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    alert('Fehler beim Aktualisieren: ' + error.message);
  }
};

window.deleteCategory = async (id) => {
  if (!confirm('Kategorie wirklich löschen?')) return;

  try {
    const { error } = await db
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await loadCategories();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    alert('Fehler beim Löschen: ' + error.message);
  }
};

