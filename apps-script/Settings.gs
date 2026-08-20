/**
 * Settings.gs — ตั้งค่าระบบทั่วไป + หัวข้อ/เกณฑ์การประเมิน (EvalItems)
 */

function getSettings_() {
  return ok_(getSettingsMap_());
}

function updateSettings_(ctx) {
  var rows = getAll_('Settings');
  for (var key in ctx.body) {
    var existing = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].Key === key) { existing = rows[i]; break; }
    }
    if (existing) {
      patchById_('Settings', 'Key', key, { Value: String(ctx.body[key]) });
    } else {
      insertRow_('Settings', { Key: key, Value: String(ctx.body[key]), Detail: '' });
    }
  }
  writeLog_(ctx.session.empId, 'Update', 'Settings', JSON.stringify(ctx.body));
  return ok_(getSettingsMap_(), 'บันทึกการตั้งค่าสำเร็จ');
}

// ---------- EvalItems ----------
function listEvalItems_(ctx) {
  var rows = getAll_('EvalItems').filter(function (r) { return String(r.Active).toUpperCase() !== 'FALSE'; });
  if (ctx.query.appliesTo) {
    var appliesTo = ctx.query.appliesTo;
    rows = rows.filter(function (r) { return r.AppliesTo === 'All' || r.AppliesTo === appliesTo; });
  }
  rows.sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
  return ok_(rows);
}

function createEvalItem_(ctx) {
  var body = ctx.body;
  if (!body.ItemName) throw HttpError_('BAD_REQUEST', 'กรุณากรอกชื่อหัวข้อประเมิน');
  var rows = getAll_('EvalItems');
  var record = {
    ItemID: genId_('EI'), Category: body.Category || '', ItemName: body.ItemName,
    Detail: body.Detail || '', MaxScore: String(body.MaxScore || 5), Weight: String(body.Weight || 1),
    AppliesTo: body.AppliesTo || 'All', Order: String(body.Order || rows.length + 1), Active: 'TRUE',
  };
  insertRow_('EvalItems', record);
  writeLog_(ctx.session.empId, 'Create', 'EvalItem:' + record.ItemID, record.ItemName);
  return ok_(record, 'เพิ่มหัวข้อประเมินสำเร็จ');
}

function updateEvalItem_(ctx) {
  var updated = patchById_('EvalItems', 'ItemID', ctx.params.id, ctx.body);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deleteEvalItem_(ctx) {
  patchById_('EvalItems', 'ItemID', ctx.params.id, { Active: 'FALSE' });
  writeLog_(ctx.session.empId, 'Deactivate', 'EvalItem:' + ctx.params.id, '');
  return ok_(true, 'ลบหัวข้อประเมินสำเร็จ');
}
