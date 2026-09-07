import { api } from '../api.js';
import { cache, listValues, subServicesFor, positionJobFunctionMap } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH, formatYoS, debounce, exportCsv, parseCsv, printIsolated, qrSvgMarkup } from '../utils.js';

const STATUS_BADGE = { Active: 'badge-blue', Passed: 'badge-green', Extended: 'badge-gold', 'Not Passed': 'badge-red', Resign: 'badge-gray', Terminated: 'badge-gray' };

// รายงานพนักงาน: แสดงทุกฟิลด์จากหน้าแก้ไขข้อมูลพนักงาน (ข้อมูลทั่วไป + Orientation) + Meeting Schedule
// ยกเว้น: เบอร์มือถือ, Probationary Status, สิทธิ์การใช้งาน (Role), ประเภทการลาออก, วันที่ลาออก
async function printStaffReportCard(s) {
  const subServiceName = cache.subServices.find((x) => x.SubServiceID === s.SubServiceID)?.Name || '—';
  let meetings = [];
  try {
    const all = await api.get('/api/meetings');
    meetings = all.filter((m) => m.Attendees.some((a) => a.EmployeeID === s.EmployeeID));
  } catch { /* ประวัติการประชุมเป็นข้อมูลเสริม โหลดไม่สำเร็จไม่ควรทำให้พิมพ์รายงานหลักล้มเหลว */ }

  const fieldsTable = (fields) => `<table class="data-table vertical-fields"><tbody>${fields.map(([l, v]) => `<tr><th>${l}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
  const generalFields = [
    ['ชื่อเล่น', escapeHtml(s.NickName || '—')],
    ['Rehire', s.Rehire === 'TRUE' ? 'ใช่' : 'ไม่ใช่'],
    ['วันที่เริ่มงาน', formatDateTH(s.HireDate)],
    ['ตำแหน่ง', escapeHtml(s.Position || '—')],
    ['Cost Center', escapeHtml(s.CostCenterName || '—')],
    ['Job Function', escapeHtml(s.JobFunction || '—')],
    ['Sub Services', escapeHtml(subServiceName)],
    ['Preceptor/Mentor', escapeHtml(s.Preceptor || '—')],
    ['Manager', escapeHtml(s.ManagerName || '—')],
    ['Supervisor', escapeHtml(s.Supervisor || '—')],
    ['Full/Part Time', escapeHtml(s.FullPartTime || '—')],
    ['Eval Date 60 วัน', s.Eval60Date ? formatDateTH(s.Eval60Date) : '—'],
    ['Eval Date 119 วัน', s.Eval119Date ? formatDateTH(s.Eval119Date) : '—'],
    ['Note', escapeHtml(s.Note || '—')],
  ];
  const orientationFields = [
    ['Orientation เดือนที่ 1 (0-30 วัน)', s.Orient1Date ? formatDateTH(s.Orient1Date) : '—'],
    ['Orientation เดือนที่ 2 (31-60 วัน)', s.Orient2Date ? formatDateTH(s.Orient2Date) : '—'],
    ['Orientation เดือนที่ 3 (61-90 วัน)', s.Orient3Date ? formatDateTH(s.Orient3Date) : '—'],
    ['Orientation เดือนที่ 4 (91-119 วัน)', s.Orient4Date ? formatDateTH(s.Orient4Date) : '—'],
    ['วันที่ส่ง Orientation Checklist ให้ HR', s.OrientSentHRDate ? formatDateTH(s.OrientSentHRDate) : '—'],
    ['Apply Ladder After Probation', escapeHtml(s.ApplyLadderStatus || '—')],
    ['Unit Specific Competency', escapeHtml(s.UnitSpecificCompetency || '—')],
  ];
  const meetingsHtml = meetings.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>วันที่</th><th>หัวข้อ</th><th>สถานะ</th></tr></thead>
        <tbody>${meetings.map((m) => `<tr><td>${formatDateTH(m.Date)}</td><td>${escapeHtml(m.Title)}</td><td>${escapeHtml(m.Status)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-state">ยังไม่มีประวัติการเข้าร่วมประชุม</div>';

  const html = `
    <div class="staff-report-card">
      <div class="staff-report-head">
        <div class="staff-report-head-text">
          <p class="sr-name">${escapeHtml(s.ThaiName)}${s.NickName ? ` (${escapeHtml(s.NickName)})` : ''}</p>
          <p class="sr-position">${escapeHtml(s.Position || '—')}</p>
          <span class="sr-id">Employee ID: ${escapeHtml(s.EmployeeID)}</span>
        </div>
        <div class="staff-report-qr">
          ${qrSvgMarkup(s.EmployeeID)}
          <span>${escapeHtml(s.EmployeeID)}</span>
        </div>
      </div>
      <div class="staff-report-body">
        <div class="print-section-block">
          <div class="section-title" style="margin-top:0;">ข้อมูลทั่วไป</div>
          ${fieldsTable(generalFields)}
        </div>
        <div class="print-section-block">
          <div class="section-title">Orientation</div>
          ${fieldsTable(orientationFields)}
        </div>
        <div class="print-section-block">
          <div class="section-title">Meeting Schedule</div>
          ${meetingsHtml}
        </div>
      </div>
    </div>`;
  await printIsolated('รายงานพนักงาน', '', html);
}

// การ์ดพนักงานแบบสั้น (ใช้กับปุ่ม "Report" ในตารางรายชื่อ) — ต่างจาก printStaffReportCard ซึ่งเป็นรายงานฉบับเต็ม
// แสดง ชื่อ-นามสกุล/ชื่อเล่น/ตำแหน่ง/Employee ID + QR Code มุมขวาบน พร้อม Cost Center/Job Function/Sub Services/Manager
// (ไม่มีข้อมูลอื่นที่เหลือ/Orientation/Meeting Schedule เหมือนรายงานฉบับเต็ม)
function printStaffSimpleCard(s) {
  const subServiceName = cache.subServices.find((x) => x.SubServiceID === s.SubServiceID)?.Name || '—';
  const fields = [
    ['Cost Center', escapeHtml(s.CostCenterName || '—')],
    ['Job Function', escapeHtml(s.JobFunction || '—')],
    ['Sub Services', escapeHtml(subServiceName)],
    ['Manager', escapeHtml(s.ManagerName || '—')],
  ];
  const html = `
    <div class="staff-report-card">
      <div class="staff-report-head">
        <div class="staff-report-head-text">
          <p class="sr-name">${escapeHtml(s.ThaiName)}${s.NickName ? ` (${escapeHtml(s.NickName)})` : ''}</p>
          <p class="sr-position">${escapeHtml(s.Position || '—')}</p>
          <span class="sr-id">Employee ID: ${escapeHtml(s.EmployeeID)}</span>
        </div>
        <div class="staff-report-qr">
          ${qrSvgMarkup(s.EmployeeID)}
          <span>${escapeHtml(s.EmployeeID)}</span>
        </div>
      </div>
      <div class="staff-report-body">
        <table class="data-table vertical-fields"><tbody>${fields.map(([l, v]) => `<tr><th>${l}</th><td>${v}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  printIsolated('รายงานพนักงาน', '', html);
}

// ถามจำนวนดวง QR (1-10) ก่อนพิมพ์ — ทั้งหมดจัดวางในหน้า A4 ใบเดียว
function promptQrCopies(s) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.innerHTML = `
      <p class="confirm-message">พิมพ์ QR Code ของ ${escapeHtml(s.ThaiName)} (${escapeHtml(s.EmployeeID)})</p>
      <div class="field"><label>จำนวน QR Code (1-10)</label><input type="number" id="qr-copies-prompt" value="1" min="1" max="10" /></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">ยกเลิก</button>
        <button class="btn btn-primary" data-act="ok">พิมพ์</button>
      </div>`;
    const body = openModal('Print QR Code', box);
    body.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const n = Math.min(10, Math.max(1, Number(body.querySelector('#qr-copies-prompt').value) || 1));
      closeModal();
      resolve(n);
    });
    body.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      closeModal();
      resolve(null);
    });
  });
}

async function printStaffQrBulk(staffList, copies = 1) {
  const n = Math.min(10, Math.max(1, Number(copies) || 1));
  const cardHtml = (s) => `
    <div class="qr-badge-card" style="page-break-inside:avoid; break-inside:avoid; margin:0 0 24px;">
      ${qrSvgMarkup(s.EmployeeID, 6)}
      <div class="qr-badge-name">${escapeHtml(s.ThaiName)}</div>
      <div class="qr-badge-id">${escapeHtml(s.EmployeeID)}</div>
    </div>`;
  const cards = staffList.flatMap((s) => Array.from({ length: n }, () => cardHtml(s))).join('');
  const html = `<div style="display:flex; flex-wrap:wrap; gap:20px; justify-content:center;">${cards}</div>`;
  await printIsolated('QR Code พนักงาน', '', html);
}

function opts(list, selected, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
}
function ccOpts(selected) {
  return `<option value="">— เลือก —</option>${cache.costCenters.map((c) => `<option value="${c.CostCenterID}" data-name="${escapeHtml(c.Name)}" ${c.CostCenterID === selected ? 'selected' : ''}>${escapeHtml(c.Code || '')} ${escapeHtml(c.Name)}</option>`).join('')}`;
}
function ssOpts(costCenterId, selected) {
  return `<option value="">— เลือก —</option>${subServicesFor(costCenterId).map((s) => `<option value="${s.SubServiceID}" ${s.SubServiceID === selected ? 'selected' : ''}>${escapeHtml(s.Name)}</option>`).join('')}`;
}

// ---------- แท็บ Orientation / Evaluation / Consultation History / Meetings (ใน modal แก้ไขพนักงาน) ----------
async function loadEvalTab(container, empId) {
  container.innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  const evals = await api.get(`/api/evaluations/staff/${empId}`);
  container.innerHTML = evals.length === 0 ? '<div class="empty-state">ยังไม่มีผลการประเมิน</div>' : `
    <table class="data-table"><thead><tr><th>รอบ</th><th>วันที่</th><th>ผล</th><th>ความเห็น</th></tr></thead>
    <tbody>${evals.map((e) => `<tr><td>${e.Period} วัน</td><td>${formatDateTH(e.EvalDate)}</td><td>${escapeHtml(e.Result)}</td><td>${escapeHtml(e.Comment || '—')}</td></tr>`).join('')}</tbody></table>`;
}
async function loadConsultTab(container, empId) {
  container.innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  const rows = await api.get(`/api/consultations?employeeId=${empId}`);
  container.innerHTML = rows.length === 0 ? '<div class="empty-state">ยังไม่มีประวัติการให้คำปรึกษา</div>' : `
    <table class="data-table"><thead><tr><th>วันที่</th><th>หัวข้อ</th><th>ผล</th><th>Follow-up</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${formatDateTH(r.Date)}</td><td>${escapeHtml(r.Topic)}</td><td>${escapeHtml(r.Result)}</td><td>${r.FollowUpDate ? formatDateTH(r.FollowUpDate) : '—'}</td></tr>`).join('')}</tbody></table>`;
}
async function loadMeetingsTab(container, empId) {
  container.innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  const all = await api.get('/api/meetings');
  const mine = all.filter((m) => m.Attendees.some((a) => a.EmployeeID === empId));
  container.innerHTML = mine.length === 0 ? '<div class="empty-state">ยังไม่มีประวัติการเข้าร่วมประชุม</div>' : `
    <table class="data-table"><thead><tr><th>วันที่</th><th>หัวข้อ</th><th>สถานะ</th></tr></thead>
    <tbody>${mine.map((m) => `<tr><td>${formatDateTH(m.Date)}</td><td>${escapeHtml(m.Title)}</td><td>${escapeHtml(m.Status)}</td></tr>`).join('')}</tbody></table>`;
}

// initialTab: แท็บที่เปิดขึ้นมาให้เห็นทันที — ใช้ตอนกด "แก้ไข" จากตารางแจ้งเตือน (Apply Ladder/Orientation Checklist
// อยู่ในแท็บ "orientation") จะได้ไม่ต้องกดสลับแท็บเองก่อนเห็นฟิลด์ที่เกี่ยวข้อง ค่าเริ่มต้นยังเป็น 'general' เหมือนเดิม
export function staffForm(staff, onSaved, initialTab = 'general') {
  const isEdit = !!staff;
  const tabActive = (tab) => (tab === initialTab ? 'active' : '');
  const paneHidden = (tab) => (tab === initialTab ? '' : 'hidden');
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="tabs" id="sf-tabs">
      <button type="button" class="tab-btn ${tabActive('general')}" data-tab="general">ข้อมูลทั่วไป</button>
      <button type="button" class="tab-btn ${tabActive('orientation')}" data-tab="orientation">Orientation</button>
      ${isEdit ? `<button type="button" class="tab-btn ${tabActive('eval')}" data-tab="eval">การประเมิน</button>` : ''}
      ${isEdit ? `<button type="button" class="tab-btn ${tabActive('consult')}" data-tab="consult">ประวัติคำปรึกษา</button>` : ''}
      ${isEdit ? `<button type="button" class="tab-btn ${tabActive('meetings')}" data-tab="meetings">Meetings</button>` : ''}
    </div>
    <form id="staff-form">
      <div class="tab-pane ${paneHidden('general')}" data-pane="general">
        <div class="form-grid">
          <div class="field"><label>Employee ID *</label><input id="f-EmployeeID" value="${escapeHtml(staff?.EmployeeID || '')}" ${isEdit ? 'disabled' : ''} required /></div>
          <div class="field"><label>ชื่อ-นามสกุล *</label><input id="f-ThaiName" value="${escapeHtml(staff?.ThaiName || '')}" required /></div>
          <div class="field"><label>ชื่อเล่น *</label><input id="f-NickName" value="${escapeHtml(staff?.NickName || '')}" required /></div>
          <div class="field"><label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" id="f-Rehire" style="width:auto;" ${staff?.Rehire === 'TRUE' ? 'checked' : ''} /> Rehire</label></div>
          <div class="field"><label>วันที่เริ่มงาน *</label><input type="date" id="f-HireDate" value="${staff?.HireDate || ''}" required /></div>
          <div class="field"><label>ตำแหน่ง</label><select id="f-Position">${opts(listValues('Position'), staff?.Position, '-- เลือก --')}</select></div>
          <div class="field"><label>Cost Center</label><select id="f-CostCenterID">${ccOpts(staff?.CostCenterID)}</select></div>
          <div class="field"><label>Cost Center Name</label><input id="f-CostCenterName" value="${escapeHtml(staff?.CostCenterName || '')}" disabled /></div>
          <div class="field"><label>Job Function</label><select id="f-JobFunction">${opts(listValues('JobFunction'), staff?.JobFunction, '-- เลือก --')}</select></div>
          <div class="field"><label>Sub Services</label><select id="f-SubServiceID">${ssOpts(staff?.CostCenterID || '', staff?.SubServiceID)}</select></div>
          <div class="field"><label>Preceptor/Mentor</label><input id="f-Preceptor" value="${escapeHtml(staff?.Preceptor || '')}" /></div>
          <div class="field"><label>Manager</label><input id="f-ManagerName" value="${escapeHtml(staff?.ManagerName || '')}" /></div>
          <div class="field"><label>Supervisor</label><input id="f-Supervisor" value="${escapeHtml(staff?.Supervisor || '')}" /></div>
          <div class="field"><label>Full/Part Time</label><select id="f-FullPartTime">${opts(listValues('FullPartTime'), staff?.FullPartTime || 'Full Time', '-- เลือก --')}</select></div>
          <div class="field"><label>Probationary Status</label><select id="f-ProbationaryStatus">${opts(listValues('ProbationaryStatus'), staff?.ProbationaryStatus || 'Active', '-- เลือก --')}</select></div>
          <div class="field"><label>Eval Date 60 วัน (คำนวณอัตโนมัติ)</label><input id="f-Eval60Date" value="${staff?.Eval60Date ? formatDateTH(staff.Eval60Date) : 'กรุณาเลือกวันที่เริ่มงานก่อน'}" disabled /></div>
          <div class="field"><label>Eval Date 119 วัน (คำนวณอัตโนมัติ)</label><input id="f-Eval119Date" value="${staff?.Eval119Date ? formatDateTH(staff.Eval119Date) : 'กรุณาเลือกวันที่เริ่มงานก่อน'}" disabled /></div>
          <div class="field"><label>เบอร์มือถือ * (ใช้เข้าสู่ระบบ)</label><input type="tel" id="f-Phone" inputmode="numeric" value="${escapeHtml(staff?.Phone || '')}" required /></div>
          <div class="field"><label>ประเภทการลาออก (ถ้ามี)</label><select id="f-ResignationType">${opts(listValues('ResignationType'), staff?.ResignationType, '-- ไม่มี --')}</select></div>
          <div class="field"><label>วันที่ลาออก (ถ้ามี)</label><input type="date" id="f-ResignDate" value="${staff?.ResignDate || ''}" /></div>
          <div class="field field-full"><label>Note</label><textarea id="f-Note" rows="2">${escapeHtml(staff?.Note || '')}</textarea></div>
        </div>
      </div>
      <div class="tab-pane ${paneHidden('orientation')}" data-pane="orientation">
        <div class="form-grid">
          <div class="field"><label>Orientation เดือนที่ 1 (0-30 วัน)</label><input type="date" id="f-Orient1Date" value="${staff?.Orient1Date || ''}" /></div>
          <div class="field"><label>Orientation เดือนที่ 2 (31-60 วัน)</label><input type="date" id="f-Orient2Date" value="${staff?.Orient2Date || ''}" /></div>
          <div class="field"><label>Orientation เดือนที่ 3 (61-90 วัน)</label><input type="date" id="f-Orient3Date" value="${staff?.Orient3Date || ''}" /></div>
          <div class="field"><label>Orientation เดือนที่ 4 (91-119 วัน)</label><input type="date" id="f-Orient4Date" value="${staff?.Orient4Date || ''}" /></div>
          <div class="field"><label>วันที่ส่ง Orientation Checklist ให้ HR</label><input type="date" id="f-OrientSentHRDate" value="${staff?.OrientSentHRDate || ''}" /></div>
          <div class="field"><label>Apply Ladder After Probation</label><select id="f-ApplyLadderStatus">${opts(listValues('ApplyLadderStatus'), staff?.ApplyLadderStatus || 'NA', '-- เลือก --')}</select></div>
          <div class="field field-full"><label>Unit Specific Competency</label><textarea id="f-UnitSpecificCompetency" rows="2">${escapeHtml(staff?.UnitSpecificCompetency || '')}</textarea></div>
        </div>
      </div>
      ${isEdit ? `<div class="tab-pane ${paneHidden('eval')}" data-pane="eval"></div>` : ''}
      ${isEdit ? `<div class="tab-pane ${paneHidden('consult')}" data-pane="consult"></div>` : ''}
      ${isEdit ? `<div class="tab-pane ${paneHidden('meetings')}" data-pane="meetings"></div>` : ''}
      <div class="modal-actions">
        ${isEdit ? '<button type="button" class="btn btn-secondary" id="staff-print" style="margin-right:auto;">Print รายละเอียดพนักงาน</button>' : ''}
        <button type="button" class="btn btn-ghost" id="staff-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`;
  const body = openModal(isEdit ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มข้อมูลพนักงาน', wrap, { wide: true });
  body.querySelector('#staff-cancel').addEventListener('click', closeModal);

  // อ่านค่าฟิลด์ที่กำลังพิมพ์อยู่ในฟอร์มขณะนั้น ๆ (ใช้ร่วมกันทั้งตอนบันทึกและตอนพิมพ์รายงาน จากปุ่มพิมพ์ในฟอร์มแก้ไข)
  // เพื่อไม่ให้ "Print รายละเอียดพนักงาน" แสดงข้อมูลเก่าก่อนแก้ไข ถ้าผู้ใช้ยังไม่ได้กดบันทึกก่อนพิมพ์
  function collectFormFields() {
    const g = (id) => body.querySelector(id).value.trim();
    return {
      ThaiName: g('#f-ThaiName'), NickName: g('#f-NickName'),
      Rehire: body.querySelector('#f-Rehire').checked ? 'TRUE' : 'FALSE',
      HireDate: g('#f-HireDate'), Position: g('#f-Position'),
      CostCenterID: g('#f-CostCenterID'), CostCenterName: g('#f-CostCenterName'), JobFunction: g('#f-JobFunction'),
      SubServiceID: g('#f-SubServiceID'), Preceptor: g('#f-Preceptor'), ManagerName: g('#f-ManagerName'),
      Supervisor: g('#f-Supervisor'), FullPartTime: g('#f-FullPartTime'), ProbationaryStatus: g('#f-ProbationaryStatus'),
      Phone: g('#f-Phone'), ResignationType: g('#f-ResignationType'), ResignDate: g('#f-ResignDate'),
      Note: g('#f-Note'),
      Orient1Date: g('#f-Orient1Date'), Orient2Date: g('#f-Orient2Date'), Orient3Date: g('#f-Orient3Date'), Orient4Date: g('#f-Orient4Date'),
      OrientSentHRDate: g('#f-OrientSentHRDate'), ApplyLadderStatus: g('#f-ApplyLadderStatus'), UnitSpecificCompetency: g('#f-UnitSpecificCompetency'),
    };
  }
  if (isEdit) body.querySelector('#staff-print').addEventListener('click', () => printStaffReportCard({ ...staff, ...collectFormFields() }));

  const loaded = { eval: false, consult: false, meetings: false };
  body.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      body.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      body.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== btn.dataset.tab));
      const pane = body.querySelector(`.tab-pane[data-pane="${btn.dataset.tab}"]`);
      if (btn.dataset.tab === 'eval' && !loaded.eval) { loaded.eval = true; loadEvalTab(pane, staff.EmployeeID); }
      if (btn.dataset.tab === 'consult' && !loaded.consult) { loaded.consult = true; loadConsultTab(pane, staff.EmployeeID); }
      if (btn.dataset.tab === 'meetings' && !loaded.meetings) { loaded.meetings = true; loadMeetingsTab(pane, staff.EmployeeID); }
    });
  });

  function recalcEvalDates() {
    const hd = body.querySelector('#f-HireDate').value;
    if (!hd) return;
    const d60 = new Date(hd); d60.setDate(d60.getDate() + 60);
    const d119 = new Date(hd); d119.setDate(d119.getDate() + 119);
    body.querySelector('#f-Eval60Date').value = formatDateTH(d60.toISOString().slice(0, 10));
    body.querySelector('#f-Eval119Date').value = formatDateTH(d119.toISOString().slice(0, 10));
  }
  body.querySelector('#f-HireDate').addEventListener('change', recalcEvalDates);

  body.querySelector('#f-CostCenterID').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    body.querySelector('#f-CostCenterName').value = opt?.dataset.name || '';
    const subSelect = body.querySelector('#f-SubServiceID');
    const prevValue = subSelect.value;
    const matches = subServicesFor(e.target.value);
    // คง Sub Service เดิมไว้ถ้ายังอยู่ใน Cost Center ใหม่ / auto-fill ให้อัตโนมัติถ้า Cost Center นี้มี Sub Service เดียว
    const keepValue = matches.some((m) => m.SubServiceID === prevValue) ? prevValue : (matches.length === 1 ? matches[0].SubServiceID : '');
    subSelect.innerHTML = ssOpts(e.target.value, keepValue);
  });

  body.querySelector('#f-Position').addEventListener('change', (e) => {
    const jobFunction = positionJobFunctionMap()[e.target.value];
    if (jobFunction) body.querySelector('#f-JobFunction').value = jobFunction;
  });

  body.querySelector('#staff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { EmployeeID: body.querySelector('#f-EmployeeID').value.trim(), ...collectFormFields() };
    try {
      await withLoading(() => (isEdit ? api.put(`/api/staff/${staff.EmployeeID}`, payload) : api.post('/api/staff', payload)));
      toastSuccess('บันทึกข้อมูลพนักงานสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

const TABS = [
  { key: 'onProbation', label: 'On Probation', filter: (s) => s.ProbationaryStatus === 'Active' },
  { key: 'onboarding', label: 'Onboarding (120วัน-1ปี)', filter: (s) => s.ProbationaryStatus !== 'Resign' && s.ProbationaryStatus !== 'Terminated' && s.HireDate && daysSince(s.HireDate) > 119 && daysSince(s.HireDate) <= 365 },
  { key: 'existing', label: 'Existing (>1ปี)', filter: (s) => s.ProbationaryStatus !== 'Resign' && s.ProbationaryStatus !== 'Terminated' && s.HireDate && daysSince(s.HireDate) > 365 },
  { key: 'resignation', label: 'Resignation Detail', filter: (s) => s.ProbationaryStatus === 'Resign' || s.ProbationaryStatus === 'Terminated' },
];
function daysSince(hireDate) {
  return Math.round((Date.now() - new Date(`${hireDate}T00:00:00`).getTime()) / 86400000);
}

export async function render(container) {
  container.innerHTML = `
    <div id="directory-alerts"></div>
    <div class="toolbar">
      <input id="staff-search" class="field" style="max-width:240px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID/ชื่อ/ตำแหน่ง" />
      <select id="f-status">${opts(listValues('ProbationaryStatus'), '', 'ทุก Status')}</select>
      <select id="f-position">${opts(listValues('Position'), '', 'ทุกตำแหน่ง')}</select>
      <select id="f-subservice">${opts(cache.subServices.map((s) => s.Name), '', 'ทุก Sub Services')}</select>
      <select id="f-costcenter">${opts(cache.costCenters.map((c) => c.Name), '', 'ทุก Cost Center')}</select>
      <button id="filter-reset" class="btn btn-ghost">Reset</button>
      <span class="spacer"></span>
      <button id="template-btn" class="btn btn-ghost">ดาวน์โหลด Template</button>
      <label class="btn btn-ghost" style="cursor:pointer;" title="วันที่เริ่มงานในไฟล์รับได้หลายรูปแบบ: yyyy-mm-dd, dd/mm/yyyy, dd/mm/yy หรือเซลล์วันที่ที่ Excel export เป็นตัวเลขล้วน ระบบแปลงให้อัตโนมัติ">Import Excel<input type="file" id="import-file" accept=".csv" class="hidden" /></label>
      <button id="export-btn" class="btn btn-secondary">Export Excel</button>
      <button id="print-tab-btn" class="btn btn-primary">Print</button>
      <button id="add-staff-btn" class="btn btn-primary">+ เพิ่มพนักงาน</button>
    </div>
    <div class="toolbar">
      <span id="staff-selected-count" style="font-size:13.5px; color:var(--muted);">ยังไม่ได้เลือกพนักงาน</span>
      <span class="spacer"></span>
      <button id="print-qr-selected-btn" class="btn btn-secondary" disabled>Print QR Code ที่เลือก</button>
    </div>
    <div class="tabs" id="directory-tabs">
      ${TABS.map((t, i) => `<button type="button" class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label} <span class="tab-count" id="count-${t.key}">0</span></button>`).join('')}
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th><input type="checkbox" id="staff-select-all" /></th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ชื่อเล่น</th><th>ตำแหน่ง</th><th>Cost Center</th><th>Sub Services</th><th>เริ่มงาน</th><th>YoS</th><th>Preceptor/Mentor</th><th>Manager</th><th>Status</th><th></th></tr></thead>
        <tbody id="staff-body"></tbody>
      </table>
    </div>`;

  let allStaff = [];
  let activeTab = TABS[0].key;
  const selectedIds = new Set();

  function updateSelectionUi() {
    const countEl = document.getElementById('staff-selected-count');
    const printBtn = document.getElementById('print-qr-selected-btn');
    if (!countEl || !printBtn) return;
    countEl.textContent = selectedIds.size ? `เลือกแล้ว ${selectedIds.size} คน` : 'ยังไม่ได้เลือกพนักงาน';
    printBtn.disabled = selectedIds.size === 0;
    const selectAll = document.getElementById('staff-select-all');
    if (selectAll) {
      const visibleIds = currentRows().map((s) => s.EmployeeID);
      selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    }
  }

  function currentRows() {
    const search = document.getElementById('staff-search').value.trim().toLowerCase();
    const status = document.getElementById('f-status').value;
    const position = document.getElementById('f-position').value;
    const subservice = document.getElementById('f-subservice').value;
    const costcenter = document.getElementById('f-costcenter').value;
    const tabDef = TABS.find((t) => t.key === activeTab);
    let rows = allStaff.filter(tabDef.filter);
    if (search) rows = rows.filter((s) => `${s.EmployeeID} ${s.ThaiName} ${s.NickName} ${s.Position}`.toLowerCase().includes(search));
    if (status) rows = rows.filter((s) => s.ProbationaryStatus === status);
    if (position) rows = rows.filter((s) => s.Position === position);
    if (subservice) rows = rows.filter((s) => s.SubServiceID && cache.subServices.find((x) => x.SubServiceID === s.SubServiceID)?.Name === subservice);
    if (costcenter) rows = rows.filter((s) => s.CostCenterName === costcenter);
    return rows;
  }

  function renderCounts() {
    TABS.forEach((t) => { document.getElementById(`count-${t.key}`).textContent = allStaff.filter(t.filter).length; });
  }

  function renderTable() {
    const rows = currentRows();
    const body = document.getElementById('staff-body');
    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="13" class="empty-state">ไม่พบข้อมูล</td></tr>';
      updateSelectionUi();
      return;
    }
    body.innerHTML = rows.map((s) => `
      <tr>
        <td><input type="checkbox" class="staff-select" data-id="${escapeHtml(s.EmployeeID)}" ${selectedIds.has(s.EmployeeID) ? 'checked' : ''} /></td>
        <td>${escapeHtml(s.EmployeeID)}</td>
        <td>${escapeHtml(s.ThaiName)}</td>
        <td>${escapeHtml(s.NickName)}</td>
        <td>${escapeHtml(s.Position)}</td>
        <td>${escapeHtml(s.CostCenterName || '')}</td>
        <td>${escapeHtml(cache.subServices.find((x) => x.SubServiceID === s.SubServiceID)?.Name || '')}</td>
        <td>${formatDateTH(s.HireDate)}</td>
        <td>${formatYoS(s.HireDate)}</td>
        <td>${escapeHtml(s.Preceptor || '—')}</td>
        <td>${escapeHtml(s.ManagerName || '—')}</td>
        <td><span class="badge ${STATUS_BADGE[s.ProbationaryStatus] || 'badge-gray'}">${escapeHtml(s.ProbationaryStatus || '—')}</span></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${s.EmployeeID}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-report="${s.EmployeeID}" title="พิมพ์รายงานพนักงาน">Report</button>
          <button class="btn btn-ghost btn-sm" data-qr="${s.EmployeeID}" title="พิมพ์ QR Code">QR</button>
          <button class="btn btn-danger btn-sm" data-del="${s.EmployeeID}">Del</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('.staff-select').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => staffForm(allStaff.find((x) => x.EmployeeID === btn.dataset.edit), reload));
    });
    body.querySelectorAll('[data-report]').forEach((btn) => {
      btn.addEventListener('click', () => printStaffSimpleCard(allStaff.find((x) => x.EmployeeID === btn.dataset.report)));
    });
    body.querySelectorAll('[data-qr]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = allStaff.find((x) => x.EmployeeID === btn.dataset.qr);
        const n = await promptQrCopies(s);
        if (n) printStaffQrBulk([s], n);
      });
    });
    body.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog(`ต้องการปิดการใช้งาน ${btn.dataset.del} หรือไม่?`))) return;
        try {
          await withLoading(() => api.del(`/api/staff/${btn.dataset.del}`));
          toastSuccess('ปิดการใช้งานสำเร็จ');
          reload();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  async function reload() {
    allStaff = await api.get('/api/staff');
    renderCounts();
    renderTable();
  }

  async function loadLadderReminders() {
    const box = document.getElementById('directory-alerts');
    if (!box) return;
    try {
      const reminders = await api.get('/api/dashboard/reminders');
      box.innerHTML = reminders.ladderDue?.length ? `
        <div class="alert-banner alert-banner-gold">แจ้งเตือน: ต้องดำเนินการ Apply Ladder Status (เดือนที่ 5, 8, 10) — ${reminders.ladderDue.length} รายการ</div>
        <div class="card" style="margin-bottom:14px;">
          <div class="table-wrap">
            <table class="data-table"><thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th>Apply Ladder After Probation</th><th></th></tr></thead>
            <tbody>${reminders.ladderDue.map((r) => `<tr><td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>เดือนที่ ${r.Month}</td><td>${escapeHtml(r.ApplyLadderStatus)}</td><td><button class="btn btn-ghost btn-sm" data-edit-ladder="${escapeHtml(r.EmployeeID)}">Edit</button></td></tr>`).join('')}</tbody></table>
          </div>
        </div>` : '';
      box.querySelectorAll('[data-edit-ladder]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const staff = allStaff.find((x) => x.EmployeeID === btn.dataset.editLadder);
          if (!staff) return;
          staffForm(staff, async () => { await reload(); await loadLadderReminders(); }, 'orientation');
        });
      });
    } catch { /* แจ้งเตือนเป็นข้อมูลเสริม โหลดไม่สำเร็จไม่ควรทำให้หน้าหลักใช้งานไม่ได้ */ }
  }
  loadLadderReminders();

  document.querySelectorAll('#directory-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#directory-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      activeTab = btn.dataset.tab;
      renderTable();
    });
  });

  document.getElementById('template-btn').addEventListener('click', () => {
    exportCsv('staff-import-template.csv', [{
      EmployeeID: '306550', 'ชื่อ-นามสกุล': 'ตัวอย่าง ทดสอบ', ชื่อเล่น: 'เนย', HireDate: '2026-01-16',
      Position: 'Registered Nurse level 1', CostCenterID: '', CostCenterName: '', JobFunction: 'Registered Nurse',
      SubServiceID: '', Preceptor: 'พี่เลี้ยงตัวอย่าง', ManagerName: 'หัวหน้าตัวอย่าง', FullPartTime: 'Full Time',
      ProbationaryStatus: 'Active', Orient1Date: '', Orient2Date: '', Orient3Date: '', Orient4Date: '',
      OrientSentHRDate: '', ApplyLadderStatus: 'NA', UnitSpecificCompetency: '', Phone: '0812345678', Note: '',
    }]);
  });
  document.getElementById('add-staff-btn').addEventListener('click', () => staffForm(null, reload));
  ['staff-search'].forEach((id) => document.getElementById(id).addEventListener('input', debounce(renderTable, 200)));
  ['f-status', 'f-position', 'f-subservice', 'f-costcenter'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('filter-reset').addEventListener('click', () => {
    document.getElementById('staff-search').value = '';
    ['f-status', 'f-position', 'f-subservice', 'f-costcenter'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });

  document.getElementById('staff-select-all').addEventListener('change', (e) => {
    currentRows().forEach((s) => { if (e.target.checked) selectedIds.add(s.EmployeeID); else selectedIds.delete(s.EmployeeID); });
    renderTable();
  });
  document.getElementById('print-qr-selected-btn').addEventListener('click', () => {
    const staffList = allStaff.filter((s) => selectedIds.has(s.EmployeeID));
    if (staffList.length === 0) return;
    printStaffQrBulk(staffList, 1);
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const rows = currentRows().map((s) => ({
      EmployeeID: s.EmployeeID, 'ชื่อ-นามสกุล': s.ThaiName, ชื่อเล่น: s.NickName, HireDate: s.HireDate,
      Position: s.Position, CostCenterID: s.CostCenterID, CostCenterName: s.CostCenterName, JobFunction: s.JobFunction,
      SubServiceID: s.SubServiceID, Preceptor: s.Preceptor, ManagerName: s.ManagerName, FullPartTime: s.FullPartTime,
      ProbationaryStatus: s.ProbationaryStatus, Eval60Date: s.Eval60Date, Eval119Date: s.Eval119Date,
      Orient1Date: s.Orient1Date, Orient2Date: s.Orient2Date, Orient3Date: s.Orient3Date, Orient4Date: s.Orient4Date,
      OrientSentHRDate: s.OrientSentHRDate, ApplyLadderStatus: s.ApplyLadderStatus, UnitSpecificCompetency: s.UnitSpecificCompetency,
      Phone: s.Phone, Note: s.Note,
    }));
    exportCsv('staff-directory.csv', rows);
  });

  document.getElementById('print-tab-btn').addEventListener('click', () => {
    const rows = currentRows();
    const tabLabel = TABS.find((t) => t.key === activeTab)?.label || '';
    const bodyRows = rows.length === 0 ? '<tr><td colspan="10" class="empty-state">ไม่พบข้อมูล</td></tr>' : rows.map((s) => `
      <tr>
        <td>${escapeHtml(s.EmployeeID)}</td><td>${escapeHtml(s.ThaiName)}</td><td>${escapeHtml(s.NickName)}</td>
        <td>${escapeHtml(s.Position)}</td><td>${escapeHtml(s.CostCenterName || '')}</td>
        <td>${escapeHtml(cache.subServices.find((x) => x.SubServiceID === s.SubServiceID)?.Name || '')}</td>
        <td>${formatDateTH(s.HireDate)}</td><td>${formatYoS(s.HireDate)}</td>
        <td>${escapeHtml(s.ManagerName || '—')}</td><td>${escapeHtml(s.ProbationaryStatus || '—')}</td>
      </tr>`).join('');
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ชื่อเล่น</th><th>ตำแหน่ง</th><th>Cost Center</th><th>Sub Services</th><th>เริ่มงาน</th><th>YoS</th><th>Manager</th><th>Status</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table></div>`;
    printIsolated(`Staff Directory — ${tabLabel}`, '', html);
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text).map((r) => ({ ...r, ThaiName: r['ชื่อ-นามสกุล'] || r.ThaiName, NickName: r['ชื่อเล่น'] || r.NickName }));
    try {
      const result = await withLoading(() => api.post('/api/staff/import', { rows: parsed }));
      toastSuccess(`นำเข้าสำเร็จ: เพิ่มใหม่ ${result.created}, อัปเดต ${result.updated}${result.errors.length ? `, ผิดพลาด ${result.errors.length} แถว` : ''}`);
      reload();
    } catch (err) {
      toastError(err.message);
    }
    e.target.value = '';
  });

  await reload();
}
