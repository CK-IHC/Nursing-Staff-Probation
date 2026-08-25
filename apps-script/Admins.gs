/**
 * Admins.gs — บัญชีผู้ดูแลระบบ (Admin) เก็บในชีต Admins แยกจากชีต Staff โดยเด็ดขาด
 * คนคนหนึ่ง ณ เวลาใดเวลาหนึ่งเป็นได้แค่อย่างใดอย่างหนึ่ง (Staff หรือ Admin) — ให้สิทธิ์ Admin คือย้ายข้อมูลตัวตน
 * (ชื่อ/เบอร์) จากชีต Staff มาชีต Admins แล้วลบออกจาก Staff เด็ดขาด ไม่ปรากฏใน Staff Directory อีกต่อไป
 * ลบสิทธิ์ Admin (revoke) คือปิดใช้งานบัญชี Admin นั้น — ระบบไม่สร้างข้อมูลพนักงานกลับให้อัตโนมัติ
 * (ถ้าต้องการให้กลับมาเป็นพนักงาน ต้องเพิ่มข้อมูลพนักงานใหม่ผ่านหน้า Staff Directory)
 */

function sanitizeAdmin_(row) {
  var out = sanitizeStaff_(row);
  out.Role = 'Admin'; // ชีต Admins ไม่มีคอลัมน์ Role (ทุกแถวคือ Admin อยู่แล้ว) — เติมให้ frontend ใช้แยก role ได้เหมือน Staff
  return out;
}

function listAdmins_() {
  var rows = getAll_('Admins').filter(function (r) { return String(r.Active).toUpperCase() !== 'FALSE'; });
  return ok_(rows.map(sanitizeAdmin_));
}

/** เพิ่ม Admin — ระบุ fromEmployeeId เพื่อย้ายข้อมูลตัวตนจากพนักงานที่มีอยู่แล้ว (ลบออกจากชีต Staff ทันที)
 *  หรือกรอกข้อมูลเอง (EmployeeID/ThaiName/Phone) เพื่อสร้างบัญชี Admin ใหม่ที่ไม่ผูกกับพนักงานคนใดในระบบ */
function createAdmin_(ctx) {
  var body = ctx.body;
  var now = new Date().toISOString();

  if (body.fromEmployeeId) {
    var staff = getById_('Staff', 'EmployeeID', body.fromEmployeeId);
    if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
    if (getById_('Admins', 'EmployeeID', staff.EmployeeID)) {
      throw HttpError_('CONFLICT', 'มีบัญชี Admin นี้อยู่แล้ว');
    }
    var record = {
      EmployeeID: staff.EmployeeID, ThaiName: staff.ThaiName, NickName: staff.NickName,
      Phone: staff.Phone, Active: 'TRUE', Note: staff.Note || '', CreatedAt: now, UpdatedAt: now,
    };
    insertRow_('Admins', record);
    deleteRowByField_('Staff', 'EmployeeID', staff.EmployeeID);
    writeLog_(ctx.session.empId, 'GrantAdmin', 'Admin:' + staff.EmployeeID, 'ย้ายจากชีต Staff');
    return ok_(sanitizeAdmin_(record), 'ให้สิทธิ์ Admin สำเร็จ');
  }

  var employeeId = String(body.EmployeeID || '').trim();
  var thaiName = String(body.ThaiName || '').trim();
  var phone = String(body.Phone || '').trim();
  if (!employeeId || !thaiName || !phone) {
    throw HttpError_('BAD_REQUEST', 'กรุณากรอก Employee ID, ชื่อ-นามสกุล, เบอร์มือถือ ให้ครบ');
  }
  if (getById_('Admins', 'EmployeeID', employeeId) || getById_('Staff', 'EmployeeID', employeeId)) {
    throw HttpError_('CONFLICT', 'มีรหัสพนักงานนี้อยู่แล้ว');
  }
  if (findByPhone_(phone, null)) {
    throw HttpError_('CONFLICT', 'มีบัญชีที่ใช้เบอร์มือถือนี้เข้าสู่ระบบอยู่แล้ว');
  }
  var newRecord = {
    EmployeeID: employeeId, ThaiName: thaiName, NickName: String(body.NickName || '').trim(),
    Phone: phone, Active: 'TRUE', Note: String(body.Note || '').trim(), CreatedAt: now, UpdatedAt: now,
  };
  insertRow_('Admins', newRecord);
  writeLog_(ctx.session.empId, 'GrantAdmin', 'Admin:' + employeeId, 'สร้างใหม่');
  return ok_(sanitizeAdmin_(newRecord), 'เพิ่ม Admin สำเร็จ');
}

function updateAdmin_(ctx) {
  var id = ctx.params.id;
  if (ctx.body.Phone !== undefined && String(ctx.body.Phone).trim() && findByPhone_(ctx.body.Phone, id)) {
    throw HttpError_('CONFLICT', 'มีบัญชีที่ใช้เบอร์มือถือนี้เข้าสู่ระบบอยู่แล้ว');
  }
  var patch = { UpdatedAt: new Date().toISOString() };
  ['ThaiName', 'NickName', 'Phone', 'Note'].forEach(function (f) {
    if (ctx.body[f] !== undefined) patch[f] = ctx.body[f];
  });
  var updated = patchById_('Admins', 'EmployeeID', id, patch);
  writeLog_(ctx.session.empId, 'Update', 'Admin:' + id, JSON.stringify(patch));
  return ok_(sanitizeAdmin_(updated), 'บันทึกการแก้ไขสำเร็จ');
}

function revokeAdmin_(ctx) {
  var id = ctx.params.id;
  if (ctx.session.empId === id) throw HttpError_('BAD_REQUEST', 'ไม่สามารถลบสิทธิ์ Admin ของบัญชีตัวเองได้');
  patchById_('Admins', 'EmployeeID', id, { Active: 'FALSE', UpdatedAt: new Date().toISOString() });
  writeLog_(ctx.session.empId, 'RevokeAdmin', 'Admin:' + id, '');
  return ok_(true, 'ลบสิทธิ์ Admin สำเร็จ');
}
