/**
 * Responses.gs — รับคำตอบแบบสอบถาม + คำนวณคะแนนจาก ScoreMap_JSON
 */

function scoreAnswer_(question, answer) {
  var scoreMap = {};
  try { scoreMap = JSON.parse(question.ScoreMap_JSON || '{}'); } catch (e) { scoreMap = {}; }
  if (question.Type === 'multi' && Object.prototype.toString.call(answer) === '[object Array]') {
    var scores = answer.map(function (a) { return scoreMap[String(a)]; }).filter(function (s) { return typeof s === 'number'; });
    if (scores.length === 0) return null;
    return scores.reduce(function (a, b) { return a + b; }, 0);
  }
  if ((question.Type === 'single' || question.Type === 'rating') && answer !== undefined && answer !== null && answer !== '') {
    var s = scoreMap[String(answer)];
    return typeof s === 'number' ? s : null;
  }
  return null;
}

function questionsForQid_(qid) {
  return getAll_('Questions').filter(function (q) { return q.QID === qid; })
    .sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
}

function formatAnswerPlain_(val) {
  if (val === undefined || val === null) return '';
  if (Object.prototype.toString.call(val) === '[object Array]') return val.join(', ');
  return String(val);
}

// หาคอลัมน์ของหัวข้อคำถามนี้ในชีต Responses ถ้ายังไม่มีให้เพิ่มคอลัมน์ใหม่ต่อท้าย (คืน index แบบ 0-based ใน headers)
function ensureAnswerColumn_(sh, headers, questionText) {
  var idx = headers.indexOf(questionText);
  if (idx !== -1) return idx;
  var newCol = headers.length + 1;
  sh.getRange(1, newCol).setValue(questionText);
  headers.push(questionText);
  return headers.length - 1;
}

// เขียนคำตอบแต่ละหัวข้อคำถามลงคอลัมน์แยกของตัวเองในชีต Responses (นอกเหนือจาก Answers_JSON เดิมที่ยังเก็บไว้เผื่อใช้งานผ่าน API)
// เรียงคอลัมน์ตามลำดับที่สร้างคำถามไว้ (Order) ค่าที่เขียนเป็นข้อความล้วน ไม่มีเครื่องหมาย JSON ({}, "", [])
function writeAnswerColumnsForRow_(sh, headers, rowNum, qid, answers) {
  questionsForQid_(qid).forEach(function (q) {
    var colIdx = ensureAnswerColumn_(sh, headers, q.QuestionText);
    sh.getRange(rowNum, colIdx + 1).setValue(formatAnswerPlain_(answers[q.QuestionID]));
  });
}

// ซิงก์คำตอบเดิม (ที่เคยบันทึกไว้ก่อนมีฟีเจอร์แยกคอลัมน์) ให้กระจายลงคอลัมน์รายหัวข้อด้วย — เรียกครั้งเดียวจากปุ่มใน Survey Builder
function syncResponseColumns_(ctx) {
  var sh = sheet_('Responses');
  var headers = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  var rows = getAll_('Responses');
  rows.forEach(function (r) {
    if (!r.QID || !r._row) return;
    var answers = {};
    try { answers = JSON.parse(r.Answers_JSON || '{}'); } catch (e) { answers = {}; }
    writeAnswerColumnsForRow_(sh, headers, r._row, r.QID, answers);
  });
  invalidateTableCache_('Responses');
  writeLog_(ctx.session.empId, 'Sync', 'ResponseColumns', rows.length + ' rows');
  return ok_({ updated: rows.length }, 'ซิงก์คำตอบลงคอลัมน์สำเร็จ');
}

function submitResponse_(ctx) {
  var session = ctx.session;
  var qid = ctx.body.qid;
  var answers = ctx.body.answers;
  if (!qid || !answers) throw HttpError_('BAD_REQUEST', 'ข้อมูลไม่ครบถ้วน');

  var questionnaire = getById_('Questionnaires', 'QID', qid);
  if (!questionnaire || questionnaire.Status !== 'Active') {
    throw HttpError_('BAD_REQUEST', 'แบบสอบถามนี้ไม่เปิดรับคำตอบแล้ว');
  }

  if (questionnaire.AllowResubmit !== 'TRUE') {
    var prior = getAll_('Responses');
    var already = prior.some(function (r) { return r.QID === qid && r.RespondentID === session.empId; });
    if (already) throw HttpError_('CONFLICT', 'คุณได้ตอบแบบสอบถามนี้ไปแล้ว');
  }

  var questions = getAll_('Questions').filter(function (r) { return r.QID === qid; });
  var missingRequired = questions.filter(function (q) {
    return q.Required === 'TRUE' && (answers[q.QuestionID] === undefined || answers[q.QuestionID] === '');
  });
  if (missingRequired.length > 0) {
    throw HttpError_('BAD_REQUEST', 'กรุณาตอบคำถามที่จำเป็นให้ครบ: ' + missingRequired.map(function (q) { return q.QuestionText; }).join(', '));
  }

  var totalScore = 0, scoredCount = 0;
  questions.forEach(function (q) {
    var s = scoreAnswer_(q, answers[q.QuestionID]);
    if (s !== null) { totalScore += s; scoredCount += 1; }
  });
  var avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;

  var record = {
    ResponseID: genId_('RS'), QID: qid, RespondentID: session.empId,
    Answers_JSON: JSON.stringify(answers), TotalScore: totalScore.toFixed(2),
    AvgScore: avgScore.toFixed(2), SubmitDate: todayISO_(),
  };
  insertRow_('Responses', record);
  try {
    var sh = sheet_('Responses');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    writeAnswerColumnsForRow_(sh, headers, sh.getLastRow(), qid, answers);
  } catch (e) { /* เขียนคอลัมน์เสริมไม่สำเร็จ ไม่ควรทำให้การส่งแบบสอบถามหลักล้มเหลว */ }
  return ok_(record, 'ส่งแบบสอบถามสำเร็จ ขอบคุณสำหรับความคิดเห็น');
}

function myResponses_(ctx) {
  var rows = getAll_('Responses').filter(function (r) { return r.RespondentID === ctx.session.empId; });
  if (ctx.query.qid) rows = rows.filter(function (r) { return r.QID === ctx.query.qid; });
  return ok_(rows);
}

function questionnaireResponses_(ctx) {
  var rows = getAll_('Responses').filter(function (r) { return r.QID === ctx.params.qid; });
  return ok_(rows);
}
