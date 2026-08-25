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

/** ตรวจ session แล้วยืนยันสิทธิ์ซ้ำกับชีตเสมอ (ไม่เชื่อ role ที่ฝังอยู่ใน token ฝ่ายเดียว) — Admin เก็บอยู่คนละชีต
 *  (Admins) จาก Staff โดยเด็ดขาด ดู payload.role เพื่อเลือกว่าจะตรวจกับชีตไหน แต่ยังต้องเจอแถวจริงที่ Active
 *  อยู่ในชีตนั้นเสมอ ต่อให้ token จะปลอม role มา ก็จะหาไม่เจอ/ไม่ผ่านอยู่ดี ไม่ได้สิทธิ์เพิ่มขึ้นจากการปลอม role */
function requireAuth_(handler) {
  return function (ctx) {
    var payload = verifySession_(ctx.token);
    if (!payload) throw HttpError_('UNAUTHORIZED', 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    if (payload.role === 'Admin') {
      var admin = getById_('Admins', 'EmployeeID', payload.empId);
      if (!admin || String(admin.Active).toUpperCase() === 'FALSE') {
        throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน');
      }
      ctx.session = { empId: payload.empId, role: 'Admin', name: admin.ThaiName };
      return handler(ctx);
    }
    var staff = getById_('Staff', 'EmployeeID', payload.empId);
    if (!staff || String(staff.Active).toUpperCase() === 'FALSE') {
      throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน');
    }
    ctx.session = { empId: payload.empId, role: 'User', name: staff.ThaiName || staff.EnglishName };
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

// Admin เก็บอยู่คนละชีตจาก Staff โดยเด็ดขาด — เช็คชีต Admins ก่อนเสมอ (เบอร์เดียวกันเป็นได้แค่ Admin หรือ Staff
// อย่างใดอย่างหนึ่ง ดู findByPhone_ ใน Staff.gs ที่บังคับไม่ให้เบอร์ซ้ำข้ามสองชีตตั้งแต่ตอนสร้าง/แก้ไขบัญชี)
function handleLogin_(ctx) {
  var phone = normalizePhone_(ctx.body.phone);
  if (!phone) {
    throw HttpError_('BAD_REQUEST', 'กรุณากรอกเบอร์มือถือ');
  }
  var admins = getAll_('Admins');
  for (var i = 0; i < admins.length; i++) {
    if (normalizePhone_(admins[i].Phone) === phone) {
      if (String(admins[i].Active).toUpperCase() === 'FALSE') {
        throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }
      var adminToken = signSession_({ empId: admins[i].EmployeeID, role: 'Admin', name: admins[i].ThaiName });
      writeLog_(admins[i].EmployeeID, 'Login', 'Auth', '');
      return ok_({ token: adminToken, user: sanitizeAdmin_(admins[i]) });
    }
  }
  var rows = getAll_('Staff');
  var match = null;
  for (var j = 0; j < rows.length; j++) {
    if (normalizePhone_(rows[j].Phone) === phone) {
      match = rows[j];
      break;
    }
  }
  if (!match) throw HttpError_('UNAUTHORIZED', 'ไม่พบข้อมูลผู้ใช้ กรุณาตรวจสอบเบอร์มือถือ');
  // แถวเก่าที่ยังไม่ถูกย้ายไปชีต Admins (deploy โค้ดนี้ใหม่ ๆ ยังไม่มีใครกด "รันซ่อมแซมโครงสร้างชีต"/เปิด
  // ?path=/api/setup/status เลยสักครั้ง) — ย้ายให้ทันทีตอนนี้ กัน Admin เดิมล็อกอินไม่ได้จนกว่าจะมีคนย้ายให้ก่อน
  if (match.Role === 'Admin') {
    migrateStaffAdminsToAdminsSheet_();
    var migrated = getById_('Admins', 'EmployeeID', match.EmployeeID);
    if (migrated) {
      var migratedToken = signSession_({ empId: migrated.EmployeeID, role: 'Admin', name: migrated.ThaiName });
      writeLog_(migrated.EmployeeID, 'Login', 'Auth', '');
      return ok_({ token: migratedToken, user: sanitizeAdmin_(migrated) });
    }
  }
  if (String(match.Active).toUpperCase() === 'FALSE') {
    throw HttpError_('UNAUTHORIZED', 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }
  var token = signSession_({ empId: match.EmployeeID, role: 'User', name: match.ThaiName });
  writeLog_(match.EmployeeID, 'Login', 'Auth', '');
  return ok_({ token: token, user: sanitizeStaff_(match) });
}

function handleMe_(ctx) {
  if (ctx.session.role === 'Admin') {
    var admin = getById_('Admins', 'EmployeeID', ctx.session.empId);
    if (!admin) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้');
    return ok_(sanitizeAdmin_(admin));
  }
  var staff = getById_('Staff', 'EmployeeID', ctx.session.empId);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้');
  return ok_(sanitizeStaff_(staff));
}

function handleLogout_(ctx) {
  writeLog_(ctx.session.empId, 'Logout', 'Auth', '');
  return ok_(true);
}
