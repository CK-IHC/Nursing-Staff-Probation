import { api, state } from '../api.js';
import { formatDateTH, escapeHtml, renderGuard } from '../utils.js';

export async function render(container) {
  const isCurrent = renderGuard(container);
  const all = await api.get('/api/meetings');
  if (!isCurrent()) return;
  const mine = all.filter((m) => m.Attendees.some((a) => a.EmployeeID === state.user.EmployeeID));

  container.innerHTML = `
    <div class="section-title">การประชุมที่ฉันเข้าร่วม (${mine.length})</div>
    ${mine.length === 0 ? '<div class="empty-state">ยังไม่มีประวัติการเข้าร่วมประชุม</div>' : mine.map((m) => `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:10px; flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 4px;">${escapeHtml(m.Title)}</h3>
            <p style="color:var(--muted); font-size:14px; margin:0;">${formatDateTH(m.Date)}${m.Time ? ` · ${escapeHtml(m.Time)}` : ''}</p>
          </div>
          <span class="badge ${m.Status === 'เสร็จสิ้น' ? 'badge-green' : m.Status === 'กำลังดำเนินการ' ? 'badge-gold' : 'badge-gray'}">${escapeHtml(m.Status)}</span>
        </div>
        ${m.Detail ? `<p style="margin-top:8px;">${escapeHtml(m.Detail)}</p>` : ''}
      </div>`).join('')}`;
}
