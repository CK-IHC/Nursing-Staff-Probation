/**
 * Staff.gs — จัดการบุคลากร (CRUD, แจ้งเตือนใกล้ครบกำหนดประเมิน 60/119 วัน, ทีมของหัวหน้า, โปรไฟล์ตนเอง, Import/Export)
 */

function sanitizeStaff_(row) {
  var out = {};
  for (var k in row) {
    if (k !== '_row') out[k] = row[k];
  }
  return out;
}

function isSupervisorOf_(supervisorEmpId, targetEmpId) {
  var target = getById_('Staff', 'EmployeeID', targetEmpId);
  return !!target && target.Supervisor === supervisorEmpId;
}

/** คำนวณวันครบกำหนดประเมินครั้งที่ 1 (60 วัน) และครั้งที่ 2/สุดท้าย (119 วัน) จากวันที่เริ่มงาน */
function computeEvalDates_(hireDate) {
  if (!hireDate) return { Eval60Date: '', Eval119Date: '' };
  return { Eval60Date: addDays_(hireDate, 60), Eval119Date: addDays_(hireDate, 119) };
}

// แปลงวันที่ที่พิมพ์มาในรูปแบบ dd/mm/yyyy (หรือรูปแบบอื่นที่พบบ่อยเวลาผู้ใช้แก้ไฟล์ CSV ด้วย Excel) ให้เป็น yyyy-mm-dd
// ก่อนบันทึก/คำนวณ — ถ้าเป็น yyyy-mm-dd อยู่แล้วคืนค่าเดิม ถ้าแปลงไม่ได้คืนค่าเดิมไว้ (กัน exception พังทั้งแถวตอนนำเข้า)
function normalizeDateInput_(value) {
  var s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    var parts = s.split('-');
    return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  }
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return s;
}

function listStaff_(ctx) {
  var rows = getAll_('Staff');
  var q = ctx.query;
  // ค่าเริ่มต้นไม่แสดงบัญชี Admin ปนอยู่ในรายชื่อ "Staff" — ต้องระบุ includeAdmin=true อย่างชัดเจน
  // (ใช้เฉพาะหน้า Settings > จัดการสิทธิ์ผู้ใช้งาน) จึงจะเห็นบัญชี Admin
  if (q.includeAdmin !== 'true') rows = rows.filter(function (r) { return r.Role !== 'Admin'; });
  if (q.costCenterId) rows = rows.filter(function (r) { return r.CostCenterID === q.costCenterId; });
  if (q.subServiceId) rows = rows.filter(function (r) { return r.SubServiceID === q.subServiceId; });
  if (q.position) rows = rows.filter(function (r) { return r.Position === q.position; });
  if (q.manager) rows = rows.filter(function (r) { return r.ManagerName === q.manager; });
  if (q.status) rows = rows.filter(function (r) { return (r.ProbationaryStatus || 'Active') === q.status; });
  if (q.hireFrom) rows = rows.filter(function (r) { return r.HireDate && r.HireDate >= q.hireFrom; });
  if (q.hireTo) rows = rows.filter(function (r) { return r.HireDate && r.HireDate <= q.hireTo; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.EmployeeID || '').toLowerCase().indexOf(s) !== -1 ||
        (r.ThaiName || '').toLowerCase().indexOf(s) !== -1 ||
        (r.NickName || '').toLowerCase().indexOf(s) !== -1 ||
        (r.Position || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  return ok_(rows.map(sanitizeStaff_));
}

/** พนักงานที่ใกล้ครบกำหนดประเมิน (60 วัน / 119 วัน แยกกัน) หรือครบแล้วแต่ยังไม่มีผลสรุป */
function staffNearDue_(ctx) {
  var rows = getAll_('Staff').filter(function (r) { return r.ProbationaryStatus === 'Active' && r.Role !== 'Admin'; });
  var settings = getSettingsMap_();
  var alertDays = Number(ctx.query.alertDays || settings.AlertDays || '10');
  var today = todayISO_();
  var evalRows = getAll_('Evaluations');

  function hasEval(empId, period) {
    return evalRows.some(function (e) { return e.EmployeeID === empId && e.Period === period; });
  }

  function classify(dateField, period) {
    var nearDue = [], overdue = [];
    rows.forEach(function (r) {
      if (!r[dateField] || hasEval(r.EmployeeID, period)) return;
      var remain = daysBetween_(today, r[dateField]);
      if (remain < 0) overdue.push(sanitizeStaff_(r));
      else if (remain <= alertDays) nearDue.push(sanitizeStaff_(r));
    });
    return { nearDue: nearDue, overdue: overdue };
  }

  return ok_({ round60: classify('Eval60Date', '60'), round119: classify('Eval119Date', '119') });
}

function staffTeam_(ctx) {
  var rows = getAll_('Staff');
  var team = rows.filter(function (r) {
    return r.Supervisor === ctx.session.empId && String(r.Active).toUpperCase() !== 'FALSE';
  });
  return ok_(team.map(sanitizeStaff_));
}

function getStaff_(ctx) {
  var id = ctx.params.id;
  if (!canAccessStaff_(ctx.session, id)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  var staff = getById_('Staff', 'EmployeeID', id);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
  return ok_(sanitizeStaff_(staff));
}

function buildStaffRecord_(body, existing) {
  var hireDate = normalizeDateInput_(body.HireDate || (existing && existing.HireDate) || '');
  var evalDates = computeEvalDates_(hireDate);
  var base = existing ? sanitizeStaff_(existing) : {};
  var record = {
    ThaiName: body.ThaiName !== undefined ? body.ThaiName : base.ThaiName || '',
    NickName: body.NickName !== undefined ? body.NickName : base.NickName || '',
    HireDate: hireDate,
    Position: body.Position !== undefined ? body.Position : base.Position || '',
    CostCenterID: body.CostCenterID !== undefined ? body.CostCenterID : base.CostCenterID || '',
    CostCenterName: body.CostCenterName !== undefined ? body.CostCenterName : base.CostCenterName || '',
    JobFunction: body.JobFunction !== undefined ? body.JobFunction : base.JobFunction || '',
    SubServiceID: body.SubServiceID !== undefined ? body.SubServiceID : base.SubServiceID || '',
    Preceptor: body.Preceptor !== undefined ? body.Preceptor : base.Preceptor || '',
    ManagerName: body.ManagerName !== undefined ? body.ManagerName : base.ManagerName || '',
    Supervisor: body.Supervisor !== undefined ? body.Supervisor : base.Supervisor || '',
    FullPartTime: body.FullPartTime !== undefined ? body.FullPartTime : base.FullPartTime || 'Full Time',
    ProbationaryStatus: body.ProbationaryStatus ? body.ProbationaryStatus : base.ProbationaryStatus || 'Active',
    Eval60Date: evalDates.Eval60Date,
    Eval119Date: evalDates.Eval119Date,
    Orient1Date: body.Orient1Date !== undefined ? normalizeDateInput_(body.Orient1Date) : base.Orient1Date || '',
    Orient2Date: body.Orient2Date !== undefined ? normalizeDateInput_(body.Orient2Date) : base.Orient2Date || '',
    Orient3Date: body.Orient3Date !== undefined ? normalizeDateInput_(body.Orient3Date) : base.Orient3Date || '',
    Orient4Date: body.Orient4Date !== undefined ? normalizeDateInput_(body.Orient4Date) : base.Orient4Date || '',
    OrientSentHRDate: body.OrientSentHRDate !== undefined ? normalizeDateInput_(body.OrientSentHRDate) : base.OrientSentHRDate || '',
    ApplyLadderStatus: body.ApplyLadderStatus !== undefined ? body.ApplyLadderStatus : base.ApplyLadderStatus || 'NA',
    UnitSpecificCompetency: body.UnitSpecificCompetency !== undefined ? body.UnitSpecificCompetency : base.UnitSpecificCompetency || '',
    Role: body.Role === 'Admin' ? 'Admin' : (base.Role === 'Admin' && body.Role === undefined ? 'Admin' : 'User'),
    Phone: body.Phone !== undefined ? body.Phone : base.Phone || '',
    Rehire: body.Rehire !== undefined ? String(body.Rehire) : base.Rehire || 'FALSE',
    ResignationType: body.ResignationType !== undefined ? body.ResignationType : base.ResignationType || '',
    ResignDate: body.ResignDate !== undefined ? normalizeDateInput_(body.ResignDate) : base.ResignDate || '',
    Note: body.Note !== undefined ? body.Note : base.Note || '',
  };
  return record;
}

/** หาพนักงานจากเบอร์มือถือ (ใช้ตรวจว่าเบอร์ซ้ำก่อนบันทึก เพราะเบอร์คือรหัสผ่านเข้าสู่ระบบ) */
function findByPhone_(phone, excludeEmployeeId) {
  var target = normalizePhone_(phone);
  if (!target) return null;
  var rows = getAll_('Staff');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].EmployeeID === excludeEmployeeId) continue;
    if (normalizePhone_(rows[i].Phone) === target) return rows[i];
  }
  return null;
}

function createStaff_(ctx) {
  var body = ctx.body;
  var employeeId = String(body.EmployeeID || '').trim();
  var thaiName = String(body.ThaiName || '').trim();
  var hireDate = String(body.HireDate || '').trim();
  var phone = String(body.Phone || '').trim();
  if (!employeeId || !thaiName || !hireDate || !phone) {
    throw HttpError_('BAD_REQUEST', 'กรุณากรอก Employee ID, ชื่อ-นามสกุล, วันที่เริ่มงาน, เบอร์มือถือ ให้ครบ');
  }
  if (getById_('Staff', 'EmployeeID', employeeId)) {
    throw HttpError_('CONFLICT', 'มีรหัสพนักงานนี้อยู่แล้ว');
  }
  if (findByPhone_(phone, null)) {
    throw HttpError_('CONFLICT', 'มีพนักงานที่ใช้เบอร์มือถือนี้เข้าสู่ระบบอยู่แล้ว');
  }

  var now = new Date().toISOString();
  var record = buildStaffRecord_(body, null);
  record.EmployeeID = employeeId;
  record.Active = 'TRUE';
  record.CreatedAt = now;
  record.UpdatedAt = now;
  insertRow_('Staff', record);
  writeLog_(ctx.session.empId, 'Create', 'Staff:' + employeeId, JSON.stringify(record));
  return ok_(record, 'เพิ่มพนักงานสำเร็จ');
}

function updateStaff_(ctx) {
  var id = ctx.params.id;
  var existing = getById_('Staff', 'EmployeeID', id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');

  if (ctx.body.Phone !== undefined && String(ctx.body.Phone).trim() && findByPhone_(ctx.body.Phone, id)) {
    throw HttpError_('CONFLICT', 'มีพนักงานที่ใช้เบอร์มือถือนี้เข้าสู่ระบบอยู่แล้ว');
  }

  var patch = buildStaffRecord_(ctx.body, existing);
  patch.UpdatedAt = new Date().toISOString();
  var updated = patchById_('Staff', 'EmployeeID', id, patch);
  writeLog_(ctx.session.empId, 'Update', 'Staff:' + id, JSON.stringify(patch));
  return ok_(sanitizeStaff_(updated), 'บันทึกการแก้ไขสำเร็จ');
}

// ฟิลด์ที่พนักงานแก้ไขข้อมูลส่วนตัวของตนเองได้ — ยกเว้นวันที่เริ่มงาน, รหัสพนักงาน, สิทธิ์การใช้งาน (Role)
// และฟิลด์ที่ระบบคำนวณ/ฝ่ายบุคคลเป็นผู้จัดการ (Eval60/119Date, ProbationaryStatus, Orientation, ฯลฯ)
var SELF_EDITABLE_FIELDS_ = [
  'ThaiName', 'NickName', 'Position', 'CostCenterID', 'CostCenterName', 'JobFunction',
  'SubServiceID', 'Preceptor', 'ManagerName', 'FullPartTime', 'Phone', 'Note',
];

// แก้ไขข้อมูลส่วนตัวของตนเอง (เฉพาะฟิลด์ที่อนุญาตตาม SELF_EDITABLE_FIELDS_)
function updateOwnProfile_(ctx) {
  var id = ctx.params.id;
  if (ctx.session.empId !== id) throw HttpError_('FORBIDDEN', 'แก้ไขได้เฉพาะข้อมูลของตนเอง');

  var body = ctx.body;
  if (body.Phone !== undefined && String(body.Phone).trim() && findByPhone_(body.Phone, id)) {
    throw HttpError_('CONFLICT', 'มีพนักงานที่ใช้เบอร์มือถือนี้เข้าสู่ระบบอยู่แล้ว');
  }

  var patch = { UpdatedAt: new Date().toISOString() };
  SELF_EDITABLE_FIELDS_.forEach(function (field) {
    if (body[field] !== undefined) patch[field] = body[field];
  });
  var updated = patchById_('Staff', 'EmployeeID', id, patch);
  return ok_(sanitizeStaff_(updated), 'บันทึกข้อมูลส่วนตัวสำเร็จ');
}

// พนักงานแจ้งเองว่าได้ส่ง Orientation Checklist ให้ HR แล้ว (หน้า Probation Tracking) — หยุดการแจ้งเตือนหลังบันทึก
function selfOrientHRCheckin_(ctx) {
  var id = ctx.params.id;
  if (ctx.session.empId !== id) throw HttpError_('FORBIDDEN', 'บันทึกได้เฉพาะข้อมูลของตนเอง');
  var date = String(ctx.body.date || '').trim();
  if (!date) throw HttpError_('BAD_REQUEST', 'กรุณาระบุวันที่ส่งให้ HR');

  var patch = { OrientSentHRDate: date, UpdatedAt: new Date().toISOString() };
  var updated = patchById_('Staff', 'EmployeeID', id, patch);
  writeLog_(ctx.session.empId, 'SelfCheckin', 'Staff:' + id, 'OrientSentHRDate=' + date);
  return ok_(sanitizeStaff_(updated), 'บันทึกสถานะส่ง HR สำเร็จ');
}

function deactivateStaff_(ctx) {
  var id = ctx.params.id;
  patchById_('Staff', 'EmployeeID', id, { Active: 'FALSE', UpdatedAt: new Date().toISOString() });
  writeLog_(ctx.session.empId, 'Deactivate', 'Staff:' + id, '');
  return ok_(true, 'ปิดการใช้งานพนักงานสำเร็จ');
}

/** นำเข้าพนักงานจำนวนมาก (Import Excel) — body = { rows: [ {EmployeeID, ThaiName, HireDate, ...}, ... ] } */
function bulkImportStaff_(ctx) {
  var rows = ctx.body.rows || [];
  if (!rows.length) throw HttpError_('BAD_REQUEST', 'ไม่พบข้อมูลที่จะนำเข้า');
  var now = new Date().toISOString();
  var created = 0, updated = 0, errors = [];
  rows.forEach(function (r, idx) {
    var employeeId = String(r.EmployeeID || '').trim();
    var thaiName = String(r.ThaiName || '').trim();
    var hireDate = String(r.HireDate || '').trim();
    if (!employeeId || !thaiName || !hireDate) {
      errors.push('แถวที่ ' + (idx + 1) + ': ข้อมูลไม่ครบ (Employee ID / ชื่อ-นามสกุล / วันที่เริ่มงาน)');
      return;
    }
    try {
      var existing = getById_('Staff', 'EmployeeID', employeeId);
      var record = buildStaffRecord_(r, existing);
      record.EmployeeID = employeeId;
      record.UpdatedAt = now;
      if (existing) {
        patchById_('Staff', 'EmployeeID', employeeId, record);
        updated++;
      } else {
        record.Active = 'TRUE';
        record.CreatedAt = now;
        insertRow_('Staff', record);
        created++;
      }
    } catch (e) {
      // แถวเดียวมีปัญหา (เช่น รูปแบบวันที่แปลกจนคำนวณไม่ได้) ไม่ควรทำให้แถวอื่นที่ถูกต้องนำเข้าไม่สำเร็จไปด้วย
      errors.push('แถวที่ ' + (idx + 1) + ': ' + e.message);
    }
  });
  writeLog_(ctx.session.empId, 'Import', 'Staff', created + ' created, ' + updated + ' updated');
  return ok_({ created: created, updated: updated, errors: errors }, 'นำเข้าข้อมูลสำเร็จ ' + created + ' เพิ่มใหม่, ' + updated + ' อัปเดต');
}
