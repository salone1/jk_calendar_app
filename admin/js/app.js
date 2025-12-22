// Simple in-memory state and file endpoints
const FILES = {
  holidays: 'holidays.json',
  hijri: 'hijri.json',
  log: 'update-log.json'
};

let state = {
  holidays: [],
  hijri: {},
  log: [],
  settings: {
    defaultLanguage: 'en',
    devEmail: '',
    devInstagram: '',
    devTelegram: '',
    devTwitter: ''
  }
};

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function init() {
  // Navigation
  qsa('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      qsa('.panel').forEach(p => p.classList.remove('active'));
      qs(`#${target}`).classList.add('active');
    });
  });

  // Load files
  try {
    state.holidays = await loadJSON(FILES.holidays);
  } catch (e) { console.warn('holidays.json missing'); }
  try {
    state.hijri = await loadJSON(FILES.hijri);
  } catch (e) { console.warn('hijri.json missing'); }
  try {
    state.log = await loadJSON(FILES.log);
  } catch (e) { console.warn('update-log.json missing'); }

  renderDashboard();
  renderHolidayTable();
  renderLogTable();
  renderHijriState();

  // Events
  qs('#importGADBtn').addEventListener('click', importGADJson);
  qs('#addHolidayBtn').addEventListener('click', addHoliday);
  qs('#holidaySearch').addEventListener('input', renderHolidayTable);
  qs('#holidayScopeFilter').addEventListener('change', renderHolidayTable);

  qs('#applyHijriOverrideBtn').addEventListener('click', applyHijriOverride);
  qs('#simulateCheckBtn').addEventListener('click', simulateHijri29thCheck);
  qs('#runMoonCheckBtn').addEventListener('click', simulateHijri29thCheck);

  qs('#saveAllBtn').addEventListener('click', saveAll);
  qs('#saveSettingsBtn').addEventListener('click', saveSettings);
}

function renderDashboard() {
  const count = state.holidays.length;
  qs('#holidayCount').textContent = String(count);
  const status = state.hijri?.moon?.status ?? 'unknown';
  qs('#moonStatus').textContent = status;
  const last = state.hijri?.moon?.lastChecked ?? '—';
  qs('#lastSync').textContent = last;
}

function renderHolidayTable() {
  const tbody = qs('#holidayTableBody');
  const search = (qs('#holidaySearch').value || '').toLowerCase();
  const scopeFilter = qs('#holidayScopeFilter').value;

  const rows = state.holidays
    .filter(h => h.name.toLowerCase().includes(search))
    .filter(h => scopeFilter === 'all' ? true : h.scope === scopeFilter)
    .map((h, idx) => `
      <tr>
        <td>${h.name}</td>
        <td>${h.date ?? '—'}</td>
        <td>${h.calendar}</td>
        <td>${h.scope}</td>
        <td>${h.moonDependent ? 'Yes' : 'No'}</td>
        <td>${h.district ?? ''}</td>
        <td>
          <button class="btn-outlined" onclick="editHoliday(${idx})">Edit</button>
          <button class="btn-danger" onclick="deleteHoliday(${idx})">Delete</button>
        </td>
      </tr>
    `).join('');

  tbody.innerHTML = rows || `<tr><td colspan="7">No holidays yet.</td></tr>`;
}

function addHoliday() {
  const name = qs('#hName').value.trim();
  const date = qs('#hDate').value.trim();
  const calendar = qs('#hCalendar').value;
  const scope = qs('#hScope').value;
  const district = qs('#hDistrict').value.trim() || undefined;
  const moonDependent = qs('#hMoonDependent').checked;

  if (!name) return alert('Name required');
  if (calendar === 'gregorian' && !date) return alert('Gregorian date required');

  const id = `jk-${date || name.toLowerCase().replace(/\s+/g, '-')}`;
  state.holidays.push({ id, name, date, calendar, scope, district, moonDependent });

  logChange(`Holiday added: ${name}`, 'manual');
  renderHolidayTable();
}

function editHoliday(idx) {
  const h = state.holidays[idx];
  const name = prompt('Edit name', h.name);
  if (name === null) return;
  const date = prompt('Edit date (YYYY-MM-DD or blank for Hijri event)', h.date || '');
  const scope = prompt('Edit scope (UT/provincial-kashmir/provincial-jammu/local/restricted)', h.scope);
  const moon = confirm('Mark as moon dependent? OK=Yes, Cancel=No');

  Object.assign(h, { name: name.trim(), date: (date || '').trim(), scope, moonDependent: moon });
  logChange(`Holiday edited: ${h.name}`, 'manual');
  renderHolidayTable();
}

function deleteHoliday(idx) {
  const h = state.holidays[idx];
  if (!confirm(`Delete holiday: ${h.name}?`)) return;
  state.holidays.splice(idx, 1);
  logChange(`Holiday deleted: ${h.name}`, 'manual');
  renderHolidayTable();
}

function importGADJson() {
  const file = qs('#uploadGADJson').files[0];
  if (!file) return alert('Select a JSON file');
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) {
        state.holidays = data;
      } else if (Array.isArray(data.holidays)) {
        state.holidays = data.holidays;
      } else {
        return alert('Invalid JSON format');
      }
      logChange('GAD holidays imported', 'manual');
      renderHolidayTable();
    } catch (e) {
      alert('Failed to parse JSON');
    }
  };
  reader.readAsText(file);
}

function renderHijriState() {
  qs('#hijriStateView').textContent = JSON.stringify(state.hijri, null, 2);
  const nextInfo = state.hijri?.nextCheckInfo ?? '—';
  qs('#nextCheckInfo').textContent = nextInfo;
}

function applyHijriOverride() {
  const hijriDate = qs('#currentHijriDate').value.trim();
  const gregDate = qs('#currentGregorianDate').value.trim();
  const length = Number(qs('#currentMonthLength').value);
  const newMoonSeen = qs('#newMoonSeen').checked;

  if (!hijriDate) return alert('Hijri date required');

  state.hijri.current = {
    hijriDate, gregorianDate: gregDate || undefined, monthLength: length
  };
  state.hijri.moon = state.hijri.moon || {};
  state.hijri.moon.lastChecked = new Date().toISOString();
  state.hijri.moon.status = newMoonSeen ? 'new_moon_sighted' : 'awaiting';
  state.hijri.nextCheckInfo = 'Next check scheduled for next Hijri 29th';

  logChange(`Hijri override: ${hijriDate} (len=${length}, newMoon=${newMoonSeen})`, 'manual');
  renderHijriState();
  renderDashboard();
}

function simulateHijri29thCheck() {
  // This simulates the centralized auto-check. In production, this would call a serverless function.
  const seen = confirm('Simulate: New moon sighted? OK=Yes, Cancel=No');
  state.hijri.moon = state.hijri.moon || {};
  state.hijri.moon.lastChecked = new Date().toISOString();
  state.hijri.moon.status = seen ? 'new_moon_sighted' : 'not_sighted';
  state.hijri.nextCheckInfo = 'Auto-check completed; next check at next Hijri 29th';
  logChange(`Auto moon check: ${state.hijri.moon.status}`, 'auto');

  // Recalculate Islamic events flagged as moonDependent (placeholder)
  // In practice, you’d shift Hijri month start and adjust corresponding events.
  renderHijriState();
  renderDashboard();
}

function renderLogTable() {
  const tbody = qs('#logTableBody');
  const rows = state.log.map(entry => `
    <tr>
      <td>${entry.timestamp}</td>
      <td>${entry.change}</td>
      <td>${entry.source}</td>
    </tr>
  `).join('');
  tbody.innerHTML = rows || `<tr><td colspan="3">No updates yet.</td></tr>`;
}

function logChange(change, source = 'manual') {
  state.log.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    change,
    source
  });
  renderLogTable();
}

async function saveAll() {
  // Note: On static hosting you cannot write files directly from the browser.
  // For production, back these with Firestore or add Netlify Functions to handle POST writes.
  alert('Saving requires backend (Firestore or serverless). For now, copy JSON from console.');
  console.log('holidays.json', JSON.stringify(state.holidays, null, 2));
  console.log('hijri.json', JSON.stringify(state.hijri, null, 2));
  console.log('update-log.json', JSON.stringify(state.log, null, 2));
}

function saveSettings() {
  state.settings.defaultLanguage = qs('#defaultLanguage').value;
  state.settings.devEmail = qs('#devEmail').value.trim();
  state.settings.devInstagram = qs('#devInstagram').value.trim();
  state.settings.devTelegram = qs('#devTelegram').value.trim();
  state.settings.devTwitter = qs('#devTwitter').value.trim();
  logChange('Settings updated', 'manual');
}

window.addEventListener('DOMContentLoaded', init);
