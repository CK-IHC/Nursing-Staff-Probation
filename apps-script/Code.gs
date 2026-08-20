/**
 * Code.gs — จุดเข้า Web App (doGet/doPost) + ตาราง route ทั้งหมด
 *
 * Deploy: บันทึกโปรเจกต์ → Deploy → New deployment → เลือกประเภท "Web app"
 *         → Execute as: Me → Who has access: Anyone → Deploy → คัดลอก URL (ลงท้ายด้วย /exec)
 *
 * ก่อนใช้งานต้องตั้งค่า Script Properties (Project Settings → Script Properties):
 *   TOKEN_SECRET      สุ่มสตริงยาว ๆ ใช้เซ็น session token
 *   ANTHROPIC_API_KEY (ไม่บังคับ) ใช้กับฟีเจอร์ AI Coach เท่านั้น
 *   ANTHROPIC_MODEL   (ไม่บังคับ) ค่าเริ่มต้น claude-sonnet-5
 *
 * Transport contract (ออกแบบให้เรียกข้าม origin จาก Cloudflare Worker/Pages ได้โดยไม่ติด CORS preflight):
 *   GET  {exec_url}?path=/api/staff&token=...&otherQuery=...
 *   POST {exec_url}  Content-Type: text/plain;charset=utf-8
 *        body = JSON.stringify({ path, method, token, body })   // method คือ 'POST' | 'PUT' | 'DELETE'
 */

var SHEET_ID = '1zBOpzSHNq9lZGr6XckZU_NSWhfUpWIk2vzFYClKxw2o';

// เพิ่มเลขนี้ทุกครั้งที่ส่งโค้ด backend รอบใหม่ — ใช้เทียบกับค่าที่เห็นจริงตอนเปิด {exec_url}?path=/api/setup/status
// เพื่อพิสูจน์ว่าโค้ดที่ deploy อยู่ตอนนี้เป็นเวอร์ชันล่าสุดจริงหรือไม่ (ไม่ต้องเดา)
var BACKEND_CODE_VERSION_ = 'v27-2026-07-23-walkround-fixes';

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function matchRoute_(routes, method, path) {
  var pathSegs = path.split('/').filter(function (s) { return s !== ''; });
  for (var i = 0; i < routes.length; i++) {
    var route = routes[i];
    if (route.method !== method) continue;
    var patSegs = route.pattern.split('/').filter(function (s) { return s !== ''; });
    if (patSegs.length !== pathSegs.length) continue;
    var params = {};
    var isMatch = true;
    for (var j = 0; j < patSegs.length; j++) {
      if (patSegs[j].charAt(0) === ':') {
        params[patSegs[j].slice(1)] = decodeURIComponent(pathSegs[j]);
      } else if (patSegs[j] !== pathSegs[j]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) return { handler: route.handler, params: params };
  }
  return null;
}

/** ตาราง route ทั้งหมด — สร้างแบบ lazy ภายในฟังก์ชัน เพื่อไม่ผูกกับลำดับการโหลดไฟล์ (function declaration ถูก hoist ครบก่อนเรียกใช้เสมอ) */
function getRoutes_() {
  return [
    // ---------- Setup / bootstrap ----------
    { method: 'POST', pattern: '/api/setup/init', handler: handleSetupInit_ },
    { method: 'POST', pattern: '/api/setup/first-admin', handler: handleFirstAdmin_ },
    { method: 'GET', pattern: '/api/setup/status', handler: handleSetupStatus_ },

    // ---------- Auth ----------
    { method: 'POST', pattern: '/api/auth/login', handler: handleLogin_ },
    { method: 'GET', pattern: '/api/auth/me', handler: requireAuth_(handleMe_) },
    { method: 'POST', pattern: '/api/auth/logout', handler: requireAuth_(handleLogout_) },

    // ---------- Staff ----------
    { method: 'GET', pattern: '/api/staff', handler: requireAdmin_(listStaff_) },
    { method: 'GET', pattern: '/api/staff/near-due', handler: requireAdmin_(staffNearDue_) },
    { method: 'GET', pattern: '/api/staff/team', handler: requireAuth_(staffTeam_) },
    { method: 'POST', pattern: '/api/staff/import', handler: requireAdmin_(bulkImportStaff_) },
    { method: 'GET', pattern: '/api/staff/:id', handler: requireAuth_(getStaff_) },
    { method: 'POST', pattern: '/api/staff', handler: requireAdmin_(createStaff_) },
    { method: 'PUT', pattern: '/api/staff/:id', handler: requireAdmin_(updateStaff_) },
    { method: 'PUT', pattern: '/api/staff/:id/profile', handler: requireAuth_(updateOwnProfile_) },
    { method: 'POST', pattern: '/api/staff/:id/orient-hr-checkin', handler: requireAuth_(selfOrientHRCheckin_) },
    { method: 'DELETE', pattern: '/api/staff/:id', handler: requireAdmin_(deactivateStaff_) },

    // ---------- Dashboard / Orientation Checklist ----------
    { method: 'GET', pattern: '/api/dashboard/summary', handler: requireAuth_(dashboardSummary_) },
    { method: 'GET', pattern: '/api/dashboard/reminders', handler: requireAdmin_(dashboardReminders_) },
    { method: 'GET', pattern: '/api/orientation/summary', handler: requireAuth_(orientationSummary_) },
    { method: 'GET', pattern: '/api/orientation/list', handler: requireAuth_(orientationList_) },

    // ---------- Lists (dropdown/tag taxonomies) ----------
    { method: 'GET', pattern: '/api/lists', handler: requireAuth_(listAllLists_) },
    { method: 'GET', pattern: '/api/lists/:category', handler: requireAuth_(listByCategory_) },
    { method: 'POST', pattern: '/api/lists/:category', handler: requireAdmin_(createListItem_) },
    { method: 'DELETE', pattern: '/api/lists/item/:id', handler: requireAdmin_(deleteListItem_) },

    // ---------- Consultations ----------
    { method: 'GET', pattern: '/api/consultations', handler: requireAuth_(listConsultations_) },
    { method: 'GET', pattern: '/api/consultations/summary', handler: requireAuth_(consultationSummary_) },
    { method: 'POST', pattern: '/api/consultations', handler: requireAuth_(createConsultation_) },
    { method: 'PUT', pattern: '/api/consultations/:id', handler: requireAuth_(updateConsultation_) },
    { method: 'DELETE', pattern: '/api/consultations/:id', handler: requireAdmin_(deleteConsultation_) },

    // ---------- Monthly Meetings ----------
    { method: 'GET', pattern: '/api/meetings/probation-counts', handler: requireAuth_(meetingProbationCounts_) },
    { method: 'GET', pattern: '/api/meetings', handler: requireAuth_(listMeetings_) },
    { method: 'GET', pattern: '/api/meetings/:id', handler: requireAuth_(getMeeting_) },
    { method: 'POST', pattern: '/api/meetings', handler: requireAuth_(createMeeting_) },
    { method: 'PUT', pattern: '/api/meetings/:id', handler: requireAuth_(updateMeeting_) },
    { method: 'DELETE', pattern: '/api/meetings/:id', handler: requireAdmin_(deleteMeeting_) },

    // ---------- Org: Cost Centers / Sub Services / Presets ----------
    { method: 'GET', pattern: '/api/org/cost-centers', handler: requireAuth_(listCostCenters_) },
    { method: 'POST', pattern: '/api/org/cost-centers/import', handler: requireAdmin_(bulkImportCostCenters_) },
    { method: 'POST', pattern: '/api/org/cost-centers', handler: requireAdmin_(createCostCenter_) },
    { method: 'PUT', pattern: '/api/org/cost-centers/:id', handler: requireAdmin_(updateCostCenter_) },
    { method: 'DELETE', pattern: '/api/org/cost-centers/:id', handler: requireAdmin_(deleteCostCenter_) },
    { method: 'GET', pattern: '/api/org/sub-services', handler: requireAuth_(listSubServices_) },
    { method: 'POST', pattern: '/api/org/sub-services', handler: requireAdmin_(createSubService_) },
    { method: 'PUT', pattern: '/api/org/sub-services/:id', handler: requireAdmin_(updateSubService_) },
    { method: 'DELETE', pattern: '/api/org/sub-services/:id', handler: requireAdmin_(deleteSubService_) },
    { method: 'GET', pattern: '/api/org/presets', handler: requireAdmin_(listPresets_) },
    { method: 'GET', pattern: '/api/org/presets/apply', handler: requireAuth_(applyPresets_) },
    { method: 'POST', pattern: '/api/org/presets', handler: requireAdmin_(createPreset_) },
    { method: 'PUT', pattern: '/api/org/presets/:id', handler: requireAdmin_(updatePreset_) },
    { method: 'DELETE', pattern: '/api/org/presets/:id', handler: requireAdmin_(deletePreset_) },

    // ---------- Settings + EvalItems ----------
    { method: 'GET', pattern: '/api/settings', handler: requireAuth_(getSettings_) },
    { method: 'PUT', pattern: '/api/settings', handler: requireAdmin_(updateSettings_) },
    { method: 'GET', pattern: '/api/settings/eval-items', handler: requireAuth_(listEvalItems_) },
    { method: 'POST', pattern: '/api/settings/eval-items', handler: requireAdmin_(createEvalItem_) },
    { method: 'PUT', pattern: '/api/settings/eval-items/:id', handler: requireAdmin_(updateEvalItem_) },
    { method: 'DELETE', pattern: '/api/settings/eval-items/:id', handler: requireAdmin_(deleteEvalItem_) },

    // ---------- Evaluations ----------
    { method: 'POST', pattern: '/api/evaluations', handler: requireAuth_(submitEvaluation_) },
    { method: 'GET', pattern: '/api/evaluations/my', handler: requireAuth_(myEvaluations_) },
    { method: 'GET', pattern: '/api/evaluations/list', handler: requireAdmin_(evaluationList_) },
    { method: 'GET', pattern: '/api/evaluations/staff/:id', handler: requireAuth_(staffEvaluations_) },
    { method: 'GET', pattern: '/api/evaluations/probation/:id', handler: requireAuth_(probationTimeline_) },
    { method: 'POST', pattern: '/api/evaluations/probation/:id/checkin', handler: requireAuth_(selfEvalCheckin_) },

    // ---------- Survey builder ----------
    { method: 'GET', pattern: '/api/surveys', handler: requireAdmin_(listQuestionnaires_) },
    { method: 'GET', pattern: '/api/surveys/active', handler: requireAuth_(activeQuestionnaires_) },
    { method: 'GET', pattern: '/api/surveys/:qid', handler: requireAuth_(getQuestionnaire_) },
    { method: 'POST', pattern: '/api/surveys', handler: requireAdmin_(createQuestionnaire_) },
    { method: 'PUT', pattern: '/api/surveys/:qid', handler: requireAdmin_(updateQuestionnaire_) },
    { method: 'DELETE', pattern: '/api/surveys/:qid', handler: requireAdmin_(deleteQuestionnaire_) },
    { method: 'POST', pattern: '/api/surveys/:qid/questions', handler: requireAdmin_(addQuestion_) },
    { method: 'PUT', pattern: '/api/surveys/questions/:id', handler: requireAdmin_(updateQuestion_) },
    { method: 'DELETE', pattern: '/api/surveys/questions/:id', handler: requireAdmin_(deleteQuestion_) },

    // ---------- Responses ----------
    { method: 'POST', pattern: '/api/responses', handler: requireAuth_(submitResponse_) },
    { method: 'POST', pattern: '/api/responses/sync-columns', handler: requireAdmin_(syncResponseColumns_) },
    { method: 'GET', pattern: '/api/responses/my', handler: requireAuth_(myResponses_) },
    { method: 'GET', pattern: '/api/responses/questionnaire/:qid', handler: requireAdmin_(questionnaireResponses_) },

    // ---------- Reports ----------
    { method: 'GET', pattern: '/api/reports/:domain/monthly', handler: requireAdmin_(reportMonthly_) },
    { method: 'GET', pattern: '/api/reports/:domain/yearly', handler: requireAdmin_(reportYearly_) },
    { method: 'GET', pattern: '/api/reports/:domain/individual', handler: requireAuth_(reportIndividual_) },
    { method: 'GET', pattern: '/api/reports/:domain/by-cost-center', handler: requireAdmin_(reportByCostCenter_) },

    // ---------- AI Coach ----------
    { method: 'POST', pattern: '/api/ai/coach/:employeeId/generate', handler: requireAuth_(generateAiCoach_) },
    { method: 'GET', pattern: '/api/ai/coach/:employeeId', handler: requireAuth_(getAiCoach_) },
    { method: 'GET', pattern: '/api/ai/admin/theme-summary', handler: requireAdmin_(aiThemeSummary_) },

    // ---------- Logs ----------
    { method: 'GET', pattern: '/api/logs', handler: requireAdmin_(listLogs_) },

    // ---------- Manuals (Information tab) ----------
    { method: 'GET', pattern: '/api/manuals', handler: requireAuth_(listManuals_) },
    { method: 'POST', pattern: '/api/manuals', handler: requireAdmin_(uploadManual_) },
    { method: 'PUT', pattern: '/api/manuals/:id', handler: requireAdmin_(updateManual_) },
    { method: 'DELETE', pattern: '/api/manuals/:id', handler: requireAdmin_(deleteManual_) },

    // ---------- Walk Round ----------
    { method: 'GET', pattern: '/api/walk-rounds', handler: requireAdmin_(listWalkRounds_) },
    { method: 'GET', pattern: '/api/walk-rounds/due', handler: requireAdmin_(walkRoundsDueToday_) },
    { method: 'GET', pattern: '/api/walk-rounds/report-by-user', handler: requireAdmin_(walkRoundReportByUser_) },
    { method: 'GET', pattern: '/api/walk-rounds/report-by-department', handler: requireAdmin_(walkRoundReportByDepartment_) },
    { method: 'POST', pattern: '/api/walk-rounds/sync-columns', handler: requireAdmin_(syncWalkRoundChecklistColumns_) },
    { method: 'GET', pattern: '/api/walk-rounds/checklist', handler: requireAuth_(listWalkRoundChecklist_) },
    { method: 'POST', pattern: '/api/walk-rounds/checklist', handler: requireAdmin_(createWalkRoundChecklistItem_) },
    { method: 'PUT', pattern: '/api/walk-rounds/checklist/:id', handler: requireAdmin_(updateWalkRoundChecklistItem_) },
    { method: 'GET', pattern: '/api/walk-rounds/:id', handler: requireAdmin_(getWalkRound_) },
    { method: 'POST', pattern: '/api/walk-rounds', handler: requireAdmin_(createWalkRound_) },
    { method: 'PUT', pattern: '/api/walk-rounds/:id', handler: requireAdmin_(updateWalkRound_) },
    { method: 'DELETE', pattern: '/api/walk-rounds/:id', handler: requireAdmin_(deleteWalkRound_) },
  ];
}

function dispatch_(method, path, params, body, token) {
  READ_TABLE_CACHE_ = {}; // เคลียร์แคชการอ่านชีต (Data.gs) ทุกต้นคำขอ กันข้อมูลเก่าข้ามคำขอ
  var route = matchRoute_(getRoutes_(), method, path);
  if (!route) return fail_('ไม่พบ endpoint นี้: ' + method + ' ' + path, 'NOT_FOUND');
  var ctx = { params: route.params, query: params, body: body || {}, token: token };
  try {
    return route.handler(ctx);
  } catch (e) {
    if (e && e.name === 'HttpError') return fail_(e.message, e.code);
    Logger.log(e && e.stack ? e.stack : e);
    return fail_(String(e && e.message ? e.message : e), 'SERVER_ERROR');
  }
}

function doGet(e) {
  // e เป็น undefined ถ้าเรียกผ่านปุ่ม Run ในตัวแก้ไขโดยตรง — doGet ใช้ได้เฉพาะผ่าน Web App URL (/exec) เท่านั้น
  if (!e || !e.parameter) {
    return jsonOutput_(fail_('ฟังก์ชันนี้ต้องเรียกผ่าน Web App URL (/exec) เท่านั้น ไม่ใช่กด Run ในตัวแก้ไข', 'BAD_REQUEST'));
  }
  var params = {};
  for (var k in e.parameter) params[k] = e.parameter[k];
  var path = params.path || '/';
  var token = params.token || '';
  delete params.path;
  delete params.token;
  // เปิด URL /exec ตรง ๆ โดยไม่มี ?path= (เช่น เปิดผ่าน browser เพื่อเช็คว่า deploy สำเร็จ) — ตอบข้อความสถานะที่เข้าใจง่าย
  // แทนที่จะโชว์ error "ไม่พบ endpoint นี้" ซึ่งดูเหมือนระบบพัง ทั้งที่จริง ๆ deploy สำเร็จแล้ว แค่ยังไม่ได้ระบุ path
  if (path === '/') {
    return jsonOutput_(ok_({ status: 'ok', message: 'Nursing Staff Probation Management API ทำงานปกติ — เรียกผ่านหน้าเว็บแอป ไม่ใช้ URL นี้ตรง ๆ' }));
  }
  return jsonOutput_(dispatch_('GET', path, params, {}, token));
}

// ขนาดคำขอ POST สูงสุดที่ยอมรับ (ตัวอักษร) — กันไม่ให้ไฟล์แนบ (เข้ารหัส base64 แล้วยาวขึ้น ~1.37 เท่า) ใหญ่จน
// Apps Script Web App ประมวลผลช้า/ค้าง/ล้มเหลวแบบไม่มี error ชัดเจน ให้ตอบกลับ error ที่ชัดเจนได้เร็วแทน
var MAX_POST_BODY_CHARS_ = 30 * 1000 * 1000; // ~30MB ข้อความ ครอบคลุมไฟล์แนบ 15MB + รูปหน้าปก 5MB ตามลิมิตฝั่ง frontend

function doPost(e) {
  if (!e || !e.postData) {
    return jsonOutput_(fail_('ฟังก์ชันนี้ต้องเรียกผ่าน Web App URL (/exec) เท่านั้น ไม่ใช่กด Run ในตัวแก้ไข', 'BAD_REQUEST'));
  }
  if (e.postData.contents && e.postData.contents.length > MAX_POST_BODY_CHARS_) {
    return jsonOutput_(fail_('ไฟล์แนบใหญ่เกินไปสำหรับระบบประมวลผล กรุณาลดขนาดไฟล์แล้วลองใหม่อีกครั้ง', 'BAD_REQUEST'));
  }
  var payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_(fail_('รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)', 'BAD_REQUEST'));
  }
  var method = payload.method || 'POST';
  var path = payload.path || '/';
  var token = payload.token || '';
  var body = payload.body || {};
  var query = payload.query || {};
  return jsonOutput_(dispatch_(method, path, query, body, token));
}
