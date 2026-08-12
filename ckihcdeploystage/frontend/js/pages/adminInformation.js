import { api } from '../api.js';
import { escapeHtml, formatDateTH } from '../utils.js';
import { withLoading } from '../components/loading.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';

const MAX_FILE_MB = 15;
const MAX_COVER_MB = 5;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

// แก้ไข Information (แก้ได้เฉพาะชื่อเรื่อง/ลิงก์วิดีโอ/ช่วงวันที่แสดง/ปักหมุด/ติดดาว — เปลี่ยนไฟล์แนบ/รูปหน้าปกให้ลบแล้วอัปโหลดใหม่)
function editManualForm(record, onSaved) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="mn-edit-form" class="form-grid">
      <div class="field field-full"><label>ชื่อเรื่อง</label><input id="mne-title" value="${escapeHtml(record.Title || '')}" required /></div>
      <div class="field field-full"><label>ลิงก์วิดีโอ (YouTube/Google Drive ฯลฯ)</label><input id="mne-video" type="url" value="${escapeHtml(record.VideoURL || '')}" placeholder="https://..." /></div>
      <div class="field"><label>แสดงตั้งแต่วันที่ (ไม่บังคับ)</label><input type="date" id="mne-start" value="${record.StartDate || ''}" /></div>
      <div class="field"><label>แสดงถึงวันที่ (ไม่บังคับ)</label><input type="date" id="mne-end" value="${record.EndDate || ''}" /></div>
      <div class="field"><label><input type="checkbox" id="mne-pinned" style="width:auto; margin-right:6px;" ${record.Pinned === 'TRUE' ? 'checked' : ''} />ปักหมุด</label></div>
      <div class="field"><label><input type="checkbox" id="mne-featured" style="width:auto; margin-right:6px;" ${record.Featured === 'TRUE' ? 'checked' : ''} />ติดดาว (เป็นที่นิยม)</label></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mne-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
      </div>
    </form>`;
  const body = openModal('แก้ไข Information', wrap, { wide: true });
  body.querySelector('#mne-cancel').addEventListener('click', closeModal);
  body.querySelector('#mn-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = body.querySelector('#mne-title').value.trim();
    if (!title) return;
    try {
      await withLoading(() => api.put(`/api/manuals/${record.ManualID}`, {
        title, videoUrl: body.querySelector('#mne-video').value.trim(),
        startDate: body.querySelector('#mne-start').value, endDate: body.querySelector('#mne-end').value,
        pinned: body.querySelector('#mne-pinned').checked, featured: body.querySelector('#mne-featured').checked,
      }));
      toastSuccess('บันทึกการแก้ไขสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) { toastError(err.message); }
  });
}

export async function render(container) {
  container.innerHTML = `
    <div class="card">
      <h3>อัปโหลด Information</h3>
      <form id="manual-form" class="form-grid">
        <div class="field field-full"><label>ชื่อเรื่อง</label><input id="mn-title" placeholder="เช่น คู่มือปฐมนิเทศพนักงานใหม่" required /></div>
        <div class="field field-full">
          <label>ไฟล์ (PDF/Word/รูปภาพ) — ไม่เกิน ${MAX_FILE_MB} MB (ใส่หรือไม่ใส่ก็ได้ ถ้ามีลิงก์วิดีโอ)</label>
          <input type="file" id="mn-file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
        </div>
        <div class="field field-full"><label>ลิงก์วิดีโอ (YouTube/Google Drive ฯลฯ)</label><input id="mn-video" type="url" placeholder="https://..." /></div>
        <div class="field field-full">
          <label>รูปหน้าปก (ไม่บังคับ) — ไม่เกิน ${MAX_COVER_MB} MB, แนะนำขนาด 1200 x 675 px (อัตราส่วน 16:9)</label>
          <input type="file" id="mn-cover" accept=".png,.jpg,.jpeg,.webp" />
        </div>
        <div class="field"><label>แสดงตั้งแต่วันที่ (ไม่บังคับ)</label><input type="date" id="mn-start" /></div>
        <div class="field"><label>แสดงถึงวันที่ (ไม่บังคับ)</label><input type="date" id="mn-end" /></div>
        <div class="field"><label><input type="checkbox" id="mn-pinned" style="width:auto; margin-right:6px;" />ปักหมุด</label></div>
        <div class="field"><label><input type="checkbox" id="mn-featured" style="width:auto; margin-right:6px;" />ติดดาว (เป็นที่นิยม)</label></div>
        <div class="field field-full"><button type="submit" class="btn btn-primary">อัปโหลด</button></div>
      </form>
    </div>
    <div class="card">
      <h3>รายการ Information</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ชื่อเรื่อง</th><th>ไฟล์/วิดีโอ</th><th>แสดงช่วง</th><th>ปักหมุด</th><th>ดาว</th><th>อัปโหลดเมื่อ</th><th></th></tr></thead>
          <tbody id="mn-body"><tr><td colspan="7" class="empty-state">กำลังโหลด...</td></tr></tbody>
        </table>
      </div>
    </div>`;

  async function reload() {
    const rows = await api.get('/api/manuals');
    const body = document.getElementById('mn-body');
    if (!body) return;
    body.innerHTML = rows.length === 0 ? '<tr><td colspan="7" class="empty-state">ยังไม่มี Information</td></tr>' : rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.Title)}</td>
        <td>${r.FileName ? escapeHtml(r.FileName) : ''}${r.VideoURL ? `${r.FileName ? '<br>' : ''}<a href="${escapeHtml(r.VideoURL)}" target="_blank" rel="noopener">ลิงก์วิดีโอ</a>` : ''}</td>
        <td>${r.StartDate || r.EndDate ? `${r.StartDate ? formatDateTH(r.StartDate) : '—'} – ${r.EndDate ? formatDateTH(r.EndDate) : '—'}` : 'ตลอดเวลา'}</td>
        <td><button type="button" class="btn ${r.Pinned === 'TRUE' ? 'btn-secondary' : 'btn-ghost'} btn-sm" data-toggle-pin="${r.ManualID}" data-cur="${r.Pinned === 'TRUE'}">${r.Pinned === 'TRUE' ? 'ปักหมุดอยู่' : 'ปักหมุด'}</button></td>
        <td><button type="button" class="btn ${r.Featured === 'TRUE' ? 'btn-secondary' : 'btn-ghost'} btn-sm" data-toggle-star="${r.ManualID}" data-cur="${r.Featured === 'TRUE'}">${r.Featured === 'TRUE' ? 'ติดดาวอยู่' : 'ติดดาว'}</button></td>
        <td>${formatDateTH((r.UploadedAt || '').slice(0, 10))}</td>
        <td class="row-actions">
          ${r.FileURL ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(r.FileURL)}" target="_blank" rel="noopener">เปิดดู</a>` : ''}
          <button class="btn btn-ghost btn-sm" data-edit="${r.ManualID}">แก้ไข</button>
          <button class="btn btn-danger btn-sm" data-del="${r.ManualID}">ลบ</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => editManualForm(rows.find((r) => r.ManualID === btn.dataset.edit), reload));
    });
    body.querySelectorAll('[data-toggle-pin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await withLoading(() => api.put(`/api/manuals/${btn.dataset.togglePin}`, { pinned: btn.dataset.cur !== 'true' }));
          reload();
        } catch (err) { toastError(err.message); }
      });
    });
    body.querySelectorAll('[data-toggle-star]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await withLoading(() => api.put(`/api/manuals/${btn.dataset.toggleStar}`, { featured: btn.dataset.cur !== 'true' }));
          reload();
        } catch (err) { toastError(err.message); }
      });
    });
    body.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('ลบรายการนี้? ไฟล์ใน Google Drive จะถูกย้ายไปถังขยะด้วย'))) return;
        try {
          await withLoading(() => api.del(`/api/manuals/${btn.dataset.del}`));
          toastSuccess('ลบสำเร็จ');
          reload();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  document.getElementById('manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('mn-file');
    const coverInput = document.getElementById('mn-cover');
    const file = fileInput.files[0];
    const cover = coverInput.files[0];
    const title = document.getElementById('mn-title').value.trim();
    const videoUrl = document.getElementById('mn-video').value.trim();
    if (!title) return;
    if (!file && !videoUrl) { toastError('กรุณาแนบไฟล์ หรือใส่ลิงก์วิดีโอ อย่างน้อยหนึ่งอย่าง'); return; }
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) { toastError(`ไฟล์ใหญ่เกินไป (จำกัด ${MAX_FILE_MB} MB)`); return; }
    if (cover && cover.size > MAX_COVER_MB * 1024 * 1024) { toastError(`รูปหน้าปกใหญ่เกินไป (จำกัด ${MAX_COVER_MB} MB)`); return; }
    try {
      const payload = {
        title, videoUrl,
        startDate: document.getElementById('mn-start').value, endDate: document.getElementById('mn-end').value,
        pinned: document.getElementById('mn-pinned').checked, featured: document.getElementById('mn-featured').checked,
      };
      if (file) {
        payload.fileName = file.name;
        payload.mimeType = file.type || 'application/octet-stream';
        payload.dataBase64 = await fileToBase64(file);
      }
      if (cover) {
        payload.coverImageFileName = cover.name;
        payload.coverImageMimeType = cover.type || 'image/jpeg';
        payload.coverImageBase64 = await fileToBase64(cover);
      }
      await withLoading(() => api.post('/api/manuals', payload));
      toastSuccess('อัปโหลดสำเร็จ');
      e.target.reset();
      reload();
    } catch (err) {
      toastError(err.message);
    }
  });

  await reload();
}
