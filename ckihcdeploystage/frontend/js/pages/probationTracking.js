import { api } from '../api.js';
import { cache } from '../state.js';
import { escapeHtml, formatDateTH, debounce, exportCsv, printReport } from '../utils.js';

function opts(list, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}`;
}

export async function render(container) {
  container.innerHTML = `
    <div class="toolbar">
      <span></span>
      <span class="spacer"></span>
      <button id="pt-export" class="btn btn-secondary">Export Excel</button>
      <button id="pt-print" class="btn btn-primary">Print Report</button>
    </div>
    <div id="pt-alert"></div>
    <div class="toolbar">
      <input id="pt-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหา ID / ชื่อ / Manager" />
      <select id="pt-manager"><option value="">ทุก Manager</option></select>
      <select id="pt-neardue"><option value="">ทุกสถานะ</option><option value="1">ใกล้ครบกำหนด ≤10วัน</option></select>
      <select id="pt-status">${opts(cache.lists.ProbationaryStatus?.map((r) => r.Value) || [], 'ทุก Status')}</select>
      <select id="pt-position">${opts(cache.lists.Position?.map((r) => r.Value) || [], 'ทุกตำแหน่ง')}</select>
      <select id="pt-costcenter">${opts(cache.costCenters.map((c) => c.Name), 'ทุก Cost Center')}</select>
      <button id="pt-reset" class="btn btn-ghost">Reset</button>
    </div>
    <div class="tabs" id="pt-tabs">
      <button type="button" class="tab-btn active" data-round="60">การประเมิน 60 วัน (ครั้งที่ 1) <span class="tab-count" id="pt-count-60">0</span></button>
      <button type="button" class="tab-btn" data-round="119">การประเมิน 119 วัน (ครั้งที่ 2) <span class="tab-count" id="pt-count-119">0</span></button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>สถานะ</th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>Cost Center</th><th>Sub Services</th><th>Manager</th><th>วันเริ่มงาน</th><th>กำหนดประเมิน</th><th>เหลือ/เกิน</th><th>วันที่ประเมิน</th><th>ผล</th></tr></thead>
        <tbody id="pt-body"></tbody>
      </table>
    </div>`;

  let round = '60';
  let rows = [];

  async function load() {
    rows = await api.get(`/api/evaluations/list?round=${round}`);
    document.getElementById(`pt-count-${round}`).textContent = rows.filter((r) => r.NearDue).length ? `(${rows.filter((r) => r.NearDue).length} ใกล้ครบกำหนด)` : '';
    const managers = [...new Set(rows.map((r) => r.ManagerName).filter(Boolean))];
    const managerSel = document.getElementById('pt-manager');
    const current = managerSel.value;
    managerSel.innerHTML = `<option value="">ทุก Manager</option>${managers.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;
    managerSel.value = current;
    renderAlert();
    renderTable();
  }

  function filtered() {
    const search = document.getElementById('pt-search').value.trim().toLowerCase();
    const manager = document.getElementById('pt-manager').value;
    const nearDue = document.getElementById('pt-neardue').value;
    const status = document.getElementById('pt-status').value;
    const position = document.getElementById('pt-position').value;
    const costcenter = document.getElementById('pt-costcenter').value;
    let out = rows;
    if (search) out = out.filter((r) => `${r.EmployeeID} ${r.ThaiName} ${r.ManagerName}`.toLowerCase().includes(search));
    if (manager) out = out.filter((r) => r.ManagerName === manager);
    if (nearDue) out = out.filter((r) => r.NearDue);
    if (status) out = out.filter((r) => r.ProbationaryStatus === status);
    if (position) out = out.filter((r) => r.Position === position);
    if (costcenter) out = out.filter((r) => r.CostCenterName === costcenter);
    return out;
  }

  function renderAlert() {
    const nearDue = rows.filter((r) => r.NearDue);
    const box = document.getElementById('pt-alert');
    box.innerHTML = nearDue.length ? `<div class="alert-banner">แจ้งเตือน: ${nearDue.length} รายการใกล้ครบกำหนดประเมิน (≤10 วัน)</div>` : '';
  }

  function renderTable() {
    const out = filtered();
    const body = document.getElementById('pt-body');
    if (out.length === 0) {
      body.innerHTML = '<tr><td colspan="12" class="empty-state">ไม่พบข้อมูลในเงื่อนไขที่เลือก</td></tr>';
      return;
    }
    body.innerHTML = out.map((r) => {
      const remainTxt = r.RemainDays === null ? '—' : r.RemainDays < 0 ? `เกิน ${Math.abs(r.RemainDays)} วัน` : `เหลือ ${r.RemainDays} วัน`;
      const badge = r.HasEval ? (r.Result === 'Passed' ? 'badge-green' : r.Result === 'NotPassed' ? 'badge-red' : 'badge-gold') : r.NearDue ? 'badge-red' : 'badge-gray';
      const statusTxt = r.HasEval ? 'ประเมินแล้ว' : r.NearDue ? 'ใกล้ครบกำหนด' : 'รอถึงกำหนด';
      return `<tr>
        <td><span class="badge ${badge}">${statusTxt}</span></td>
        <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>${escapeHtml(r.Position || '')}</td>
        <td>${escapeHtml(r.CostCenterName || '')}</td><td>${escapeHtml(r.SubServiceID || '')}</td><td>${escapeHtml(r.ManagerName || '')}</td>
        <td>${formatDateTH(r.HireDate)}</td><td>${formatDateTH(r.DueDate)}</td><td>${remainTxt}</td>
        <td>${r.EvalDate ? formatDateTH(r.EvalDate) : '—'}</td><td>${escapeHtml(r.Result || '—')}</td>
      </tr>`;
    }).join('');
  }

  document.querySelectorAll('#pt-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#pt-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      round = btn.dataset.round;
      load();
    });
  });

  ['pt-manager', 'pt-neardue', 'pt-status', 'pt-position', 'pt-costcenter'].forEach((id) => document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('pt-search').addEventListener('input', debounce(renderTable, 200));
  document.getElementById('pt-reset').addEventListener('click', () => {
    document.getElementById('pt-search').value = '';
    ['pt-manager', 'pt-neardue', 'pt-status', 'pt-position', 'pt-costcenter'].forEach((id) => { document.getElementById(id).value = ''; });
    renderTable();
  });
  document.getElementById('pt-print').addEventListener('click', () => printReport('Probation Tracking Report', `รอบประเมิน ${round} วัน`));
  document.getElementById('pt-export').addEventListener('click', () => {
    exportCsv(`probation-tracking-${round}.csv`, filtered().map((r) => ({
      EmployeeID: r.EmployeeID, ชื่อ: r.ThaiName, ตำแหน่ง: r.Position, CostCenter: r.CostCenterName, Manager: r.ManagerName,
      วันเริ่มงาน: r.HireDate, กำหนดประเมิน: r.DueDate, วันที่ประเมิน: r.EvalDate || '', ผล: r.Result || '',
    })));
  });

  await load();
}
