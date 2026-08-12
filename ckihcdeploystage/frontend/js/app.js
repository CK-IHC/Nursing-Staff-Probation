import { api, state, setSession, clearSession } from './api.js';
import { loadReferenceData, cache } from './state.js';
import { visibleRoutes, renderRoute, initRouter, BOTTOM_NAV_ROUTES } from './router.js';
import { initSortableTables } from './components/sortableTable.js';
import { toastError } from './components/toast.js';
import { withLoading } from './components/loading.js';
import { openModal, closeModal } from './components/modal.js';

const loginView = document.getElementById('login-view');
const appShell = document.getElementById('app-shell');

// ข้อความ error ที่หน้าบ้านเป็นเจ้าของเอง (ไม่ใช้ err.message ดิบจาก backend) เพื่อกันปัญหาข้อความไทยเพี้ยน
// หากบางครั้งข้อความจาก backend ถูกก็อปปี้ผิดวิธีจนตัวอักษรเสีย อย่างน้อยหน้า login ก็ยังอ่านออกเสมอ
const LOGIN_ERROR_MESSAGES = {
  BAD_REQUEST: 'กรุณากรอกเบอร์มือถือให้ถูกต้อง',
  UNAUTHORIZED: 'ไม่พบบัญชีผู้ใช้ที่ตรงกับเบอร์นี้ หรือบัญชีถูกระงับการใช้งาน',
  NOT_FOUND: 'ไม่พบข้อมูลผู้ใช้',
  SERVER_ERROR: 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง',
  NETWORK_ERROR: 'เชื่อมต่อ backend ไม่สำเร็จ กรุณาตรวจสอบ API URL ในไฟล์ config.js หรืออินเทอร์เน็ต',
  BAD_RESPONSE: 'backend ตอบกลับผิดรูปแบบ — ตรวจสอบว่า deploy เวอร์ชันล่าสุดของ Apps Script แล้ว',
};
// ต่อท้ายด้วย error code (เป็นอังกฤษล้วน ไม่มีปัญหาภาษาไทยเพี้ยน) เพื่อให้แจ้งปัญหากลับมาได้ตรงจุดแม้ข้อความไทยจาก backend จะเพี้ยน
function withCode(text, err) {
  return `${text} (${err?.code || 'UNKNOWN'})`;
}
function loginErrorText(err) {
  return withCode(LOGIN_ERROR_MESSAGES[err?.code] || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', err);
}

const FIRST_ADMIN_ERROR_MESSAGES = {
  CONFLICT: 'มีบัญชีผู้ใช้อยู่แล้วในระบบ กรุณาตรวจสอบเบอร์มือถือให้ตรงกับบัญชีผู้ดูแลระบบที่มีอยู่',
  BAD_REQUEST: 'กรุณากรอกเบอร์มือถือให้ถูกต้อง',
  SERVER_ERROR: 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง',
  NETWORK_ERROR: 'เชื่อมต่อ backend ไม่สำเร็จ กรุณาตรวจสอบ API URL ในไฟล์ config.js หรืออินเทอร์เน็ต',
  BAD_RESPONSE: 'backend ตอบกลับผิดรูปแบบ — ตรวจสอบว่า deploy เวอร์ชันล่าสุดของ Apps Script แล้ว',
};
function firstAdminErrorText(err) {
  return withCode(FIRST_ADMIN_ERROR_MESSAGES[err?.code] || 'เข้าสู่ผู้ดูแลระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', err);
}

function showLogin() {
  appShell.classList.add('hidden');
  loginView.classList.remove('hidden');
  document.body.classList.remove('role-user');
}

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = visibleRoutes()
    .map((r) => `<a class="nav-link" href="${r.path}" title="${r.label}">${r.icon ? `<span class="nav-icon">${r.icon}</span>` : ''}<span class="nav-label">${r.label}</span></a>`)
    .join('');
}

function renderBottomNav() {
  const bar = document.getElementById('bottom-nav');
  if (state.user.Role === 'Admin') {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = BOTTOM_NAV_ROUTES
    .map((r) => `<a class="bottom-nav-link" href="${r.path}"><span class="bottom-nav-icon">${r.icon}</span><span>${r.shortLabel}</span></a>`)
    .join('');
  bar.classList.remove('hidden');
}

async function enterApp() {
  document.body.classList.toggle('role-user', state.user.Role !== 'Admin');
  document.getElementById('topbar-user-name').textContent = state.user.ThaiName || state.user.NickName;
  document.getElementById('topbar-user-role').textContent = state.user.Role === 'Admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน';
  document.getElementById('app-title-text').textContent = cache.settings.AppTitle || 'Nursing Staff Probation Management';
  document.title = cache.settings.AppTitle || 'Nursing Staff Probation Management';

  renderSidebar();
  renderBottomNav();
  loginView.classList.add('hidden');
  appShell.classList.remove('hidden');
  if (!location.hash) location.hash = state.user.Role === 'Admin' ? '#/staff' : '#/profile';
  await renderRoute();
  if (!window.__sortableTablesInit) {
    window.__sortableTablesInit = true;
    initSortableTables(document.getElementById('app-content'));
  }
}

async function handleLogin(phone) {
  const data = await api.post('/api/auth/login', { phone });
  setSession(data.token, data.user);
  await loadReferenceData();
  await enterApp();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  const phone = document.getElementById('login-phone').value.trim();
  try {
    await withLoading(() => handleLogin(phone));
  } catch (err) {
    errorEl.textContent = loginErrorText(err);
  }
});

// เข้าสู่ผู้ดูแลระบบ: กรอกแค่เบอร์มือถืออย่างเดียว — ลองล็อกอินปกติก่อน (กรณีมีบัญชี Admin อยู่แล้ว)
// ถ้าไม่พบบัญชีนี้เลย (ยังไม่มีพนักงานในระบบ) จะสร้างบัญชีผู้ดูแลระบบคนแรกให้อัตโนมัติโดยไม่ต้องกรอกรหัสพนักงาน/ชื่อ
document.getElementById('login-gear-btn').addEventListener('click', () => {
  const box = document.createElement('div');
  box.innerHTML = `
    <form id="admin-access-form">
      <div class="field"><label>เบอร์มือถือ *</label><input id="aa-phone" type="tel" inputmode="numeric" autocomplete="tel" required /></div>
      <p id="aa-error" class="login-error"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">เข้าสู่ผู้ดูแลระบบ</button>
      </div>
    </form>`;
  const body = openModal('เข้าสู่ผู้ดูแลระบบ', box);
  body.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
  body.querySelector('#admin-access-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = body.querySelector('#aa-error');
    errorEl.textContent = '';
    const phone = body.querySelector('#aa-phone').value.trim();
    try {
      await withLoading(async () => {
        let data;
        try {
          data = await api.post('/api/auth/login', { phone });
        } catch (loginErr) {
          if (loginErr.code !== 'UNAUTHORIZED' && loginErr.code !== 'NOT_FOUND') throw loginErr;
          const employeeId = phone.replace(/\D/g, '') || phone;
          data = await api.post('/api/setup/first-admin', { employeeId, thaiName: 'ผู้ดูแลระบบ', phone });
        }
        setSession(data.token, data.user);
        closeModal();
        await loadReferenceData();
        await enterApp();
      });
    } catch (err) {
      errorEl.textContent = firstAdminErrorText(err);
    }
  });
});

// ทิศทางกระดาษเวลาพิมพ์รายงาน (แนวตั้ง/แนวนอน) — จำค่าไว้ใน localStorage ใช้ร่วมกันทุกรายงานในระบบ
// ทำงานผ่าน <style> ที่แทรก @page ให้ตรงกับที่เลือกไว้ ก่อนกด Print Report ใด ๆ ก็ตาม
function applyPrintOrientation(orientation) {
  let styleEl = document.getElementById('print-orientation-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-orientation-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@page{ size:A4 ${orientation}; margin:12mm; }`;
  document.getElementById('print-orient-portrait')?.classList.toggle('active', orientation === 'portrait');
  document.getElementById('print-orient-landscape')?.classList.toggle('active', orientation === 'landscape');
  localStorage.setItem('printOrientation', orientation);
}
applyPrintOrientation(localStorage.getItem('printOrientation') === 'landscape' ? 'landscape' : 'portrait');
document.getElementById('print-orient-portrait').addEventListener('click', () => applyPrintOrientation('portrait'));
document.getElementById('print-orient-landscape').addEventListener('click', () => applyPrintOrientation('landscape'));

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await api.post('/api/auth/logout', {});
  } catch {
    /* ignore */
  }
  clearSession();
  location.hash = ''; // ล้าง route ค้างจากผู้ใช้คนก่อน กันเครื่องที่ใช้ร่วมกันแล้วผู้ใช้ถัดไปเข้าสู่ระบบมาเจอหน้าที่ไม่มีสิทธิ์ดู
  showLogin();
});

// มือถือ: เปิด/ปิด sidebar แบบ drawer พร้อม backdrop คลิกด้านนอกเพื่อปิดได้ และปิดอัตโนมัติเมื่อกดเมนู
function setMobileSidebarOpen(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-backdrop').classList.toggle('show', open);
}
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  setMobileSidebarOpen(!document.getElementById('sidebar').classList.contains('open'));
});
document.getElementById('sidebar-backdrop').addEventListener('click', () => setMobileSidebarOpen(false));
document.getElementById('sidebar-nav').addEventListener('click', (e) => {
  if (e.target.closest('.nav-link')) setMobileSidebarOpen(false);
});

// หุบ/ขยาย sidebar บนจอกว้าง (เดสก์ท็อป) — จำสถานะไว้ใน localStorage
const SIDEBAR_COLLAPSE_KEY = 'npm_sidebar_collapsed';
if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') {
  document.getElementById('sidebar').classList.add('collapsed');
}
document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
  const collapsed = document.getElementById('sidebar').classList.toggle('collapsed');
  localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
});

document.addEventListener('session-expired', () => {
  toastError('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  showLogin();
});

initRouter();
showLogin();
