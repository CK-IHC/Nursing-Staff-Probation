import { api } from '../api.js';
import { cache } from '../state.js';
import { openModal, closeModal } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH, debounce, exportCsv, printReport, printIsolated } from '../utils.js';
import { ICON_CHECK, iconInline } from '../icons.js';

// พิมพ์รายงาน Orientation Checklist รายบุคคล (หลายคนพร้อมกัน) — 1 การ์ดต่อคน
function printOrientationByPerson(rows) {
  const cell = (date) => (date ? formatDateTH(date) : '—');
  const sections = rows.map((s) => `
    <div class="card" style="page-break-inside:avoid; break-inside:avoid; margin-bottom:16px;">
      <h3>${escapeHtml(s.EmployeeID)} — ${escapeHtml(s.ThaiName)}</h3>
      <div class="form-grid">
        <div class="field"><label>ตำแหน่ง</label><input value="${escapeHtml(s.Position || '—')}" disabled /></div>
        <div class="field"><label>หน่วยงาน</label><input value="${escapeHtml(s.CostCenterName || '—')}" disabled /></div>
        <div class="field"><label>วันเริ่มงาน</label><input value="${cell(s.HireDate)}" disabled /></div>
        <div class="field"><label>Manager</label><input value="${escapeHtml(s.ManagerName || '—')}" disabled /></div>
        <div class="field"><label>เดือนที่ 1</label><input value="${cell(s.Orient1Date)}" disabled /></div>
        <div class="field"><label>เดือนที่ 2</label><input value="${cell(s.Orient2Date)}" disabled /></div>
        <div class="field"><label>เดือนที่ 3</label><input value="${cell(s.Orient3Date)}" disabled /></div>
        <div class="field"><label>เดือนที่ 4</label><input value="${cell(s.Orient4Date)}" disabled /></div>
        <div class="field"><label>ส่ง HR</label><input value="${cell(s.OrientSentHRDate)}" disabled /></div>
      </div>
    </div>`).join('');
  printIsolated('รายงาน Orientation Checklist รายบุคคล', '', sections);
}

function opts(list, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}`;
}

function editModal(staff, onSaved) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="or-form">
      <div class="form-grid">
        <div class="field"><label>Employee</label><input value="${escapeHtml(staff.EmployeeID)} — ${escapeHtml(staff.ThaiName)}" disabled /></div>
        <div class="field"></div>
        <div class="field"><label>เดือนที่ 1 (0-30 วัน)</label><input type="date" id="or-1" value="${staff.Orient1Date || ''}" /></div>
        <div class="field"><label>เดือนที่ 2 (31-60 วัน)</label><input type="date" id="or-2" value="${staff.Orient2Date || ''}" /></div>
        <div class="field"><label>เดือนที่ 3 (61-90 วัน)</label><input type="date" id="or-3" value="${staff.Orient3Date || ''}" /></div>
        <div class="field"><label>เดือนที่ 4 (91-119 วัน)</label><input type="date" id="or-4" value="${staff.Orient4Date || ''}" /></div>
        <div class="field"><label>วันที่ส่งให้ HR</label><input type="date" id="or-hr" value="${staff.OrientSentHRDate || ''}" /></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="or-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`;
  const body = openModal(`Orientation Checklist — ${staff.EmployeeID}`, wrap, { wide: true });
  body.querySelector('#or-cancel').addEventListener('click', closeModal);
  body.querySelector('#or-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {
      Orient1Date: body.querySelector('#or-1').value, Orient2Date: body.querySelector('#or-2').value,
      Orient3Date: body.querySelector('#or-3').value, Orient4Date: body.querySelector('#or-4').value,
      OrientSentHRDate: body.querySelector('#or-hr').value,
    };
    try {
      await withLoading(() => api.put(`/api/staff/${staff.EmployeeID}`, patch));
      toastSuccess('บันทึก Orientation Checklist สำเร็จ');
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

export async function render(container) {
  container.innerHTML = `
    <div class="toolbar">
      <span class="spacer"></span>
      <button id="or-export" class="btn btn-secondary">Export Excel</button>
      <button id="or-print" class="btn btn-primary">Print Report</button>
    </div>
    <div class="stat-grid" id="or-summary"></div>
    <div id="or-alerts"></div>
    <div class="toolbar">
      <input id="or-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID/ชื่อ" />
      <select id="or-status">${opts(cache.lists.ProbationaryStatus?.map((r) => r.Value) || [], 'ทุก Status')}</select>
      <select id="or-hrstatus"><option value="">ทุก HR Status</option><option value="sent">ส่งแล้ว</option><option value="pending">รอส่ง</option></select>
      <select id="or-filter-cc"><option value="">ทุก Cost Center</option>${cache.costCenters.map((c) => `<option value="${c.CostCenterID}">${escapeHtml(c.Name)}</option>`).join('')}</select>
      <select id="or-filter-ss"><option value="">ทุก Sub Services</option>${cache.subServices.map((s) => `<option value="${s.SubServiceID}">${escapeHtml(s.Name)}</option>`).join('')}</select>
      <select id="or-filter-manager"><option value="">ทุก Manager</option></select>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">เริ่มงานตั้งแต่<input type="date" id="or-hire-from" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">ถึง<input type="date" id="or-hire-to" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <button id="or-reset" class="btn btn-ghost">Reset</button>
    </div>
    <div class="toolbar">
      <span id="or-selected-count" style="font-size:13.5px; color:var(--muted);">ยังไม่ได้เลือกพนักงาน</span>
      <span class="spacer"></span>
      <button id="or-print-selected" class="btn btn-secondary" disabled>Print รายบุคคลที่เลือก</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th><input type="checkbox" id="or-select-all" /></th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>วันเริ่มงาน</th><th>M1</th><th>M2</th><th>M3</th><th>M4</th><th>ส่ง HR</th><th></th></tr></thead>
        <tbody id="or-body"></tbody>
      </table>
    </div>`;

  const [summary, reminders] = await Promise.all([
    api.get('/api/orientation/summary'),
    api.get('/api/dashboard/reminders'),
  ]);
  document.getElementById('or-summary').innerHTML = `
    <div class="stat-card stat-blue"><span class="stat-label">On Probation 0-119d</span><span class="stat-value">${summary.onProbation}</span></div>
    <div class="stat-card stat-blue"><span class="stat-label">TOTAL STAFF</span><span class="stat-value">${summary.totalStaff}</span></div>
    <div class="stat-card stat-green"><span class="stat-label">ครบทุกเดือน</span><span class="stat-value">${summary.completedAllMonths}</span></div>
    <div class="stat-card stat-orange"><span class="stat-label">ส่ง HR แล้ว</span><span class="stat-value">${summary.sentToHR}</span></div>
    <div class="stat-card stat-red"><span class="stat-label">ยังไม่ส่ง HR</span><span class="stat-value">${summary.notSentToHR}</span></div>`;
  function renderAlerts(hrSendDue) {
    const box = document.getElementById('or-alerts');
    if (!box) return;
    const alerts = [];
    if (summary.overdueOneYear) alerts.push(`<div class="alert-banner">เกินกำหนด (&gt;1ปี) ยังไม่ส่ง HR: ${summary.overdueOneYear} คน</div>`);
    if (hrSendDue?.length) {
      alerts.push(`
        <div class="alert-banner alert-banner-gold">แจ้งเตือน: ต้องส่ง Orientation Checklist ให้ HR (เดือนที่ 5-11) — ${hrSendDue.length} รายการ</div>
        <div class="card" style="margin-bottom:14px;">
          <div class="table-wrap">
            <table class="data-table"><thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th></th></tr></thead>
            <tbody>${hrSendDue.map((r) => `<tr><td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>เดือนที่ ${r.Month}</td><td><button class="btn btn-ghost btn-sm" data-edit-hrsend="${escapeHtml(r.EmployeeID)}">Edit</button></td></tr>`).join('')}</tbody></table>
          </div>
        </div>`);
    }
    box.innerHTML = alerts.join('');
    box.querySelectorAll('[data-edit-hrsend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const staff = hrSendDue.find((x) => x.EmployeeID === btn.dataset.editHrsend);
        if (!staff) return;
        editModal(staff, async () => {
          await reload();
          const fresh = await api.get('/api/dashboard/reminders');
          renderAlerts(fresh.hrSendDue);
        });
      });
    });
  }
  renderAlerts(reminders.hrSendDue);

  let allRows = [];
  const selectedIds = new Set();
  async function reload() {
    allRows = await api.get('/api/orientation/list');
    const managerSel = document.getElementById('or-filter-manager');
    const current = managerSel.value;
    const managers = [...new Set(allRows.map((r) => r.ManagerName).filter(Boolean))].sort();
    managerSel.innerHTML = `<option value="">ทุก Manager</option>${managers.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;
    managerSel.value = current;
    renderTable();
  }
  function filtered() {
    const search = document.getElementById('or-search').value.trim().toLowerCase();
    const status = document.getElementById('or-status').value;
    const hrStatus = document.getElementById('or-hrstatus').value;
    const costCenterId = document.getElementById('or-filter-cc').value;
    const subServiceId = document.getElementById('or-filter-ss').value;
    const manager = document.getElementById('or-filter-manager').value;
    const hireFrom = document.getElementById('or-hire-from').value;
    const hireTo = document.getElementById('or-hire-to').value;
    let rows = allRows;
    if (search) rows = rows.filter((r) => `${r.EmployeeID} ${r.ThaiName}`.toLowerCase().includes(search));
    if (status) rows = rows.filter((r) => r.ProbationaryStatus === status);
    if (hrStatus === 'sent') rows = rows.filter((r) => r.OrientSentHRDate);
    if (hrStatus === 'pending') rows = rows.filter((r) => !r.OrientSentHRDate);
    if (costCenterId) rows = rows.filter((r) => r.CostCenterID === costCenterId);
    if (subServiceId) rows = rows.filter((r) => r.SubServiceID === subServiceId);
    if (manager) rows = rows.filter((r) => r.ManagerName === manager);
    if (hireFrom) rows = rows.filter((r) => r.HireDate && r.HireDate >= hireFrom);
    if (hireTo) rows = rows.filter((r) => r.HireDate && r.HireDate <= hireTo);
    return rows;
  }
  function cell(date) { return date ? `<span class="badge badge-green">${iconInline(ICON_CHECK)} ${formatDateTH(date)}</span>` : '<span class="badge badge-gray">—</span>'; }

  function updateSelectionUi() {
    const countEl = document.getElementById('or-selected-count');
    const printBtn = document.getElementById('or-print-selected');
    if (!countEl || !printBtn) return;
    countEl.textContent = selectedIds.size ? `เลือกแล้ว ${selectedIds.size} คน` : 'ยังไม่ได้เลือกพนักงาน';
    printBtn.disabled = selectedIds.size === 0;
    const selectAll = document.getElementById('or-select-all');
    if (selectAll) {
      const visibleIds = filtered().map((r) => r.EmployeeID);
      selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    }
  }

  function renderTable() {
    const rows = filtered();
    const body = document.getElementById('or-body');
    if (rows.length === 0) { body.innerHTML = '<tr><td colspan="12" class="empty-state">ไม่พบข้อมูล</td></tr>'; updateSelectionUi(); return; }
    body.innerHTML = rows.map((s) => `
      <tr>
        <td><input type="checkbox" class="or-select" data-id="${escapeHtml(s.EmployeeID)}" ${selectedIds.has(s.EmployeeID) ? 'checked' : ''} /></td>
        <td>${escapeHtml(s.EmployeeID)}</td><td>${escapeHtml(s.ThaiName)}</td><td>${escapeHtml(s.Position || '')}</td>
        <td>${escapeHtml(s.CostCenterName || '')}</td><td>${formatDateTH(s.HireDate)}</td>
        <td>${cell(s.Orient1Date)}</td><td>${cell(s.Orient2Date)}</td><td>${cell(s.Orient3Date)}</td><td>${cell(s.Orient4Date)}</td>
        <td>${s.OrientSentHRDate ? `<span class="badge badge-green">ส่งแล้ว</span>` : `<span class="badge badge-red">รอส่ง</span>`}</td>
        <td><button class="btn btn-ghost btn-sm" data-edit="${s.EmployeeID}">Edit</button></td>
      </tr>`).join('');
    body.querySelectorAll('.or-select').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => editModal(rows.find((r) => r.EmployeeID === btn.dataset.edit), reload));
    });
  }

  document.getElementById('or-search').addEventListener('input', debounce(renderTable, 200));
  ['or-status', 'or-hrstatus', 'or-filter-cc', 'or-filter-ss', 'or-filter-manager', 'or-hire-from', 'or-hire-to'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('or-reset').addEventListener('click', () => {
    document.getElementById('or-search').value = '';
    ['or-status', 'or-hrstatus', 'or-filter-cc', 'or-filter-ss', 'or-filter-manager', 'or-hire-from', 'or-hire-to'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });
  document.getElementById('or-select-all').addEventListener('change', (e) => {
    filtered().forEach((r) => { if (e.target.checked) selectedIds.add(r.EmployeeID); else selectedIds.delete(r.EmployeeID); });
    renderTable();
  });
  document.getElementById('or-print-selected').addEventListener('click', () => {
    const rows = allRows.filter((r) => selectedIds.has(r.EmployeeID));
    if (rows.length === 0) return;
    printOrientationByPerson(rows);
  });
  document.getElementById('or-print').addEventListener('click', () => printReport('Orientation Checklist Report', ''));
  document.getElementById('or-export').addEventListener('click', () => {
    exportCsv('orientation-checklist.csv', filtered().map((s) => ({
      EmployeeID: s.EmployeeID, ชื่อ: s.ThaiName, ตำแหน่ง: s.Position, M1: s.Orient1Date || '', M2: s.Orient2Date || '',
      M3: s.Orient3Date || '', M4: s.Orient4Date || '', ส่งHR: s.OrientSentHRDate || '',
    })));
  });

  await reload();
}
