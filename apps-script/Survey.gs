/**
 * Survey.gs — สร้างแบบสอบถาม (Questionnaires) + คำถาม (Questions)
 */

function staffMatchesScope_(scope, staff) {
  if (!scope || scope === 'All') return true;
  if (scope.indexOf('CostCenter:') === 0) return scope.slice('CostCenter:'.length) === staff.CostCenterID;
  if (scope.indexOf('SubService:') === 0) return scope.slice('SubService:'.length) === staff.SubServiceID;
  return false;
}

function listQuestionnaires_() {
  return ok_(getAll_('Questionnaires'));
}

function activeQuestionnaires_(ctx) {
  var staff = getById_('Staff', 'EmployeeID', ctx.session.empId);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');
  var rows = getAll_('Questionnaires');
  var responses = getAll_('Responses');
  var active = rows
    .filter(function (r) { return r.Status === 'Active' && staffMatchesScope_(r.TargetScope, staff); })
    .map(function (r) {
      var out = {};
      for (var k in r) out[k] = r[k];
      out.alreadySubmitted = responses.some(function (res) {
        return res.QID === r.QID && res.RespondentID === ctx.session.empId;
      });
      return out;
    });
  return ok_(active);
}

function getQuestionnaire_(ctx) {
  var qid = ctx.params.qid;
  var q = getById_('Questionnaires', 'QID', qid);
  if (!q) throw HttpError_('NOT_FOUND', 'ไม่พบแบบสอบถาม');
  var questions = getAll_('Questions')
    .filter(function (r) { return r.QID === qid; })
    .sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
  return ok_({ questionnaire: q, questions: questions });
}

function createQuestionnaire_(ctx) {
  var body = ctx.body;
  if (!body.Title) throw HttpError_('BAD_REQUEST', 'กรุณากรอกชื่อแบบสอบถาม');
  var record = {
    QID: genId_('QN'), Title: body.Title, Description: body.Description || '',
    TargetScope: body.TargetScope || 'All', CreatedBy: ctx.session.empId, CreatedDate: todayISO_(),
    Status: 'Draft', AllowResubmit: body.AllowResubmit === 'TRUE' ? 'TRUE' : 'FALSE',
  };
  insertRow_('Questionnaires', record);
  writeLog_(ctx.session.empId, 'Create', 'Questionnaire:' + record.QID, record.Title);
  return ok_(record, 'สร้างแบบสอบถามสำเร็จ');
}

function updateQuestionnaire_(ctx) {
  var updated = patchById_('Questionnaires', 'QID', ctx.params.qid, ctx.body);
  writeLog_(ctx.session.empId, 'Update', 'Questionnaire:' + ctx.params.qid, JSON.stringify(ctx.body));
  return ok_(updated, 'บันทึกสำเร็จ');
}

// ลบแบบสอบถามที่ไม่ได้ใช้งานแล้ว (ลบคำถามที่ผูกอยู่ไปด้วย) — คำตอบ (Responses) ที่เคยมีคนตอบไว้แล้วยังคงเก็บไว้เป็นข้อมูลย้อนหลัง ไม่ลบตาม
function deleteQuestionnaire_(ctx) {
  var qid = ctx.params.qid;
  var existing = getById_('Questionnaires', 'QID', qid);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบแบบสอบถาม');
  getAll_('Questions').filter(function (r) { return r.QID === qid; }).forEach(function (r) {
    patchById_('Questions', 'QuestionID', r.QuestionID, {
      QuestionID: '', QID: '', QuestionText: '', Type: '', Options_JSON: '', ScoreMap_JSON: '', Required: '', Order: '', Topic: '',
    });
  });
  patchById_('Questionnaires', 'QID', qid, {
    QID: '', Title: '', Description: '', TargetScope: '', CreatedBy: '', CreatedDate: '', Status: '', AllowResubmit: '',
  });
  writeLog_(ctx.session.empId, 'Delete', 'Questionnaire:' + qid, existing.Title);
  return ok_(true, 'ลบแบบสอบถามสำเร็จ');
}

function addQuestion_(ctx) {
  var qid = ctx.params.qid;
  var questionnaire = getById_('Questionnaires', 'QID', qid);
  if (!questionnaire) throw HttpError_('NOT_FOUND', 'ไม่พบแบบสอบถาม');
  var body = ctx.body;
  if (!body.QuestionText || !body.Type) throw HttpError_('BAD_REQUEST', 'กรุณากรอกคำถามและประเภทคำถาม');

  var existingQuestions = getAll_('Questions').filter(function (r) { return r.QID === qid; });
  var record = {
    QuestionID: genId_('Q'), QID: qid, QuestionText: body.QuestionText, Type: body.Type,
    Options_JSON: JSON.stringify(body.options || []), ScoreMap_JSON: JSON.stringify(body.scoreMap || {}),
    Required: (body.Required === false || body.Required === 'FALSE' || body.Required === 'false') ? 'FALSE' : 'TRUE',
    Order: String(body.Order || existingQuestions.length + 1),
    Topic: body.Topic || '',
  };
  insertRow_('Questions', record);
  return ok_(record, 'เพิ่มคำถามสำเร็จ');
}

function updateQuestion_(ctx) {
  var body = ctx.body;
  var patch = {};
  for (var k in body) patch[k] = body[k];
  if (body.options) patch.Options_JSON = JSON.stringify(body.options);
  if (body.scoreMap) patch.ScoreMap_JSON = JSON.stringify(body.scoreMap);
  var updated = patchById_('Questions', 'QuestionID', ctx.params.id, patch);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deleteQuestion_(ctx) {
  var existing = getById_('Questions', 'QuestionID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบคำถาม');
  patchById_('Questions', 'QuestionID', ctx.params.id, {
    QuestionID: '', QID: '', QuestionText: '', Type: '', Options_JSON: '', ScoreMap_JSON: '', Required: '', Order: '', Topic: '',
  });
  return ok_(true, 'ลบคำถามสำเร็จ');
}
