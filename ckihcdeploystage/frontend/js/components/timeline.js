// Mission Timeline ของช่วงทดลองงาน — ดัดแปลงจาก probation_timeline.html ให้กินข้อมูลจริงจาก backend (4 เดือน Orientation + checkpoint 60/119 วัน)
import { formatDateTH } from '../utils.js';
import { ICON_CROWN, ICON_STAR, ICON_PARTY, iconInline } from '../icons.js';

const medalSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1.5 6H8.5L7 3z"/><circle cx="12" cy="15" r="6"/><path d="M9.5 15l1.7 1.7 3.3-3.4"/></svg>`;
const checkSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
const trophySVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>`;

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// แสดงเดือนที่ 1-4 ของ Orientation Checklist (ไม่รวม 1st/2nd Evaluation ซึ่งย้ายไปหน้า Probation Tracking แล้ว)
function buildMilestones(s) {
  const today = new Date();
  const stages = s.stages || [];
  return stages.map((st, idx) => {
    const isFinal = idx === stages.length - 1;
    const isFuture = !st.checked && new Date(st.date) > today;
    return {
      label: st.label, day: '',
      sub: st.checked ? `เสร็จสิ้น (${formatDateTH(st.checkedDate)})` : '',
      date: st.date, done: !!st.checked, goal: isFinal, dim: isFuture,
    };
  });
}

export function renderTimeline(container, s) {
  container.innerHTML = `
    <section class="probation" id="probation">
      <div class="head">
        <div class="avatar" id="pv-initials">N</div>
        <div class="who">
          <p class="eyebrow">Probation Journey</p>
          <h2 id="pv-name">—</h2>
          <p><b id="pv-pos">—</b> · <span id="pv-cc">—</span></p>
          <p>เริ่มงาน <b id="pv-hire">—</b> · ครบกำหนด <b id="pv-end">—</b></p>
        </div>
        <div class="ring">
          <div class="dial">
            <svg width="78" height="78" viewBox="0 0 78 78">
              <defs>
                <linearGradient id="pgrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#3E9E6B"/><stop offset="1" stop-color="#B8862F"/>
                </linearGradient>
              </defs>
              <circle class="track" cx="39" cy="39" r="33" fill="none" stroke-width="7"/>
              <circle class="fill" cx="39" cy="39" r="33" fill="none" stroke-width="7" stroke-dasharray="207.3" stroke-dashoffset="207.3" id="pv-ring"/>
            </svg>
            <div class="pct" id="pv-pct">0%</div>
          </div>
          <div class="meta">คงเหลือ<b id="pv-remain">— วัน</b>ผ่านมาแล้ว <span id="pv-elapsed">—</span> วัน</div>
        </div>
      </div>
      <div class="title"><h3>Mission</h3><span class="rule"></span><span class="status-chip" id="pv-status">—</span></div>
      <div class="track-card"><div class="rail" id="pv-rail"></div><p class="note" id="pv-note"></p></div>
    </section>`;

  const root = container.querySelector('#probation');
  const today = new Date();
  const hasHireDate = !!s.hireDate && !Number.isNaN(new Date(s.hireDate).getTime());
  const hire = hasHireDate ? new Date(s.hireDate) : today;
  const end = new Date(hire);
  end.setDate(end.getDate() + 119);

  container.querySelector('#pv-initials').textContent = (s.name || 'N').trim().charAt(0).toUpperCase();
  container.querySelector('#pv-name').textContent = s.name || '—';
  container.querySelector('#pv-pos').textContent = s.position || '—';
  container.querySelector('#pv-cc').textContent = s.costCenter || '—';
  container.querySelector('#pv-hire').textContent = formatDateTH(s.hireDate);
  container.querySelector('#pv-end').textContent = hasHireDate ? formatDateTH(end.toISOString().slice(0, 10)) : '—';

  const elapsed = Math.max(0, daysBetween(hire, today));
  const remain = Math.max(0, daysBetween(today, end));
  container.querySelector('#pv-elapsed').textContent = elapsed;
  container.querySelector('#pv-remain').textContent = s.status === 'Passed' ? 'ผ่านแล้ว' : `${remain} วัน`;

  const ms = buildMilestones(s);
  let currentIdx = ms.findIndex((m) => !m.done);
  if (currentIdx === -1) currentIdx = ms.length;

  const doneCount = ms.filter((m) => m.done).length;
  const pct = Math.round((doneCount / ms.length) * 100);
  container.querySelector('#pv-pct').textContent = `${pct}%`;
  const C = 2 * Math.PI * 33;
  container.querySelector('#pv-ring').style.strokeDashoffset = C * (1 - pct / 100);

  const chip = container.querySelector('#pv-status');
  const map = { Active: ['กำลังทดลองงาน', 'active'], Passed: ['ผ่านทดลองงาน', ''], Extended: ['ขยายเวลา', 'active'], 'Not Passed': ['ไม่ผ่านทดลองงาน', ''], Resign: ['ลาออก', ''], Terminated: ['สิ้นสุดสัญญา', ''] };
  const [txt, cls] = map[s.status] || ['—', ''];
  chip.textContent = txt;
  chip.className = `status-chip ${cls}`;

  const rail = container.querySelector('#pv-rail');
  // minmax(0,1fr) (ไม่ใช่แค่ 1fr เฉย ๆ) ให้แต่ละคอลัมน์ยอมหดเล็กกว่าความกว้างเนื้อหาขั้นต่ำได้ — กันข้อความ/ไอคอนดันให้ rail ล้นขอบจอมือถือ
  rail.style.gridTemplateColumns = `repeat(${ms.length}, minmax(0,1fr))`;
  rail.innerHTML = ms.map((m, i) => {
    const state = m.done ? 'done' : i === currentIdx ? 'current' : '';
    const goal = m.goal ? 'goal' : '';
    const dim = m.dim ? 'dim' : '';
    const icon = m.done ? (m.goal ? trophySVG : checkSVG) : m.goal ? trophySVG : medalSVG;
    return `<div class="stop ${state} ${goal} ${dim}">
        <div class="medal"><span class="rank">${m.goal ? ICON_CROWN : ICON_STAR}</span>${icon}</div>
        <div class="stop-info">
          <div class="lbl">${m.label}</div>
          <div class="day">${m.day}</div>
          ${m.sub ? `<div class="sub">${m.sub}</div>` : ''}
          <div class="date">${formatDateTH(m.date)}</div>
        </div>
      </div>`;
  }).join('');

  const frac = Math.min(1, doneCount / Math.max(1, ms.length - 1));
  rail.style.setProperty('--progress', frac.toFixed(3));

  const note = container.querySelector('#pv-note');
  if (s.status === 'Passed') note.innerHTML = `${iconInline(ICON_PARTY)} ยินดีด้วย! ผ่านการทดลองงานครบทุกภารกิจแล้ว`;
  else note.textContent = '';

  requestAnimationFrame(() => root.classList.add('in'));
}
