import { api, state } from '../api.js';
import { cache, listValues } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { attachStaffSearch } from '../components/staffSearch.js';
import { escapeHtml, formatDateTH, formatYoS, debounce, exportCsv, printReport, printIsolated } from '../utils.js';

// พิมพ์รายงานการให้คำปรึกษา (หลายคนพร้อมกัน) — จัดกลุ่มตามพนักงานที่เลือก แนวตั้ง หัวข้ออยู่ column แรก ตามด้วย detail ที่บันทึกทุกหัวข้อ
function printConsultationsByPerson(employeeIds, allRows, allStaff) {
  const sections = employeeIds.map((empId) => {
    const rows = allRows.filter((r) => r.EmployeeID === empId).sort((a, b) => b.Date.localeCompare(a.Date));
    const staff = allStaff.find((s) => s.EmployeeID === empId);
    const name = staff?.ThaiName || rows[0]?.ThaiName || empId;
    const subServiceName = cache.subServices.find((x) => x.SubServiceID === staff?.SubServiceID)?.Name || '—';
    const staffInfo = `<table class="data-table vertical-fields" style="margin-bottom:14px;">
      <tbody>
        <tr><th>ตำแหน่ง</th><td>${escapeHtml(staff?.Position || '—')}</td></tr>
        <tr><th>Cost Center</th><td>${escapeHtml(staff?.CostCenterName || '—')}</td></tr>
        <tr><th>Sub Services</th><td>${escapeHtml(subServiceName)}</td></tr>
        <tr><th>วันที่เริ่มงาน</th><td>${staff?.HireDate ? formatDateTH(staff.HireDate) : '—'}</td></tr>
        <tr><th>YOS</th><td>${staff?.HireDate ? formatYoS(staff.HireDate) : '—'}</td></tr>
      </tbody>
    </table>`;
    const records = rows.map((r) => {
      const followUps = (r.FollowUps || []).length
        ? r.FollowUps.map((f) => `${f.date ? formatDateTH(f.date) : '—'} — ${escapeHtml(f.note || '')}`).join('<br/>')
        : '—';
      const fields = [
        ['วันที่', formatDateTH(r.Date)],
        ['หัวข้อ', escapeHtml(r.Topic)],
        ['รายละเอียดปัญหา', escapeHtml(r.Detail || '—')],
        ['การให้คำปรึกษา', escapeHtml(r.Advice || '—')],
        ['Result', escapeHtml(r.Result || '—')],
        ['Follow Up Date', r.FollowUpDate ? formatDateTH(r.FollowUpDate) : '—'],
        ['การติดตาม', followUps],
      ];
      return `<table class="data-table vertical-fields" style="margin-bottom:14px; page-break-inside:avoid; break-inside:avoid;">
        <tbody>${fields.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('')}</tbody>
      </table>`;
    }).join('');
    return `<div class="card" style="margin-bottom:18px;">
      <h3>${escapeHtml(empId)} — ${escapeHtml(name)}</h3>
      ${staffInfo}
      ${records || '<div class="empty-state">ไม่มีข้อมูล</div>'}
    </div>`;
  }).join('');
  printIsolated('รายงานการให้คำปรึกษา', '', sections);
}

function opts(list, placeholder, selected) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${formatDateTH(iso.slice(0, 10))} ${time} น.`;
}

function followUpRowHtml(fu, i) {
  return `<div class="card" style="padding:10px 12px; margin-bottom:8px; display:flex; gap:8px; align-items:flex-start;" data-fu="${i}">
    <input type="date" class="fu-date" value="${fu.date || ''}" style="max-width:170px;" />
    <textarea class="fu-note" rows="2" placeholder="บันทึกการติดตาม..." style="flex:1;">${escapeHtml(fu.note || '')}</textarea>
    <button type="button" class="btn btn-danger btn-sm fu-del">Delete</button>
  </div>`;
}

function consultForm(allStaff, record, onSaved) {
  const followUps = record?.FollowUps ? record.FollowUps.map((f) => ({ ...f })) : [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="cs-form">
      <div class="form-grid">
        <div class="field field-full" style="position:relative;"><label>ค้นหาพนักงาน (Employee ID / ชื่อ) *</label>
          <input id="cs-emp-search" placeholder="พิมพ์ Employee ID หรือชื่อเพื่อค้นหา..." autocomplete="off"
            value="${record ? `${escapeHtml(record.EmployeeID)} — ${escapeHtml(record.ThaiName)}` : ''}"
            ${record ? 'disabled' : ''} required />
          <input type="hidden" id="cs-emp" value="${record?.EmployeeID || ''}" />
          <div id="cs-emp-results" class="search-dropdown hidden"></div>
        </div>
        <div class="field"><label>วันที่ *</label><input type="date" id="cs-date" value="${record?.Date || new Date().toISOString().slice(0, 10)}" required /></div>
        <div class="field"><label>หัวข้อปัญหา *</label><select id="cs-topic" required>${opts(listValues('ConsultationTopic'), '-- เลือก --', record?.Topic)}</select></div>
        <div class="field field-full"><label>รายละเอียดปัญหา</label><textarea id="cs-detail" rows="3">${escapeHtml(record?.Detail || '')}</textarea></div>
        <div class="field field-full"><label>การให้คำปรึกษา / การช่วยเหลือ</label><textarea id="cs-advice" rows="3">${escapeHtml(record?.Advice || '')}</textarea></div>
        <div class="field"><label>Consultation Result</label><select id="cs-result">${opts(listValues('ConsultationResult'), '-- เลือก --', record?.Result || 'In Progress')}</select></div>
        <div class="field"><label>Follow Up Date</label><input type="date" id="cs-followup" value="${record?.FollowUpDate || ''}" /></div>
        <div class="field"><label>ผู้บันทึก</label><input value="${escapeHtml(record?.RecordedByName || state.user?.ThaiName || state.user?.NickName || '')}" disabled /></div>
        <div class="field"><label>วันที่และเวลาบันทึก (บันทึกอัตโนมัติ)</label><input value="${formatDateTime(record?.CreatedAt)}" disabled /></div>
      </div>

      <div class="toolbar" style="margin-top:18px;">
        <div class="section-title" style="margin:0;">การติดตามการให้คำปรึกษา</div>
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary btn-sm" id="cs-fu-add">+ เพิ่มการติดตาม</button>
      </div>
      <div id="cs-fu-list"></div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cs-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`;
  const body = openModal(record ? 'แก้ไขการให้คำปรึกษา' : 'บันทึกการให้คำปรึกษา', wrap, { wide: true });

  const fuList = body.querySelector('#cs-fu-list');
  function renderFollowUps() {
    fuList.innerHTML = followUps.length ? followUps.map(followUpRowHtml).join('') : '<span class="empty-state" style="padding:4px 0;">ยังไม่มีการติดตาม</span>';
    fuList.querySelectorAll('[data-fu]').forEach((row) => {
      const i = Number(row.dataset.fu);
      row.querySelector('.fu-date').addEventListener('change', (e) => { followUps[i].date = e.target.value; });
      row.querySelector('.fu-note').addEventListener('input', (e) => { followUps[i].note = e.target.value; });
      row.querySelector('.fu-del').addEventListener('click', async () => {
        if (!(await confirmDialog('ลบรายการติดตามนี้หรือไม่?'))) return;
        followUps.splice(i, 1);
        renderFollowUps();
      });
    });
  }
  renderFollowUps();
  body.querySelector('#cs-fu-add').addEventListener('click', () => {
    followUps.push({ date: new Date().toISOString().slice(0, 10), note: '' });
    renderFollowUps();
  });

  if (!record) {
    attachStaffSearch({
      searchInput: body.querySelector('#cs-emp-search'),
      hiddenInput: body.querySelector('#cs-emp'),
      resultsBox: body.querySelector('#cs-emp-results'),
      allStaff,
    });
  }

  body.querySelector('#cs-cancel').addEventListener('click', closeModal);
  body.querySelector('#cs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = record ? record.EmployeeID : body.querySelector('#cs-emp').value;
    if (!empId) { toastError('กรุณาเลือกพนักงาน'); return; }
    const payload = {
      EmployeeID: empId, Date: body.querySelector('#cs-date').value,
      Topic: body.querySelector('#cs-topic').value, Result: body.querySelector('#cs-result').value,
      FollowUpDate: body.querySelector('#cs-followup').value, Detail: body.querySelector('#cs-detail').value.trim(),
      Advice: body.querySelector('#cs-advice').value.trim(), FollowUps: followUps.filter((f) => f.date || f.note.trim()),
    };
    try {
      await withLoading(() => (record ? api.put(`/api/consultations/${record.ConsultID}`, payload) : api.post('/api/consultations', payload)));
      toastSuccess('บันทึกสำเร็จ');
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
      <button id="cs-export" class="btn btn-secondary">Export Excel</button>
      <button id="cs-print" class="btn btn-primary">Print Report</button>
      <button id="cs-add" class="btn btn-primary">+ บันทึกการให้คำปรึกษา</button>
    </div>
    <div class="stat-grid" id="cs-summary"></div>
    <div class="tabs">
      <button type="button" class="tab-btn active" data-tab="followup">Follow-up Tracking</button>
      <button type="button" class="tab-btn" data-tab="list">รายการให้คำปรึกษา</button>
    </div>
    <div class="toolbar">
      <input id="cs-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID/ชื่อ" />
      <select id="cs-filter-result"><option value="">All Results</option>${listValues('ConsultationResult').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
      <select id="cs-filter-topic">${opts(listValues('ConsultationTopic'), 'ทุกหัวข้อ')}</select>
      <button id="cs-reset" class="btn btn-ghost">Reset</button>
    </div>
    <div class="toolbar">
      <span id="cs-selected-count" style="font-size:13.5px; color:var(--muted);">ยังไม่ได้เลือกพนักงาน</span>
      <span class="spacer"></span>
      <button id="cs-print-selected" class="btn btn-secondary" disabled>Print รายบุคคลที่เลือก</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th><input type="checkbox" id="cs-select-all" /></th><th>#</th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>วันที่</th><th>หัวข้อ</th><th>Result</th><th>Follow Up Date</th><th>จำนวนการติดตาม</th><th>จัดการ</th></tr></thead>
        <tbody id="cs-body"></tbody>
      </table>
    </div>`;

  const summary = await api.get('/api/consultations/summary');
  document.getElementById('cs-summary').innerHTML = `
    <div class="stat-card stat-blue"><span class="stat-label">TOTAL CONSULTATIONS</span><span class="stat-value">${summary.total}</span></div>
    <div class="stat-card stat-green"><span class="stat-label">Resolved</span><span class="stat-value">${summary.resolved}</span></div>
    <div class="stat-card stat-orange"><span class="stat-label">In Progress</span><span class="stat-value">${summary.inProgress}</span></div>
    <div class="stat-card stat-red"><span class="stat-label">Needs Follow-up</span><span class="stat-value">${summary.needsFollowUp}</span></div>
    <div class="stat-card stat-purple"><span class="stat-label">Referred to Specialist</span><span class="stat-value">${summary.referred}</span></div>`;

  let allStaff = [], allRows = [], tab = 'followup';
  const selectedIds = new Set();

  function filtered() {
    const search = document.getElementById('cs-search').value.trim().toLowerCase();
    const result = document.getElementById('cs-filter-result').value;
    const topic = document.getElementById('cs-filter-topic').value;
    let rows = tab === 'followup' ? allRows.filter((r) => r.FollowUpDate) : allRows;
    if (search) rows = rows.filter((r) => `${r.EmployeeID} ${r.ThaiName}`.toLowerCase().includes(search));
    if (result) rows = rows.filter((r) => r.Result === result);
    if (topic) rows = rows.filter((r) => r.Topic === topic);
    return rows;
  }

  function updateSelectionUi() {
    const countEl = document.getElementById('cs-selected-count');
    const printBtn = document.getElementById('cs-print-selected');
    if (!countEl || !printBtn) return;
    countEl.textContent = selectedIds.size ? `เลือกแล้ว ${selectedIds.size} คน` : 'ยังไม่ได้เลือกพนักงาน';
    printBtn.disabled = selectedIds.size === 0;
    const selectAll = document.getElementById('cs-select-all');
    if (selectAll) {
      const visibleIds = filtered().map((r) => r.EmployeeID);
      selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    }
  }

  function renderTable() {
    const rows = filtered();
    const body = document.getElementById('cs-body');
    if (!body) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอ reload() หลังบันทึก/ลบ
    if (rows.length === 0) { body.innerHTML = '<tr><td colspan="10" class="empty-state">ไม่พบข้อมูล</td></tr>'; updateSelectionUi(); return; }
    body.innerHTML = rows.map((r, i) => `
      <tr>
        <td><input type="checkbox" class="cs-select" data-id="${escapeHtml(r.EmployeeID)}" ${selectedIds.has(r.EmployeeID) ? 'checked' : ''} /></td>
        <td>${i + 1}</td><td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>${formatDateTH(r.Date)}</td>
        <td>${escapeHtml(r.Topic)}</td><td><span class="badge ${r.Result === 'Resolved' ? 'badge-green' : r.Result === 'Needs Follow-up' ? 'badge-red' : 'badge-gold'}">${escapeHtml(r.Result)}</span></td>
        <td>${r.FollowUpDate ? formatDateTH(r.FollowUpDate) : '—'}</td>
        <td>${(r.FollowUps || []).length}</td>
        <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${r.ConsultID}">Edit</button></td>
      </tr>`).join('');
    body.querySelectorAll('.cs-select').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => consultForm(allStaff, allRows.find((r) => r.ConsultID === btn.dataset.edit), reload));
    });
  }

  async function reload() {
    [allStaff, allRows] = await Promise.all([api.get('/api/staff'), api.get('/api/consultations')]);
    renderTable();
  }

  document.querySelectorAll('.tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      tab = btn.dataset.tab;
      renderTable();
    });
  });
  document.getElementById('cs-search').addEventListener('input', debounce(renderTable, 200));
  ['cs-filter-result', 'cs-filter-topic'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('cs-reset').addEventListener('click', () => {
    document.getElementById('cs-search').value = '';
    ['cs-filter-result', 'cs-filter-topic'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });
  document.getElementById('cs-select-all').addEventListener('change', (e) => {
    filtered().forEach((r) => { if (e.target.checked) selectedIds.add(r.EmployeeID); else selectedIds.delete(r.EmployeeID); });
    renderTable();
  });
  document.getElementById('cs-print-selected').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    printConsultationsByPerson([...selectedIds], allRows, allStaff);
  });
  document.getElementById('cs-add').addEventListener('click', () => consultForm(allStaff, null, reload));
  document.getElementById('cs-print').addEventListener('click', () => printReport('Consultation Report', ''));
  document.getElementById('cs-export').addEventListener('click', () => {
    exportCsv('consultation.csv', filtered().map((r) => ({
      EmployeeID: r.EmployeeID, ชื่อ: r.ThaiName, วันที่: r.Date, หัวข้อ: r.Topic, ผล: r.Result, FollowUpDate: r.FollowUpDate || '',
    })));
  });

  await reload();
}
