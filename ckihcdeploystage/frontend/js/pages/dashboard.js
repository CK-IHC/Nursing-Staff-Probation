import { api } from '../api.js';
import { escapeHtml, exportCsv, printReport, printIsolated } from '../utils.js';
import { staffForm } from './staffDirectory.js';
import { withLoading } from '../components/loading.js';
import { toastError } from '../components/toast.js';

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function bucketOf(hireDate) {
  const elapsed = daysBetween(hireDate, new Date().toISOString().slice(0, 10));
  if (elapsed <= 30) return 'M1';
  if (elapsed <= 60) return 'M2';
  if (elapsed <= 90) return 'M3';
  return 'M4';
}

// จัดกลุ่ม byPosition (position ตรงตัวจาก dashboardSummary_) ตามชื่อ position ฐาน โดยตัดส่วนท้าย "level N" ออก
// เช่น "Registered Nurse level 1" และ "Registered Nurse level 3" รวมเป็นกลุ่ม "Registered Nurse" เดียว
// พร้อมแยกย่อยยอดแต่ละ level ไว้ใต้ยอดรวม — position ที่ไม่มี "level" ต่อท้าย (เช่น Navigator) ไม่มีการแยกย่อย
function groupByBasePosition(byPosition) {
  const groups = {};
  byPosition.forEach((p) => {
    const m = p.position.match(/^(.*?)\s+level\s+(\d+)$/i);
    const base = m ? m[1].trim() : p.position;
    if (!groups[base]) groups[base] = { base, count: 0, levels: [] };
    groups[base].count += p.count;
    if (m) groups[base].levels.push({ level: Number(m[2]), count: p.count });
  });
  const list = Object.values(groups);
  list.forEach((g) => g.levels.sort((a, b) => a.level - b.level));
  list.sort((a, b) => b.count - a.count);
  return list;
}

function monthStatus(dateValue) {
  return dateValue ? 'เสร็จสิ้น' : 'ยังไม่ดำเนินการ';
}
function monthBadge(status) {
  return status === 'เสร็จสิ้น' ? 'badge-green' : 'badge-gray';
}

// withActions: false สำหรับตอนพิมพ์ (printIsolated) — หน้าพิมพ์ไม่ต้องมีปุ่ม Edit
function ladderRowsHtml(rows, withActions) {
  return rows.length === 0 ? `<tr><td colspan="${withActions ? 5 : 4}" class="empty-state">ไม่มีรายการแจ้งเตือน</td></tr>` : rows.map((r) => `
    <tr><td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>เดือนที่ ${r.Month}</td><td>${escapeHtml(r.ApplyLadderStatus)}</td>${withActions ? `<td><button class="btn btn-ghost btn-sm" data-edit-ladder="${escapeHtml(r.EmployeeID)}">Edit</button></td>` : ''}</tr>`).join('');
}

function hrSendRowsHtml(rows, withActions) {
  return rows.length === 0 ? `<tr><td colspan="${withActions ? 9 : 8}" class="empty-state">ไม่มีรายการแจ้งเตือน</td></tr>` : rows.map((r) => {
    const m1 = monthStatus(r.Orient1Date), m2 = monthStatus(r.Orient2Date), m3 = monthStatus(r.Orient3Date), m4 = monthStatus(r.Orient4Date);
    const hr = r.OrientSentHRDate ? 'ส่งแล้ว' : 'รอส่ง';
    return `<tr>
      <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>เดือนที่ ${r.Month}</td>
      <td><span class="badge ${monthBadge(m1)}">${m1}</span></td>
      <td><span class="badge ${monthBadge(m2)}">${m2}</span></td>
      <td><span class="badge ${monthBadge(m3)}">${m3}</span></td>
      <td><span class="badge ${monthBadge(m4)}">${m4}</span></td>
      <td><span class="badge ${hr === 'ส่งแล้ว' ? 'badge-green' : 'badge-red'}">${hr}</span></td>
      ${withActions ? `<td><button class="btn btn-ghost btn-sm" data-edit-hrsend="${escapeHtml(r.EmployeeID)}">Edit</button></td>` : ''}
    </tr>`;
  }).join('');
}

export async function render(container) {
  const [summary, activeStaff, reminders] = await Promise.all([
    api.get('/api/dashboard/summary'),
    api.get('/api/staff?status=Active'),
    api.get('/api/dashboard/reminders'),
  ]);
  const { statusCounts: c, byPosition } = summary;
  const { ladderDue, hrSendDue } = reminders;

  const buckets = { M1: [], M2: [], M3: [], M4: [] };
  activeStaff.forEach((s) => { if (s.HireDate) buckets[bucketOf(s.HireDate)].push(s); });

  const positionGroups = groupByBasePosition(byPosition);

  container.innerHTML = `
    <div class="toolbar">
      <span class="spacer"></span>
      <button id="dash-export" class="btn btn-secondary">Export Excel</button>
      <button id="dash-print" class="btn btn-primary">Print Report</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card stat-blue"><span class="stat-label">ON PROBATION</span><span class="stat-value">${c.onProbation}</span></div>
      <div class="stat-card stat-green"><span class="stat-label">PASSED</span><span class="stat-value">${c.passed}</span></div>
      <div class="stat-card stat-orange"><span class="stat-label">EXTENDED</span><span class="stat-value">${c.extended}</span></div>
      <div class="stat-card stat-red"><span class="stat-label">NOT PASSED</span><span class="stat-value">${c.notPassed}</span></div>
      <div class="stat-card stat-purple"><span class="stat-label">TOTAL STAFF</span><span class="stat-value">${c.total}</span></div>
      <div class="stat-card stat-pink"><span class="stat-label">RESIGN</span><span class="stat-value">${c.resign}</span></div>
      <div class="stat-card stat-gray"><span class="stat-label">TERMINATED</span><span class="stat-value">${c.terminated}</span></div>
    </div>

    <div class="section-title">สรุปจำนวน Staff On Probation แต่ละเดือน</div>
    <div class="stat-grid" id="month-grid">
      ${['M1', 'M2', 'M3', 'M4'].map((k, i) => `
        <div class="stat-card stat-outline" data-month="${k}" style="cursor:pointer;">
          <span class="stat-label">Probation M${i + 1} (${['0-30d', '31-60d', '61-90d', '91d+'][i]})</span>
          <span class="stat-value">${buckets[k].length} <small style="font-size:14px; font-weight:400;">คน</small></span>
        </div>`).join('')}
      <div class="stat-card stat-outline-accent"><span class="stat-label">รวม Active</span><span class="stat-value">${summary.monthly.total} <small style="font-size:14px; font-weight:400;">คน</small></span></div>
    </div>
    <div id="month-names" class="card hidden" style="margin-bottom:20px;"></div>

    <div class="section-title">สรุปจำนวนตาม Position (On Probation)</div>
    <div class="stat-grid">
      ${positionGroups.map((g) => `
        <div class="stat-card stat-outline">
          <span class="stat-label">${escapeHtml(g.base)}</span>
          <span class="stat-value">${g.count} <small style="font-size:14px; font-weight:400;">คน</small></span>
          ${g.levels.length ? `<span style="font-size:12.5px; color:var(--muted);">${g.levels.map((l) => `Level ${l.level}: ${l.count}`).join(' · ')}</span>` : ''}
        </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>'}
    </div>

    <div class="toolbar" style="margin-top:22px;">
      <div class="section-title" style="margin:0;">รายการแจ้งเตือน (On Probation)</div>
      <span class="spacer"></span>
      <button id="dash-export-reminders" class="btn btn-secondary btn-sm">Export Excel</button>
      <button id="dash-print-reminders" class="btn btn-primary btn-sm">Print</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3>Apply Ladder Status — ยังไม่ดำเนินการ (เดือนที่ 5, 8, 10)</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th>Apply Ladder After Probation</th><th></th></tr></thead>
          <tbody>${ladderRowsHtml(ladderDue, true)}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3>Orientation Checklist — ยังไม่ส่ง HR (เดือนที่ 5-11)</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th>เช็คเดือนที่ 1</th><th>เช็คเดือนที่ 2</th><th>เช็คเดือนที่ 3</th><th>เช็คเดือนที่ 4</th><th>สถานะส่ง HR</th><th></th></tr></thead>
          <tbody>${hrSendRowsHtml(hrSendDue, true)}</tbody>
        </table>
      </div>
    </div>`;

  document.querySelectorAll('#month-grid [data-month]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.month;
      const names = buckets[key];
      const box = document.getElementById('month-names');
      box.classList.remove('hidden');
      box.innerHTML = `<h3>รายชื่อ ${key} (${names.length} คน)</h3>` +
        (names.length ? `<ul style="margin:8px 0 0; padding-left:18px;">${names.map((s) => `<li>${escapeHtml(s.EmployeeID)} — ${escapeHtml(s.ThaiName)} (${escapeHtml(s.Position || '')})</li>`).join('')}</ul>` : '<p class="empty-state">ไม่มีข้อมูล</p>');
    });
  });

  async function editStaffFromReminder(employeeId) {
    try {
      const staff = await withLoading(() => api.get(`/api/staff/${employeeId}`));
      staffForm(staff, () => render(container), 'orientation');
    } catch (err) {
      toastError(err.message);
    }
  }
  document.querySelectorAll('[data-edit-ladder]').forEach((btn) => btn.addEventListener('click', () => editStaffFromReminder(btn.dataset.editLadder)));
  document.querySelectorAll('[data-edit-hrsend]').forEach((btn) => btn.addEventListener('click', () => editStaffFromReminder(btn.dataset.editHrsend)));

  document.getElementById('dash-print').addEventListener('click', () => printReport('Dashboard Summary Report', `On Probation ${c.onProbation} · Passed ${c.passed} · Total Staff ${c.total}`));
  document.getElementById('dash-print-reminders').addEventListener('click', () => {
    const html = `
      <h3>Apply Ladder Status — ยังไม่ดำเนินการ (เดือนที่ 5, 8, 10)</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th>Apply Ladder After Probation</th></tr></thead>
        <tbody>${ladderRowsHtml(ladderDue, false)}</tbody>
      </table></div>
      <h3 style="margin-top:18px;">Orientation Checklist — ยังไม่ส่ง HR (เดือนที่ 5-11)</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>เดือนที่</th><th>เช็คเดือนที่ 1</th><th>เช็คเดือนที่ 2</th><th>เช็คเดือนที่ 3</th><th>เช็คเดือนที่ 4</th><th>สถานะส่ง HR</th></tr></thead>
        <tbody>${hrSendRowsHtml(hrSendDue, false)}</tbody>
      </table></div>`;
    printIsolated('รายการแจ้งเตือน (On Probation)', '', html);
  });
  document.getElementById('dash-export').addEventListener('click', () => {
    exportCsv('dashboard-summary.csv', [
      { รายการ: 'On Probation', จำนวน: c.onProbation },
      { รายการ: 'Passed', จำนวน: c.passed },
      { รายการ: 'Extended', จำนวน: c.extended },
      { รายการ: 'Not Passed', จำนวน: c.notPassed },
      { รายการ: 'Resign', จำนวน: c.resign },
      { รายการ: 'Terminated', จำนวน: c.terminated },
      { รายการ: 'Total Staff', จำนวน: c.total },
      { รายการ: 'Probation M1 (0-30d)', จำนวน: buckets.M1.length },
      { รายการ: 'Probation M2 (31-60d)', จำนวน: buckets.M2.length },
      { รายการ: 'Probation M3 (61-90d)', จำนวน: buckets.M3.length },
      { รายการ: 'Probation M4 (91d+)', จำนวน: buckets.M4.length },
      ...byPosition.map((p) => ({ รายการ: `Position: ${p.position}`, จำนวน: p.count })),
    ]);
  });

  document.getElementById('dash-export-reminders').addEventListener('click', () => {
    // คนละไฟล์ เพราะสองรายการมีคอลัมน์ไม่เหมือนกัน (exportCsv ใช้ key ของแถวแรกเป็นหัวตาราง)
    exportCsv('dashboard-reminders-apply-ladder.csv', ladderDue.map((r) => ({
      EmployeeID: r.EmployeeID, ชื่อ: r.ThaiName, เดือนที่: r.Month, 'Apply Ladder After Probation': r.ApplyLadderStatus,
    })));
    exportCsv('dashboard-reminders-orientation-checklist.csv', hrSendDue.map((r) => ({
      EmployeeID: r.EmployeeID, ชื่อ: r.ThaiName, เดือนที่: r.Month,
      เช็คเดือนที่1: monthStatus(r.Orient1Date), เช็คเดือนที่2: monthStatus(r.Orient2Date),
      เช็คเดือนที่3: monthStatus(r.Orient3Date), เช็คเดือนที่4: monthStatus(r.Orient4Date),
      สถานะส่งHR: r.OrientSentHRDate ? 'ส่งแล้ว' : 'รอส่ง',
    })));
  });
}
