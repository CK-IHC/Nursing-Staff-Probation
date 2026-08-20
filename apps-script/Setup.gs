/**
 * Setup.gs — สร้างโครงชีตครั้งแรก (initSheets) + สร้างผู้ดูแลระบบคนแรก (bootstrap)
 */

function handleSetupInit_(ctx) {
  var staffRows = [];
  try { staffRows = getAll_('Staff'); } catch (e) { staffRows = []; }
  if (staffRows.length > 0) {
    var payload = verifySession_(ctx.token);
    var staff = payload ? getById_('Staff', 'EmployeeID', payload.empId) : null;
    if (!staff || staff.Role !== 'Admin' || String(staff.Active).toUpperCase() === 'FALSE') {
      throw HttpError_('UNAUTHORIZED', 'ระบบตั้งค่าเรียบร้อยแล้ว ต้องเป็นผู้ดูแลระบบเท่านั้นจึงจะรันซ้ำได้');
    }
  }
  var result = initSheets_();
  return ok_(result, 'ตั้งค่าโครงสร้างชีตเรียบร้อย');
}

function handleFirstAdmin_(ctx) {
  var staffRows = [];
  try { staffRows = getAll_('Staff'); } catch (e) { staffRows = []; }
  if (staffRows.length > 0) {
    throw HttpError_('CONFLICT', 'มีบัญชีผู้ใช้อยู่แล้ว ไม่สามารถสร้างผู้ดูแลระบบคนแรกซ้ำได้');
  }
  var employeeId = String(ctx.body.employeeId || '').trim();
  var phone = String(ctx.body.phone || '').trim();
  var thaiName = String(ctx.body.thaiName || '').trim();
  if (!employeeId || !phone || !thaiName) {
    throw HttpError_('BAD_REQUEST', 'กรุณากรอก employeeId, phone, thaiName ให้ครบ');
  }

  var hireDate = todayISO_();
  var now = new Date().toISOString();
  var evalDates = computeEvalDates_(hireDate);
  var record = {
    EmployeeID: employeeId, ThaiName: thaiName, NickName: String(ctx.body.nickName || '').trim(), HireDate: hireDate,
    Position: ctx.body.position || 'ผู้ดูแลระบบ', CostCenterID: '', CostCenterName: '', JobFunction: '',
    SubServiceID: '', Preceptor: '', ManagerName: '', Supervisor: '', FullPartTime: 'Full Time',
    ProbationaryStatus: 'Passed', Eval60Date: evalDates.Eval60Date, Eval119Date: evalDates.Eval119Date,
    Orient1Date: '', Orient2Date: '', Orient3Date: '', Orient4Date: '', OrientSentHRDate: '',
    ApplyLadderStatus: 'NA', UnitSpecificCompetency: '', Role: 'Admin', Phone: phone,
    Rehire: 'FALSE', ResignationType: '', ResignDate: '', Note: '',
    Active: 'TRUE', CreatedAt: now, UpdatedAt: now,
  };
  insertRow_('Staff', record);
  var token = signSession_({ empId: employeeId, role: 'Admin', name: thaiName });
  return ok_({ token: token, user: sanitizeStaff_(record) }, 'สร้างผู้ดูแลระบบคนแรกสำเร็จ');
}

// เปิด {exec_url}?path=/api/setup/status ตรง ๆ ในเบราว์เซอร์ได้เลย (ไม่ต้องล็อกอิน) เพื่อตรวจสอบว่า
// โค้ดที่ deploy อยู่จริงตอนนี้เป็นเวอร์ชันไหน — เทียบ codeVersion กับ BACKEND_CODE_VERSION_ ล่าสุดที่ส่งให้
// endpoint นี้ "ซ่อมไปในตัว" ด้วย: สร้างชีตที่ขาดหายให้ครบทุกครั้งที่เรียก (ไม่ต้องกดปุ่มแยก, เปิด URL ครั้งเดียวจบ)
function handleSetupStatus_() {
  var rows = [];
  try { rows = getAll_('Staff'); } catch (e) { rows = []; }
  var sheetsBefore = [];
  try { sheetsBefore = ss_().getSheets().map(function (sh) { return sh.getName(); }); } catch (e) { sheetsBefore = []; }
  var repairResult = { created: [] };
  try { repairResult = initSheets_(); } catch (e) { /* ยังไม่มี Script Properties ครบตอน first-run ก็ปล่อยผ่านไป ไม่ให้ status endpoint ล่ม */ }
  var sheetsAfter = [];
  try { sheetsAfter = ss_().getSheets().map(function (sh) { return sh.getName(); }); } catch (e) { sheetsAfter = []; }
  var expectedSheets = SHEET_NAMES_;
  var missingSheets = expectedSheets.filter(function (name) { return sheetsAfter.indexOf(name) === -1; });
  return ok_({
    codeVersion: BACKEND_CODE_VERSION_,
    hasAnyStaff: rows.length > 0,
    deployedSheetsBeforeThisCheck: sheetsBefore,
    sheetsJustCreatedByThisCheck: repairResult.created,
    deployedSheetsFound: sheetsAfter,
    deployedSheetsMissing: missingSheets,
    deployedCodeUpToDate: missingSheets.length === 0,
  });
}
