import { api } from '../api.js';
import { escapeHtml, exportCsv, printReport, printIsolated } from '../utils.js';

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

function monthStatus(dateValue) {
  return dateValue ? 'เสร็จสิ้น' : 'ยังไม่ดำเนินการ';
}
function monthBadge(status) {
  return status === 'เสร็จสิ้น' ? 'badge-green' : 'badge-gray';
}

export async function render(container) {
  const [summary, activeStaff, round60, round119] = await Promise.all([
    api.get('/api/dashboard/summary'),
    api.get('/api/staff?status=Active'),
    api.get('/api/evaluations/list?round=60'),
    api.get('/api/evaluations/list?round=119'),
  ]);
  const { statusCounts: c, byPosition } = summary;

  const buckets = { M1: [], M2: [], M3: [], M4: [] };
  activeStaff.forEach((s) => { if (s.HireDate) buckets[bucketOf(s.HireDate)].push(s); });

  const round60ByEmp = Object.fromEntries(round60.map((r) => [r.EmployeeID, r]));
  const round119ByEmp = Object.fromEntries(round119.map((r) => [r.EmployeeID, r]));

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
      ${byPosition.map((p) => `<div class="stat-card stat-outline"><span class="stat-label">${escapeHtml(p.position)}</span><span class="stat-value">${p.count} <small style="font-size:14px; font-weight:400;">คน</small></span></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>'}
    </div>

    <div class="toolbar" style="margin-top:22px;">
      <div class="section-title" style="margin:0;">ตารางสรุปรายเดือน (On Probation)</div>
      <span class="spacer"></span>
      <button id="dash-export-monthly" class="btn btn-secondary btn-sm">Export Excel</button>
      <button id="dash-print-monthly" class="btn btn-primary btn-sm">Print</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ชื่อพยาบาล</th><th>สถานะเดือนที่ 1</th><th>สถานะเดือนที่ 2</th><th>สถานะเดือนที่ 3</th><th>สถานะเดือนที่ 4</th><th>ผลประเมินครั้งที่ 1 (60 วัน)</th><th>ผลประเมินครั้งที่ 2 (119 วัน)</th></tr></thead>
        <tbody id="dash-monthly-body"></tbody>
      </table>
    </div>`;

  function monthlyRowsHtml() {
    return activeStaff.length === 0 ? '<tr><td colspan="7" class="empty-state">ไม่มีพนักงานที่อยู่ระหว่างทดลองงาน</td></tr>' : activeStaff.map((s) => {
      const m1 = monthStatus(s.Orient1Date), m2 = monthStatus(s.Orient2Date), m3 = monthStatus(s.Orient3Date), m4 = monthStatus(s.Orient4Date);
      const r60 = round60ByEmp[s.EmployeeID], r119 = round119ByEmp[s.EmployeeID];
      return `<tr>
        <td>${escapeHtml(s.EmployeeID)} — ${escapeHtml(s.ThaiName)}</td>
        <td><span class="badge ${monthBadge(m1)}">${m1}</span></td>
        <td><span class="badge ${monthBadge(m2)}">${m2}</span></td>
        <td><span class="badge ${monthBadge(m3)}">${m3}</span></td>
        <td><span class="badge ${monthBadge(m4)}">${m4}</span></td>
        <td>${r60?.HasEval ? escapeHtml(r60.Result) : 'รอถึงกำหนด'}</td>
        <td>${r119?.HasEval ? escapeHtml(r119.Result) : 'รอถึงกำหนด'}</td>
      </tr>`;
    }).join('');
  }

  const monthlyBody = document.getElementById('dash-monthly-body');
  monthlyBody.innerHTML = monthlyRowsHtml();

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

  document.getElementById('dash-print').addEventListener('click', () => printReport('Dashboard Summary Report', `On Probation ${c.onProbation} · Passed ${c.passed} · Total Staff ${c.total}`));
  document.getElementById('dash-print-monthly').addEventListener('click', () => {
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>ชื่อพยาบาล</th><th>สถานะเดือนที่ 1</th><th>สถานะเดือนที่ 2</th><th>สถานะเดือนที่ 3</th><th>สถานะเดือนที่ 4</th><th>ผลประเมินครั้งที่ 1 (60 วัน)</th><th>ผลประเมินครั้งที่ 2 (119 วัน)</th></tr></thead>
      <tbody>${monthlyRowsHtml()}</tbody>
    </table></div>`;
    printIsolated('ตารางสรุปรายเดือน (On Probation)', '', html);
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

  document.getElementById('dash-export-monthly').addEventListener('click', () => {
    exportCsv('dashboard-monthly-summary.csv', activeStaff.map((s) => ({
      EmployeeID: s.EmployeeID, ชื่อพยาบาล: s.ThaiName,
      สถานะเดือนที่1: monthStatus(s.Orient1Date), สถานะเดือนที่2: monthStatus(s.Orient2Date),
      สถานะเดือนที่3: monthStatus(s.Orient3Date), สถานะเดือนที่4: monthStatus(s.Orient4Date),
      ผลประเมินครั้งที่1: round60ByEmp[s.EmployeeID]?.HasEval ? round60ByEmp[s.EmployeeID].Result : 'รอถึงกำหนด',
      ผลประเมินครั้งที่2: round119ByEmp[s.EmployeeID]?.HasEval ? round119ByEmp[s.EmployeeID].Result : 'รอถึงกำหนด',
    })));
  });
}
