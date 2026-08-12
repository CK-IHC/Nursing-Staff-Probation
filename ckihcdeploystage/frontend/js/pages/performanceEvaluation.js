import { api } from '../api.js';
import { cache, listValues } from '../state.js';
import { openModal, closeModal } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH, debounce, exportCsv, printReport } from '../utils.js';

function opts(list, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}`;
}

function evalModal(row, round, onSaved) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p style="margin-top:0;">${escapeHtml(row.ThaiName)} (${escapeHtml(row.EmployeeID)}) — รอบ ${round} วัน</p>
    <form id="ev-form">
      <div class="field"><label>ผลการประเมิน *</label><select id="ev-result" required>${opts(listValues('EvalResult'), '-- เลือก --')}</select></div>
      <div class="field field-full"><label>ความเห็นเพิ่มเติม</label><textarea id="ev-comment" rows="3"></textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="ev-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกผลการประเมิน</button>
      </div>
    </form>`;
  const body = openModal('บันทึกผลการประเมิน', wrap, { wide: true });
  body.querySelector('#ev-cancel').addEventListener('click', closeModal);
  body.querySelector('#ev-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = body.querySelector('#ev-result').value;
    const comment = body.querySelector('#ev-comment').value.trim();
    try {
      await withLoading(() => api.post('/api/evaluations', { employeeId: row.EmployeeID, period: round, result, comment }));
      toastSuccess('บันทึกผลการประเมินสำเร็จ');
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
      <button id="pe-export" class="btn btn-secondary">Export Excel</button>
      <button id="pe-print" class="btn btn-primary">Print Report</button>
    </div>
    <div class="toolbar">
      <input id="pe-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID/ชื่อ" />
      <select id="pe-position">${opts(cache.lists.Position?.map((r) => r.Value) || [], 'ทุกตำแหน่ง')}</select>
      <select id="pe-costcenter">${opts(cache.costCenters.map((c) => c.Name), 'ทุก Cost Center')}</select>
      <button id="pe-reset" class="btn btn-ghost">Reset</button>
    </div>
    <div class="tabs" id="pe-tabs">
      <button type="button" class="tab-btn active" data-mode="nearDue">ใกล้ครบกำหนด (≤10 วัน)</button>
      <button type="button" class="tab-btn" data-mode="all">Evaluation Detail</button>
      <span class="spacer"></span>
      <select id="pe-round" style="margin-left:8px;"><option value="119">รอบ 119 วัน</option><option value="60">รอบ 60 วัน</option></select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>Cost Center</th><th>Manager</th><th>กำหนดประเมิน</th><th>เหลือ/เกิน</th><th>ผล</th><th></th></tr></thead>
        <tbody id="pe-body"></tbody>
      </table>
    </div>`;

  let round = '119', mode = 'nearDue', rows = [];

  async function load() {
    const q = mode === 'nearDue' ? `&filter=nearDue` : '';
    rows = await api.get(`/api/evaluations/list?round=${round}${q}`);
    renderTable();
  }
  function filtered() {
    const search = document.getElementById('pe-search').value.trim().toLowerCase();
    const position = document.getElementById('pe-position').value;
    const costcenter = document.getElementById('pe-costcenter').value;
    let out = rows;
    if (search) out = out.filter((r) => `${r.EmployeeID} ${r.ThaiName}`.toLowerCase().includes(search));
    if (position) out = out.filter((r) => r.Position === position);
    if (costcenter) out = out.filter((r) => r.CostCenterName === costcenter);
    return out;
  }
  function renderTable() {
    const out = filtered();
    const body = document.getElementById('pe-body');
    if (out.length === 0) { body.innerHTML = '<tr><td colspan="9" class="empty-state">ไม่พบข้อมูล</td></tr>'; return; }
    body.innerHTML = out.map((r) => {
      const remainTxt = r.RemainDays === null ? '—' : r.RemainDays < 0 ? `เกิน ${Math.abs(r.RemainDays)} วัน` : `เหลือ ${r.RemainDays} วัน`;
      return `<tr>
        <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>${escapeHtml(r.Position || '')}</td>
        <td>${escapeHtml(r.CostCenterName || '')}</td><td>${escapeHtml(r.ManagerName || '')}</td>
        <td>${formatDateTH(r.DueDate)}</td><td>${remainTxt}</td>
        <td>${r.HasEval
          ? `<span class="badge ${r.Result === 'Passed' ? 'badge-green' : r.Result === 'NotPassed' ? 'badge-red' : 'badge-gold'}">${escapeHtml(r.Result)}</span>`
          : r.CheckinDate
            ? `<span class="badge badge-blue" title="พนักงานลงวันที่เข้าร่วมประเมินเองแล้ว รอบันทึกผลอย่างเป็นทางการ">Completed (${formatDateTH(r.CheckinDate)})</span>`
            : '<span class="badge badge-gray">ยังไม่ประเมิน</span>'}</td>
        <td><button class="btn btn-primary btn-sm" data-eval="${r.EmployeeID}" ${r.HasEval && mode === 'nearDue' ? 'disabled' : ''}>บันทึกประเมิน</button></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-eval]').forEach((btn) => {
      btn.addEventListener('click', () => evalModal(out.find((r) => r.EmployeeID === btn.dataset.eval), round, load));
    });
  }

  document.querySelectorAll('#pe-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#pe-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      mode = btn.dataset.mode;
      load();
    });
  });
  document.getElementById('pe-round').addEventListener('change', (e) => { round = e.target.value; load(); });
  document.getElementById('pe-search').addEventListener('input', debounce(renderTable, 200));
  ['pe-position', 'pe-costcenter'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('pe-reset').addEventListener('click', () => {
    document.getElementById('pe-search').value = '';
    ['pe-position', 'pe-costcenter'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });
  document.getElementById('pe-print').addEventListener('click', () => printReport('Performance Evaluation Report', `รอบประเมิน ${round} วัน`));
  document.getElementById('pe-export').addEventListener('click', () => {
    exportCsv(`performance-evaluation-${round}.csv`, filtered().map((r) => ({
      EmployeeID: r.EmployeeID, ชื่อ: r.ThaiName, ตำแหน่ง: r.Position, กำหนดประเมิน: r.DueDate, ผล: r.Result || '',
    })));
  });

  await load();
}
