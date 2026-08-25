import { api } from '../api.js';
import { cache, loadReferenceData } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, exportCsv, parseCsv } from '../utils.js';
import { attachStaffSearch } from '../components/staffSearch.js';

const LIST_CATEGORIES = [
  { key: 'Position', label: 'รายการตำแหน่ง (Position)' },
  { key: 'JobFunction', label: 'รายการ Job Function' },
  { key: 'ConsultationTopic', label: 'หัวข้อปัญหา (Consultation Topics)' },
  { key: 'ConsultationResult', label: 'ผลการให้คำปรึกษา (Consultation Results)' },
  { key: 'ProbationaryStatus', label: 'Probationary Status' },
  { key: 'MeetingStatus', label: 'สถานะการประชุม' },
  { key: 'ApplyLadderStatus', label: 'Status Apply Ladder' },
  { key: 'EvalResult', label: 'ผลการประเมิน' },
  { key: 'HRSendStatus', label: 'Status ส่ง HR' },
  { key: 'FullPartTime', label: 'Full/Part Time' },
  { key: 'ResignationType', label: 'Resignation Type' },
];

// Walk Round มีแท็บของตัวเองแยกต่างหาก (ไม่ปนกับรายการ Dropdown/Tag ทั่วไป) — สถานะการเยี่ยมยังเป็น list กลางแบบเดิม
// ส่วนหัวข้อเช็กลิสต์ใช้ตัวจัดการเฉพาะด้านล่าง (checklistEditorHtml/loadChecklistItems) เพราะแต่ละหัวข้อมีตัวเลือก "ผล" ของตัวเอง
const WALKROUND_CATEGORIES = [
  { key: 'WalkRoundStatus', label: 'สถานะการเยี่ยม' },
];

function checklistEditorHtml() {
  return `
    <div class="card">
      <h3>หัวข้อเช็กลิสต์ + ตัวเลือก "ผล" (แต่ละหัวข้อกำหนดตัวเลือกผลของตัวเองได้)</h3>
      <div id="wr-checklist-items"></div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="wr-new-checklist-text" placeholder="เพิ่มหัวข้อเช็กลิสต์ใหม่..." style="flex:1;" />
        <button type="button" class="btn btn-secondary btn-sm" id="wr-add-checklist-item">+ เพิ่มหัวข้อ</button>
      </div>
    </div>`;
}

function checklistItemCardHtml(it) {
  return `
    <div class="card" style="padding:14px 16px; margin-bottom:10px;" data-item="${it.ListID}">
      <div class="wr-item-section">
        <label class="wr-item-section-label">หัวข้อเช็กลิสต์</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input class="wr-item-text" value="${escapeHtml(it.text)}" style="flex:1; font-weight:600;" />
          <button type="button" class="btn btn-secondary btn-sm wr-item-save">บันทึก</button>
          <button type="button" class="btn btn-danger btn-sm wr-item-del">ลบ</button>
        </div>
      </div>
      <div class="wr-item-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--line-soft);">
        <label class="wr-item-section-label">ตัวเลือก "ผล"</label>
        <div class="tag-list wr-item-options"></div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input class="wr-item-new-opt" placeholder="เพิ่มตัวเลือกผล..." style="flex:1;" />
          <button type="button" class="btn btn-ghost btn-sm wr-item-add-opt">+ เพิ่มตัวเลือก</button>
        </div>
      </div>
    </div>`;
}

async function loadChecklistItems() {
  const items = await api.get('/api/walk-rounds/checklist');
  const box = document.getElementById('wr-checklist-items');
  if (!box) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอโหลด
  box.innerHTML = items.length ? items.map(checklistItemCardHtml).join('') : '<span class="empty-state">ยังไม่มีหัวข้อเช็กลิสต์</span>';

  items.forEach((it) => {
    const card = box.querySelector(`[data-item="${it.ListID}"]`);
    if (!card) return;
    let workingOptions = [...it.options];

    function renderOptions() {
      const wrap = card.querySelector('.wr-item-options');
      wrap.innerHTML = workingOptions.length
        ? workingOptions.map((o, oi) => `<span class="tag-pill">${escapeHtml(o)}<button type="button" data-rm-opt="${oi}" aria-label="ลบ">&times;</button></span>`).join('')
        : '<span class="empty-state" style="padding:4px 0;">ยังไม่มีตัวเลือก</span>';
      wrap.querySelectorAll('[data-rm-opt]').forEach((btn) => btn.addEventListener('click', () => {
        workingOptions.splice(Number(btn.dataset.rmOpt), 1);
        renderOptions();
      }));
    }
    renderOptions();

    card.querySelector('.wr-item-add-opt').addEventListener('click', () => {
      const input = card.querySelector('.wr-item-new-opt');
      const v = input.value.trim();
      if (!v) return;
      workingOptions.push(v);
      input.value = '';
      renderOptions();
    });
    card.querySelector('.wr-item-new-opt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.wr-item-add-opt').click(); }
    });

    card.querySelector('.wr-item-save').addEventListener('click', async () => {
      const text = card.querySelector('.wr-item-text').value.trim();
      if (!text) { toastError('กรุณากรอกหัวข้อเช็กลิสต์'); return; }
      try {
        await withLoading(() => api.put(`/api/walk-rounds/checklist/${it.ListID}`, { text, options: workingOptions }));
        toastSuccess('บันทึกสำเร็จ');
        await loadChecklistItems();
      } catch (err) { toastError(err.message); }
    });

    card.querySelector('.wr-item-del').addEventListener('click', async () => {
      if (!(await confirmDialog('ลบหัวข้อเช็กลิสต์นี้หรือไม่?'))) return;
      try {
        await withLoading(() => api.del(`/api/lists/item/${it.ListID}`));
        toastSuccess('ลบสำเร็จ');
        await loadChecklistItems();
      } catch (err) { toastError(err.message); }
    });
  });
}

function tagEditorHtml(category, label) {
  return `
    <div class="card" data-list-card="${category}">
      <h3>${escapeHtml(label)}</h3>
      <div class="tag-list" id="tags-${category}"></div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="new-tag-${category}" placeholder="เพิ่มรายการใหม่..." style="flex:1;" />
        <button type="button" class="btn btn-secondary btn-sm" data-add-tag="${category}">+ เพิ่มรายการ</button>
      </div>
    </div>`;
}

async function loadTagList(category) {
  const rows = await api.get(`/api/lists/${category}`);
  const box = document.getElementById(`tags-${category}`);
  if (!box) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอโหลด
  box.innerHTML = rows.length
    ? rows.map((r) => `<span class="tag-pill">${escapeHtml(r.Value)}<button type="button" data-rm-tag="${r.ListID}" aria-label="ลบ">&times;</button></span>`).join('')
    : '<span class="empty-state" style="padding:4px 0;">ยังไม่มีรายการ</span>';
  box.querySelectorAll('[data-rm-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmDialog('ลบรายการนี้หรือไม่?'))) return;
      await withLoading(() => api.del(`/api/lists/item/${btn.dataset.rmTag}`));
      await Promise.all([loadTagList(category), loadReferenceData()]);
    });
  });
}

export async function render(container) {
  container.innerHTML = `
    <div class="tabs" id="settings-tabs">
      <button type="button" class="tab-btn active" data-tab="general">ตั้งค่าทั่วไป</button>
      <button type="button" class="tab-btn" data-tab="lists">รายการ Dropdown/Tag</button>
      <button type="button" class="tab-btn" data-tab="walkround">Walk Round</button>
      <button type="button" class="tab-btn" data-tab="org">Cost Center</button>
      <button type="button" class="tab-btn" data-tab="position">ตำแหน่ง / Job Function</button>
      <button type="button" class="tab-btn" data-tab="admin">Admin</button>
    </div>

    <div class="tab-pane" data-pane="general">
      <div class="card">
        <h3>ตั้งค่าระบบทั่วไป</h3>
        <form id="settings-form" class="form-grid">
          <div class="field"><label>ชื่อแอป</label><input id="s-AppTitle" /></div>
          <div class="field"><label>สเกลคะแนนสูงสุด (Rating)</label><input type="number" id="s-RatingScaleMax" /></div>
          <div class="field"><label>แจ้งเตือนล่วงหน้าก่อนครบกำหนดประเมิน (วัน)</label><input type="number" id="s-AlertDays" /></div>
          <div class="field"><label>QID แบบสอบถามรายเดือน (AI Coach)</label><input id="s-MonthlySurveyQID" disabled /></div>
          <div class="field-full"><button class="btn btn-primary" type="submit">บันทึกการตั้งค่า</button></div>
        </form>
      </div>
      <div class="card">
        <h3>ซ่อมแซมโครงสร้างชีต (Initialize Sheets)</h3>
        <p style="color:var(--muted); font-size:13.5px; margin:-6px 0 12px;">
          กดปุ่มนี้เมื่อเจอข้อความ "ไม่พบชีต ... กรุณากด initSheets ก่อน" — ระบบจะสร้างเฉพาะชีต/หมวดหมู่ที่ยังขาดหายเท่านั้น ไม่กระทบข้อมูลเดิมที่มีอยู่แล้ว
        </p>
        <button type="button" id="init-sheets-btn" class="btn btn-secondary">รันซ่อมแซมโครงสร้างชีต</button>
      </div>
    </div>

    <div class="tab-pane hidden" data-pane="lists">
      ${LIST_CATEGORIES.map((c) => tagEditorHtml(c.key, c.label)).join('')}
    </div>

    <div class="tab-pane hidden" data-pane="walkround">
      ${checklistEditorHtml()}
      ${WALKROUND_CATEGORIES.map((c) => tagEditorHtml(c.key, c.label)).join('')}
    </div>

    <div class="tab-pane hidden" data-pane="org">
      <div class="card">
        <div class="toolbar"><h3 style="margin:0;">หน่วยงาน (Cost Center)</h3><span class="spacer"></span>
          <button id="cc-template-btn" class="btn btn-ghost btn-sm">ดาวน์โหลด Template</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;">นำเข้าข้อมูล<input type="file" id="cc-import-file" accept=".csv" class="hidden" /></label>
        </div>
        <p style="color:var(--muted); font-size:13.5px; margin:-6px 0 12px;">แต่ละ Cost Center ผูกกับ Sub Service เดียว — ใช้สำหรับ auto-fill ในหน้าเพิ่ม/แก้ไขข้อมูลพนักงาน</p>
        <form id="cc-form" class="form-grid">
          <div class="field"><label>Cost Center *</label><input id="cc-code" required /></div>
          <div class="field"><label>Cost Center Name *</label><input id="cc-name" required /></div>
          <div class="field"><label>Sub Services</label><input id="cc-subservice" placeholder="เช่น Nursing - Critical Care Services" /></div>
          <div class="field-full"><button class="btn btn-primary btn-sm" type="submit">+ เพิ่ม Cost Center</button></div>
        </form>
        <div class="table-wrap" style="margin-top:14px;">
          <table class="data-table"><thead><tr><th>Cost Center</th><th>Cost Center Name</th><th>Sub Services</th><th>จัดการ</th></tr></thead><tbody id="cc-body"></tbody></table>
        </div>
      </div>
    </div>

    <div class="tab-pane hidden" data-pane="position">
      <div class="card">
        <h3>จับคู่ ตำแหน่ง (Position) กับ Job Function</h3>
        <p style="color:var(--muted); font-size:13.5px; margin:-6px 0 12px;">เมื่อเลือกตำแหน่งในหน้าเพิ่ม/แก้ไขข้อมูลพนักงาน ระบบจะ auto-fill Job Function ให้อัตโนมัติตามคู่ที่ตั้งไว้นี้</p>
        <form id="pj-form" class="form-grid">
          <div class="field"><label>ตำแหน่ง (Position) *</label><select id="pj-position" required></select></div>
          <div class="field"><label>Job Function *</label><select id="pj-jobfunction" required></select></div>
          <div class="field-full"><button class="btn btn-primary btn-sm" type="submit">+ เพิ่มคู่จับคู่</button></div>
        </form>
        <div class="table-wrap" style="margin-top:14px;">
          <table class="data-table"><thead><tr><th>ตำแหน่ง</th><th>Job Function</th><th>จัดการ</th></tr></thead><tbody id="pj-body"></tbody></table>
        </div>
      </div>
    </div>

    <div class="tab-pane hidden" data-pane="admin">
      <div class="card">
        <div class="toolbar"><h3 style="margin:0;">ผู้ดูแลระบบ (Admin)</h3><span class="spacer"></span><button id="add-admin-btn" class="btn btn-primary btn-sm">+ เพิ่ม Admin</button></div>
        <p style="color:var(--muted); font-size:13.5px; margin:-6px 0 12px;">บันทึกแยกชีต (Admins) จากชีต Staff โดยเด็ดขาด — การให้สิทธิ์ Admin กับพนักงานที่มีอยู่แล้วจะย้ายข้อมูลตัวตนไปชีตนี้และลบออกจาก Staff Directory ทันที ไม่แสดงปนกันอีกต่อไป</p>
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เบอร์มือถือ (ใช้เข้าสู่ระบบ)</th><th>จัดการ</th></tr></thead><tbody id="admins-body"></tbody></table>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('#settings-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#settings-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== btn.dataset.tab));
    });
  });

  // ---------- ตั้งค่าทั่วไป ----------
  const s = cache.settings;
  document.getElementById('s-AppTitle').value = s.AppTitle || '';
  document.getElementById('s-RatingScaleMax').value = s.RatingScaleMax || 5;
  document.getElementById('s-AlertDays').value = s.AlertDays || 10;
  document.getElementById('s-MonthlySurveyQID').value = s.MonthlySurveyQID || '(สร้างอัตโนมัติเมื่อรัน initSheets)';

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await withLoading(() => api.put('/api/settings', {
        AppTitle: document.getElementById('s-AppTitle').value.trim(),
        RatingScaleMax: document.getElementById('s-RatingScaleMax').value,
        AlertDays: document.getElementById('s-AlertDays').value,
      }));
      await loadReferenceData();
      toastSuccess('บันทึกการตั้งค่าสำเร็จ');
    } catch (err) { toastError(err.message); }
  });

  document.getElementById('init-sheets-btn').addEventListener('click', async () => {
    try {
      const result = await withLoading(() => api.post('/api/setup/init', {}));
      const created = result.created && result.created.length ? result.created.join(', ') : 'ไม่มีชีตที่ขาดหาย (ครบถ้วนอยู่แล้ว)';
      toastSuccess(`ซ่อมแซมโครงสร้างชีตสำเร็จ — สร้างเพิ่ม: ${created}`);
    } catch (err) { toastError(err.message); }
  });

  // ---------- รายการ Dropdown/Tag + Walk Round (ใช้ tag editor ตัวเดียวกัน) ----------
  [...LIST_CATEGORIES, ...WALKROUND_CATEGORIES].forEach((c) => {
    loadTagList(c.key);
    document.querySelector(`[data-add-tag="${c.key}"]`).addEventListener('click', async () => {
      const input = document.getElementById(`new-tag-${c.key}`);
      const value = input.value.trim();
      if (!value) return;
      try {
        await withLoading(() => api.post(`/api/lists/${c.key}`, { Value: value }));
        input.value = '';
        await Promise.all([loadTagList(c.key), loadReferenceData()]);
      } catch (err) { toastError(err.message); }
    });
  });

  // ---------- Walk Round: หัวข้อเช็กลิสต์ + ตัวเลือก "ผล" ต่อหัวข้อ ----------
  loadChecklistItems();
  document.getElementById('wr-add-checklist-item').addEventListener('click', async () => {
    const input = document.getElementById('wr-new-checklist-text');
    const text = input.value.trim();
    if (!text) return;
    try {
      await withLoading(() => api.post('/api/walk-rounds/checklist', { text, options: [] }));
      input.value = '';
      await loadChecklistItems();
    } catch (err) { toastError(err.message); }
  });

  // ---------- Cost Center (ผูกกับ Sub Service เดียวเสมอ — จัดการคู่กันในฟอร์มเดียว) ----------
  async function loadCostCenters() {
    const costCenters = await api.get('/api/org/cost-centers');
    const ccBody = document.getElementById('cc-body');
    if (!ccBody) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอโหลด
    ccBody.innerHTML = costCenters.map((c) => {
      const subServiceName = cache.subServices.find((s) => s.CostCenterID === c.CostCenterID)?.Name || '—';
      return `<tr><td>${escapeHtml(c.Code)}</td><td>${escapeHtml(c.Name)}</td><td>${escapeHtml(subServiceName)}</td>
      <td><button class="btn btn-danger btn-sm" data-del-cc="${c.CostCenterID}">Del</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty-state">ยังไม่มีข้อมูล</td></tr>';
    document.querySelectorAll('[data-del-cc]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmDialog('ลบหน่วยงานนี้หรือไม่? Sub Service ที่ผูกอยู่จะถูกลบไปด้วย'))) return;
      await withLoading(() => api.del(`/api/org/cost-centers/${btn.dataset.delCc}`));
      toastSuccess('ลบสำเร็จ');
      await refreshOrg();
    }));
  }

  async function refreshOrg() {
    await loadReferenceData();
    await loadCostCenters();
    await loadPositionJobFunction();
  }
  document.getElementById('cc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await withLoading(() => api.post('/api/org/cost-centers', {
        Code: document.getElementById('cc-code').value.trim(),
        Name: document.getElementById('cc-name').value.trim(),
        SubServiceName: document.getElementById('cc-subservice').value.trim(),
      }));
      toastSuccess('เพิ่ม Cost Center สำเร็จ');
      e.target.reset();
      await refreshOrg();
    } catch (err) { toastError(err.message); }
  });
  document.getElementById('cc-template-btn').addEventListener('click', () => {
    exportCsv('cost-center-import-template.csv', [{ Code: 'CC001', Name: 'หน่วยงานตัวอย่าง', SubServiceName: 'เช่น Nursing - Critical Care Services' }]);
  });
  document.getElementById('cc-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    try {
      const result = await withLoading(() => api.post('/api/org/cost-centers/import', { rows: parsed }));
      toastSuccess(`นำเข้าสำเร็จ: เพิ่มใหม่ ${result.created}, อัปเดต ${result.updated}${result.errors.length ? `, ผิดพลาด ${result.errors.length} แถว` : ''}`);
      await refreshOrg();
    } catch (err) {
      toastError(err.message);
    }
    e.target.value = '';
  });

  // ---------- ตำแหน่ง (Position) <-> Job Function ----------
  // เก็บคู่จับคู่ไว้ใน Lists หมวดหมู่ 'PositionJobFunctionMap' (Value เป็น JSON {position, jobFunction})
  // ใช้ CRUD generic ตัวเดียวกับรายการ Dropdown/Tag ทั่วไป (createListItem_/deleteListItem_) ไม่ต้องเพิ่ม backend ใหม่
  function parsePositionJobFunctionPairs() {
    return (cache.lists.PositionJobFunctionMap || []).map((r) => {
      let parsed = {};
      try { parsed = JSON.parse(r.Value); } catch { /* ignore */ }
      return { ListID: r.ListID, position: parsed.position || '', jobFunction: parsed.jobFunction || '' };
    }).filter((p) => p.position);
  }
  async function loadPositionJobFunction() {
    const posSelect = document.getElementById('pj-position');
    const jfSelect = document.getElementById('pj-jobfunction');
    if (!posSelect || !jfSelect) return;
    const positions = (cache.lists.Position || []).map((r) => r.Value);
    const jobFunctions = (cache.lists.JobFunction || []).map((r) => r.Value);
    posSelect.innerHTML = `<option value="">— เลือก —</option>${positions.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}`;
    jfSelect.innerHTML = `<option value="">— เลือก —</option>${jobFunctions.map((j) => `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`).join('')}`;
    const pjBody = document.getElementById('pj-body');
    if (!pjBody) return;
    const pairs = parsePositionJobFunctionPairs();
    pjBody.innerHTML = pairs.map((p) => `
      <tr><td>${escapeHtml(p.position)}</td><td>${escapeHtml(p.jobFunction)}</td>
      <td><button class="btn btn-danger btn-sm" data-del-pj="${p.ListID}">Del</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="empty-state">ยังไม่มีคู่จับคู่</td></tr>';
    document.querySelectorAll('[data-del-pj]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmDialog('ลบคู่จับคู่นี้หรือไม่?'))) return;
      await withLoading(() => api.del(`/api/lists/item/${btn.dataset.delPj}`));
      toastSuccess('ลบสำเร็จ');
      await loadReferenceData();
      await loadPositionJobFunction();
    }));
  }
  document.getElementById('pj-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const position = document.getElementById('pj-position').value;
    const jobFunction = document.getElementById('pj-jobfunction').value;
    if (!position || !jobFunction) return;
    try {
      await withLoading(() => api.post('/api/lists/PositionJobFunctionMap', {
        Value: JSON.stringify({ position, jobFunction }),
      }));
      toastSuccess('เพิ่มคู่จับคู่สำเร็จ');
      e.target.reset();
      await loadReferenceData();
      await loadPositionJobFunction();
    } catch (err) { toastError(err.message); }
  });

  // ---------- Admin: บันทึกแยกชีต (Admins) จากชีต Staff โดยเด็ดขาด — ดู Admins.gs ฝั่ง backend ----------
  function editAdminModal(admin, onSaved) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <form id="admin-edit-form">
        <div class="form-grid">
          <div class="field"><label>Employee ID</label><input value="${escapeHtml(admin.EmployeeID)}" disabled /></div>
          <div class="field"><label>ชื่อ-นามสกุล *</label><input id="ae-ThaiName" value="${escapeHtml(admin.ThaiName || '')}" required /></div>
          <div class="field"><label>ชื่อเล่น</label><input id="ae-NickName" value="${escapeHtml(admin.NickName || '')}" /></div>
          <div class="field"><label>เบอร์มือถือ * (ใช้เข้าสู่ระบบ)</label><input type="tel" id="ae-Phone" inputmode="numeric" value="${escapeHtml(admin.Phone || '')}" required /></div>
          <div class="field field-full"><label>Note</label><textarea id="ae-Note" rows="2">${escapeHtml(admin.Note || '')}</textarea></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="ae-cancel">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">บันทึก</button>
        </div>
      </form>`;
    const body = openModal(`แก้ไขข้อมูล Admin — ${admin.EmployeeID}`, wrap);
    body.querySelector('#ae-cancel').addEventListener('click', closeModal);
    body.querySelector('#admin-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {
        ThaiName: body.querySelector('#ae-ThaiName').value.trim(),
        NickName: body.querySelector('#ae-NickName').value.trim(),
        Phone: body.querySelector('#ae-Phone').value.trim(),
        Note: body.querySelector('#ae-Note').value.trim(),
      };
      try {
        await withLoading(() => api.put(`/api/admins/${admin.EmployeeID}`, patch));
        toastSuccess('บันทึกข้อมูล Admin สำเร็จ');
        closeModal();
        onSaved();
      } catch (err) { toastError(err.message); }
    });
  }

  async function loadAdmins() {
    const admins = await api.get('/api/admins');
    const adminsBody = document.getElementById('admins-body');
    if (!adminsBody) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอโหลด
    adminsBody.innerHTML = admins.map((a) => `
      <tr>
        <td>${escapeHtml(a.EmployeeID)}</td><td>${escapeHtml(a.ThaiName)}</td><td>${escapeHtml(a.Phone || '—')}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit-admin="${a.EmployeeID}">แก้ไข</button>
          <button class="btn btn-danger btn-sm" data-revoke="${a.EmployeeID}">ลบสิทธิ์ Admin</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty-state">ยังไม่มีผู้ดูแลระบบ</td></tr>';

    document.querySelectorAll('[data-edit-admin]').forEach((btn) => btn.addEventListener('click', () => {
      editAdminModal(admins.find((x) => x.EmployeeID === btn.dataset.editAdmin), loadAdmins);
    }));
    document.querySelectorAll('[data-revoke]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmDialog(`ต้องการลบสิทธิ์ Admin ของ ${btn.dataset.revoke} หรือไม่? ระบบจะไม่สร้างข้อมูลพนักงานกลับให้อัตโนมัติ — ถ้าต้องการให้กลับมาเป็นพนักงาน ต้องเพิ่มข้อมูลใหม่ที่ Staff Directory`))) return;
      try {
        await withLoading(() => api.del(`/api/admins/${btn.dataset.revoke}`));
        toastSuccess('ลบสิทธิ์ Admin สำเร็จ');
        loadAdmins();
      } catch (err) { toastError(err.message); }
    }));
  }

  document.getElementById('add-admin-btn').addEventListener('click', async () => {
    const nonAdminStaff = await api.get('/api/staff');
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="tabs" id="ga-tabs">
        <button type="button" class="tab-btn active" data-tab="existing">จากพนักงานที่มีอยู่แล้ว</button>
        <button type="button" class="tab-btn" data-tab="new">สร้างใหม่ (ไม่ผูกกับพนักงานในระบบ)</button>
      </div>
      <form id="grant-form">
        <div class="tab-pane" data-pane="existing">
          <p style="color:var(--muted); font-size:13.5px; margin:4px 0 12px;">ข้อมูลพนักงานที่เลือกจะถูกย้ายไปชีต Admin และ<b>ลบออกจาก Staff Directory ทันที</b> (ประวัติทดลองงาน/ปฐมนิเทศเดิมจะไม่แสดงอีกต่อไป)</p>
          <div class="field" style="position:relative;"><label>ค้นหาพนักงาน (Employee ID / ชื่อ) ที่จะให้สิทธิ์ Admin</label>
            <input id="grant-emp-search" placeholder="พิมพ์ Employee ID หรือชื่อเพื่อค้นหา..." autocomplete="off" />
            <input type="hidden" id="grant-emp" />
            <div id="grant-emp-results" class="search-dropdown hidden"></div>
          </div>
        </div>
        <div class="tab-pane hidden" data-pane="new">
          <div class="form-grid">
            <div class="field"><label>Employee ID *</label><input id="ga-EmployeeID" /></div>
            <div class="field"><label>ชื่อ-นามสกุล *</label><input id="ga-ThaiName" /></div>
            <div class="field"><label>ชื่อเล่น</label><input id="ga-NickName" /></div>
            <div class="field"><label>เบอร์มือถือ * (ใช้เข้าสู่ระบบ)</label><input type="tel" id="ga-Phone" inputmode="numeric" /></div>
            <div class="field field-full"><label>Note</label><textarea id="ga-Note" rows="2"></textarea></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="grant-cancel">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">ให้สิทธิ์ Admin</button>
        </div>
      </form>`;
    const body = openModal('เพิ่มรายชื่อผู้ดูแลระบบ', wrap, { wide: true });
    attachStaffSearch({
      searchInput: body.querySelector('#grant-emp-search'),
      hiddenInput: body.querySelector('#grant-emp'),
      resultsBox: body.querySelector('#grant-emp-results'),
      allStaff: nonAdminStaff,
    });
    let activeGrantTab = 'existing';
    body.querySelectorAll('#ga-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('#ga-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        body.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== btn.dataset.tab));
        activeGrantTab = btn.dataset.tab;
      });
    });
    body.querySelector('#grant-cancel').addEventListener('click', closeModal);
    body.querySelector('#grant-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        if (activeGrantTab === 'existing') {
          const empId = body.querySelector('#grant-emp').value;
          if (!empId) { toastError('กรุณาเลือกพนักงาน'); return; }
          await withLoading(() => api.post('/api/admins', { fromEmployeeId: empId }));
        } else {
          const payload = {
            EmployeeID: body.querySelector('#ga-EmployeeID').value.trim(),
            ThaiName: body.querySelector('#ga-ThaiName').value.trim(),
            NickName: body.querySelector('#ga-NickName').value.trim(),
            Phone: body.querySelector('#ga-Phone').value.trim(),
            Note: body.querySelector('#ga-Note').value.trim(),
          };
          if (!payload.EmployeeID || !payload.ThaiName || !payload.Phone) { toastError('กรุณากรอก Employee ID, ชื่อ-นามสกุล, เบอร์มือถือ ให้ครบ'); return; }
          await withLoading(() => api.post('/api/admins', payload));
        }
        toastSuccess('ให้สิทธิ์ Admin สำเร็จ');
        closeModal();
        loadAdmins();
      } catch (err) { toastError(err.message); }
    });
  });

  await Promise.all([refreshOrg(), loadAdmins()]);
}
