/**
 * Evaluations.gs — บันทึกผลประเมินทดลองงาน 2 รอบตายตัว: 60 วัน (Formative) และ 119 วัน (Final Summative)
 */

function submitEvaluation_(ctx) {
  var session = ctx.session;
  var body = ctx.body;
  var employeeId = body.employeeId, period = String(body.period || ''), result = String(body.result || '').trim();
  if (!employeeId || (period !== '60' && period !== '119') || !result) {
    throw HttpError_('BAD_REQUEST', 'กรุณาระบุพนักงาน รอบการประเมิน (60 หรือ 119) และผลการประเมิน');
  }

  var staff = getById_('Staff', 'EmployeeID', employeeId);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
  if (session.role !== 'Admin' && staff.Supervisor !== session.empId) {
    throw HttpError_('FORBIDDEN', 'เฉพาะหัวหน้าที่ได้รับมอบหมายหรือผู้ดูแลระบบเท่านั้นที่ประเมินได้');
  }

  var isFinalRound = period === '119';
  var record = {
    EvalID: genId_('EV'), EmployeeID: employeeId, EvaluatorID: session.empId, Period: period,
    EvalDate: todayISO_(), JSON_Scores: '', TotalScore: '', AvgScore: '', Percentage: '',
    Result: result, Comment: body.comment || '',
  };
  insertRow_('Evaluations', record);

  if (isFinalRound && (result === 'Passed' || result === 'NotPassed' || result === 'Extended')) {
    var patch = { ProbationaryStatus: result === 'Extended' ? 'Extended' : (result === 'Passed' ? 'Passed' : 'Not Passed'), UpdatedAt: new Date().toISOString() };
    if (result === 'Extended') {
      patch.Eval119Date = addDays_(staff.Eval119Date || todayISO_(), 60);
    }
    patchById_('Staff', 'EmployeeID', employeeId, patch);
  }

  writeLog_(session.empId, 'Create', 'Evaluation:' + record.EvalID, employeeId + ' / รอบ ' + period + 'วัน / ' + result);
  return ok_(record, 'บันทึกผลการประเมินสำเร็จ');
}

// พนักงานลงวันที่เข้าร่วมประเมินกับผู้จัดการแผนกด้วยตนเอง (ยังไม่ใช่ผลประเมินอย่างเป็นทางการ)
// หน้า Probation Tracking (User) ใช้แสดงสถานะ "Completed" ระหว่างรอผู้ดูแลระบบ/หัวหน้าบันทึกผลจริง
function selfEvalCheckin_(ctx) {
  var id = ctx.params.id;
  if (ctx.session.empId !== id) throw HttpError_('FORBIDDEN', 'บันทึกได้เฉพาะข้อมูลของตนเอง');
  var period = String(ctx.body.period || '');
  var date = String(ctx.body.date || '').trim();
  if (period !== '60' && period !== '119') throw HttpError_('BAD_REQUEST', 'period ต้องเป็น 60 หรือ 119');
  if (!date) throw HttpError_('BAD_REQUEST', 'กรุณาระบุวันที่เข้าร่วมประเมิน');

  var field = period === '60' ? 'Eval60Checkin' : 'Eval119Checkin';
  var patch = { UpdatedAt: new Date().toISOString() };
  patch[field] = date;
  var updated = patchById_('Staff', 'EmployeeID', id, patch);
  writeLog_(ctx.session.empId, 'SelfCheckin', 'Staff:' + id, field + '=' + date);
  return ok_(sanitizeStaff_(updated), 'บันทึกวันที่เข้าร่วมประเมินสำเร็จ');
}

function myEvaluations_(ctx) {
  var rows = getAll_('Evaluations').filter(function (r) { return r.EmployeeID === ctx.session.empId; });
  rows.sort(function (a, b) { return a.EvalDate.localeCompare(b.EvalDate); });
  return ok_(rows);
}

function staffEvaluations_(ctx) {
  var id = ctx.params.id;
  if (!canAccessStaff_(ctx.session, id)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  var rows = getAll_('Evaluations').filter(function (r) { return r.EmployeeID === id; });
  rows.sort(function (a, b) { return a.EvalDate.localeCompare(b.EvalDate); });
  return ok_(rows);
}

/** รายการพนักงานสำหรับหน้า Performance Evaluation แยกตามรอบ (60/119) พร้อมสถานะใกล้ครบกำหนด */
function evaluationList_(ctx) {
  var q = ctx.query;
  var period = q.round === '60' ? '60' : '119';
  var dateField = period === '60' ? 'Eval60Date' : 'Eval119Date';
  var checkinField = period === '60' ? 'Eval60Checkin' : 'Eval119Checkin';
  var settings = getSettingsMap_();
  var alertDays = Number(q.alertDays || settings.AlertDays || '10');
  var today = todayISO_();
  var evalRows = getAll_('Evaluations').filter(function (r) { return r.Period === period; });
  var evalByEmp = {};
  evalRows.forEach(function (r) { evalByEmp[r.EmployeeID] = r; });

  var staffRows = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin'; });
  if (q.status) staffRows = staffRows.filter(function (r) { return r.ProbationaryStatus === q.status; });
  if (q.position) staffRows = staffRows.filter(function (r) { return r.Position === q.position; });
  if (q.manager) staffRows = staffRows.filter(function (r) { return r.ManagerName === q.manager; });
  if (q.costCenterId) staffRows = staffRows.filter(function (r) { return r.CostCenterID === q.costCenterId; });
  if (q.subServiceId) staffRows = staffRows.filter(function (r) { return r.SubServiceID === q.subServiceId; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    staffRows = staffRows.filter(function (r) {
      return (r.EmployeeID || '').toLowerCase().indexOf(s) !== -1 || (r.ThaiName || '').toLowerCase().indexOf(s) !== -1;
    });
  }

  var out = staffRows.map(function (r) {
    var dueDate = r[dateField];
    var evalRow = evalByEmp[r.EmployeeID];
    var remain = dueDate ? daysBetween_(today, dueDate) : null;
    return {
      EmployeeID: r.EmployeeID, ThaiName: r.ThaiName, Position: r.Position, CostCenterName: r.CostCenterName,
      SubServiceID: r.SubServiceID, ManagerName: r.ManagerName, HireDate: r.HireDate, DueDate: dueDate,
      RemainDays: remain, ProbationaryStatus: r.ProbationaryStatus,
      HasEval: !!evalRow, EvalDate: evalRow ? evalRow.EvalDate : '', Result: evalRow ? evalRow.Result : '',
      CheckinDate: r[checkinField] || '',
      NearDue: r.ProbationaryStatus === 'Active' && !evalRow && remain !== null && remain <= alertDays,
    };
  });

  if (q.filter === 'nearDue') out = out.filter(function (r) { return r.NearDue; });
  out.sort(function (a, b) { return (a.DueDate || '').localeCompare(b.DueDate || ''); });
  return ok_(out);
}

function probationTimeline_(ctx) {
  var id = ctx.params.id;
  if (!canAccessStaff_(ctx.session, id)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  var staff = getById_('Staff', 'EmployeeID', id);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');

  var evals = getAll_('Evaluations')
    .filter(function (r) { return r.EmployeeID === id; })
    .sort(function (a, b) { return a.EvalDate.localeCompare(b.EvalDate); });

  var today = todayISO_();
  var stages = [
    { key: 'M1', label: 'เดือนที่ 1 (0-30 วัน)', date: addDays_(staff.HireDate, 30), checked: !!staff.Orient1Date, checkedDate: staff.Orient1Date },
    { key: 'M2', label: 'เดือนที่ 2 (31-60 วัน)', date: addDays_(staff.HireDate, 60), checked: !!staff.Orient2Date, checkedDate: staff.Orient2Date },
    { key: 'M3', label: 'เดือนที่ 3 (61-90 วัน)', date: addDays_(staff.HireDate, 90), checked: !!staff.Orient3Date, checkedDate: staff.Orient3Date },
    { key: 'M4', label: 'เดือนที่ 4 (91-119 วัน)', date: addDays_(staff.HireDate, 119), checked: !!staff.Orient4Date, checkedDate: staff.Orient4Date },
  ];
  var eval60 = evals.filter(function (e) { return e.Period === '60'; })[0];
  var eval119 = evals.filter(function (e) { return e.Period === '119'; })[0];

  return ok_({
    name: staff.ThaiName, empId: staff.EmployeeID, position: staff.Position,
    costCenter: staff.CostCenterName, hireDate: staff.HireDate, status: staff.ProbationaryStatus,
    stages: stages,
    checkpoints: [
      { period: '60', label: '1st Evaluation (60 วัน)', dueDate: staff.Eval60Date, done: !!eval60, evalDate: eval60 ? eval60.EvalDate : '', result: eval60 ? eval60.Result : '', checkinDate: staff.Eval60Checkin || '' },
      { period: '119', label: '2nd Evaluation (119 วัน)', dueDate: staff.Eval119Date, done: !!eval119, evalDate: eval119 ? eval119.EvalDate : '', result: eval119 ? eval119.Result : '', checkinDate: staff.Eval119Checkin || '' },
    ],
    evaluations: evals,
  });
}
