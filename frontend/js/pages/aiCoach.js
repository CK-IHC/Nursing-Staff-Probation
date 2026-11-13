import { api, state } from '../api.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml } from '../utils.js';
import { ICON_SPARKLE, ICON_TARGET, iconInline } from '../icons.js';

export function renderCard(data, round) {
  if (!data) {
    return `<div class="empty-state">ยังไม่มีคำแนะนำจาก AI สำหรับรอบนี้ กดปุ่มด้านล่างเพื่อสร้างคำแนะนำ (ต้องทำแบบสอบถามความพึงพอใจรายเดือนก่อน)</div>`;
  }
  return `
    <div class="ai-card">
      <h3>${iconInline(ICON_SPARKLE)} คำแนะนำจาก AI · ประจำเดือน ${escapeHtml(round || data.round || '')}</h3>
      <p style="font-weight:600; margin-top:14px;">จุดแข็งเดือนนี้</p>
      <ul class="ai-list">${(data.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>'}</ul>
      <p style="font-weight:600; margin-top:14px;">สิ่งที่ควรพัฒนา</p>
      <ul class="ai-list">
        ${(data.improvements || []).map((i) => `<li><b>${escapeHtml(i.topic)}</b> (${i.score ?? '-'}/5) — ${escapeHtml(i.action)}</li>`).join('') || '<li>—</li>'}
      </ul>
      <div class="ai-goal">${iconInline(ICON_TARGET)} เป้าหมายเดือนหน้า: ${escapeHtml(data.nextGoal || '—')}</div>
      <p style="font-size:12.5px; color:var(--muted); margin-top:14px;">* คำแนะนำเป็นข้อมูลประกอบ — ปรึกษาพี่เลี้ยง/หัวหน้าเพิ่มเติม ระบบใช้ AI ช่วยวิเคราะห์และบันทึกไว้ในระบบโดยอัตโนมัติ</p>
    </div>`;
}

export async function render(container) {
  const empId = state.user.EmployeeID;
  container.innerHTML = `
    <div class="toolbar">
      <span style="color:var(--muted); font-size:14px;">คำแนะนำการพัฒนารายเดือนจาก AI Coach วิเคราะห์จากคะแนนความพึงพอใจของคุณ</span>
      <span class="spacer"></span>
      <button id="regen-btn" class="btn btn-secondary btn-sm">สร้างคำแนะนำใหม่</button>
    </div>
    <div id="ai-slot"></div>`;

  const slot = document.getElementById('ai-slot');
  try {
    const existing = await api.get(`/api/ai/coach/${empId}`);
    slot.innerHTML = renderCard(existing, existing?.round);
  } catch (err) {
    slot.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }

  document.getElementById('regen-btn').addEventListener('click', async () => {
    try {
      const result = await withLoading(() => api.post(`/api/ai/coach/${empId}/generate?force=true`, {}));
      slot.innerHTML = renderCard(result);
      toastSuccess('สร้างคำแนะนำจาก AI สำเร็จ และบันทึกลงสมุดพัฒนาของคุณแล้ว');
    } catch (err) {
      toastError(err.message);
    }
  });
}
