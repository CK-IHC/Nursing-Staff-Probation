// ตัวช่วยเรียก Backend API (Google Apps Script Web App) — ไม่ใช้ localStorage ตาม spec
// เก็บ base URL (exec URL) + token ไว้ในตัวแปร JS ของโมดูลนี้เท่านั้น หายเมื่อรีเฟรชหน้า
//
// Transport: Apps Script Web App มีแค่ endpoint เดียว (/exec) และรองรับเฉพาะ GET/POST จริง ๆ
// จึงส่ง method เชิงตรรกะ (PUT/DELETE) ผ่าน field "method" ในตัว POST body แทน และหลีกเลี่ยง
// CORS preflight โดยไม่ใช้ custom header ใด ๆ (ส่ง token เป็นส่วนหนึ่งของ query/body แทน Authorization header)

export const state = {
  apiBase: window.APP_CONFIG?.API_BASE || '',
  token: null,
  user: null,
};

export function setSession(token, user) {
  state.token = token;
  state.user = user;
}

export function clearSession() {
  state.token = null;
  state.user = null;
}

function splitPath(path) {
  var idx = path.indexOf('?');
  if (idx === -1) return { pure: path, query: {} };
  var pure = path.slice(0, idx);
  var query = {};
  new URLSearchParams(path.slice(idx + 1)).forEach((v, k) => { query[k] = v; });
  return { pure: pure, query: query };
}

async function handleResponse(res, hadToken) {
  let json;
  try {
    json = await res.json();
  } catch {
    const err = new Error(`เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status})`);
    err.code = 'BAD_RESPONSE';
    throw err;
  }
  // ยิง session-expired เฉพาะตอนที่เคยมี token อยู่แล้วแต่ถูกปฏิเสธ (session หมดอายุจริง)
  // ไม่ใช่ตอน login/setup ครั้งแรกที่ไม่เคยมี token เลย (กรอกรหัส/ชื่อเล่นผิด ก็ตอบ UNAUTHORIZED เหมือนกัน)
  if (json.code === 'UNAUTHORIZED' && hadToken) {
    clearSession();
    document.dispatchEvent(new CustomEvent('session-expired'));
  }
  if (!json.success) {
    const err = new Error(json.message || `เกิดข้อผิดพลาด (${json.code || 'ERROR'})`);
    err.code = json.code || '';
    throw err;
  }
  return json.data;
}

async function doGet(path) {
  const { pure, query } = splitPath(path);
  const params = new URLSearchParams(query);
  params.set('path', pure);
  const hadToken = !!state.token;
  if (state.token) params.set('token', state.token);
  let res;
  try {
    res = await fetch(`${state.apiBase}?${params.toString()}`, { method: 'GET' });
  } catch {
    throw networkError_();
  }
  return handleResponse(res, hadToken);
}

// เกิดเมื่อ fetch() ล้มเหลวระดับ network (DNS/CORS/timeout) — ไม่ใช่ error จาก backend เอง เช่น
// deployment ของ Google Apps Script ถูกลบ/URL เก่า หรือ "Who has access" ไม่ได้ตั้งเป็น Anyone
// (กรณีนี้ browser จะถูก redirect ไปหน้า login ของ Google แล้ว fetch เห็นเป็น network error)
// ดูวิธีไล่เช็คทีละขั้นได้ที่ docs/DEPLOY.md หัวข้อ "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"
function networkError_() {
  const err = new Error(
    'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ API URL ' +
    '(ดูวิธีแก้ได้ที่ docs/DEPLOY.md หัวข้อ "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ")'
  );
  err.code = 'NETWORK_ERROR';
  return err;
}

async function doMutate(method, path, body) {
  const { pure, query } = splitPath(path);
  const hadToken = !!state.token;
  let res;
  try {
    res = await fetch(state.apiBase, {
      method: 'POST', // Apps Script Web App รองรับแค่ doPost จริง ๆ — method ที่ตั้งใจอยู่ใน payload.method
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // เลี่ยง CORS preflight
      body: JSON.stringify({ path: pure, method, token: state.token, body: body || {}, query }),
    });
  } catch {
    throw networkError_();
  }
  return handleResponse(res, hadToken);
}

export const api = {
  get: (path) => doGet(path),
  post: (path, body) => doMutate('POST', path, body),
  put: (path, body) => doMutate('PUT', path, body),
  del: (path) => doMutate('DELETE', path, {}),
};
