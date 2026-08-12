import { api } from '../api.js';
import { cache } from '../state.js';
import { toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, qs } from '../utils.js';
import { renderCard } from './aiCoach.js';
import { attachStaffSearch } from '../components/staffSearch.js';
import { ICON_PARTY, ICON_TREND_DOWN, ICON_TREND_UP, ICON_ARROW_RIGHT, iconInline } from '../icons.js';

const SUGGESTION = {
  'บทบาท/งานที่ได้รับ': 'คุยกับหัวหน้าเรื่องขอบเขตงานให้ชัด',
  'การพัฒนา/อบรม': 'ลงคอร์ส/ขอ on-the-job training เพิ่ม',
  'สภาพแวดล้อม/อุปกรณ์': 'แจ้งหน่วยงานเรื่องอุปกรณ์',
  'ตารางงาน/พักผ่อน': 'จัดการเวร/พักผ่อน, คุย workload',
  'ทีม/การยอมรับ': 'สร้างสัมพันธ์ทีม, ขอ feedback',
  'สื่อสารสหวิชาชีพ': 'ฝึกส่งเวร/SBAR, สื่อสารกับแพทย์',
  'การปรับตัว': 'ตั้งเป้าเรียนรู้ระบบงานทีละส่วน',
  'ความสุขในงาน': 'คุย preceptor, ดูแล wellbeing',
};

export async function render(container) {
  const staffList = await api.get('/api/staff');
  const now = new Date().toISOString().slice(0, 7);

  container.innerHTML = `
    <div class="toolbar">
      <select id="t-cc"><option value="">ทุกหน่วยงาน</option>${cache.costCenters.map((c) => `<option value="${c.CostCenterID}">${escapeHtml(c.Name)}</option>`).join('')}</select>
      <input type="month" id="t-round" value="${now}" />
      <button id="t-run" class="btn btn-primary btn-sm">แสดงสรุป</button>
    </div>
    <div id="t-summary"></div>
    <div class="section-title">ดูคำแนะนำ AI รายบุคคล</div>
    <div class="toolbar">
      <div style="position:relative; max-width:300px; flex:1;">
        <input id="t-emp-search" placeholder="พิมพ์ Employee ID หรือชื่อเพื่อค้นหา..." autocomplete="off" style="width:100%;" />
        <input type="hidden" id="t-emp" />
        <div id="t-emp-results" class="search-dropdown hidden"></div>
      </div>
      <button id="t-view-emp" class="btn btn-ghost btn-sm">ดูคำแนะนำ</button>
    </div>
    <div id="t-emp-card"></div>`;

  attachStaffSearch({
    searchInput: document.getElementById('t-emp-search'),
    hiddenInput: document.getElementById('t-emp'),
    resultsBox: document.getElementById('t-emp-results'),
    allStaff: staffList,
  });

  async function runSummary() {
    const costCenterId = document.getElementById('t-cc').value;
    const round = document.getElementById('t-round').value;
    try {
      const data = await withLoading(() => api.get(`/api/ai/admin/theme-summary${qs({ costCenterId, round })}`));
      const el = document.getElementById('t-summary');
      if (data.respondentCount === 0) {
        el.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูลแบบสอบถามในรอบนี้</div>';
        return;
      }
      el.innerHTML = `
        <div class="card">
          <h3>ธีมที่กลุ่มทดลองงานควรพัฒนาร่วมกัน (${escapeHtml(data.round)}) — จากผู้ตอบ ${data.respondentCount} คน</h3>
          ${data.weakThemes.length === 0 ? `<p>${iconInline(ICON_PARTY)} ไม่พบหัวข้อที่มีคะแนนต่ำเป็นกลุ่ม</p>` : data.weakThemes.map((w) => `
            <p>${iconInline(ICON_TREND_DOWN)} <b>${escapeHtml(w.topic)}</b> ต่ำใน ${w.lowCount}/${w.total} คน ${iconInline(ICON_ARROW_RIGHT)} ${escapeHtml(SUGGESTION[w.topic] || 'ควรติดตามเพิ่มเติมเป็นรายบุคคล')}</p>
          `).join('')}
          <p style="margin-top:14px; font-weight:600;">จุดแข็งของกลุ่ม</p>
          ${data.strongThemes.map((s) => `<p>${iconInline(ICON_TREND_UP)} ${escapeHtml(s.topic)} แข็งแรง (เฉลี่ย ${s.avg})</p>`).join('') || '<p>—</p>'}
        </div>`;
    } catch (err) {
      toastError(err.message);
    }
  }

  document.getElementById('t-run').addEventListener('click', runSummary);
  document.getElementById('t-view-emp').addEventListener('click', async () => {
    const empId = document.getElementById('t-emp').value;
    if (!empId) return;
    const cardEl = document.getElementById('t-emp-card');
    try {
      const data = await withLoading(() => api.get(`/api/ai/coach/${empId}`));
      cardEl.innerHTML = renderCard(data, data?.round);
    } catch (err) {
      toastError(err.message);
    }
  });

  await runSummary();
}
