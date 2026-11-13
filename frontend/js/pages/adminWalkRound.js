import { api, state } from '../api.js';
import { cache, listValues } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { attachStaffSearch } from '../components/staffSearch.js';
import { escapeHtml, formatDateTH, formatYoS, debounce, exportCsv, printReport, printIsolated } from '../utils.js';

// ตารางเดียวกับที่ backend ใช้กำหนดรอบเยี่ยม (WalkRounds.gs: WALK_ROUND_SCHEDULE_) — ใช้แสดงผลฝั่งหน้าบ้านทันทีที่เลือกพนักงาน
// backend เป็นผู้กำหนดค่าจริงตอนบันทึกเสมอ ค่าที่คำนวณที่นี่ใช้แสดงตัวอย่างล่วงหน้าเท่านั้น
const WALK_ROUND_SCHEDULE = [
  { round: 1, label: 'ครั้งที่ 1 (สัปดาห์แรก)', dueDay: 7 },
  { round: 2, label: 'ครั้งที่ 2 (เดือนแรก)', dueDay: 30 },
  { round: 3, label: 'ครั้งที่ 3 (ครบ 90 วัน)', dueDay: 90 },
];

function daysSinceHire(hireDate) {
  if (!hireDate) return null;
  return Math.round((Date.now() - new Date(`${hireDate}T00:00:00`).getTime()) / 86400000);
}

function nextRoundFor(staff, allRows) {
  if (!staff?.HireDate) return null;
  const visited = new Set(allRows.filter((r) => r.EmployeeID === staff.EmployeeID).map((r) => r.VisitRound));
  const days = daysSinceHire(staff.HireDate);
  for (const rnd of WALK_ROUND_SCHEDULE) {
    if (!visited.has(rnd.label)) return { ...rnd, daysSinceHire: days };
  }
  return null;
}

function opts(list, placeholder, selected) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
}

// ตัวเลือก "ผล" ของหัวข้อเช็กลิสต์ — จับคู่ด้วย ListID (คงที่) ก่อน แล้วค่อย fallback ไปจับคู่ด้วยข้อความ (label)
// สำหรับข้อมูลเก่าที่บันทึกไว้ก่อนมีการเก็บ id — กันไม่ให้การแก้ไข/ลบ/เพิ่มหัวข้อเช็กลิสต์ใน Settings ภายหลัง
// ทำให้ตัวเลือกของบันทึกเก่าหายไป (บันทึกเก่าไม่ต้องแก้ไขตาม แม้หัวข้อ/ตัวเลือกต้นทางจะเปลี่ยนไปแล้ว)
function optionsForChecklistItem(checklistItems, item) {
  const match = (item.id && checklistItems.find((ci) => ci.ListID === item.id))
    || checklistItems.find((ci) => ci.text === item.label);
  let list = match ? match.options : [];
  if (item.value && !list.includes(item.value)) list = [...list, item.value];
  return list;
}

function walkRoundForm(allStaff, allRows, checklistItems, record, onSaved, prefillEmployeeId) {
  const prefillStaff = !record && prefillEmployeeId ? allStaff.find((s) => s.EmployeeID === prefillEmployeeId) : null;
  const initDept = record?.Department || prefillStaff?.CostCenterName || '';
  const initPosition = record?.Position || prefillStaff?.Position || '';
  const initHireDate = record?.HireDate || prefillStaff?.HireDate || '';
  const initBuddy = record?.Buddy || prefillStaff?.Preceptor || '';
  const initRoundLabel = record?.VisitRound || (prefillStaff ? nextRoundFor(prefillStaff, allRows)?.label : null) || 'เลือกพนักงานก่อน';
  const checklist = record?.Checklist?.length ? record.Checklist : checklistItems.map((ci) => ({ id: ci.ListID, label: ci.text, value: '', note: '' }));
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="wr-form">
      <div class="section-title" style="margin-top:0;">ข้อมูลการเยี่ยม</div>
      <div class="form-grid">
        <div class="field"><label>วันที่เยี่ยม *</label><input type="date" id="wr-date" value="${record?.VisitDate || new Date().toISOString().slice(0, 10)}" required /></div>
        <div class="field"><label>เวลา</label><input type="time" id="wr-time" value="${record?.VisitTime || ''}" /></div>
        <div class="field"><label>ผู้เยี่ยม/ผู้บันทึก</label><input value="${escapeHtml(record?.VisitorName || state.user?.ThaiName || '')}" disabled /></div>
        <div class="field"><label>รอบการเยี่ยม</label><input id="wr-round-display" value="${escapeHtml(initRoundLabel)}" disabled /></div>
      </div>

      <div class="section-title">ข้อมูลพนักงานใหม่</div>
      <div class="form-grid">
        <div class="field field-full" style="position:relative;"><label>พนักงาน * (ค้นหาด้วยรหัสหรือชื่อ)</label>
          <input id="wr-emp-search" placeholder="พิมพ์รหัสพนักงานหรือชื่อ..." autocomplete="off"
            value="${record ? `${escapeHtml(record.EmployeeID)} — ${escapeHtml(record.EmployeeName)}` : prefillStaff ? `${escapeHtml(prefillStaff.EmployeeID)} — ${escapeHtml(prefillStaff.ThaiName)}` : ''}"
            ${record ? 'disabled' : ''} required />
          <input type="hidden" id="wr-emp" value="${record?.EmployeeID || prefillStaff?.EmployeeID || ''}" />
          <div id="wr-emp-results" class="search-dropdown hidden"></div>
          <span id="wr-emp-hint" class="field-hint-error hidden">กรุณาเลือกพนักงานจากรายการที่แสดง ไม่ใช่พิมพ์เองแล้วปิดหน้าต่างทันที</span>
        </div>
        <div class="field"><label>หน่วยงาน/แผนก</label><input id="wr-dept" value="${escapeHtml(initDept)}" disabled /></div>
        <div class="field"><label>ตำแหน่ง</label><input id="wr-position" value="${escapeHtml(initPosition)}" disabled /></div>
        <div class="field"><label>วันเริ่มงาน</label><input id="wr-hiredate" value="${initHireDate ? formatDateTH(initHireDate) : ''}" disabled /></div>
        <div class="field"><label>อายุงาน</label><input id="wr-age" value="${initHireDate ? `${daysSinceHire(initHireDate)} วัน` : '—'}" disabled /></div>
        <div class="field"><label>หัวหน้างาน/พี่เลี้ยง (Buddy)</label><input id="wr-buddy" value="${escapeHtml(initBuddy)}" disabled /></div>
      </div>

      <div class="section-title">หัวข้อที่พูดคุย / เช็กลิสต์</div>
      <div id="wr-checklist"></div>

      <div class="section-title">สรุปผลและการติดตาม</div>
      <div class="form-grid">
        <div class="field"><label>สถานะ</label><select id="wr-status">${opts(listValues('WalkRoundStatus'), '-- เลือกสถานะ --', record?.Status || listValues('WalkRoundStatus')[0])}</select></div>
        <div class="field"><label>วันนัดติดตามครั้งถัดไป</label><input type="date" id="wr-followup" value="${record?.NextFollowUpDate || ''}" /></div>
        <div class="field field-full"><label>ประเด็นที่พบ / ข้อกังวล</label><textarea id="wr-issues" rows="2">${escapeHtml(record?.IssuesFound || '')}</textarea></div>
        <div class="field"><label>การดำเนินการที่ต้องทำ (Action)</label><input id="wr-action" value="${escapeHtml(record?.ActionNeeded || '')}" /></div>
        <div class="field"><label>ผู้รับผิดชอบ</label><input id="wr-owner" value="${escapeHtml(record?.ActionOwner || '')}" /></div>
        <div class="field field-full"><label>หมายเหตุ</label><textarea id="wr-note" rows="2">${escapeHtml(record?.Note || '')}</textarea></div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="wr-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`;
  const body = openModal(record ? 'แก้ไขการเยี่ยม' : 'บันทึก Walk Round เยี่ยมพนักงานใหม่', wrap, { wide: true });

  const checklistBox = body.querySelector('#wr-checklist');
  checklistBox.innerHTML = checklist.length ? checklist.map((item, i) => `
    <div class="card" style="padding:12px 14px; margin-bottom:8px;">
      <div style="font-size:13.5px; font-weight:600; margin-bottom:8px;">${escapeHtml(item.label)}</div>
      <div class="form-grid">
        <div class="field"><label>ผล</label>
          <select data-ci="${i}" class="wr-ci-val">${opts(optionsForChecklistItem(checklistItems, item), '-- เลือก --', item.value)}</select>
        </div>
        <div class="field field-full"><label>หมายเหตุ</label><input data-ci="${i}" class="wr-ci-note" value="${escapeHtml(item.note || '')}" /></div>
      </div>
    </div>`).join('') : '<div class="empty-state">ยังไม่มีหัวข้อเช็กลิสต์ — <a href="#/settings" id="wr-goto-settings">ไปเพิ่มที่ Settings &gt; Walk Round</a></div>';
  const gotoSettingsLink = checklistBox.querySelector('#wr-goto-settings');
  if (gotoSettingsLink) gotoSettingsLink.addEventListener('click', () => closeModal());

  function fillFromStaff(empId) {
    const s = allStaff.find((x) => x.EmployeeID === empId);
    body.querySelector('#wr-dept').value = s?.CostCenterName || '';
    body.querySelector('#wr-position').value = s?.Position || '';
    body.querySelector('#wr-hiredate').value = s?.HireDate ? formatDateTH(s.HireDate) : '';
    body.querySelector('#wr-age').value = s?.HireDate ? `${daysSinceHire(s.HireDate)} วัน` : '—';
    body.querySelector('#wr-buddy').value = s?.Preceptor || '';
    const next = nextRoundFor(s, allRows);
    body.querySelector('#wr-round-display').value = next ? next.label : 'ครบทุกรอบแล้ว (จะบันทึกเป็นเยี่ยมเพิ่มเติม)';
  }

  if (!record) {
    const empSearchInput = body.querySelector('#wr-emp-search');
    const empHiddenInput = body.querySelector('#wr-emp');
    const empHint = body.querySelector('#wr-emp-hint');
    attachStaffSearch({
      searchInput: empSearchInput,
      hiddenInput: empHiddenInput,
      resultsBox: body.querySelector('#wr-emp-results'),
      allStaff,
      onSelect: (s) => {
        fillFromStaff(s.EmployeeID);
        empSearchInput.classList.remove('input-error');
        empHint.classList.add('hidden');
      },
    });
    // แจ้งเตือนชัดเจนถ้าพิมพ์ข้อความไว้แต่ยังไม่ได้เลือกพนักงานจาก dropdown (หมายเลข/ชื่อยังไม่ผูกกับ EmployeeID จริง)
    // ยกเว้นกรณีพิมพ์รหัสพนักงานตรงเป๊ะแบบไม่ซ้ำใคร (พิมพ์แล้วกด Tab ออกทันทีโดยไม่คลิกเลือก) — ให้ auto-resolve ให้เลยแทนที่จะฟ้อง error
    empSearchInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!empHiddenInput.value) {
          const typed = empSearchInput.value.trim().toLowerCase();
          const exactMatches = typed ? allStaff.filter((s) => s.EmployeeID.toLowerCase() === typed) : [];
          if (exactMatches.length === 1) {
            empHiddenInput.value = exactMatches[0].EmployeeID;
            empSearchInput.value = `${exactMatches[0].EmployeeID} — ${exactMatches[0].ThaiName}`;
            fillFromStaff(exactMatches[0].EmployeeID);
          }
        }
        const invalid = empSearchInput.value.trim() && !empHiddenInput.value;
        empSearchInput.classList.toggle('input-error', !!invalid);
        empHint.classList.toggle('hidden', !invalid);
      }, 200);
    });
    if (prefillStaff) fillFromStaff(prefillStaff.EmployeeID);
  }

  body.querySelector('#wr-cancel').addEventListener('click', closeModal);
  body.querySelector('#wr-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (id) => body.querySelector(id).value;
    const newChecklist = checklist.map((item, i) => ({
      id: item.id, label: item.label,
      value: body.querySelector(`.wr-ci-val[data-ci="${i}"]`).value,
      note: body.querySelector(`.wr-ci-note[data-ci="${i}"]`).value.trim(),
    }));
    const payload = {
      VisitDate: g('#wr-date'), VisitTime: g('#wr-time'), EmployeeID: record ? record.EmployeeID : g('#wr-emp'),
      Checklist: newChecklist, Status: g('#wr-status'), IssuesFound: g('#wr-issues').trim(),
      ActionNeeded: g('#wr-action').trim(), ActionOwner: g('#wr-owner').trim(), NextFollowUpDate: g('#wr-followup'),
      Note: g('#wr-note').trim(),
    };
    if (!record && !payload.EmployeeID) { toastError('กรุณาเลือกพนักงานที่เยี่ยม'); return; }
    try {
      await withLoading(() => (record ? api.put(`/api/walk-rounds/${record.RoundID}`, payload) : api.post('/api/walk-rounds', payload)));
      toastSuccess('บันทึกสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

function renderDueTab(container) {
  container.innerHTML = `
    <div class="toolbar" style="margin-bottom:10px;"><span class="spacer"></span><button id="wr-due-print" class="btn btn-primary btn-sm">Print</button></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ชื่อพนักงาน</th><th>หน่วยงาน</th><th>รอบการเยี่ยม</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody id="wr-due-body"><tr><td colspan="5" class="empty-state">กำลังโหลด...</td></tr></tbody>
      </table>
    </div>`;

  let dueList = [];

  Promise.all([
    api.get('/api/walk-rounds/due'), api.get('/api/staff'),
    api.get('/api/walk-rounds'), api.get('/api/walk-rounds/checklist'),
  ]).then(([due, allStaff, allRows, checklistItems]) => {
    dueList = due;
    const body = document.getElementById('wr-due-body');
    if (!body) return;
    body.innerHTML = due.length === 0 ? '<tr><td colspan="5" class="empty-state">ไม่มีรายการที่ถึงกำหนดวันนี้</td></tr>' : due.map((d) => `
      <tr>
        <td>${escapeHtml(d.EmployeeID)} — ${escapeHtml(d.ThaiName)}</td><td>${escapeHtml(d.Department)}</td>
        <td>${escapeHtml(d.RoundLabel)}</td>
        <td><span class="badge ${d.Overdue ? 'badge-red' : 'badge-gold'}">${d.Overdue ? 'เลยกำหนด' : 'ถึงกำหนดแล้ว'}</span></td>
        <td><button type="button" class="btn btn-primary btn-sm" data-visit="${escapeHtml(d.EmployeeID)}">บันทึกการเยี่ยม</button></td>
      </tr>`).join('');
    body.querySelectorAll('[data-visit]').forEach((btn) => {
      btn.addEventListener('click', () => walkRoundForm(allStaff, allRows, checklistItems, null, () => renderDueTab(container), btn.dataset.visit));
    });
  }).catch((err) => toastError(err.message));

  document.getElementById('wr-due-print').addEventListener('click', () => {
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>ชื่อพนักงาน</th><th>หน่วยงาน</th><th>รอบการเยี่ยม</th><th>สถานะ</th></tr></thead>
      <tbody>${dueList.length === 0 ? '<tr><td colspan="4" class="empty-state">ไม่มีรายการที่ถึงกำหนด</td></tr>' : dueList.map((d) => `
        <tr>
          <td>${escapeHtml(d.EmployeeID)} — ${escapeHtml(d.ThaiName)}</td><td>${escapeHtml(d.Department)}</td>
          <td>${escapeHtml(d.RoundLabel)}</td>
          <td><span class="badge ${d.Overdue ? 'badge-red' : 'badge-gold'}">${d.Overdue ? 'เลยกำหนด' : 'ถึงกำหนดแล้ว'}</span></td>
        </tr>`).join('')}</tbody>
    </table></div>`;
    printIsolated('วันนี้ถึงกำหนด Walk Round', '', html);
  });
}

// พิมพ์รายงาน Walk Round (หลายคนพร้อมกัน) — แนวตั้ง หัวข้ออยู่ column แรก ตามด้วย detail ที่บันทึกทุกหัวข้อ
function printWalkRoundByPerson(employeeIds, allRows, allStaff) {
  const sections = employeeIds.map((empId) => {
    const rows = allRows.filter((r) => r.EmployeeID === empId).sort((a, b) => b.VisitDate.localeCompare(a.VisitDate));
    const staff = allStaff.find((s) => s.EmployeeID === empId);
    const name = staff?.ThaiName || rows[0]?.EmployeeName || empId;
    const subServiceName = cache.subServices.find((x) => x.SubServiceID === staff?.SubServiceID)?.Name || '—';
    const staffInfo = `<table class="data-table vertical-fields" style="margin-bottom:14px;">
      <tbody>
        <tr><th>ตำแหน่ง</th><td>${escapeHtml(staff?.Position || '—')}</td></tr>
        <tr><th>Cost Center</th><td>${escapeHtml(staff?.CostCenterName || '—')}</td></tr>
        <tr><th>Sub Cost Center</th><td>${escapeHtml(subServiceName)}</td></tr>
        <tr><th>วันที่เริ่มงาน</th><td>${staff?.HireDate ? formatDateTH(staff.HireDate) : '—'}</td></tr>
        <tr><th>YOS</th><td>${staff?.HireDate ? formatYoS(staff.HireDate) : '—'}</td></tr>
      </tbody>
    </table>`;
    const records = rows.map((r) => {
      const checklistRows = (r.Checklist || []).length
        ? r.Checklist.map((ci) => `${escapeHtml(ci.label)}: ${escapeHtml(ci.value || '—')}${ci.note ? ` (${escapeHtml(ci.note)})` : ''}`).join('<br/>')
        : '—';
      const fields = [
        ['วันที่เยี่ยม', formatDateTH(r.VisitDate)],
        ['เวลา', escapeHtml(r.VisitTime || '—')],
        ['ผู้เยี่ยม', escapeHtml(r.VisitorName || '—')],
        ['รอบการเยี่ยม', escapeHtml(r.VisitRound || '—')],
        ['ตำแหน่ง', escapeHtml(r.Position || '—')],
        ['วันเริ่มงาน', r.HireDate ? formatDateTH(r.HireDate) : '—'],
        ['พี่เลี้ยง (Buddy)', escapeHtml(r.Buddy || '—')],
        ['หัวข้อที่พูดคุย / เช็กลิสต์', checklistRows],
        ['สถานะ', escapeHtml(r.Status || '—')],
        ['ประเด็นที่พบ', escapeHtml(r.IssuesFound || '—')],
        ['การดำเนินการที่ต้องทำ', escapeHtml(r.ActionNeeded || '—')],
        ['ผู้รับผิดชอบ', escapeHtml(r.ActionOwner || '—')],
        ['วันนัดติดตามถัดไป', r.NextFollowUpDate ? formatDateTH(r.NextFollowUpDate) : '—'],
        ['หมายเหตุ', escapeHtml(r.Note || '—')],
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
  printIsolated('รายงาน Walk Round', '', sections);
}

function renderDataTab(container) {
  container.innerHTML = `
    <div class="toolbar">
      <input id="wr-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID/ชื่อ" />
      <select id="wr-filter-dept"><option value="">ทุก Cost Center</option>${cache.costCenters.map((c) => `<option value="${escapeHtml(c.Name)}">${escapeHtml(c.Name)}</option>`).join('')}</select>
      <select id="wr-filter-ss"><option value="">ทุก Sub Services</option>${cache.subServices.map((s) => `<option value="${s.SubServiceID}">${escapeHtml(s.Name)}</option>`).join('')}</select>
      <select id="wr-filter-manager"><option value="">ทุก Manager</option></select>
      <select id="wr-filter-status"><option value="">ทุกสถานะ</option>${listValues('WalkRoundStatus').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">เริ่มงานตั้งแต่<input type="date" id="wr-hire-from" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">ถึง<input type="date" id="wr-hire-to" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <button id="wr-reset" class="btn btn-ghost">Reset</button>
      <span class="spacer"></span>
      <button id="wr-sync-columns" class="btn btn-ghost btn-sm" title="แยกเช็กลิสต์เดิม (ChecklistJSON) ที่เคยบันทึกไว้แล้วออกเป็นคอลัมน์ในชีต">ซิงก์เช็กลิสต์ลงคอลัมน์</button>
      <button id="wr-export" class="btn btn-secondary">Export Excel</button>
      <button id="wr-print" class="btn btn-primary">Print Report</button>
      <button id="wr-add" class="btn btn-primary">+ บันทึกการเยี่ยม</button>
    </div>
    <div class="toolbar">
      <span id="wr-selected-count" style="font-size:13.5px; color:var(--muted);">ยังไม่ได้เลือกพนักงาน</span>
      <span class="spacer"></span>
      <button id="wr-print-selected" class="btn btn-secondary" disabled>Print รายบุคคลที่เลือก</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th><input type="checkbox" id="wr-select-all" /></th><th>#</th><th>วันที่เยี่ยม</th><th>หน่วยงาน</th><th>รหัสพนักงาน</th><th>ชื่อพนักงานใหม่</th><th>ตำแหน่ง</th>
          <th>เริ่มงาน</th><th>อายุงาน</th><th>รอบการเยี่ยม</th><th>ปัญหาที่พบ</th><th>ผู้เยี่ยม</th><th>Action</th><th>ผู้รับผิดชอบ</th>
          <th>สถานะ</th><th>ติดตามถัดไป</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
        <tbody id="wr-body"></tbody>
      </table>
    </div>`;

  let allStaff = [], allRows = [], checklistItems = [];
  let staffById = {};
  const selectedIds = new Set();

  function ageDays(hireDate) {
    const d = daysSinceHire(hireDate);
    return d === null ? '—' : `${d} วัน`;
  }

  function filtered() {
    const search = document.getElementById('wr-search').value.trim().toLowerCase();
    const dept = document.getElementById('wr-filter-dept').value;
    const subServiceId = document.getElementById('wr-filter-ss').value;
    const manager = document.getElementById('wr-filter-manager').value;
    const status = document.getElementById('wr-filter-status').value;
    const hireFrom = document.getElementById('wr-hire-from').value;
    const hireTo = document.getElementById('wr-hire-to').value;
    let rows = allRows;
    if (search) rows = rows.filter((r) => `${r.EmployeeID} ${r.EmployeeName}`.toLowerCase().includes(search));
    if (dept) rows = rows.filter((r) => r.Department === dept);
    if (subServiceId) rows = rows.filter((r) => staffById[r.EmployeeID]?.SubServiceID === subServiceId);
    if (manager) rows = rows.filter((r) => staffById[r.EmployeeID]?.ManagerName === manager);
    if (status) rows = rows.filter((r) => r.Status === status);
    if (hireFrom) rows = rows.filter((r) => r.HireDate && r.HireDate >= hireFrom);
    if (hireTo) rows = rows.filter((r) => r.HireDate && r.HireDate <= hireTo);
    return rows;
  }

  function updateSelectionUi() {
    const countEl = document.getElementById('wr-selected-count');
    const printBtn = document.getElementById('wr-print-selected');
    if (!countEl || !printBtn) return;
    countEl.textContent = selectedIds.size ? `เลือกแล้ว ${selectedIds.size} คน` : 'ยังไม่ได้เลือกพนักงาน';
    printBtn.disabled = selectedIds.size === 0;
    const selectAll = document.getElementById('wr-select-all');
    if (selectAll) {
      const visibleIds = filtered().map((r) => r.EmployeeID);
      selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    }
  }

  function renderTable() {
    const rows = filtered();
    const body = document.getElementById('wr-body');
    if (!body) return;
    body.innerHTML = rows.length === 0 ? '<tr><td colspan="18" class="empty-state">ไม่พบข้อมูล</td></tr>' : rows.map((r, i) => `
      <tr>
        <td><input type="checkbox" class="wr-select" data-id="${escapeHtml(r.EmployeeID)}" ${selectedIds.has(r.EmployeeID) ? 'checked' : ''} /></td>
        <td>${i + 1}</td><td>${formatDateTH(r.VisitDate)}</td><td>${escapeHtml(r.Department)}</td>
        <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.EmployeeName)}</td><td>${escapeHtml(r.Position || '')}</td>
        <td>${r.HireDate ? formatDateTH(r.HireDate) : '—'}</td><td>${ageDays(r.HireDate)}</td><td>${escapeHtml(r.VisitRound || '')}</td>
        <td>${escapeHtml(r.IssuesFound || '—')}</td><td>${escapeHtml(r.VisitorName)}</td><td>${escapeHtml(r.ActionNeeded || '—')}</td>
        <td>${escapeHtml(r.ActionOwner || '—')}</td>
        <td><span class="badge ${r.Status === 'เรียบร้อย' ? 'badge-green' : 'badge-gold'}">${escapeHtml(r.Status || '')}</span></td>
        <td>${r.NextFollowUpDate ? formatDateTH(r.NextFollowUpDate) : '—'}</td><td>${escapeHtml(r.Note || '—')}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${r.RoundID}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${r.RoundID}">Del</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('.wr-select').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => walkRoundForm(allStaff, allRows, checklistItems, allRows.find((r) => r.RoundID === btn.dataset.edit), reload));
    });
    body.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('ลบข้อมูลการเยี่ยมนี้หรือไม่?'))) return;
        try {
          await withLoading(() => api.del(`/api/walk-rounds/${btn.dataset.del}`));
          toastSuccess('ลบสำเร็จ');
          reload();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  async function reload() {
    [allStaff, allRows, checklistItems] = await Promise.all([
      api.get('/api/staff'), api.get('/api/walk-rounds'), api.get('/api/walk-rounds/checklist'),
    ]);
    const managerSel = document.getElementById('wr-filter-manager');
    if (!managerSel) return; // ผู้ใช้เปลี่ยนแท็บไปแล้วระหว่างรอโหลดข้อมูล — ไม่มี DOM ให้เขียนต่อ
    staffById = Object.fromEntries(allStaff.map((s) => [s.EmployeeID, s]));
    const current = managerSel.value;
    const managers = [...new Set(allStaff.map((s) => s.ManagerName).filter(Boolean))].sort();
    managerSel.innerHTML = `<option value="">ทุก Manager</option>${managers.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;
    managerSel.value = current;
    renderTable();
  }

  document.getElementById('wr-search').addEventListener('input', debounce(renderTable, 200));
  ['wr-filter-dept', 'wr-filter-ss', 'wr-filter-manager', 'wr-filter-status', 'wr-hire-from', 'wr-hire-to'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('wr-reset').addEventListener('click', () => {
    document.getElementById('wr-search').value = '';
    ['wr-filter-dept', 'wr-filter-ss', 'wr-filter-manager', 'wr-filter-status', 'wr-hire-from', 'wr-hire-to'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });
  document.getElementById('wr-select-all').addEventListener('change', (e) => {
    filtered().forEach((r) => { if (e.target.checked) selectedIds.add(r.EmployeeID); else selectedIds.delete(r.EmployeeID); });
    renderTable();
  });
  document.getElementById('wr-print-selected').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    printWalkRoundByPerson([...selectedIds], allRows, allStaff);
  });
  document.getElementById('wr-add').addEventListener('click', () => walkRoundForm(allStaff, allRows, checklistItems, null, reload));
  document.getElementById('wr-sync-columns').addEventListener('click', async () => {
    try {
      const result = await withLoading(() => api.post('/api/walk-rounds/sync-columns', {}));
      toastSuccess(`ซิงก์เช็กลิสต์ลงคอลัมน์สำเร็จ (${result.updated} รายการ)`);
    } catch (err) { toastError(err.message); }
  });
  // พิมพ์ตารางแบบสะอาด ไม่มี checkbox / คอลัมน์ "จัดการ" (ต่างจากตารางบนหน้าจอที่มีไว้ใช้งานเท่านั้น)
  document.getElementById('wr-print').addEventListener('click', () => {
    const rows = filtered();
    const bodyRows = rows.length === 0 ? '<tr><td colspan="16" class="empty-state">ไม่พบข้อมูล</td></tr>' : rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td><td>${formatDateTH(r.VisitDate)}</td><td>${escapeHtml(r.Department)}</td>
        <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.EmployeeName)}</td><td>${escapeHtml(r.Position || '')}</td>
        <td>${r.HireDate ? formatDateTH(r.HireDate) : '—'}</td><td>${ageDays(r.HireDate)}</td><td>${escapeHtml(r.VisitRound || '')}</td>
        <td>${escapeHtml(r.IssuesFound || '—')}</td><td>${escapeHtml(r.VisitorName)}</td>
        <td>${escapeHtml(r.ActionNeeded || '—')}</td><td>${escapeHtml(r.ActionOwner || '—')}</td>
        <td>${escapeHtml(r.Status || '')}</td><td>${r.NextFollowUpDate ? formatDateTH(r.NextFollowUpDate) : '—'}</td><td>${escapeHtml(r.Note || '—')}</td>
      </tr>`).join('');
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>วันที่เยี่ยม</th><th>หน่วยงาน</th><th>รหัสพนักงาน</th><th>ชื่อพนักงานใหม่</th><th>ตำแหน่ง</th>
        <th>เริ่มงาน</th><th>อายุงาน</th><th>รอบการเยี่ยม</th><th>ปัญหาที่พบ</th><th>ผู้เยี่ยม</th><th>Action</th><th>ผู้รับผิดชอบ</th>
        <th>สถานะ</th><th>ติดตามถัดไป</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table></div>`;
    printIsolated('Walk Round Report', '', html);
  });
  document.getElementById('wr-export').addEventListener('click', () => {
    exportCsv('walk-round.csv', filtered().map((r) => ({
      วันที่เยี่ยม: r.VisitDate, หน่วยงาน: r.Department, รหัสพนักงาน: r.EmployeeID,
      ชื่อพนักงานใหม่: r.EmployeeName, ตำแหน่ง: r.Position || '', เริ่มงาน: r.HireDate || '', อายุงาน: ageDays(r.HireDate), รอบการเยี่ยม: r.VisitRound || '',
      ปัญหาที่พบ: r.IssuesFound || '', ผู้เยี่ยม: r.VisitorName, Action: r.ActionNeeded || '',
      ผู้รับผิดชอบ: r.ActionOwner || '', สถานะ: r.Status || '', วันติดตามถัดไป: r.NextFollowUpDate || '', หมายเหตุ: r.Note || '',
    })));
  });

  reload();
}

const WR_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WR_METRICS = [
  ['จำนวนครั้งที่เยี่ยม', 'visitCount'],
  ['จำนวนพนักงานที่ดูแล', 'staffCovered'],
  ['เรียบร้อย', 'completed'],
  ['รอติดตาม', 'pending'],
  ['ปัญหาที่พบ', 'issues'],
  ['ปิดได้', 'issuesResolved'],
];

function walkRoundMonthMetrics(rows) {
  return {
    visitCount: rows.length,
    staffCovered: new Set(rows.map((r) => r.EmployeeID).filter(Boolean)).size,
    completed: rows.filter((r) => r.Status === 'เรียบร้อย').length,
    pending: rows.filter((r) => r.Status !== 'เรียบร้อย').length,
    issues: rows.filter((r) => r.IssuesFound).length,
    issuesResolved: rows.filter((r) => r.IssuesFound && r.Status === 'เรียบร้อย').length,
  };
}

function buildWalkRoundUserPivot(allRows, year) {
  const inYear = allRows.filter((r) => String(r.VisitDate || '').slice(0, 4) === year);
  const byVisitor = {};
  inYear.forEach((r) => {
    const key = r.VisitorID || r.VisitorName || '—';
    if (!byVisitor[key]) byVisitor[key] = { visitorName: r.VisitorName || key, rows: [] };
    byVisitor[key].rows.push(r);
  });
  const monthRowsOf = (rows, i) => {
    const mm = String(i + 1).padStart(2, '0');
    return rows.filter((r) => String(r.VisitDate || '').slice(5, 7) === mm);
  };
  const visitors = Object.keys(byVisitor).map((key) => {
    const rows = byVisitor[key].rows;
    const monthly = WR_MONTH_LABELS.map((_, i) => walkRoundMonthMetrics(monthRowsOf(rows, i)));
    const ytd = walkRoundMonthMetrics(rows);
    return { visitorName: byVisitor[key].visitorName, monthly, ytd };
  }).sort((a, b) => b.ytd.visitCount - a.ytd.visitCount);
  const overallMonthly = WR_MONTH_LABELS.map((_, i) => walkRoundMonthMetrics(monthRowsOf(inYear, i)));
  const overallYtd = walkRoundMonthMetrics(inYear);
  return { visitors, overallMonthly, overallYtd };
}

function walkRoundUserPivotTableHtml(title, monthly, ytd) {
  const rows = WR_METRICS.map(([label, key]) => `
    <tr data-nosort><td>${escapeHtml(label)}</td>${monthly.map((m) => `<td>${m[key]}</td>`).join('')}<td><b>${ytd[key]}</b></td></tr>`).join('');
  return `
    <div class="print-section-block">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>รายการ</th>${WR_MONTH_LABELS.map((m) => `<th>${m}</th>`).join('')}<th>รวม</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderReportByUserTab(container) {
  container.innerHTML = `
    <div class="toolbar">
      <label style="font-size:13.5px; font-weight:600; color:var(--muted);">ปี</label>
      <select id="wru-year"></select>
      <span class="spacer"></span>
      <button id="wru-export" class="btn btn-secondary">Export Excel</button>
      <button id="wru-print" class="btn btn-primary">Print Report</button>
    </div>
    <div id="wru-body"><div class="empty-state">กำลังโหลด...</div></div>`;
  let allRows = [];

  function renderPivotUi() {
    const year = document.getElementById('wru-year').value;
    const pivot = buildWalkRoundUserPivot(allRows, year);
    const body = document.getElementById('wru-body');
    if (!body) return;
    if (!pivot.visitors.length) { body.innerHTML = '<div class="empty-state">ไม่มีข้อมูลในปีที่เลือก</div>'; return; }
    body.innerHTML = pivot.visitors.map((v) => walkRoundUserPivotTableHtml(v.visitorName, v.monthly, v.ytd)).join('')
      + walkRoundUserPivotTableHtml('รวมทุกคน (Total)', pivot.overallMonthly, pivot.overallYtd);
  }

  api.get('/api/walk-rounds').then((rows) => {
    allRows = rows;
    const years = [...new Set(rows.map((r) => String(r.VisitDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const currentYear = String(new Date().getFullYear());
    const defaultYear = years.includes(currentYear) ? currentYear : (years[0] || currentYear);
    const yearSelect = document.getElementById('wru-year');
    yearSelect.innerHTML = years.length
      ? years.map((y) => `<option value="${y}" ${y === defaultYear ? 'selected' : ''}>${y}</option>`).join('')
      : `<option value="${defaultYear}">${defaultYear}</option>`;
    yearSelect.addEventListener('change', renderPivotUi);
    renderPivotUi();
  }).catch((err) => toastError(err.message));

  document.getElementById('wru-print').addEventListener('click', () => {
    const year = document.getElementById('wru-year').value || '';
    const bodyEl = document.getElementById('wru-body');
    printIsolated('Walk Round — Report by ผู้เยี่ยม', year ? `ปี ${year}` : '', bodyEl ? bodyEl.innerHTML : '');
  });
  document.getElementById('wru-export').addEventListener('click', () => {
    const year = document.getElementById('wru-year').value;
    const pivot = buildWalkRoundUserPivot(allRows, year);
    const csvRows = [];
    pivot.visitors.forEach((v) => {
      WR_METRICS.forEach(([label, key]) => {
        const row = { ผู้เยี่ยม: v.visitorName, รายการ: label };
        WR_MONTH_LABELS.forEach((m, i) => { row[m] = v.monthly[i][key]; });
        row['รวม'] = v.ytd[key];
        csvRows.push(row);
      });
    });
    exportCsv(`walk-round-by-user-${year}.csv`, csvRows);
  });
}

function renderReportByDeptTab(container) {
  container.innerHTML = `
    <div class="toolbar"><span class="spacer"></span>
      <button id="wrd-export" class="btn btn-secondary">Export Excel</button>
      <button id="wrd-print" class="btn btn-primary">Print Report</button>
    </div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>หน่วยงาน</th><th>พนักงานใหม่ทั้งหมด</th><th>เยี่ยมแล้ว</th><th>% Coverage</th><th>ปัญหาที่พบบ่อย</th><th>Action ค้าง</th></tr></thead><tbody id="wr-report-dept-body"><tr><td colspan="6" class="empty-state">กำลังโหลด...</td></tr></tbody></table></div>`;
  let rows = [];
  api.get('/api/walk-rounds/report-by-department').then((data) => {
    rows = data;
    const body = document.getElementById('wr-report-dept-body');
    if (!body) return;
    body.innerHTML = rows.length === 0 ? '<tr><td colspan="6" class="empty-state">ไม่มีข้อมูล</td></tr>' : rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.department)}</td><td>${r.totalNewStaff}</td><td>${r.visitedStaff}</td><td>${r.coveragePct}%</td>
        <td>${r.topIssues.map((t) => escapeHtml(t.text)).join(', ') || '—'}</td><td>${r.pendingActions}</td>
      </tr>`).join('');
  }).catch((err) => toastError(err.message));
  document.getElementById('wrd-print').addEventListener('click', () => printReport('Walk Round — Report by หน่วยงาน', ''));
  document.getElementById('wrd-export').addEventListener('click', () => {
    exportCsv('walk-round-by-department.csv', rows.map((r) => ({
      หน่วยงาน: r.department, พนักงานใหม่ทั้งหมด: r.totalNewStaff, เยี่ยมแล้ว: r.visitedStaff, Coverage: `${r.coveragePct}%`,
      ปัญหาที่พบบ่อย: r.topIssues.map((t) => t.text).join('; '), Actionค้าง: r.pendingActions,
    })));
  });
}

const TABS = [
  { key: 'due', label: 'วันนี้ถึงกำหนด Walk Round', render: renderDueTab },
  { key: 'data', label: 'บันทึกการเยี่ยม', render: renderDataTab },
  { key: 'by-user', label: 'Report by ผู้เยี่ยม', render: renderReportByUserTab },
  { key: 'by-dept', label: 'Report by หน่วยงาน', render: renderReportByDeptTab },
];

export async function render(container) {
  container.innerHTML = `
    <div class="tabs" id="wr-tabs">
      ${TABS.map((t, i) => `<button type="button" class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="wr-tab-content"></div>`;

  const content = document.getElementById('wr-tab-content');
  TABS[0].render(content);

  document.querySelectorAll('#wr-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#wr-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      const tab = TABS.find((t) => t.key === btn.dataset.tab);
      if (tab) tab.render(content);
    });
  });
}
