/**
 * Auth.gs — เข้าสู่ระบบ, session token (HMAC-SHA256, อายุ 12 ชม.), middleware requireAuth_/requireAdmin_
 * Token เก็บฝั่ง frontend ไว้ในตัวแปร JS เท่านั้น (ไม่ใช้ localStorage) ต้องส่งกลับมาทุกคำขอเพื่อยืนยันสิทธิ์ซ้ำ
 */

var TOKEN_TTL_SECONDS_ = 12 * 60 * 60;

function tokenSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!secret) throw HttpError_('SERVER_ERROR', 'ยังไม่ได้ตั้งค่า Script Property: TOKEN_SECRET');
  return secret;
}

function signSession_(payload) {
  var now = Math.floor(Date.now() / 1000);
  var full = {
    empId: payload.empId, role: payload.role, name: payload.name,
    iat: now, exp: now + TOKEN_TTL_SECONDS_,
  };
  var body = base64UrlEncode_(JSON.stringify(full));
  var sigBytes = Utilities.computeHmacSha256Signature(body, tokenSecret_());
  var sig = base64UrlEncode_(sigBytes);
  return body + '.' + sig;
}

function verifySession_(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var parts = token.split('.');
  var body = parts[0], sig = parts[1];
  var expectedSig = base64UrlEncode_(Utilities.computeHmacSha256Signature(body, tokenSecret_()));
  if (expectedSig !== sig) return null;
  try {
    var payload = JSON.parse(base64UrlDecodeToString_(body));
  } catch (e) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** ตรวจ session แล้วยืนยันสิทธิ์ซ้ำกับชีต Staff เสมอ (ไม่เชื่อ role ที่ฝังอยู่ใน token ฝ่ายเดียว) */
function requireAuth_(handler) {
  return function (ctx) {
    var payload = verifySession_(ctx.token);
    if (!payload) throw HttpError_('UNAUTHORIZED', 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    var staff = getById_('Staff', 'EmployeeID', payload.empId);
    if (!staff || String(staff.Active).toUpperCase() === 'FALSE') {
      throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน');
    }
    ctx.session = { empId: payload.empId, role: staff.Role, name: staff.ThaiName || staff.EnglishName };
    return handler(ctx);
  };
}

function requireAdmin_(handler) {
  return requireAuth_(function (ctx) {
    if (ctx.session.role !== 'Admin') throw HttpError_('FORBIDDEN', 'ต้องเป็นผู้ดูแลระบบเท่านั้น');
    return handler(ctx);
  });
}

function canAccessStaff_(session, targetId) {
  if (session.role === 'Admin' || session.empId === targetId) return true;
  var target = getById_('Staff', 'EmployeeID', targetId);
  return !!target && target.Supervisor === session.empId;
}

// ---------- Route handlers ----------
/** เข้าสู่ระบบด้วยเบอร์มือถืออย่างเดียว — ตัดอักขระที่ไม่ใช่ตัวเลขออกก่อนเทียบ (กันรูปแบบ 08x-xxx-xxxx ไม่ตรงกัน) */
function normalizePhone_(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function handleLogin_(ctx) {
  var phone = normalizePhone_(ctx.body.phone);
  if (!phone) {
    throw HttpError_('BAD_REQUEST', 'กรุณากรอกเบอร์มือถือ');
  }
  var rows = getAll_('Staff');
  var match = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizePhone_(r.Phone) === phone) {
      match = r;
      break;
    }
  }
  if (!match) throw HttpError_('UNAUTHORIZED', 'ไม่พบข้อมูลผู้ใช้ กรุณาตรวจสอบเบอร์มือถือ');
  if (String(match.Active).toUpperCase() === 'FALSE') {
    throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }
  var token = signSession_({ empId: match.EmployeeID, role: match.Role || 'User', name: match.ThaiName });
  writeLog_(match.EmployeeID, 'Login', 'Auth', '');
  return ok_({ token: token, user: sanitizeStaff_(match) });
}

function handleMe_(ctx) {
  var staff = getById_('Staff', 'EmployeeID', ctx.session.empId);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้');
  return ok_(sanitizeStaff_(staff));
}

function handleLogout_(ctx) {
  writeLog_(ctx.session.empId, 'Logout', 'Auth', '');
  return ok_(true);
}
