import { api } from '../api.js';
import { listValues } from '../state.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml } from '../utils.js';

const PERIODS = [{ value: '60', label: '60 วัน (ประเมินครั้งที่ 1 — Formative)' }, { value: '119', label: '119 วัน (ประเมินครั้งที่ 2 — Final Summative)' }];

function loadForm(container, staff) {
  container.innerHTML = `
    <div class="card">
      <h3>ประเมิน: ${escapeHtml(staff.ThaiName)} (${escapeHtml(staff.EmployeeID)})</h3>
      <form id="eval-form">
        <div class="form-grid cols-2">
          <div class="field"><label>รอบการประเมิน</label>
            <select id="eval-period">${PERIODS.map((p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>ผลการประเมิน *</label>
            <select id="eval-result" required><option value="">-- เลือก --</option>${listValues('EvalResult').map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field field-full"><label>ความเห็นเพิ่มเติม</label><textarea id="eval-comment" rows="3"></textarea></div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;">บันทึกผลการประเมิน</button>
      </form>
    </div>`;

  document.getElementById('eval-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const period = document.getElementById('eval-period').value;
    const result = document.getElementById('eval-result').value;
    const comment = document.getElementById('eval-comment').value.trim();
    try {
      await withLoading(() => api.post('/api/evaluations', { employeeId: staff.EmployeeID, period, result, comment }));
      toastSuccess('บันทึกผลการประเมินสำเร็จ');
    } catch (err) {
      toastError(err.message);
    }
  });
}

export async function render(container) {
  const team = await api.get('/api/staff/team');

  container.innerHTML = `
    <div class="toolbar">
      <div class="field" style="min-width:260px;">
        <label>เลือกพนักงานในความรับผิดชอบ</label>
        <select id="team-select">
          <option value="">— เลือกพนักงาน —</option>
          ${team.map((s) => `<option value="${s.EmployeeID}">${escapeHtml(s.ThaiName)} (${s.EmployeeID})</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="eval-slot">${team.length === 0 ? '<div class="empty-state">ยังไม่มีพนักงานในความรับผิดชอบของคุณ</div>' : ''}</div>`;

  document.getElementById('team-select').addEventListener('change', (e) => {
    const staff = team.find((s) => s.EmployeeID === e.target.value);
    const slot = document.getElementById('eval-slot');
    if (!staff) {
      slot.innerHTML = '';
      return;
    }
    loadForm(slot, staff);
  });
}
