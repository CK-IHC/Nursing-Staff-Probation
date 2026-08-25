/**
 * Data.gs — ชั้นเข้าถึงข้อมูล Google Sheets (ใช้ SpreadsheetApp โดยตรง ไม่ผ่าน REST API)
 * ทุกคอลัมน์ถูกฟอร์แมตเป็นข้อความ (@) ตั้งแต่ initSheets_() เพื่อกัน Sheets auto-convert วันที่/ตัวเลขนำหน้าศูนย์
 */

// นิยามคอลัมน์ของทุกชีต (แท็บ) — ต้องตรงกับลำดับที่ initSheets_() สร้างหัวตารางเสมอ
var SCHEMA_ = {
  Staff: ['EmployeeID', 'ThaiName', 'NickName', 'HireDate', 'Position', 'CostCenterID', 'CostCenterName',
    'JobFunction', 'SubServiceID', 'Preceptor', 'ManagerName', 'Supervisor', 'FullPartTime',
    'ProbationaryStatus', 'Eval60Date', 'Eval119Date', 'Orient1Date', 'Orient2Date', 'Orient3Date', 'Orient4Date',
    'OrientSentHRDate', 'ApplyLadderStatus', 'UnitSpecificCompetency', 'Role', 'Phone',
    'Rehire', 'ResignationType', 'ResignDate', 'Note', 'Active', 'CreatedAt', 'UpdatedAt',
    'Eval60Checkin', 'Eval119Checkin'],
  CostCenters: ['CostCenterID', 'Name', 'Code', 'Description', 'Active'],
  SubServices: ['SubServiceID', 'CostCenterID', 'Name', 'Code', 'Description', 'Active'],
  Lists: ['ListID', 'Category', 'Value', 'Order', 'Active'],
  Presets: ['PresetID', 'ScopeType', 'ScopeRefID', 'Key', 'Value', 'Detail'],
  EvalItems: ['ItemID', 'Category', 'ItemName', 'Detail', 'MaxScore', 'Weight', 'AppliesTo', 'Order', 'Active'],
  Evaluations: ['EvalID', 'EmployeeID', 'EvaluatorID', 'Period', 'EvalDate', 'JSON_Scores',
    'TotalScore', 'AvgScore', 'Percentage', 'Result', 'Comment'],
  Consultations: ['ConsultID', 'EmployeeID', 'Date', 'Topic', 'Detail', 'Advice', 'Result', 'FollowUpDate', 'FollowUpsJSON', 'RecordedBy', 'CreatedAt'],
  Meetings: ['MeetingID', 'Date', 'Time', 'Title', 'Detail', 'Status', 'AttendeesJSON', 'ManualCount', 'RecordedBy', 'CreatedAt'],
  // ผู้เข้าร่วมประชุมแต่ละคนแยกเป็นคนละแถว (แทนการเก็บรวมเป็น JSON ก้อนเดียวใน Meetings.AttendeesJSON)
  // เพื่อให้เปิดดู/ตรวจสอบตรง ๆ ใน Google Sheets ได้โดยไม่ต้องแกะ JSON — Meetings.AttendeesJSON เหลือไว้เป็น
  // fallback สำหรับข้อมูลเก่าก่อนแยกตารางเท่านั้น (ดู enrichMeeting_ ใน Meetings.gs)
  MeetingAttendees: ['MeetingAttendeeID', 'MeetingID', 'Date', 'Time', 'Title', 'Detail', 'Status', 'EmployeeID', 'ThaiName'],
  Questionnaires: ['QID', 'Title', 'Description', 'TargetScope', 'CreatedBy', 'CreatedDate', 'Status', 'AllowResubmit'],
  Questions: ['QuestionID', 'QID', 'QuestionText', 'Type', 'Options_JSON', 'ScoreMap_JSON', 'Required', 'Order', 'Topic'],
  Responses: ['ResponseID', 'QID', 'RespondentID', 'Answers_JSON', 'TotalScore', 'AvgScore', 'SubmitDate'],
  Settings: ['Key', 'Value', 'Detail'],
  Logs: ['Timestamp', 'User', 'Action', 'Target', 'Detail'],
  AIRecommendations: ['RecID', 'EmployeeID', 'Round', 'Month', 'Year', 'JSON', 'GeneratedAt', 'ViewedBy'],
  Manuals: ['ManualID', 'Title', 'FileName', 'FileID', 'FileURL', 'MimeType', 'VideoURL',
    'CoverImageFileID', 'CoverImageURL', 'StartDate', 'EndDate', 'Pinned', 'Featured', 'UploadedBy', 'UploadedAt'],
  WalkRounds: ['RoundID', 'VisitDate', 'VisitTime', 'VisitorID', 'VisitorName', 'Department', 'VisitRound',
    'EmployeeID', 'EmployeeName', 'Position', 'HireDate', 'Buddy',
    'ChecklistJSON', 'SatisfactionScore', 'IssuesFound', 'ActionNeeded', 'ActionOwner', 'Status',
    'NextFollowUpDate', 'VisitorSignature', 'StaffSignature', 'Note', 'CreatedAt', 'UpdatedAt'],
  // บัญชีผู้ดูแลระบบ (Admin) — เก็บแยกจากชีต Staff โดยเด็ดขาด ไม่ปนกับข้อมูลพนักงานที่มีประวัติทดลองงาน/ปฐมนิเทศ
  // (ดู Admins.gs) คนละบทบาทกัน ณ เวลาใดเวลาหนึ่งเป็นได้แค่อย่างใดอย่างหนึ่ง (Staff หรือ Admin ไม่ปนกัน)
  Admins: ['EmployeeID', 'ThaiName', 'NickName', 'Phone', 'Active', 'Note', 'CreatedAt', 'UpdatedAt'],
};
var SHEET_NAMES_ = Object.keys(SCHEMA_);

var DEFAULT_SETTINGS_ = [
  { Key: 'AppTitle', Value: 'Nursing Staff Probation Management', Detail: 'ชื่อแอปที่แสดงบน Topbar' },
  { Key: 'RatingScaleMax', Value: '5', Detail: 'สเกลคะแนนสูงสุดของแบบสอบถาม (rating)' },
  { Key: 'PassThreshold', Value: '80', Detail: 'เกณฑ์ร้อยละขั้นต่ำที่ถือว่าผ่านทดลองงาน' },
  { Key: 'AlertDays', Value: '10', Detail: 'จำนวนวันล่วงหน้าที่ระบบจะแจ้งเตือนก่อนครบกำหนดประเมิน (60/119 วัน)' },
  { Key: 'MonthlySurveyQID', Value: '', Detail: 'QID ของแบบสอบถามความพึงพอใจรายเดือน 12 ข้อ ที่ AI Coach ใช้วิเคราะห์' },
];

// หมวดหมู่ dropdown/tag ที่จัดการได้จากหน้า Settings — ค่าเริ่มต้นถูก seed ครั้งแรกเท่านั้น (initSheets_ จะไม่เขียนทับของที่ผู้ใช้แก้ไขแล้ว)
var DEFAULT_LISTS_ = {
  Position: ['Registered Nurse level 1', 'Registered Nurse level 2', 'Registered Nurse level 3', 'Registered Nurse level 4',
    'Respiratory Care Nurse level 1', 'Clinic Associate', 'Senior Clinic Associate', 'Clinical Nurse Coordinator level 3',
    'Practical Nurse', 'Practical Nurse level 1', 'Practical Nurse level 2', 'Ambulance Driver', 'Navigator',
    'Radiation Therapy Technologist level 1', 'พยาบาลวิชาชีพ', 'ผู้ช่วยพยาบาล', 'พนักงานช่วยงานการพยาบาล'],
  JobFunction: ['Registered Nurse', 'Practical Nurse', 'Officer', 'Senior Officer', 'Nurse Coordinator', 'Driver',
    'Radiation Therapy Technologist', 'Nurse Supervisor', 'Navigator', 'Nursing', 'Nursing Aid', 'Head Nurse'],
  ConsultationTopic: ['Work Performance Issue', 'Team Relationship', 'Nursing Skills', 'Time Management', 'Stress', 'Communication', 'Other'],
  ConsultationResult: ['Resolved', 'In Progress', 'Needs Follow-up', 'Referred to Specialist'],
  ProbationaryStatus: ['Active', 'Passed', 'Extended', 'Not Passed', 'Resign', 'Terminated'],
  MeetingStatus: ['ยังไม่ดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น'],
  ApplyLadderStatus: ['Apply', 'Drafted', 'NA', 'Not Create Form Adjust Ladder', 'Package Complete'],
  EvalResult: ['Completed', 'Pending Acknowledgement', 'Evaluation in Progress', 'ผ่าน', 'ไม่ผ่าน', 'ขยายเวลา'],
  HRSendStatus: ['ส่งแล้ว', 'รอส่ง', 'ไม่ต้องส่ง'],
  FullPartTime: ['Full Time', 'Part Time'],
  ResignationType: ['Career Advancement', 'Compensation & Benefit', 'Continue Studying', 'Family Reason',
    'Fellow/Co-worker', 'Health Reason', 'Location', 'Marriage', 'Not pass probation', 'Transportation Problems',
    'Type of Work', 'Workload of Unit', 'Working Environment', 'Working Hours', 'Working Process'],
  // แต่ละหัวข้อเช็กลิสต์เก็บตัวเลือก "ผล" ของตัวเอง (JSON) ไม่ใช้ list กลางร่วมกันทุกหัวข้อเหมือนเดิม
  WalkRoundChecklist: [
    JSON.stringify({ text: 'ความพร้อมของอุปกรณ์/พื้นที่ทำงาน (โต๊ะ, คอมพิวเตอร์, สิทธิ์เข้าระบบ, บัตรพนักงาน)', options: ['✓ พร้อม', '✗ ยังไม่พร้อม', 'N/A'] }),
    JSON.stringify({ text: 'ความเข้าใจในบทบาทหน้าที่และเป้าหมายงาน', options: ['✓ เข้าใจดี', '△ เข้าใจบางส่วน', '✗ ยังไม่เข้าใจ'] }),
    JSON.stringify({ text: 'การได้รับการปฐมนิเทศ / คู่มือ / การอบรมเบื้องต้น', options: ['✓ ได้รับแล้ว', '✗ ยังไม่ได้รับ', 'กำลังดำเนินการ'] }),
    JSON.stringify({ text: 'ความสัมพันธ์กับทีมและหัวหน้างาน', options: ['✓ ดี', '△ ปานกลาง', '✗ มีปัญหา'] }),
    JSON.stringify({ text: 'สวัสดิการ/สิทธิประโยชน์ที่เข้าใจแล้ว', options: ['✓ เข้าใจแล้ว', '✗ ยังไม่เข้าใจ', 'N/A'] }),
  ],
  WalkRoundResult: ['✓ พร้อม/เข้าใจแล้ว', '✗ ยังไม่พร้อม/ไม่เข้าใจ', 'N/A'],
  WalkRoundStatus: ['รอติดตาม', 'เรียบร้อย'],
};

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

// สร้างชีตที่ขาดหายให้อัตโนมัติเมื่อถูกเข้าถึงครั้งแรก (auto-create-on-access) — ไม่ต้องรอผู้ใช้กดปุ่ม "รันซ่อมแซมโครงสร้างชีต"
// เอง เพื่อกันปัญหา deploy โค้ดใหม่แล้วชีตของฟีเจอร์ใหม่ (เช่น WalkRounds, Manuals) ยังไม่ถูกสร้างจนกว่าจะมีคนกดปุ่ม
function createSheetWithHeaders_(spreadsheet, tab) {
  var headers = SCHEMA_[tab];
  if (!headers) throw HttpError_('SERVER_ERROR', 'ไม่รู้จักชีต ' + tab);
  var sh = spreadsheet.insertSheet(tab);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2000), headers.length).setNumberFormat('@');
  sh.setFrozenRows(1);
  return sh;
}

function sheet_(tab) {
  var spreadsheet = ss_();
  var sh = spreadsheet.getSheetByName(tab);
  if (!sh) sh = createSheetWithHeaders_(spreadsheet, tab);
  return sh;
}

function cellToString_(value) {
  if (value instanceof Date) {
    var tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
    // ปี 1899 (30 ธ.ค. 1899 คือ "วันฐาน" ของ Google Sheets) แปลว่าเซลล์นี้เก็บค่า "เวลาล้วน" (time-of-day) ไม่ใช่วันที่จริง
    // เช่นค่าจากช่อง <input type="time"> ที่ Sheets ตีความ/แปลงเป็น serial เวลาอัตโนมัติ — ต้อง format เป็น HH:mm
    // ไม่งั้นข้อมูลเวลาที่กรอกไว้จะหายไปทั้งหมด เหลือแต่ "1899-12-30" (รูปแบบวันที่ที่ไม่มีความหมายอะไรเลย)
    if (value.getFullYear() === 1899) return Utilities.formatDate(value, tz, 'HH:mm');
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

// แคชผลอ่านชีตไว้ในตัวแปรระดับสคริปต์ระหว่างคำขอเดียว (reset ทุกครั้งใน dispatch_) — บาง handler
// เรียก getAll_() ชีตเดียวกันซ้ำหลายครั้งผ่านฟังก์ชันช่วยต่าง ๆ การอ่าน Sheets API ซ้ำ ๆ คือส่วนที่ช้าที่สุดของคำขอ
var READ_TABLE_CACHE_ = {};

function invalidateTableCache_(tab) {
  delete READ_TABLE_CACHE_[tab];
}

function readTable_(tab) {
  if (READ_TABLE_CACHE_[tab]) return READ_TABLE_CACHE_[tab];
  var sh = ss_().getSheetByName(tab);
  var result;
  if (!sh) {
    result = { headers: SCHEMA_[tab] || [], rows: [] };
  } else {
    var values = sh.getDataRange().getValues();
    if (values.length === 0) {
      result = { headers: SCHEMA_[tab] || [], rows: [] };
    } else {
      var headers = values[0];
      var rows = [];
      for (var i = 1; i < values.length; i++) {
        var raw = values[i];
        var isEmpty = true;
        for (var k = 0; k < raw.length; k++) {
          if (raw[k] !== '' && raw[k] !== null && raw[k] !== undefined) { isEmpty = false; break; }
        }
        if (isEmpty) continue;
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          obj[headers[j]] = cellToString_(raw[j]);
        }
        obj._row = i + 1;
        rows.push(obj);
      }
      result = { headers: headers, rows: rows };
    }
  }
  READ_TABLE_CACHE_[tab] = result;
  return result;
}

// คืน array ใหม่เสมอ (slice) แม้จะมาจากแคช — กัน handler ที่เรียก .sort()/.push() ใส่ผลลัพธ์โดยตรง
// ไปกระทบ array ต้นฉบับที่แคชไว้ ซึ่งอาจถูกเรียกซ้ำอีกครั้งภายในคำขอเดียวกัน
function getAll_(tab) {
  return readTable_(tab).rows.slice();
}

function getById_(tab, idField, idValue) {
  var rows = getAll_(tab);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][idField] === idValue) return rows[i];
  }
  return null;
}

function appendRow_(tab, obj) {
  var headers = SCHEMA_[tab];
  if (!headers) throw HttpError_('SERVER_ERROR', 'ไม่รู้จักชีต ' + tab);
  var row = headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : String(v);
  });
  var sh = sheet_(tab);
  // ใช้ getRange().setValues() แทน sh.appendRow() — appendRow() ไม่เคารพ number format แบบ Plain text ('@')
  // ที่ตั้งไว้ตอนสร้างชีต (createSheetWithHeaders_) ทำให้ค่าที่ "ดูเหมือน" วันที่/เวลา/ตัวเลข (เช่น "14:30" จากช่อง
  // กรอกเวลา) ถูก Sheets ตีความและแปลงเป็น Date/number อัตโนมัติโดยไม่ตั้งใจ ต่างจาก setValues() ที่เคารพ format เดิม
  sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  invalidateTableCache_(tab);
}

function updateRow_(tab, rowNumber, obj) {
  var headers = SCHEMA_[tab];
  if (!headers) throw HttpError_('SERVER_ERROR', 'ไม่รู้จักชีต ' + tab);
  var row = headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : String(v);
  });
  sheet_(tab).getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  invalidateTableCache_(tab);
}

function insertRow_(tab, obj) {
  appendRow_(tab, obj);
}

// ลบแถวออกจากชีตจริง ๆ (ต่างจาก patchById_ ที่ตั้ง Active='FALSE' ไว้เฉย ๆ) — ใช้ตอน migrateStaffAdminsToAdminsSheet_
// ย้ายบัญชี Admin เดิม (ก่อนแยกชีต Admins ออกมา) ออกจากชีต Staff เด็ดขาด ไม่ใช่แค่ถูกปิดใช้งาน
function deleteRowByField_(tab, idField, idValue) {
  var sh = ss_().getSheetByName(tab);
  if (!sh) return false;
  var values = sh.getDataRange().getValues();
  if (values.length === 0) return false;
  var idCol = values[0].indexOf(idField);
  if (idCol === -1) return false;
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === idValue) {
      sh.deleteRow(i + 1);
      invalidateTableCache_(tab);
      return true;
    }
  }
  return false;
}

function patchById_(tab, idField, idValue, patch) {
  var existing = getById_(tab, idField, idValue);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบข้อมูล ' + idField + '=' + idValue + ' ในชีต ' + tab);
  var merged = {};
  for (var k in existing) merged[k] = existing[k];
  for (var p in patch) merged[p] = patch[p];
  updateRow_(tab, existing._row, merged);
  var result = {};
  for (var k2 in existing) result[k2] = existing[k2];
  for (var p2 in patch) result[p2] = patch[p2];
  return result;
}

// ---------- Settings helpers ----------
function getSettingsMap_() {
  var rows = getAll_('Settings');
  var map = {};
  DEFAULT_SETTINGS_.forEach(function (d) { map[d.Key] = d.Value; });
  rows.forEach(function (r) { map[r.Key] = r.Value; });
  return map;
}

// ---------- Lists (taxonomy) helpers ----------
function getListValues_(category) {
  return getAll_('Lists')
    .filter(function (r) { return r.Category === category && String(r.Active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); })
    .map(function (r) { return r.Value; });
}

// ---------- สร้างแท็บที่ยังไม่มี + เขียนหัวตาราง + บังคับ format เป็นข้อความ + seed Settings/Lists ----------
function initSheets_() {
  var spreadsheet = ss_();
  var existing = {};
  spreadsheet.getSheets().forEach(function (sh) { existing[sh.getName()] = true; });

  var created = [];
  SHEET_NAMES_.forEach(function (tab) {
    var sh = spreadsheet.getSheetByName(tab);
    if (!sh) {
      createSheetWithHeaders_(spreadsheet, tab);
      created.push(tab);
      return;
    }
    var headers = SCHEMA_[tab];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2000), headers.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });

  // ลบชีตเริ่มต้น "Sheet1" ที่ Google สร้างให้อัตโนมัติถ้ายังว่างอยู่และไม่ใช่หนึ่งในชีตของเรา
  var default1 = spreadsheet.getSheetByName('Sheet1');
  if (default1 && default1.getLastRow() === 0 && spreadsheet.getSheets().length > 1) {
    spreadsheet.deleteSheet(default1);
  }

  var seeded = [];
  var settingRows = getAll_('Settings');
  var existingKeys = {};
  settingRows.forEach(function (r) { existingKeys[r.Key] = true; });
  DEFAULT_SETTINGS_.forEach(function (s) {
    if (!existingKeys[s.Key]) {
      appendRow_('Settings', s);
      seeded.push(s.Key);
    }
  });

  var seededLists = [];
  var listRows = getAll_('Lists');
  var existingCategories = {};
  listRows.forEach(function (r) { existingCategories[r.Category] = true; });
  Object.keys(DEFAULT_LISTS_).forEach(function (category) {
    if (existingCategories[category]) return;
    DEFAULT_LISTS_[category].forEach(function (value, idx) {
      appendRow_('Lists', { ListID: genId_('LST'), Category: category, Value: value, Order: String(idx + 1), Active: 'TRUE' });
    });
    seededLists.push(category);
  });

  var seededSurveyQID = seedMonthlySurveyIfMissing_();
  var migratedAdmins = migrateStaffAdminsToAdminsSheet_();
  return { created: created, seeded: seeded, seededLists: seededLists, seededSurveyQID: seededSurveyQID, migratedAdmins: migratedAdmins };
}

// ย้ายแถวที่เหลืออยู่ในชีต Staff ที่มี Role='Admin' (จากโครงสร้างเดิมก่อนแยกชีต Admins ออกมาต่างหาก) ไปไว้ที่ชีต
// Admins แล้วลบออกจาก Staff — รันอัตโนมัติทุกครั้งที่ initSheets_ ทำงาน (ไม่ต้องรอกดปุ่มแยก) ทำครั้งเดียวจบเพราะ
// หลังย้ายแล้วจะไม่มีแถว Role='Admin' เหลือใน Staff ให้ย้ายซ้ำอีก
function migrateStaffAdminsToAdminsSheet_() {
  var now = new Date().toISOString();
  var staffAdmins = getAll_('Staff').filter(function (r) { return r.Role === 'Admin'; });
  var migrated = [];
  staffAdmins.forEach(function (r) {
    if (getById_('Admins', 'EmployeeID', r.EmployeeID)) return; // มีบัญชี Admin นี้อยู่แล้ว ข้ามไป กันข้อมูลซ้ำ
    appendRow_('Admins', {
      EmployeeID: r.EmployeeID, ThaiName: r.ThaiName, NickName: r.NickName, Phone: r.Phone,
      Active: r.Active || 'TRUE', Note: r.Note || '', CreatedAt: r.CreatedAt || now, UpdatedAt: now,
    });
    deleteRowByField_('Staff', 'EmployeeID', r.EmployeeID);
    migrated.push(r.EmployeeID);
  });
  return migrated;
}
