/**
 * Meetings.gs — บันทึกการประชุมรายเดือน (Mentoring Support for New Nursing Staff) พร้อมรายชื่อผู้เข้าร่วม
 * ผู้เข้าร่วมเก็บแยกเป็นคนละแถวในชีต MeetingAttendees (ดู syncMeetingAttendees_) — Meetings.AttendeesJSON
 * เหลือไว้เป็น fallback อ่านอย่างเดียวสำหรับข้อมูลเก่าก่อนแยกตาราง (ดู enrichMeeting_)
 */

function meetingAttendeesByMeetingMap_() {
  var rows = getAll_('MeetingAttendees');
  var map = {};
  rows.forEach(function (r) {
    if (!r.MeetingID) return;
    if (!map[r.MeetingID]) map[r.MeetingID] = [];
    map[r.MeetingID].push(r);
  });
  return map;
}

// เขียนรายชื่อผู้เข้าร่วมประชุมลง MeetingAttendees แยกเป็นคนละแถวต่อคน — ลบแถวเดิมของ MeetingID นี้ทั้งหมด
// (soft delete แบบเดียวกับที่ใช้ทั่วทั้งระบบ) แล้วเขียนแถวใหม่ตามรายชื่อปัจจุบันเสมอทุกครั้งที่บันทึก ง่ายกว่า
// การ diff รายชื่อเดิม/ใหม่ และจำนวนผู้เข้าร่วมต่อการประชุมไม่มากพอที่จะกังวลเรื่อง performance
// แต่ละแถวเก็บ Date/Time/Title/Detail/Status ของการประชุมนั้นซ้ำไว้ด้วย (denormalized) ให้เปิดดูใน Sheet
// ตรง ๆ เห็นบริบทการประชุมของแต่ละคนได้เลยโดยไม่ต้อง VLOOKUP ไปที่ชีต Meetings — sync ใหม่ทุกครั้งที่บันทึก
// ฟอร์ม (ฟอร์มส่ง Attendees มาเสมอ) ข้อมูลที่ซ้ำนี้จึงไม่มีทางค้างเก่าไม่ตรงกับ Meetings
function syncMeetingAttendees_(meeting, attendeeIds, staffById) {
  var rows = getAll_('MeetingAttendees');
  rows.forEach(function (r) {
    if (r.MeetingID === meeting.MeetingID) {
      updateRow_('MeetingAttendees', r._row, {
        MeetingAttendeeID: '', MeetingID: '', Date: '', Time: '', Title: '', Detail: '', Status: '', EmployeeID: '', ThaiName: '',
      });
    }
  });
  (attendeeIds || []).forEach(function (empId) {
    var s = staffById[empId];
    insertRow_('MeetingAttendees', {
      MeetingAttendeeID: genId_('MA'), MeetingID: meeting.MeetingID,
      Date: meeting.Date || '', Time: meeting.Time || '', Title: meeting.Title || '', Detail: meeting.Detail || '', Status: meeting.Status || '',
      EmployeeID: empId, ThaiName: s ? s.ThaiName : '',
    });
  });
}

function enrichMeeting_(row, staffById, attendeesByMeeting) {
  var out = {};
  for (var k in row) { if (k !== '_row') out[k] = row[k]; }
  var list = (attendeesByMeeting && attendeesByMeeting[row.MeetingID]) || null;
  if (!list) {
    // รองรับข้อมูลเก่าก่อนแยก MeetingAttendees เป็นตารางแยก (ยังเก็บผู้เข้าร่วมเป็น AttendeesJSON อยู่ในแถวเดิม)
    var legacyIds = [];
    try { legacyIds = JSON.parse(row.AttendeesJSON || '[]'); } catch (e) { legacyIds = []; }
    list = legacyIds.map(function (id) { return { EmployeeID: id, ThaiName: '' }; });
  }
  out.Attendees = list.map(function (a) {
    var s = staffById[a.EmployeeID];
    return s ? { EmployeeID: a.EmployeeID, ThaiName: s.ThaiName, Position: s.Position, CostCenterName: s.CostCenterName, HireDate: s.HireDate } : { EmployeeID: a.EmployeeID, ThaiName: a.ThaiName || '(ไม่พบข้อมูล)' };
  });
  out.AttendeeCount = list.length;
  var recorder = staffById[row.RecordedBy];
  out.RecordedByName = recorder ? recorder.ThaiName : (row.RecordedBy || '');
  return out;
}

function listMeetings_(ctx) {
  var q = ctx.query;
  var rows = getAll_('Meetings');
  if (q.status) rows = rows.filter(function (r) { return r.Status === q.status; });
  if (q.year) rows = rows.filter(function (r) { return (r.Date || '').indexOf(q.year + '-') === 0; });
  if (q.month) rows = rows.filter(function (r) { return (r.Date || '').indexOf('-' + q.month + '-') !== -1 || (r.Date || '').split('-')[1] === q.month; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    rows = rows.filter(function (r) { return (r.Title || '').toLowerCase().indexOf(s) !== -1; });
  }
  var staffById = staffByIdMap_();
  var attendeesByMeeting = meetingAttendeesByMeetingMap_();
  var enriched = rows.map(function (r) { return enrichMeeting_(r, staffById, attendeesByMeeting); });
  enriched.sort(function (a, b) { return b.Date.localeCompare(a.Date); });
  return ok_(enriched);
}

function getMeeting_(ctx) {
  var row = getById_('Meetings', 'MeetingID', ctx.params.id);
  if (!row) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลการประชุม');
  return ok_(enrichMeeting_(row, staffByIdMap_(), meetingAttendeesByMeetingMap_()));
}

/** จำนวน Staff On Probation ปัจจุบัน แบ่งตาม M1-M4 — ใช้เป็นค่าเริ่มต้นก่อน override ด้วยมือตอนบันทึกประชุมย้อนหลัง */
function meetingProbationCounts_() {
  var rows = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin'; });
  return ok_(computeProbationMonthCounts_(rows));
}

function createMeeting_(ctx) {
  var body = ctx.body;
  if (!body.Date || !body.Title) throw HttpError_('BAD_REQUEST', 'กรุณาระบุวันที่ประชุมและหัวข้อการประชุม');
  var record = {
    MeetingID: genId_('MT'), Date: body.Date, Time: body.Time || '', Title: body.Title,
    Detail: body.Detail || '', Status: body.Status || 'ยังไม่ดำเนินการ',
    AttendeesJSON: '', // ผู้เข้าร่วมเก็บแยกเป็นแถวใน MeetingAttendees แทน (ดู syncMeetingAttendees_)
    ManualCount: body.ManualCount !== undefined && body.ManualCount !== '' ? String(body.ManualCount) : '',
    RecordedBy: ctx.session.empId, CreatedAt: new Date().toISOString(),
  };
  insertRow_('Meetings', record);
  syncMeetingAttendees_(record, body.Attendees || [], staffByIdMap_());
  writeLog_(ctx.session.empId, 'Create', 'Meeting:' + record.MeetingID, body.Title);
  return ok_(record, 'บันทึกการประชุมสำเร็จ');
}

function updateMeeting_(ctx) {
  var body = ctx.body;
  var patch = {};
  for (var k in body) patch[k] = body[k];
  var attendeeIds;
  if (body.Attendees !== undefined) {
    attendeeIds = body.Attendees;
    delete patch.Attendees;
  }
  var updated = patchById_('Meetings', 'MeetingID', ctx.params.id, patch);
  if (attendeeIds !== undefined) syncMeetingAttendees_(updated, attendeeIds, staffByIdMap_());
  writeLog_(ctx.session.empId, 'Update', 'Meeting:' + ctx.params.id, JSON.stringify(patch));
  return ok_(updated, 'บันทึกการแก้ไขสำเร็จ');
}

function deleteMeeting_(ctx) {
  var existing = getById_('Meetings', 'MeetingID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลการประชุม');
  syncMeetingAttendees_(existing, [], staffByIdMap_());
  updateRow_('Meetings', existing._row, { MeetingID: '', Date: '', Time: '', Title: '', Detail: '', Status: '', AttendeesJSON: '', ManualCount: '', RecordedBy: '', CreatedAt: '' });
  writeLog_(ctx.session.empId, 'Delete', 'Meeting:' + ctx.params.id, '');
  return ok_(true, 'ลบข้อมูลการประชุมสำเร็จ');
}
