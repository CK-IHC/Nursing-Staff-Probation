/**
 * WalkRounds.gs — แบบฟอร์ม Walk Round เยี่ยมพนักงานใหม่ + รายงานสรุปตามผู้เยี่ยม/หน่วยงาน
 * รอบการเยี่ยม (VisitRound) และหน่วยงาน (Department) ระบบกำหนดให้อัตโนมัติจากประวัติ/ข้อมูลพนักงาน — ไม่ให้กรอกเอง
 */

// กำหนดการ Walk Round มาตรฐาน: ครั้งที่ 1 ภายใน 7 วันแรก, ครั้งที่ 2 ภายในเดือนแรก (30 วัน), ครั้งที่ 3 เมื่อครบ 90 วัน
var WALK_ROUND_SCHEDULE_ = [
  { round: 1, label: 'ครั้งที่ 1 (สัปดาห์แรก)', dueDay: 7 },
  { round: 2, label: 'ครั้งที่ 2 (เดือนแรก)', dueDay: 30 },
  { round: 3, label: 'ครั้งที่ 3 (ครบ 90 วัน)', dueDay: 90 },
];

function stripInternal_(row) {
  var out = {};
  for (var k in row) { if (k !== '_row') out[k] = row[k]; }
  return out;
}

function enrichWalkRound_(row) {
  var out = stripInternal_(row);
  try { out.Checklist = JSON.parse(row.ChecklistJSON || '[]'); } catch (e) { out.Checklist = []; }
  return out;
}

function visitedWalkRoundsFor_(employeeId, allRounds) {
  var set = {};
  (allRounds || getAll_('WalkRounds')).forEach(function (r) {
    if (r.EmployeeID === employeeId && r.VisitRound) set[r.VisitRound] = true;
  });
  return set;
}

/** รอบเยี่ยมถัดไปที่ยังไม่ได้ทำสำหรับพนักงานคนนี้ (ตัวแรกสุดตามลำดับที่ยังไม่มีบันทึก) — null ถ้าครบทุกรอบแล้วหรือไม่มี HireDate */
function nextWalkRoundFor_(staff, allRounds) {
  if (!staff || !staff.HireDate) return null;
  var visited = visitedWalkRoundsFor_(staff.EmployeeID, allRounds);
  var days = daysBetween_(staff.HireDate, todayISO_());
  for (var i = 0; i < WALK_ROUND_SCHEDULE_.length; i++) {
    var rnd = WALK_ROUND_SCHEDULE_[i];
    if (!visited[rnd.label]) {
      return {
        round: rnd.round, label: rnd.label, dueDay: rnd.dueDay, daysSinceHire: days,
        due: days >= rnd.dueDay - 3, overdue: days > rnd.dueDay + 7,
      };
    }
  }
  return null;
}

/** รายชื่อพนักงานที่ถึงกำหนด Walk Round แล้วแต่ยังไม่ได้เยี่ยม — ใช้ทั้งในหน้า Walk Round และ Dashboard reminders */
function walkRoundDueList_() {
  var staff = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin' && (r.ProbationaryStatus || 'Active') === 'Active' && r.HireDate; });
  var allRounds = getAll_('WalkRounds');
  var due = [];
  staff.forEach(function (s) {
    var next = nextWalkRoundFor_(s, allRounds);
    if (next && next.due) {
      due.push({
        EmployeeID: s.EmployeeID, ThaiName: s.ThaiName, Department: s.CostCenterName || 'ไม่ระบุ',
        Round: next.round, RoundLabel: next.label, Overdue: next.overdue,
      });
    }
  });
  return due;
}

function walkRoundsDueToday_() {
  return ok_(walkRoundDueList_());
}

// ---------- หัวข้อเช็กลิสต์ Walk Round + ตัวเลือก "ผล" ของแต่ละหัวข้อ (lookup รายหัวข้อ ไม่ใช่ list กลางเหมือนเดิม) ----------
// เก็บใน Lists (Category='WalkRoundChecklist') โดย Value เป็น JSON {text, options[]} แทนสตริงล้วนแบบเดิม
// รองรับข้อมูลเก่าที่ Value ยังเป็นสตริงล้วน (ก่อนอัปเดตฟีเจอร์นี้) ด้วยการ fallback ไปใช้ WalkRoundResult list เดิมเป็นตัวเลือกเริ่มต้น
function defaultWalkRoundResultOptions_() {
  var fallback = getListValues_('WalkRoundResult');
  return fallback.length ? fallback : ['✓ พร้อม/เข้าใจแล้ว', '✗ ยังไม่พร้อม/ไม่เข้าใจ', 'N/A'];
}

function getWalkRoundChecklistItems_() {
  var rows = getAll_('Lists')
    .filter(function (r) { return r.Category === 'WalkRoundChecklist' && String(r.Active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
  var fallbackOptions = defaultWalkRoundResultOptions_();
  return rows.map(function (r) {
    var parsed = null;
    try { parsed = JSON.parse(r.Value); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === 'object' && parsed.text) {
      return {
        ListID: r.ListID, text: parsed.text,
        options: Array.isArray(parsed.options) && parsed.options.length ? parsed.options : fallbackOptions,
      };
    }
    return { ListID: r.ListID, text: r.Value, options: fallbackOptions };
  });
}

function listWalkRoundChecklist_() {
  return ok_(getWalkRoundChecklistItems_());
}

function createWalkRoundChecklistItem_(ctx) {
  var body = ctx.body;
  if (!body.text) throw HttpError_('BAD_REQUEST', 'กรุณากรอกหัวข้อเช็กลิสต์');
  var options = Array.isArray(body.options) ? body.options.map(function (o) { return String(o).trim(); }).filter(Boolean) : [];
  if (!options.length) options = defaultWalkRoundResultOptions_();
  var existingCount = getAll_('Lists').filter(function (r) { return r.Category === 'WalkRoundChecklist'; }).length;
  var record = {
    ListID: genId_('LST'), Category: 'WalkRoundChecklist',
    Value: JSON.stringify({ text: String(body.text).trim(), options: options }),
    Order: String(existingCount + 1), Active: 'TRUE',
  };
  insertRow_('Lists', record);
  writeLog_(ctx.session.empId, 'Create', 'WalkRoundChecklist', record.Value);
  return ok_(record, 'เพิ่มหัวข้อเช็กลิสต์สำเร็จ');
}

function updateWalkRoundChecklistItem_(ctx) {
  var body = ctx.body;
  if (!body.text) throw HttpError_('BAD_REQUEST', 'กรุณากรอกหัวข้อเช็กลิสต์');
  var options = Array.isArray(body.options) ? body.options.map(function (o) { return String(o).trim(); }).filter(Boolean) : [];
  var value = JSON.stringify({ text: String(body.text).trim(), options: options });
  var updated = patchById_('Lists', 'ListID', ctx.params.id, { Value: value });
  writeLog_(ctx.session.empId, 'Update', 'WalkRoundChecklist:' + ctx.params.id, value);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function listWalkRounds_(ctx) {
  var q = ctx.query;
  var rows = getAll_('WalkRounds');
  if (q.visitorId) rows = rows.filter(function (r) { return r.VisitorID === q.visitorId; });
  if (q.department) rows = rows.filter(function (r) { return r.Department === q.department; });
  if (q.status) rows = rows.filter(function (r) { return r.Status === q.status; });
  if (q.employeeId) rows = rows.filter(function (r) { return r.EmployeeID === q.employeeId; });
  if (q.dateFrom) rows = rows.filter(function (r) { return r.VisitDate >= q.dateFrom; });
  if (q.dateTo) rows = rows.filter(function (r) { return r.VisitDate <= q.dateTo; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.EmployeeName || '').toLowerCase().indexOf(s) !== -1 ||
        (r.EmployeeID || '').toLowerCase().indexOf(s) !== -1 ||
        (r.VisitorName || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  rows.sort(function (a, b) { return b.VisitDate.localeCompare(a.VisitDate); });
  return ok_(rows.map(enrichWalkRound_));
}

function getWalkRound_(ctx) {
  var row = getById_('WalkRounds', 'RoundID', ctx.params.id);
  if (!row) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลการเยี่ยม');
  return ok_(enrichWalkRound_(row));
}

// หาคอลัมน์ของหัวข้อเช็กลิสต์นี้ในชีต WalkRounds ถ้ายังไม่มีให้เพิ่มคอลัมน์ใหม่ต่อท้าย (คืน index แบบ 0-based ใน headers)
function ensureChecklistColumn_(sh, headers, label) {
  var idx = headers.indexOf(label);
  if (idx !== -1) return idx;
  var newCol = headers.length + 1;
  sh.getRange(1, newCol).setValue(label);
  headers.push(label);
  return headers.length - 1;
}

// เขียนผล/หมายเหตุของแต่ละหัวข้อเช็กลิสต์ (แต่ละกล่องข้อความในฟอร์ม) ลงคอลัมน์แยกของตัวเองในชีต WalkRounds
// นอกเหนือจาก ChecklistJSON เดิมที่ยังเก็บไว้เผื่อใช้งานผ่าน API — คอลัมน์ตั้งชื่อตามหัวข้อเช็กลิสต์ (label)
function writeChecklistColumnsForRow_(sh, headers, rowNum, checklist) {
  (checklist || []).forEach(function (item) {
    if (!item || !item.label) return;
    var colIdx = ensureChecklistColumn_(sh, headers, item.label);
    var val = item.value || '';
    if (item.note) val += (val ? ' ' : '') + '(' + item.note + ')';
    sh.getRange(rowNum, colIdx + 1).setValue(val);
  });
}

// ซิงก์ข้อมูลเช็กลิสต์เดิม (ที่เคยบันทึกไว้ก่อนมีฟีเจอร์แยกคอลัมน์) ให้กระจายลงคอลัมน์รายหัวข้อด้วย — เรียกครั้งเดียวจากปุ่มในหน้า Walk Round
function syncWalkRoundChecklistColumns_(ctx) {
  var sh = sheet_('WalkRounds');
  var headers = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  var rows = getAll_('WalkRounds');
  rows.forEach(function (r) {
    if (!r.RoundID || !r._row) return;
    var checklist = [];
    try { checklist = JSON.parse(r.ChecklistJSON || '[]'); } catch (e) { checklist = []; }
    writeChecklistColumnsForRow_(sh, headers, r._row, checklist);
  });
  invalidateTableCache_('WalkRounds');
  writeLog_(ctx.session.empId, 'Sync', 'WalkRoundChecklistColumns', rows.length + ' rows');
  return ok_({ updated: rows.length }, 'ซิงก์ข้อมูลเช็กลิสต์ลงคอลัมน์สำเร็จ');
}

function createWalkRound_(ctx) {
  var body = ctx.body;
  if (!body.VisitDate || !body.EmployeeID) {
    throw HttpError_('BAD_REQUEST', 'กรุณาระบุวันที่เยี่ยมและพนักงานที่เยี่ยม');
  }
  var staff = getById_('Staff', 'EmployeeID', body.EmployeeID);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
  var next = nextWalkRoundFor_(staff, getAll_('WalkRounds'));
  var record = {
    RoundID: genId_('WR'), VisitDate: body.VisitDate, VisitTime: body.VisitTime || '',
    VisitorID: ctx.session.empId, VisitorName: ctx.session.name || '',
    Department: staff.CostCenterName || 'ไม่ระบุ', VisitRound: next ? next.label : 'เยี่ยมเพิ่มเติม',
    EmployeeID: staff.EmployeeID, EmployeeName: staff.ThaiName,
    Position: staff.Position || '', HireDate: staff.HireDate || '', Buddy: staff.Preceptor || '',
    ChecklistJSON: JSON.stringify(body.Checklist || []),
    SatisfactionScore: '', IssuesFound: body.IssuesFound || '',
    ActionNeeded: body.ActionNeeded || '', ActionOwner: body.ActionOwner || '',
    Status: body.Status || 'รอติดตาม', NextFollowUpDate: body.NextFollowUpDate || '',
    VisitorSignature: '', StaffSignature: '',
    Note: body.Note || '', CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString(),
  };
  insertRow_('WalkRounds', record);
  try {
    var sh = sheet_('WalkRounds');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    writeChecklistColumnsForRow_(sh, headers, sh.getLastRow(), body.Checklist || []);
  } catch (e) { /* เขียนคอลัมน์เสริมไม่สำเร็จ ไม่ควรทำให้การบันทึกหลักล้มเหลว */ }
  writeLog_(ctx.session.empId, 'Create', 'WalkRound:' + record.RoundID, record.EmployeeName + ' / ' + record.Department);
  return ok_(enrichWalkRound_(record), 'บันทึกการเยี่ยมสำเร็จ');
}

function updateWalkRound_(ctx) {
  var body = ctx.body;
  var patch = {};
  var editable = ['VisitDate', 'VisitTime', 'IssuesFound', 'ActionNeeded', 'ActionOwner', 'Status', 'NextFollowUpDate', 'Note'];
  editable.forEach(function (k) { if (body[k] !== undefined) patch[k] = body[k]; });
  if (body.Checklist !== undefined) patch.ChecklistJSON = JSON.stringify(body.Checklist || []);
  patch.UpdatedAt = new Date().toISOString();
  var updated = patchById_('WalkRounds', 'RoundID', ctx.params.id, patch);
  if (body.Checklist !== undefined) {
    try {
      var sh = sheet_('WalkRounds');
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      writeChecklistColumnsForRow_(sh, headers, updated._row, body.Checklist || []);
    } catch (e) { /* เขียนคอลัมน์เสริมไม่สำเร็จ ไม่ควรทำให้การแก้ไขหลักล้มเหลว */ }
  }
  writeLog_(ctx.session.empId, 'Update', 'WalkRound:' + ctx.params.id, JSON.stringify(body));
  return ok_(enrichWalkRound_(updated), 'บันทึกการแก้ไขสำเร็จ');
}

function deleteWalkRound_(ctx) {
  var existing = getById_('WalkRounds', 'RoundID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบรายการ');
  updateRow_('WalkRounds', existing._row, {
    RoundID: '', VisitDate: '', VisitTime: '', VisitorID: '', VisitorName: '', Department: '', VisitRound: '',
    EmployeeID: '', EmployeeName: '', Position: '', HireDate: '', Buddy: '', ChecklistJSON: '', SatisfactionScore: '',
    IssuesFound: '', ActionNeeded: '', ActionOwner: '', Status: '', NextFollowUpDate: '', VisitorSignature: '',
    StaffSignature: '', Note: '', CreatedAt: '', UpdatedAt: '',
  });
  writeLog_(ctx.session.empId, 'Delete', 'WalkRound:' + ctx.params.id, '');
  return ok_(true, 'ลบรายการสำเร็จ');
}

// รายงานตามผู้เยี่ยม: จำนวนครั้ง/พนักงานที่ดูแล, ครบ vs ค้าง, ปัญหาที่พบ/ปิดได้/รอติดตาม
function walkRoundReportByUser_() {
  var rows = getAll_('WalkRounds');
  var byUser = {};
  rows.forEach(function (r) {
    var key = r.VisitorID || '—';
    if (!byUser[key]) {
      byUser[key] = {
        visitorId: key, visitorName: r.VisitorName || key, visitCount: 0, staffIds: {},
        completedCount: 0, pendingCount: 0, issuesCount: 0, issuesResolved: 0,
      };
    }
    var u = byUser[key];
    u.visitCount++;
    if (r.EmployeeID) u.staffIds[r.EmployeeID] = true;
    if (r.Status === 'เรียบร้อย') u.completedCount++; else u.pendingCount++;
    if (r.IssuesFound) {
      u.issuesCount++;
      if (r.Status === 'เรียบร้อย') u.issuesResolved++;
    }
  });
  var out = Object.keys(byUser).map(function (key) {
    var u = byUser[key];
    return {
      visitorId: u.visitorId, visitorName: u.visitorName, visitCount: u.visitCount,
      staffCoveredCount: Object.keys(u.staffIds).length, completedCount: u.completedCount, pendingCount: u.pendingCount,
      issuesCount: u.issuesCount, issuesResolved: u.issuesResolved, issuesPending: u.issuesCount - u.issuesResolved,
    };
  });
  out.sort(function (a, b) { return b.visitCount - a.visitCount; });
  return ok_(out);
}

// รายงานตามหน่วยงาน: พนักงานใหม่ทั้งหมด vs เยี่ยมแล้ว (% coverage), ปัญหาที่พบบ่อย, Action ค้าง
function walkRoundReportByDepartment_() {
  var rounds = getAll_('WalkRounds');
  var staff = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin' && (r.ProbationaryStatus || 'Active') === 'Active'; });
  var deptTotals = {};
  staff.forEach(function (s) {
    var dept = s.CostCenterName || 'ไม่ระบุ';
    deptTotals[dept] = (deptTotals[dept] || 0) + 1;
  });
  var byDept = {};
  rounds.forEach(function (r) {
    var dept = r.Department || 'ไม่ระบุ';
    if (!byDept[dept]) {
      byDept[dept] = { department: dept, visitedStaffIds: {}, issues: {}, pendingActions: 0 };
    }
    var d = byDept[dept];
    if (r.EmployeeID) d.visitedStaffIds[r.EmployeeID] = true;
    if (r.IssuesFound) d.issues[r.IssuesFound] = (d.issues[r.IssuesFound] || 0) + 1;
    if (r.ActionNeeded && r.Status !== 'เรียบร้อย') d.pendingActions++;
  });
  var depts = {};
  Object.keys(deptTotals).forEach(function (d) { depts[d] = true; });
  Object.keys(byDept).forEach(function (d) { depts[d] = true; });
  var out = Object.keys(depts).map(function (dept) {
    var d = byDept[dept] || { visitedStaffIds: {}, issues: {}, pendingActions: 0 };
    var total = deptTotals[dept] || 0;
    var visited = Object.keys(d.visitedStaffIds).length;
    var topIssues = Object.keys(d.issues).map(function (txt) { return { text: txt, count: d.issues[txt] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    return {
      department: dept, totalNewStaff: total, visitedStaff: visited,
      coveragePct: total ? Math.round((visited / total) * 1000) / 10 : 0,
      topIssues: topIssues, pendingActions: d.pendingActions,
    };
  });
  out.sort(function (a, b) { return b.totalNewStaff - a.totalNewStaff; });
  return ok_(out);
}
