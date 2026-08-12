import { api, state } from '../api.js';
import { formatDateTH, renderGuard } from '../utils.js';
import { ICON_CHECK_CIRCLE, ICON_SQUARE, iconInline } from '../icons.js';

const MONTHS = [
  { field: 'Orient1Date', label: 'เดือนที่ 1 (0-30 วัน)', maxDays: 30 },
  { field: 'Orient2Date', label: 'เดือนที่ 2 (31-60 วัน)', maxDays: 60 },
  { field: 'Orient3Date', label: 'เดือนที่ 3 (61-90 วัน)', maxDays: 90 },
  { field: 'Orient4Date', label: 'เดือนที่ 4 (91-119 วัน)', maxDays: 119 },
];

// รอบเดือนปัจจุบันของการปฐมนิเทศ ตามจำนวนวันที่ทำงานมาแล้ว — ใช้เกณฑ์เดียวกับตาราง M1-M4 ในหน้า Admin Dashboard
function currentMonthIndex(hireDate) {
  if (!hireDate) return -1;
  const days = Math.floor((Date.now() - new Date(`${hireDate}T00:00:00`).getTime()) / 86400000);
  if (days < 0 || days > 119) return -1;
  return MONTHS.findIndex((m) => days <= m.maxDays);
}

export async function render(container) {
  const isCurrent = renderGuard(container);
  const staff = await api.get(`/api/staff/${state.user.EmployeeID}`);
  if (!isCurrent()) return;
  const checkedCount = MONTHS.filter((m) => staff[m.field]).length;
  const curIdx = currentMonthIndex(staff.HireDate);

  container.innerHTML = `
    <div class="card">
      <h3>Orientation Checklist ของฉัน</h3>
      <p style="color:var(--muted); font-size:14.5px;">ความคืบหน้า ${checkedCount}/4 เดือน</p>
      ${curIdx >= 0 ? `<p style="color:var(--muted); font-size:14.5px;">ขณะนี้อยู่ในรอบ <b>${MONTHS[curIdx].label}</b> — ${staff[MONTHS[curIdx].field] ? `ทำแล้วในเดือนนี้ ${iconInline(ICON_CHECK_CIRCLE)}` : 'ยังไม่ได้ทำในเดือนนี้'}</p>` : ''}
      <div class="checklist-grid">
        ${MONTHS.map((m, i) => `
          <div class="checklist-item ${staff[m.field] ? 'done' : ''} ${i === curIdx ? 'current' : ''}">
            <span class="checklist-icon">${staff[m.field] ? ICON_CHECK_CIRCLE : ICON_SQUARE}</span>
            <div><div class="checklist-label">${m.label}${i === curIdx ? ' (รอบปัจจุบัน)' : ''}</div><div class="checklist-date">${staff[m.field] ? formatDateTH(staff[m.field]) : 'รอตรวจ'}</div></div>
          </div>`).join('')}
      </div>
      <div class="form-grid cols-1" style="margin-top:16px;">
        <div class="field"><label>Apply Ladder Status</label><input value="${staff.ApplyLadderStatus || 'NA'}" disabled /></div>
        <div class="field"><label>Unit Specific Competency</label><input value="${staff.UnitSpecificCompetency || '—'}" disabled /></div>
      </div>
    </div>`;
}
