// categories.js

const reportId = new URLSearchParams(window.location.search).get('report_id');

if (!reportId) {
  alert('Kein Bericht ausgewählt.');
  window.location.href = '/index.html';
}

let categories = [];

// Standard-Kategorien
const defaultCategories = [
  { icon: '🍽️', key: 'food', name: 'Essen', color: '#ff5459' },
  { icon: '🎉', key: 'entertainment', name: 'Vergnügen', color: '#32b8c6' },
  { icon: '🛍️', key: 'shopping', name: 'Shopping', color: '#ff9c64' },
  { icon: '🏠', key: 'fixed', name: 'Fixkosten', color: '#32b8c6' },
  { icon: '💵', key: 'cash', name: 'Bargeld', color: '#4caf50' },
  { icon: '✈️', key: 'travel', name: 'Reisen', color: '#9c27b0' },
  { icon: '📈', key: 'etf', name: 'ETF', color: '#2196f3' },
  { icon: '📌', key: 'other', name: 'Sonstiges', color: '#a7a9a9' }
];

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

    // Kombiniere DB-Kategorien mit Default-Kategorien
    const dbCategories = data || [];
    const dbKeys = dbCategories.map(c => c.key);
    
    // Füge Default-Kategorien hinzu, die noch nicht in der DB sind
    const defaultToAdd = defaultCategories.filter(dc => !dbKeys.includes(dc.key));
    
    // Wenn Default-Kategorien fehlen, füge sie zur DB hinzu
    if (defaultToAdd.length > 0) {
      const toInsert = defaultToAdd.map(cat => ({
        report_id: reportId,
        icon: cat.icon,
        key: cat.key,
        name: cat.name,
        color: cat.color
      }));

      await db.from('categories').insert(toInsert);
      
      // Neu laden
      const { data: newData } = await db
        .from('categories')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });
      
      categories = newData || [];
    } else {
      categories = dbCategories;
    }

    renderCategories();
  } catch (error) {
    console.error('Fehler beim Laden:', error);
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
          style="width: 40px; padding: 6px 4px; text-align: center; font-size: 18px;"
          maxlength="2"
        />
      </td>
      <td>
        <input 
          type="text" 
          value="${cat.key}" 
          onchange="updateCategory('${cat.id}', 'key', this.value)"
          style="width: 100%; padding: 6px 8px;"
        />
      </td>
      <td>
        <input 
          type="text" 
          value="${cat.name}" 
          onchange="updateCategory('${cat.id}', 'name', this.value)"
          style="width: 100%; padding: 6px 8px;"
        />
      </td>
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

  // Prüfe, ob Key bereits existiert
  if (categories.some(c => c.key === key)) {
    alert('Dieser Key existiert bereits.');
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
