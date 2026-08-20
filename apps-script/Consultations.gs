/**
 * Consultations.gs — บันทึกการให้คำปรึกษาพนักงานทดลองงาน (Consultation Logs)
 */

function enrichConsultation_(row, staffById) {
  var staff = staffById[row.EmployeeID];
  var recorder = staffById[row.RecordedBy];
  var out = {};
  for (var k in row) { if (k !== '_row' && k !== 'FollowUpsJSON') out[k] = row[k]; }
  out.ThaiName = staff ? staff.ThaiName : '';
  out.Position = staff ? staff.Position : '';
  out.ManagerName = staff ? staff.ManagerName : '';
  out.CostCenterID = staff ? staff.CostCenterID : '';
  out.SubServiceID = staff ? staff.SubServiceID : '';
  out.RecordedByName = recorder ? recorder.ThaiName : (row.RecordedBy || '');
  try { out.FollowUps = JSON.parse(row.FollowUpsJSON || '[]'); } catch (e) { out.FollowUps = []; }
  return out;
}

function staffByIdMap_() {
  var map = {};
  getAll_('Staff').forEach(function (s) { map[s.EmployeeID] = s; });
  return map;
}

function listConsultations_(ctx) {
  var q = ctx.query;
  var rows = getAll_('Consultations');
  var staffById = staffByIdMap_();
  if (q.employeeId) rows = rows.filter(function (r) { return r.EmployeeID === q.employeeId; });
  if (q.result) rows = rows.filter(function (r) { return r.Result === q.result; });
  if (q.topic) rows = rows.filter(function (r) { return r.Topic === q.topic; });
  if (q.dateFrom) rows = rows.filter(function (r) { return r.Date >= q.dateFrom; });
  if (q.dateTo) rows = rows.filter(function (r) { return r.Date <= q.dateTo; });
  var enriched = rows.map(function (r) { return enrichConsultation_(r, staffById); });
  if (q.position) enriched = enriched.filter(function (r) { return r.Position === q.position; });
  if (q.manager) enriched = enriched.filter(function (r) { return r.ManagerName === q.manager; });
  if (q.costCenterId) enriched = enriched.filter(function (r) { return r.CostCenterID === q.costCenterId; });
  if (q.subServiceId) enriched = enriched.filter(function (r) { return r.SubServiceID === q.subServiceId; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    enriched = enriched.filter(function (r) {
      return (r.EmployeeID || '').toLowerCase().indexOf(s) !== -1 || (r.ThaiName || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  enriched.sort(function (a, b) { return b.Date.localeCompare(a.Date); });
  return ok_(enriched);
}

function consultationSummary_() {
  var rows = getAll_('Consultations');
  var summary = { total: rows.length, resolved: 0, inProgress: 0, needsFollowUp: 0, referred: 0 };
  rows.forEach(function (r) {
    if (r.Result === 'Resolved') summary.resolved++;
    else if (r.Result === 'In Progress') summary.inProgress++;
    else if (r.Result === 'Needs Follow-up') summary.needsFollowUp++;
    else if (r.Result === 'Referred to Specialist') summary.referred++;
  });
  return ok_(summary);
}

function createConsultation_(ctx) {
  var body = ctx.body;
  if (!body.EmployeeID || !body.Date || !body.Topic) {
    throw HttpError_('BAD_REQUEST', 'กรุณาระบุพนักงาน วันที่ และหัวข้อปัญหา');
  }
  if (!getById_('Staff', 'EmployeeID', body.EmployeeID)) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
  var record = {
    ConsultID: genId_('CS'), EmployeeID: body.EmployeeID, Date: body.Date, Topic: body.Topic,
    Detail: body.Detail || '', Advice: body.Advice || '', Result: body.Result || 'In Progress',
    FollowUpDate: body.FollowUpDate || '', FollowUpsJSON: JSON.stringify(body.FollowUps || []),
    RecordedBy: ctx.session.empId, CreatedAt: new Date().toISOString(),
  };
  insertRow_('Consultations', record);
  writeLog_(ctx.session.empId, 'Create', 'Consultation:' + record.ConsultID, body.EmployeeID + ' / ' + body.Topic);
  return ok_(record, 'บันทึกการให้คำปรึกษาสำเร็จ');
}

function updateConsultation_(ctx) {
  var body = ctx.body;
  var patch = {};
  var editable = ['Date', 'Topic', 'Detail', 'Advice', 'Result', 'FollowUpDate'];
  editable.forEach(function (k) { if (body[k] !== undefined) patch[k] = body[k]; });
  if (body.FollowUps !== undefined) patch.FollowUpsJSON = JSON.stringify(body.FollowUps || []);
  var updated = patchById_('Consultations', 'ConsultID', ctx.params.id, patch);
  writeLog_(ctx.session.empId, 'Update', 'Consultation:' + ctx.params.id, JSON.stringify(body));
  return ok_(updated, 'บันทึกการแก้ไขสำเร็จ');
}

function deleteConsultation_(ctx) {
  var existing = getById_('Consultations', 'ConsultID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบรายการ');
  updateRow_('Consultations', existing._row, {
    ConsultID: '', EmployeeID: '', Date: '', Topic: '', Detail: '', Advice: '', Result: '',
    FollowUpDate: '', FollowUpsJSON: '', RecordedBy: '', CreatedAt: '',
  });
  writeLog_(ctx.session.empId, 'Delete', 'Consultation:' + ctx.params.id, '');
  return ok_(true, 'ลบรายการสำเร็จ');
}
