import { api, state } from '../api.js';
import { formatDateTH, renderGuard } from '../utils.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { ICON_CHECK_CIRCLE, ICON_CIRCLE_DOT, ICON_CLOCK } from '../icons.js';

function checkpointStatus(cp) {
  if (cp.done) return { icon: ICON_CHECK_CIRCLE, cls: 'done', text: `เสร็จสิ้น · ผล: ${cp.result || '—'} (${formatDateTH(cp.evalDate)})` };
  if (cp.checkinDate) return { icon: ICON_CIRCLE_DOT, cls: '', text: `Completed · เข้าร่วมประเมินเมื่อ ${formatDateTH(cp.checkinDate)} (รอบันทึกผลอย่างเป็นทางการ)` };
  return { icon: ICON_CLOCK, cls: '', text: `กำหนด ${formatDateTH(cp.dueDate)} · รอถึงกำหนด` };
}

export async function render(container) {
  const isCurrent = renderGuard(container);
  const empId = state.user.EmployeeID;
  const [s, staff] = await Promise.all([
    api.get(`/api/evaluations/probation/${empId}`),
    api.get(`/api/staff/${empId}`),
  ]);
  if (!isCurrent()) return;

  container.innerHTML = `
    <div class="card">
      <h3>Probation Tracking</h3>
      <p style="color:var(--muted); font-size:14.5px;">${s.name} · ${s.position || ''} — สถานะ: ${s.status || '—'}</p>
      <div class="checklist-grid">
        ${(s.checkpoints || []).map((cp) => {
          const st = checkpointStatus(cp);
          const showCheckin = !cp.done && !cp.checkinDate;
          return `
          <div class="checklist-item ${st.cls}">
            <span class="checklist-icon">${st.icon}</span>
            <div style="flex:1;">
              <div class="checklist-label">${cp.label}</div>
              <div class="checklist-date">${st.text}</div>
              ${showCheckin ? `
                <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
                  <input type="date" class="checkin-date" data-period="${cp.period}" />
                  <button type="button" class="btn btn-secondary btn-sm checkin-btn" data-period="${cp.period}">เข้าร่วมประเมินแล้ว · Update Status</button>
                </div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>ส่ง Orientation Checklist ให้ HR</h3>
      ${staff.OrientSentHRDate ? `
        <div class="checklist-item done">
          <span class="checklist-icon">${ICON_CHECK_CIRCLE}</span>
          <div><div class="checklist-label">ส่ง HR แล้ว</div><div class="checklist-date">วันที่ส่ง ${formatDateTH(staff.OrientSentHRDate)}</div></div>
        </div>` : `
        <div class="checklist-item">
          <span class="checklist-icon">${ICON_CLOCK}</span>
          <div style="flex:1;">
            <div class="checklist-label">ยังไม่ได้ส่ง</div>
            <div class="checklist-date">หากนำส่ง Orientation Checklist ให้ HR แล้ว ให้ระบุวันที่แล้วกด Update Status</div>
            <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
              <input type="date" id="hr-send-date" />
              <button type="button" class="btn btn-secondary btn-sm" id="hr-send-btn">ส่ง HR แล้ว · Update Status</button>
            </div>
          </div>
        </div>`}
    </div>`;

  container.querySelectorAll('.checkin-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const period = btn.dataset.period;
      const input = container.querySelector(`.checkin-date[data-period="${period}"]`);
      const date = input.value;
      if (!date) { toastError('กรุณาเลือกวันที่เข้าร่วมประเมิน'); return; }
      try {
        await withLoading(() => api.post(`/api/evaluations/probation/${empId}/checkin`, { period, date }));
        toastSuccess('อัปเดตสถานะเป็น Completed สำเร็จ');
        await render(container);
      } catch (err) {
        toastError(err.message);
      }
    });
  });

  const hrBtn = container.querySelector('#hr-send-btn');
  if (hrBtn) {
    hrBtn.addEventListener('click', async () => {
      const date = container.querySelector('#hr-send-date').value;
      if (!date) { toastError('กรุณาเลือกวันที่ส่ง HR'); return; }
      try {
        await withLoading(() => api.post(`/api/staff/${empId}/orient-hr-checkin`, { date }));
        toastSuccess('บันทึกสถานะส่ง HR แล้วสำเร็จ');
        await render(container);
      } catch (err) {
        toastError(err.message);
      }
    });
  }
}
