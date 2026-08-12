export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// สร้าง QR Code เป็น SVG ฝั่ง client ล้วน ๆ (ไลบรารี js/vendor/qrcode.js, โหลดเป็น global `qrcode`)
// ไม่พึ่งบริการภายนอกใด ๆ เลย — กันปัญหาสแกนไม่ได้จากเครือข่ายที่บล็อกโดเมนภายนอก หรือรูปโหลดไม่ทันตอนพิมพ์
// errorCorrectionLevel 'H' (สูงสุด) เพื่อให้กล้องมือถือทุกยี่ห้ออ่านได้ชัวร์แม้พิมพ์เล็กหรือคุณภาพกระดาษไม่ดี
export function qrSvgMarkup(text, cellSize = 5, margin = 4) {
  const qr = window.qrcode(0, 'H');
  qr.addData(String(text ?? ''));
  qr.make();
  return qr.createSvgTag({ cellSize, margin, scalable: true });
}

export function formatDateTH(dateStr) {
  if (!dateStr) return '—';
  const datePart = String(dateStr).slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// กันปัญหา race condition: หน้าที่ await API ก่อนเขียน DOM ครั้งแรก อาจ resolve ช้ากว่าที่ผู้ใช้เปลี่ยนหน้าไปแล้ว
// (container เดิมถูกนำกลับมาใช้ซ้ำเสมอโดย router จึงเก็บ token ไว้ที่ตัว container เองได้) — เรียกครั้งเดียวตอนเริ่ม
// render() แล้วเช็ค isCurrent() ก่อนเขียน DOM ทุกจุดหลัง await ใด ๆ ถ้าไม่ current แปลว่ามี render() ใหม่กว่าเริ่มไปแล้ว ให้เลิกเขียน
export function renderGuard(container) {
  const token = (container._renderToken = (container._renderToken || 0) + 1);
  return () => container._renderToken === token;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ดาวน์โหลด array ของ object เป็นไฟล์ CSV (รองรับภาษาไทยด้วย BOM)
export function exportCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(','))];
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ระยะเวลาทำงาน (Years of Service) แบบย่อ เช่น "6m", "1y 2m"
export function formatYoS(hireDate) {
  if (!hireDate) return '—';
  const hire = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hire.getTime())) return '—';
  const days = Math.max(0, Math.round((Date.now() - hire.getTime()) / 86400000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0) return `${months}m`;
  return `${years}y ${months}m`;
}

// อ่านไฟล์ CSV (รองรับ quoted field ที่มีจุลภาค/ขึ้นบรรทัดใหม่) เป็น array ของ object ตาม header แถวแรก
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const clean = text.replace(/^﻿/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

// หัวรายงานแบบมืออาชีพ: แถบ masthead เล็ก ๆ (โลโก้ตัวอักษร + ชื่อแอป) ตามด้วยชื่อรายงานตัวหนาขีดเส้นใต้
// ใช้ร่วมกันทั้ง printReport และ printIsolated ให้ทุกรายงานในระบบมีหน้าตาเดียวกัน
function printHeaderMarkup(title, subtitle, appTitle) {
  const brand = (appTitle || 'Nursing Staff Probation Management').trim();
  return `
    <div class="print-masthead">
      <span class="print-masthead-brand">${escapeHtml(brand)}</span>
    </div>
    <h1 class="print-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="print-subtitle">${escapeHtml(subtitle)}</p>` : ''}`;
}

// พิมพ์รายงานแบบมืออาชีพ: ใส่หัวรายงาน + "พิมพ์โดย {ชื่อ} · {วันที่} {เวลา}" มุมล่างขวา (แสดงเฉพาะตอนพิมพ์)
export async function printReport(title, subtitle) {
  const { state } = await import('./api.js');
  const { cache } = await import('./state.js');
  const header = document.getElementById('print-header');
  const footer = document.getElementById('print-footer');
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const printedBy = state.user?.ThaiName || state.user?.NickName || '';
  if (header) {
    header.innerHTML = printHeaderMarkup(title, subtitle, cache.settings?.AppTitle);
  }
  if (footer) {
    footer.textContent = `พิมพ์โดย ${printedBy} · ${dateStr} ${timeStr} น.`;
  }
  window.print();
}

// พิมพ์เนื้อหาที่กำหนดเองแยกจากหน้าปัจจุบัน (ซ่อนเนื้อหาแอปทั้งหมด แสดงแค่ header + bodyHtml + footer)
// ใช้สำหรับรายงานรายบุคคล/QR Code ที่ไม่ใช่การพิมพ์ทั้งหน้าจอที่กำลังแสดงอยู่
// รอให้รูปภาพ (เช่น QR Code จากบริการภายนอก) โหลดเสร็จก่อนค่อยสั่งพิมพ์ ป้องกันกล่องว่างเปล่าตอนพิมพ์
function waitForImages(container, timeoutMs = 4000) {
  const imgs = container ? Array.from(container.querySelectorAll('img')) : [];
  if (imgs.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    })))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function printIsolated(title, subtitle, bodyHtml) {
  const { state } = await import('./api.js');
  const { cache } = await import('./state.js');
  const header = document.getElementById('print-header');
  const footer = document.getElementById('print-footer');
  const isolated = document.getElementById('print-isolated');
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const printedBy = state.user?.ThaiName || state.user?.NickName || '';
  if (header) {
    header.innerHTML = printHeaderMarkup(title, subtitle, cache.settings?.AppTitle);
  }
  if (footer) {
    footer.textContent = `พิมพ์โดย ${printedBy} · ${dateStr} ${timeStr} น.`;
  }
  if (isolated) isolated.innerHTML = bodyHtml;
  document.body.classList.add('print-isolated-mode');
  await waitForImages(isolated);
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-isolated-mode');
    if (isolated) isolated.innerHTML = '';
  }, 300);
}

export function qs(obj) {
  const params = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}
