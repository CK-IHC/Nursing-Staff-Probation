import { state } from './api.js';
import { cache } from './state.js';
import { toastError } from './components/toast.js';

// ไอคอนแบบ SVG เส้นคลาสสิก (feather-style) ใช้ทั้ง sidebar (desktop) และ bottom nav (มือถือ)
const ICON_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
const ICON_MAP_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_CLIPBOARD_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"/><path d="M9 14l2 2 4-4"/></svg>';
const ICON_CLIPBOARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"/><path d="M9 12h6M9 16h6"/></svg>';
const ICON_MESSAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICON_AWARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.2 13.5 7 22l5-3 5 3-1.2-8.5"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_SPARKLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/></svg>';
const ICON_FILE_TEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>';
const ICON_COMPASS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2 6.4-6.4 2 2-6.4 6.4-2z"/></svg>';
const ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>';
const ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
const ICON_FOOTPRINTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M17 10a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0v-4a3 3 0 0 1 3-3z"/><path d="M5 15c0 2 1 3 3 3M20 8c0-2-1-3-3-3"/></svg>';

// นิยามเมนู/เส้นทางทั้งหมด — loader คืนโมดูลที่มีฟังก์ชัน render(container)
// roles = ใครเข้าถึงหน้านี้ได้ (ใช้ตรวจสิทธิ์จริง), navRoles = ใครเห็นเมนูนี้ใน sidebar (ถ้าไม่ระบุ ใช้ roles)
// Admin เข้าถึงหน้า User ได้เสมอ (สำหรับปุ่มดูตัวอย่างในหน้า Staff Directory) แต่ไม่แสดงเมนูเหล่านี้ใน sidebar ของ Admin
export const ROUTES = [
  { path: '#/staff', label: 'Staff Directory', icon: ICON_USERS, roles: ['Admin'], loader: () => import('./pages/staffDirectory.js') },
  { path: '#/dashboard', label: 'Dashboard', icon: ICON_GRID, roles: ['Admin'], loader: () => import('./pages/dashboard.js') },
  { path: '#/probation-tracking', label: 'Probation Tracking', icon: ICON_MAP_PIN, roles: ['Admin'], loader: () => import('./pages/probationTracking.js') },
  { path: '#/orientation-checklist', label: 'Orientation Checklist', icon: ICON_CLIPBOARD_CHECK, roles: ['Admin'], loader: () => import('./pages/orientationChecklist.js') },
  { path: '#/consultation', label: 'Consultation', icon: ICON_MESSAGE, roles: ['Admin'], loader: () => import('./pages/consultation.js') },
  { path: '#/meetings', label: 'Monthly Meetings', icon: ICON_CALENDAR, roles: ['Admin'], loader: () => import('./pages/meetings.js') },
  { path: '#/admin/qr-code', label: 'QR Code', icon: ICON_QR, roles: ['Admin'], loader: () => import('./pages/adminQrCode.js') },
  { path: '#/evaluation', label: 'Performance Evaluation', icon: ICON_AWARD, roles: ['Admin'], loader: () => import('./pages/performanceEvaluation.js') },
  { path: '#/admin/walk-round', label: 'Walk Round', icon: ICON_FOOTPRINTS, roles: ['Admin'], loader: () => import('./pages/adminWalkRound.js') },
  { path: '#/admin/information', label: 'Information', icon: ICON_BOOK, roles: ['Admin'], loader: () => import('./pages/adminInformation.js') },
  { path: '#/settings', label: 'Settings', icon: ICON_GEAR, roles: ['Admin'], loader: () => import('./pages/adminSettings.js') },
  { path: '#/admin/survey-builder', label: 'สร้างแบบสอบถาม', icon: ICON_EDIT, roles: ['Admin'], loader: () => import('./pages/adminSurveyBuilder.js') },
  { path: '#/admin/ai-themes', label: 'ภาพรวม AI Coach', icon: ICON_SPARKLE, roles: ['Admin'], loader: () => import('./pages/adminAiThemes.js') },
  { path: '#/admin/logs', label: 'บันทึกการใช้งาน', icon: ICON_FILE_TEXT, roles: ['Admin'], loader: () => import('./pages/adminLogs.js') },

  { path: '#/profile', label: 'Profile', icon: ICON_USER, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/profile.js') },
  { path: '#/my-timeline', label: 'Timeline', icon: ICON_COMPASS, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/myTimeline.js') },
  { path: '#/my-probation', label: 'Probation Tracking', icon: ICON_MAP_PIN, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/myProbation.js') },
  { path: '#/survey', label: 'ทำแบบสอบถาม', icon: ICON_CLIPBOARD, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/survey.js') },
  { path: '#/information', label: 'Information', icon: ICON_BOOK, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/myInformation.js') },
  { path: '#/ai-coach', label: 'คำแนะนำจาก AI', icon: ICON_SPARKLE, roles: ['User', 'Admin'], navRoles: ['User'], loader: () => import('./pages/aiCoach.js') },
  { path: '#/evaluate-team', label: 'ประเมินลูกทีม', icon: ICON_USERS, roles: ['User', 'Admin'], navRoles: ['User'], requireSupervisor: true, loader: () => import('./pages/evaluateTeam.js') },
];

// 4 เมนูหลักของ "หน้า User" บนมือถือ (แถบเมนูด้านล่าง)
// Orientation Checklist และ Monthly Meeting Record ถูกรวมเป็นหัวข้อย่อยอยู่ใน Timeline แล้ว
export const BOTTOM_NAV_ROUTES = [
  { path: '#/profile', shortLabel: 'Profile', icon: ICON_USER },
  { path: '#/my-timeline', shortLabel: 'Timeline', icon: ICON_COMPASS },
  { path: '#/my-probation', shortLabel: 'Probation', icon: ICON_MAP_PIN },
  { path: '#/survey', shortLabel: 'แบบสอบถาม', icon: ICON_CLIPBOARD },
  { path: '#/information', shortLabel: 'Information', icon: ICON_BOOK },
];

export function visibleRoutes() {
  const role = state.user?.Role || 'User';
  return ROUTES.filter((r) => (r.navRoles || r.roles).includes(role) && (!r.requireSupervisor || cache.isTeamSupervisor || role === 'Admin'));
}

// กันปัญหา race condition: ถ้าผู้ใช้กดเปลี่ยนหน้าเร็ว ๆ (พบบ่อยบนมือถือ) การ render ของหน้าเก่าที่ค้าง
// อยู่ระหว่างรอ API อาจ resolve ช้ากว่าและไปเขียนทับ/อ้างอิง DOM ของหน้าใหม่ที่ถูกแทนที่ไปแล้ว
// (เป็นสาเหตุของ error "Cannot read/set properties of null") — ใช้ token ยืนยันว่ายังเป็นการ navigate ล่าสุดอยู่ก่อนแตะ DOM ทุกครั้ง
let renderToken = 0;
let currentModule = null;

export async function renderRoute() {
  const myToken = ++renderToken;
  if (currentModule && typeof currentModule.unmount === 'function') {
    try { currentModule.unmount(); } catch { /* ignore */ }
  }
  currentModule = null;
  const container = document.getElementById('app-content');
  const path = location.hash || (state.user?.Role === 'Admin' ? '#/staff' : '#/profile');
  const route = ROUTES.find((r) => path.startsWith(r.path));

  if (!route) {
    container.innerHTML = '<div class="empty-state">ไม่พบหน้านี้</div>';
    return;
  }
  const role = state.user?.Role || 'User';
  if (!route.roles.includes(role)) {
    container.innerHTML = '<div class="empty-state">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>';
    return;
  }

  document.querySelectorAll('.nav-link, .bottom-nav-link').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === route.path);
  });
  document.getElementById('page-title').textContent = route.label;

  try {
    const mod = await route.loader();
    if (myToken !== renderToken) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอโหลดโมดูล
    container.innerHTML = '';
    await mod.render(container);
    if (myToken !== renderToken) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอ render (กัน error หลุดออกมาโดยไม่จำเป็น)
    currentModule = mod;
  } catch (err) {
    if (myToken !== renderToken) return;
    console.error(err);
    toastError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    container.innerHTML = '<div class="empty-state">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</div>';
  }
}

export function initRouter() {
  window.addEventListener('hashchange', renderRoute);
}
