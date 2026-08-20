/**
 * AI.gs — AI Development Coach: วิเคราะห์คะแนนความพึงพอใจรายเดือนต่อคน แล้วให้คำแนะนำผ่าน Claude API
 * เรียก Claude ผ่าน UrlFetchApp, เก็บผลแคชไว้ในชีต AIRecommendations ต่อคนต่อเดือน (ไม่เรียกซ้ำจนกว่าจะกดสร้างใหม่)
 */

function computeTopicScores_(questions, answers) {
  var sums = {}; // topic -> {sum, count}
  var order = [];
  var openText = {};

  questions.forEach(function (q) {
    var answer = answers[q.QuestionID];
    if (answer === undefined || answer === '') return;
    if (q.Type === 'text') {
      openText[q.Topic || q.QuestionText] = String(answer);
      return;
    }
    var scoreMap = {};
    try { scoreMap = JSON.parse(q.ScoreMap_JSON || '{}'); } catch (e) { scoreMap = {}; }
    var score = scoreMap[String(answer)];
    if (typeof score !== 'number') return;
    var topic = q.Topic || q.Category || 'ทั่วไป';
    if (!sums[topic]) { sums[topic] = { sum: 0, count: 0 }; order.push(topic); }
    sums[topic].sum += score;
    sums[topic].count += 1;
  });

  var topics = order.map(function (topic) {
    return { topic: topic, avg: Math.round((sums[topic].sum / sums[topic].count) * 100) / 100, count: sums[topic].count };
  });
  return { topics: topics, openText: openText };
}

function buildAiPrompt_(input) {
  var compare = input.topics.map(function (t) {
    var prev = input.prevTopics.filter(function (p) { return p.topic === t.topic; })[0];
    var trend = prev ? (t.avg < prev.avg ? ' (ลดลงจากเดือนก่อน)' : (t.avg > prev.avg ? ' (ดีขึ้นจากเดือนก่อน)' : '')) : '';
    return '- ' + t.topic + ': ' + t.avg + '/5' + trend;
  }).join('\n');

  var openTextEntries = [];
  for (var k in input.openText) openTextEntries.push('- ' + k + ': ' + input.openText[k]);
  var openTextStr = openTextEntries.length ? openTextEntries.join('\n') : '(ไม่มีข้อความเพิ่มเติม)';

  var system = [
    'บทบาท: คุณเป็นพี่เลี้ยงพยาบาล (preceptor) ที่ให้คำแนะนำการพัฒนาบุคลากรใหม่',
    'งาน: สรุปเป็นภาษาไทย โทนให้กำลังใจ เชิงสร้างสรรค์ นำไปทำได้จริง ตามโครง 3 ส่วน',
    '(1) จุดแข็ง 1-2 ข้อ (2) ควรพัฒนา 2-4 ข้อ พร้อมวิธีทำที่ทำได้จริง (3) เป้าหมายเดือนหน้า 1 ข้อที่วัดผลได้',
    'ข้อห้าม: ห้ามวินิจฉัยสภาพจิตใจ, ห้ามตัดสินผ่าน/ไม่ผ่าน, ไม่ตำหนิรุนแรง',
    'ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกเหนือ JSON รูปแบบ:',
    '{"strengths":["..."],"improvements":[{"topic":"...","score":0,"action":"..."}],"nextGoal":"..."}',
  ].join('\n');

  var user = [
    'ข้อมูลพนักงาน: ตำแหน่ง ' + (input.position || 'ไม่ระบุ') + ', หน่วยงาน ' + (input.costCenter || 'ไม่ระบุ') + ', เดือนที่ ' + input.monthNumber + ' ของทดลองงาน',
    'คะแนนความพึงพอใจเดือนนี้ (เทียบเดือนก่อน):',
    compare || '(ไม่มีข้อมูลคะแนน)',
    'ความเห็นปลายเปิด:',
    openTextStr,
  ].join('\n');

  return { system: system, user: user };
}

function callClaude_(system, user) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw HttpError_('BAD_REQUEST', 'ยังไม่ได้ตั้งค่า Script Property: ANTHROPIC_API_KEY (Project Settings > Script Properties)');
  var model = props.getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-5';

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: 1024, system: system, messages: [{ role: 'user', content: user }] }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw HttpError_('UPSTREAM_ERROR', 'เรียก Claude API ไม่สำเร็จ (' + code + '): ' + res.getContentText());
  }
  var json = JSON.parse(res.getContentText());
  var textBlocks = (json.content || []).filter(function (b) { return b.type === 'text'; });
  var raw = (textBlocks.length ? textBlocks[0].text : '').trim();
  var cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return { strengths: [], improvements: [], nextGoal: '', raw: cleaned };
  }
}

function getCachedAi_(employeeId, round) {
  var rows = getAll_('AIRecommendations');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].EmployeeID === employeeId && rows[i].Round === round) return rows[i];
  }
  return null;
}

function generateAiCoach_(ctx) {
  var session = ctx.session;
  var employeeId = ctx.params.employeeId;
  if (!canAccessStaff_(session, employeeId)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');

  var settings = getSettingsMap_();
  var qid = settings.MonthlySurveyQID;
  if (!qid) throw HttpError_('BAD_REQUEST', 'ยังไม่ได้ตั้งค่าแบบสอบถามความพึงพอใจรายเดือนใน Settings (MonthlySurveyQID)');

  var staff = getById_('Staff', 'EmployeeID', employeeId);
  if (!staff) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูลพนักงาน');

  var questions = getAll_('Questions').filter(function (q) { return q.QID === qid; });
  var responses = getAll_('Responses')
    .filter(function (r) { return r.RespondentID === employeeId && r.QID === qid; })
    .sort(function (a, b) { return b.SubmitDate.localeCompare(a.SubmitDate); });

  if (responses.length === 0) throw HttpError_('BAD_REQUEST', 'พนักงานคนนี้ยังไม่ได้ทำแบบสอบถามความพึงพอใจรายเดือน');

  var latest = responses[0];
  var prior = responses[1];
  var round = latest.SubmitDate.slice(0, 7);

  var force = ctx.query.force === 'true';
  if (!force) {
    var cached = getCachedAi_(employeeId, round);
    if (cached) {
      writeLog_(session.empId, 'ViewAI', 'AIRecommendation:' + employeeId, round);
      return ok_(JSON.parse(cached.JSON), 'ใช้ผลคำแนะนำที่แคชไว้');
    }
  }

  var latestAnswers = JSON.parse(latest.Answers_JSON || '{}');
  var priorAnswers = prior ? JSON.parse(prior.Answers_JSON || '{}') : {};
  var latestScores = computeTopicScores_(questions, latestAnswers);
  var priorScores = computeTopicScores_(questions, priorAnswers);

  var costCenters = getAll_('CostCenters');
  var cc = costCenters.filter(function (r) { return r.CostCenterID === staff.CostCenterID; })[0];
  var monthNumber = probationMonthNumber_(staff.HireDate, 119);

  var prompt = buildAiPrompt_({
    position: staff.Position, costCenter: cc ? cc.Name : '', monthNumber: monthNumber,
    topics: latestScores.topics, prevTopics: priorScores.topics, openText: latestScores.openText,
  });

  var result = callClaude_(prompt.system, prompt.user);

  var existing = getCachedAi_(employeeId, round);
  var recordJson = JSON.stringify(result);
  if (existing) {
    patchById_('AIRecommendations', 'RecID', existing.RecID, {
      JSON: recordJson, GeneratedAt: new Date().toISOString(), ViewedBy: session.empId,
    });
  } else {
    insertRow_('AIRecommendations', {
      RecID: genId_('AI'), EmployeeID: employeeId, Round: round, Month: round.slice(5, 7), Year: round.slice(0, 4),
      JSON: recordJson, GeneratedAt: new Date().toISOString(), ViewedBy: session.empId,
    });
  }

  writeLog_(session.empId, 'GenerateAI', 'AIRecommendation:' + employeeId, round);
  return ok_(result, 'สร้างคำแนะนำจาก AI สำเร็จ');
}

function getAiCoach_(ctx) {
  var session = ctx.session;
  var employeeId = ctx.params.employeeId;
  if (!canAccessStaff_(session, employeeId)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');

  var rows = getAll_('AIRecommendations')
    .filter(function (r) { return r.EmployeeID === employeeId; })
    .sort(function (a, b) { return b.Round.localeCompare(a.Round); });
  if (rows.length === 0) return ok_(null, 'ยังไม่มีคำแนะนำจาก AI');

  var latest = rows[0];
  var viewedBy = (latest.ViewedBy || '').split(',').filter(function (s) { return s; });
  if (viewedBy.indexOf(session.empId) === -1) {
    viewedBy.push(session.empId);
    patchById_('AIRecommendations', 'RecID', latest.RecID, { ViewedBy: viewedBy.join(',') });
  }
  writeLog_(session.empId, 'ViewAI', 'AIRecommendation:' + employeeId, latest.Round);

  var parsed = JSON.parse(latest.JSON);
  parsed.round = latest.Round;
  parsed.generatedAt = latest.GeneratedAt;
  return ok_(parsed);
}

// สรุปธีมที่กลุ่มทดลองงานควรพัฒนาร่วมกัน คำนวณตรงจากคะแนนแบบสอบถาม (ไม่ต้องพึ่งแคช AI ของทุกคน)
function aiThemeSummary_(ctx) {
  var costCenterId = ctx.query.costCenterId;
  var settings = getSettingsMap_();
  var qid = settings.MonthlySurveyQID;
  if (!qid) throw HttpError_('BAD_REQUEST', 'ยังไม่ได้ตั้งค่าแบบสอบถามความพึงพอใจรายเดือนใน Settings');

  var targetRound = ctx.query.round || Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM');
  var questions = getAll_('Questions').filter(function (q) { return q.QID === qid && q.Type !== 'text'; });
  var staffRows = getAll_('Staff');
  var staffById = {};
  staffRows.forEach(function (s) { staffById[s.EmployeeID] = s; });

  var responses = getAll_('Responses').filter(function (r) { return r.QID === qid && r.SubmitDate.indexOf(targetRound) === 0; });
  if (costCenterId) {
    responses = responses.filter(function (r) {
      var s = staffById[r.RespondentID];
      return s && s.CostCenterID === costCenterId;
    });
  }

  var LOW_THRESHOLD = 3.5;
  var topicLowCount = {};
  var topicLowOrder = [];
  var topicTotals = {};
  var topicTotalsOrder = [];
  var respondentSet = {};

  responses.forEach(function (r) {
    respondentSet[r.RespondentID] = true;
    var answers = {};
    try { answers = JSON.parse(r.Answers_JSON || '{}'); } catch (e) { answers = {}; }
    var scores = computeTopicScores_(questions, answers);
    scores.topics.forEach(function (t) {
      if (t.avg < LOW_THRESHOLD) {
        if (topicLowCount[t.topic] === undefined) { topicLowCount[t.topic] = 0; topicLowOrder.push(t.topic); }
        topicLowCount[t.topic] += 1;
      }
      if (!topicTotals[t.topic]) { topicTotals[t.topic] = { sum: 0, count: 0 }; topicTotalsOrder.push(t.topic); }
      topicTotals[t.topic].sum += t.avg;
      topicTotals[t.topic].count += 1;
    });
  });

  var respondentCount = Object.keys(respondentSet).length;
  var weakThemes = topicLowOrder.map(function (topic) {
    return { topic: topic, lowCount: topicLowCount[topic], total: respondentCount };
  }).sort(function (a, b) { return b.lowCount - a.lowCount; });

  var strongThemes = topicTotalsOrder.map(function (topic) {
    return { topic: topic, avg: Math.round((topicTotals[topic].sum / topicTotals[topic].count) * 100) / 100 };
  }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 3);

  return ok_({ round: targetRound, respondentCount: respondentCount, weakThemes: weakThemes, strongThemes: strongThemes });
}

// ---------- Seed แบบสอบถามความพึงพอใจรายเดือน 12 ข้อ (เรียกจาก initSheets_) ----------
var RATING_OPTIONS_ = ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'];
var RATING_SCORE_MAP_ = { มากที่สุด: 5, มาก: 4, ปานกลาง: 3, น้อย: 2, น้อยที่สุด: 1 };

var RATING_QUESTIONS_ = [
  { text: 'งานที่ได้รับมอบหมายตรงกับตำแหน่งและความคาดหวังของท่าน', topic: 'บทบาท/งานที่ได้รับ' },
  { text: 'ขอบเขตหน้าที่ความรับผิดชอบของท่านมีความชัดเจน', topic: 'บทบาท/งานที่ได้รับ' },
  { text: 'ท่านได้รับการอบรม/ฝึกฝนที่เพียงพอต่อการปฏิบัติงาน', topic: 'การพัฒนา/อบรม' },
  { text: 'อุปกรณ์และเครื่องมือที่ใช้ในการทำงานมีความพร้อม', topic: 'สภาพแวดล้อม/อุปกรณ์' },
  { text: 'สภาพแวดล้อมในการทำงานมีความปลอดภัยและเหมาะสม', topic: 'สภาพแวดล้อม/อุปกรณ์' },
  { text: 'ตารางเวรและเวลาพักผ่อนของท่านมีความเหมาะสม', topic: 'ตารางงาน/พักผ่อน' },
  { text: 'ท่านได้รับการต้อนรับและยอมรับจากทีมงานเป็นอย่างดี', topic: 'ทีม/การยอมรับ' },
  { text: 'เพื่อนร่วมงานให้ความช่วยเหลือเมื่อท่านต้องการ', topic: 'ทีม/การยอมรับ' },
  { text: 'ท่านรู้สึกเป็นส่วนหนึ่งของทีม', topic: 'ทีม/การยอมรับ' },
  { text: 'การสื่อสารกับแพทย์และทีมสหวิชาชีพเป็นไปด้วยดี', topic: 'สื่อสารสหวิชาชีพ' },
  { text: 'ท่านสามารถปรับตัวเข้ากับระบบงานของหน่วยงานได้', topic: 'การปรับตัว' },
  { text: 'โดยรวมแล้วท่านมีความสุขกับการทำงานที่นี่', topic: 'ความสุขในงาน' },
];
var TEXT_QUESTIONS_ = [
  { text: 'สิ่งที่ท่านประทับใจในเดือนนี้', topic: 'OpenFeedback:Impressed' },
  { text: 'สิ่งที่ท่านไม่พึงพอใจในเดือนนี้', topic: 'OpenFeedback:Dissatisfied' },
  { text: 'ข้อเสนอแนะเพิ่มเติม', topic: 'OpenFeedback:Suggestion' },
];

function seedMonthlySurveyIfMissing_() {
  var settingsRows = getAll_('Settings');
  var existingKeyRow = null;
  for (var i = 0; i < settingsRows.length; i++) {
    if (settingsRows[i].Key === 'MonthlySurveyQID') { existingKeyRow = settingsRows[i]; break; }
  }
  if (existingKeyRow && existingKeyRow.Value) {
    var questionnaires = getAll_('Questionnaires');
    var exists = questionnaires.some(function (q) { return q.QID === existingKeyRow.Value; });
    if (exists) return null; // มีอยู่แล้ว ไม่ต้อง seed ซ้ำ
  }

  var qid = genId_('QN');
  insertRow_('Questionnaires', {
    QID: qid,
    Title: 'แบบสอบถามความพึงพอใจรายเดือน (สำหรับพนักงานทดลองงาน)',
    Description: 'ใช้ประเมินความพึงพอใจรายเดือนของพนักงานทดลองงาน และเป็นข้อมูลนำเข้าให้ AI Coach วิเคราะห์คำแนะนำรายบุคคล',
    TargetScope: 'All', CreatedBy: 'system', CreatedDate: todayISO_(), Status: 'Active', AllowResubmit: 'TRUE',
  });

  var order = 1;
  RATING_QUESTIONS_.forEach(function (q) {
    insertRow_('Questions', {
      QuestionID: genId_('Q'), QID: qid, QuestionText: q.text, Type: 'rating',
      Options_JSON: JSON.stringify(RATING_OPTIONS_), ScoreMap_JSON: JSON.stringify(RATING_SCORE_MAP_),
      Required: 'TRUE', Order: String(order++), Topic: q.topic,
    });
  });
  TEXT_QUESTIONS_.forEach(function (q) {
    insertRow_('Questions', {
      QuestionID: genId_('Q'), QID: qid, QuestionText: q.text, Type: 'text',
      Options_JSON: '[]', ScoreMap_JSON: '{}', Required: 'FALSE', Order: String(order++), Topic: q.topic,
    });
  });

  if (existingKeyRow) {
    patchById_('Settings', 'Key', 'MonthlySurveyQID', { Value: qid });
  } else {
    insertRow_('Settings', {
      Key: 'MonthlySurveyQID', Value: qid,
      Detail: 'QID ของแบบสอบถามความพึงพอใจรายเดือน 12 ข้อ ที่ AI Coach ใช้วิเคราะห์',
    });
  }
  return qid;
}
