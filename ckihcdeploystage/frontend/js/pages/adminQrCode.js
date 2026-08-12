// หน้า QR Code (Admin): สแกน QR เพื่อบันทึกเข้าร่วม Monthly Meeting + ตรวจสอบ Orientation Checklist ของพนักงาน
// ใช้ไลบรารี jsQR (js/vendor/jsQR.js) ถอดรหัสจากเฟรมวิดีโอผ่าน canvas — ไม่พึ่ง BarcodeDetector API ของเบราว์เซอร์
// (BarcodeDetector ไม่มีใน iOS Safari/Chrome-on-iOS เลย ทำให้สแกนไม่ได้บนมือถือ iPhone ทุกรุ่น) ใช้ได้ทุกเบราว์เซอร์ที่รองรับกล้อง+canvas
import { api } from '../api.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH } from '../utils.js';
import { ICON_CHECK, ICON_CHECK_CIRCLE, ICON_CLOCK, iconInline } from '../icons.js';

let stream = null;
let scanLoopId = null;

function stopScan(video) {
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (video) video.srcObject = null;
}

async function startScan(video, onDetect) {
  stopScan(video);
  if (!navigator.mediaDevices?.getUserMedia) {
    toastError('เบราว์เซอร์นี้ไม่รองรับกล้อง กรุณากรอกรหัสพนักงานด้วยตนเอง');
    return;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          stopScan(video);
          onDetect(code.data);
          return;
        }
      }
      scanLoopId = requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    toastError('เปิดกล้องไม่สำเร็จ: ' + err.message);
  }
}

function extractEmployeeId(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.employeeId) return String(obj.employeeId);
  } catch { /* ไม่ใช่ JSON ใช้ค่าดิบตรง ๆ */ }
  return String(raw || '').trim();
}

function orientationCell(d) {
  return d ? `<span class="badge badge-green">${iconInline(ICON_CHECK)} ${formatDateTH(d)}</span>` : '<span class="badge badge-gray">—</span>';
}
function orientationRow(label, date) {
  return `<div class="checklist-item ${date ? 'done' : ''}"><span class="checklist-icon">${date ? ICON_CHECK_CIRCLE : ICON_CLOCK}</span><div><div class="checklist-label">${label}</div><div class="checklist-date">${orientationCell(date)}</div></div></div>`;
}

// เดือนปัจจุบันของ Orientation Checklist ตามจำนวนวันที่ทำงานมาแล้ว (M1 0-30d, M2 31-60d, M3 61-90d, M4 91-119d)
const ORIENT_MONTHS = [
  { field: 'Orient1Date', label: 'เดือนที่ 1 (0-30 วัน)', maxDays: 30 },
  { field: 'Orient2Date', label: 'เดือนที่ 2 (31-60 วัน)', maxDays: 60 },
  { field: 'Orient3Date', label: 'เดือนที่ 3 (61-90 วัน)', maxDays: 90 },
  { field: 'Orient4Date', label: 'เดือนที่ 4 (91-119 วัน)', maxDays: 119 },
];
function currentOrientMonth(hireDate) {
  if (!hireDate) return null;
  const days = Math.floor((Date.now() - new Date(`${hireDate}T00:00:00`).getTime()) / 86400000);
  if (days < 0 || days > 119) return null;
  return ORIENT_MONTHS.find((m) => days <= m.maxDays) || null;
}

export async function render(container) {
  const meetings = await api.get('/api/meetings');

  container.innerHTML = `
    <div class="card">
      <h3>สแกน QR Code — บันทึกเข้าร่วม Monthly Meeting</h3>
      <div class="field field-full" style="max-width:420px; margin-top:10px;">
        <label>เลือกการประชุม</label>
        <select id="qr-meeting">${meetings.map((m) => `<option value="${m.MeetingID}">${escapeHtml(m.Title)} — ${formatDateTH(m.Date)}</option>`).join('') || '<option value="">— ยังไม่มีการประชุม —</option>'}</select>
      </div>
      <div style="display:flex; gap:20px; flex-wrap:wrap; margin-top:14px; align-items:flex-start;">
        <div style="flex:0 0 260px;">
          <video id="qr-video" style="width:260px; height:195px; background:#000; border-radius:12px; object-fit:cover;" muted playsinline></video>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button type="button" id="qr-start" class="btn btn-primary btn-sm">Scan QR Code</button>
            <button type="button" id="qr-stop" class="btn btn-ghost btn-sm">หยุดกล้อง</button>
          </div>
        </div>
        <div style="flex:1; min-width:220px;">
          <label style="font-size:13.5px; font-weight:600; color:var(--muted); display:block; margin-bottom:4px;">หรือกรอกรหัสพนักงานด้วยตนเอง</label>
          <div style="display:flex; gap:8px;">
            <input id="qr-manual-id" placeholder="รหัสพนักงาน" style="flex:1; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" />
            <button type="button" id="qr-manual-btn" class="btn btn-secondary btn-sm">บันทึก</button>
          </div>
          <div id="qr-attend-log" style="margin-top:14px; font-size:14px; color:var(--muted); display:flex; flex-direction:column; gap:4px;"></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>ตรวจสอบ Orientation Checklist</h3>
      <div style="display:flex; gap:8px; max-width:460px; margin-top:10px;">
        <input id="oc-lookup-id" placeholder="กรอกหรือสแกนรหัสพนักงาน" style="flex:1; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" />
        <button type="button" id="oc-lookup-btn" class="btn btn-secondary">ตรวจสอบ</button>
        <button type="button" id="oc-lookup-scan" class="btn btn-ghost">สแกน</button>
      </div>
      <div id="oc-lookup-result" style="margin-top:16px;"></div>
    </div>`;

  const video = document.getElementById('qr-video');

  async function recordAttendance(employeeId) {
    if (!employeeId) return;
    const meetingId = document.getElementById('qr-meeting').value;
    if (!meetingId) { toastError('กรุณาเลือกการประชุมก่อน'); return; }
    const meeting = meetings.find((m) => m.MeetingID === meetingId);
    const ids = meeting.Attendees.map((a) => a.EmployeeID);
    if (ids.includes(employeeId)) { toastError(`${employeeId} เข้าร่วมประชุมนี้แล้ว`); return; }
    try {
      const staff = await api.get(`/api/staff/${employeeId}`);
      await withLoading(() => api.put(`/api/meetings/${meetingId}`, { Attendees: [...ids, employeeId] }));
      meeting.Attendees.push({ EmployeeID: employeeId, ThaiName: staff.ThaiName });
      toastSuccess(`บันทึกเข้าร่วมประชุมสำเร็จ: ${staff.ThaiName}`);
      const log = document.getElementById('qr-attend-log');
      log.insertAdjacentHTML('afterbegin', `<div>${iconInline(ICON_CHECK)} ${escapeHtml(staff.EmployeeID)} — ${escapeHtml(staff.ThaiName)}</div>`);
    } catch (err) {
      toastError(err.message);
    }
  }

  document.getElementById('qr-start').addEventListener('click', () => {
    startScan(video, (raw) => recordAttendance(extractEmployeeId(raw)));
  });
  document.getElementById('qr-stop').addEventListener('click', () => stopScan(video));
  document.getElementById('qr-manual-btn').addEventListener('click', () => {
    const input = document.getElementById('qr-manual-id');
    recordAttendance(input.value.trim());
    input.value = '';
  });

  async function lookupOrientation(employeeId) {
    const box = document.getElementById('oc-lookup-result');
    box.innerHTML = '<div class="empty-state">กำลังตรวจสอบ...</div>';
    try {
      const s = await api.get(`/api/staff/${employeeId}`);
      const current = currentOrientMonth(s.HireDate);
      const needsCheckin = current && !s[current.field];
      box.innerHTML = `
        <p style="font-weight:600; color:var(--teal-900); margin:0 0 10px;">${escapeHtml(s.EmployeeID)} — ${escapeHtml(s.ThaiName)} (${escapeHtml(s.Position || '')})</p>
        <div class="checklist-grid">
          ${orientationRow('เดือนที่ 1 (0-30 วัน)', s.Orient1Date)}
          ${orientationRow('เดือนที่ 2 (31-60 วัน)', s.Orient2Date)}
          ${orientationRow('เดือนที่ 3 (61-90 วัน)', s.Orient3Date)}
          ${orientationRow('เดือนที่ 4 (91-119 วัน)', s.Orient4Date)}
          ${orientationRow('ส่งให้ HR', s.OrientSentHRDate)}
        </div>
        ${needsCheckin ? `<button type="button" id="oc-checkin-btn" class="btn btn-primary btn-sm" style="margin-top:12px;" data-emp="${escapeHtml(s.EmployeeID)}" data-field="${current.field}">เช็คอิน ${current.label} วันนี้</button>` : ''}`;
      const checkinBtn = document.getElementById('oc-checkin-btn');
      if (checkinBtn) {
        checkinBtn.addEventListener('click', async () => {
          const today = new Date().toISOString().slice(0, 10);
          try {
            await withLoading(() => api.put(`/api/staff/${checkinBtn.dataset.emp}`, { [checkinBtn.dataset.field]: today }));
            toastSuccess('เช็คอิน Orientation สำเร็จ');
            lookupOrientation(employeeId);
          } catch (err) {
            toastError(err.message);
          }
        });
      }
    } catch (err) {
      box.innerHTML = `<div class="empty-state">ไม่พบข้อมูล: ${escapeHtml(err.message)}</div>`;
    }
  }

  document.getElementById('oc-lookup-btn').addEventListener('click', () => {
    const id = document.getElementById('oc-lookup-id').value.trim();
    if (id) lookupOrientation(id);
  });
  document.getElementById('oc-lookup-scan').addEventListener('click', () => {
    startScan(video, (raw) => {
      const id = extractEmployeeId(raw);
      document.getElementById('oc-lookup-id').value = id;
      lookupOrientation(id);
    });
  });
}

export function unmount() {
  stopScan(null);
}
