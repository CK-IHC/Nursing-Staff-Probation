/**
 * Lists.gs — จัดการรายการ dropdown/tag แบบ generic (ตำแหน่ง, Job Function, หัวข้อคำปรึกษา, สถานะต่าง ๆ ฯลฯ)
 * ทุกหมวดหมู่ (Category) ใช้ชีต Lists ร่วมกัน เพื่อให้หน้า Settings จัดการได้ในรูปแบบ tag editor เดียวกันทั้งหมด
 */

function listAllLists_() {
  var rows = getAll_('Lists').filter(function (r) { return String(r.Active).toUpperCase() !== 'FALSE'; });
  rows.sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
  var byCategory = {};
  rows.forEach(function (r) {
    if (!byCategory[r.Category]) byCategory[r.Category] = [];
    byCategory[r.Category].push({ ListID: r.ListID, Value: r.Value, Order: r.Order });
  });
  return ok_(byCategory);
}

function listByCategory_(ctx) {
  var category = ctx.params.category;
  var rows = getAll_('Lists')
    .filter(function (r) { return r.Category === category && String(r.Active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return Number(a.Order || 0) - Number(b.Order || 0); });
  return ok_(rows);
}

function createListItem_(ctx) {
  var body = ctx.body;
  var category = ctx.params.category;
  if (!body.Value) throw HttpError_('BAD_REQUEST', 'กรุณากรอกค่าที่ต้องการเพิ่ม');
  var existingCount = getAll_('Lists').filter(function (r) { return r.Category === category; }).length;
  var record = { ListID: genId_('LST'), Category: category, Value: String(body.Value).trim(), Order: String(existingCount + 1), Active: 'TRUE' };
  insertRow_('Lists', record);
  writeLog_(ctx.session.empId, 'Create', 'List:' + category, record.Value);
  return ok_(record, 'เพิ่มรายการสำเร็จ');
}

function deleteListItem_(ctx) {
  patchById_('Lists', 'ListID', ctx.params.id, { Active: 'FALSE' });
  writeLog_(ctx.session.empId, 'Deactivate', 'List:' + ctx.params.id, '');
  return ok_(true, 'ลบรายการสำเร็จ');
}
