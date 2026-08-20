/**
 * Org.gs — หน่วยงาน (Cost Center) / งานบริการย่อย (Sub Service) / ชุดข้อมูลสำเร็จรูป (Preset)
 */

// ---------- Cost Centers ----------
function listCostCenters_() {
  var rows = getAll_('CostCenters');
  return ok_(rows.filter(function (r) { return String(r.Active).toUpperCase() !== 'FALSE'; }));
}

// แต่ละ Cost Center ผูกกับ Sub Service เดียวเสมอ (สร้าง/อัปเดตคู่กันในคำขอเดียว) — ใช้สำหรับ auto-fill ในหน้าเพิ่ม/แก้ไขข้อมูลพนักงาน
// หา SubService ที่ผูกกับ CostCenterID นี้อยู่แล้ว (ถ้ามี) ไม่งั้นคืน null
function subServiceForCostCenter_(costCenterId) {
  var rows = getAll_('SubServices').filter(function (r) {
    return r.CostCenterID === costCenterId && String(r.Active).toUpperCase() !== 'FALSE';
  });
  return rows.length ? rows[0] : null;
}

// สร้าง/อัปเดต SubService ที่ผูกกับ Cost Center นี้ให้ตรงกับชื่อที่ระบุ — ถ้าไม่ระบุชื่อ (ว่าง) จะปิดการใช้งาน SubService เดิมทิ้ง
function upsertSubServiceForCostCenter_(costCenterId, name) {
  var trimmed = String(name || '').trim();
  var existing = subServiceForCostCenter_(costCenterId);
  if (!trimmed) {
    if (existing) patchById_('SubServices', 'SubServiceID', existing.SubServiceID, { Active: 'FALSE' });
    return null;
  }
  if (existing) {
    patchById_('SubServices', 'SubServiceID', existing.SubServiceID, { Name: trimmed, Active: 'TRUE' });
    return existing.SubServiceID;
  }
  var record = { SubServiceID: genId_('SS'), CostCenterID: costCenterId, Name: trimmed, Code: '', Description: '', Active: 'TRUE' };
  insertRow_('SubServices', record);
  return record.SubServiceID;
}

function createCostCenter_(ctx) {
  if (!ctx.body.Name) throw HttpError_('BAD_REQUEST', 'กรุณากรอกชื่อหน่วยงาน');
  var record = {
    CostCenterID: genId_('CC'), Name: ctx.body.Name, Code: ctx.body.Code || '',
    Description: ctx.body.Description || '', Active: 'TRUE',
  };
  insertRow_('CostCenters', record);
  upsertSubServiceForCostCenter_(record.CostCenterID, ctx.body.SubServiceName);
  writeLog_(ctx.session.empId, 'Create', 'CostCenter:' + record.CostCenterID, record.Name);
  return ok_(record, 'เพิ่มหน่วยงานสำเร็จ');
}

function updateCostCenter_(ctx) {
  var updated = patchById_('CostCenters', 'CostCenterID', ctx.params.id, ctx.body);
  if (ctx.body.SubServiceName !== undefined) upsertSubServiceForCostCenter_(ctx.params.id, ctx.body.SubServiceName);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deleteCostCenter_(ctx) {
  patchById_('CostCenters', 'CostCenterID', ctx.params.id, { Active: 'FALSE' });
  // Sub Service ที่ผูกกับหน่วยงานนี้ไม่มีประโยชน์แล้วถ้าไม่มี Cost Center ใช้งานอยู่ ปิดการใช้งานไปด้วยกันกันข้อมูลค้าง
  getAll_('SubServices').filter(function (r) { return r.CostCenterID === ctx.params.id; }).forEach(function (r) {
    patchById_('SubServices', 'SubServiceID', r.SubServiceID, { Active: 'FALSE' });
  });
  writeLog_(ctx.session.empId, 'Deactivate', 'CostCenter:' + ctx.params.id, '');
  return ok_(true, 'ลบหน่วยงานสำเร็จ');
}

// นำเข้าหน่วยงาน (Cost Center) จาก CSV — จับคู่แถวเดิมด้วย Code (ถ้ามี) มิฉะนั้นด้วยชื่อ (Name) แล้ว upsert พร้อม Sub Service ที่ผูกกัน
function bulkImportCostCenters_(ctx) {
  var rows = ctx.body.rows || [];
  if (!rows.length) throw HttpError_('BAD_REQUEST', 'ไม่พบข้อมูลที่จะนำเข้า');
  var existingRows = getAll_('CostCenters');
  var created = 0, updated = 0, errors = [];
  rows.forEach(function (r, idx) {
    var name = String(r.Name || '').trim();
    var code = String(r.Code || '').trim();
    var subServiceName = r.SubServiceName || r['Sub Services'] || '';
    if (!name) {
      errors.push('แถวที่ ' + (idx + 1) + ': ข้อมูลไม่ครบ (ชื่อหน่วยงาน)');
      return;
    }
    var existing = code
      ? existingRows.find(function (x) { return x.Code === code; })
      : existingRows.find(function (x) { return x.Name === name; });
    var record = { Name: name, Code: code, Active: 'TRUE' };
    var costCenterId;
    if (existing) {
      patchById_('CostCenters', 'CostCenterID', existing.CostCenterID, record);
      costCenterId = existing.CostCenterID;
      updated++;
    } else {
      costCenterId = genId_('CC');
      record.CostCenterID = costCenterId;
      record.Description = '';
      insertRow_('CostCenters', record);
      existingRows.push(record);
      created++;
    }
    upsertSubServiceForCostCenter_(costCenterId, subServiceName);
  });
  writeLog_(ctx.session.empId, 'Import', 'CostCenter', created + ' created, ' + updated + ' updated');
  return ok_({ created: created, updated: updated, errors: errors }, 'นำเข้าข้อมูลสำเร็จ ' + created + ' เพิ่มใหม่, ' + updated + ' อัปเดต');
}

// ---------- Sub Services ----------
function listSubServices_(ctx) {
  var rows = getAll_('SubServices').filter(function (r) { return String(r.Active).toUpperCase() !== 'FALSE'; });
  if (ctx.query.costCenterId) rows = rows.filter(function (r) { return r.CostCenterID === ctx.query.costCenterId; });
  return ok_(rows);
}

function createSubService_(ctx) {
  if (!ctx.body.Name || !ctx.body.CostCenterID) {
    throw HttpError_('BAD_REQUEST', 'กรุณาระบุ CostCenterID และชื่องานบริการย่อย');
  }
  var record = {
    SubServiceID: genId_('SS'), CostCenterID: ctx.body.CostCenterID, Name: ctx.body.Name,
    Code: ctx.body.Code || '', Description: ctx.body.Description || '', Active: 'TRUE',
  };
  insertRow_('SubServices', record);
  writeLog_(ctx.session.empId, 'Create', 'SubService:' + record.SubServiceID, record.Name);
  return ok_(record, 'เพิ่มงานบริการย่อยสำเร็จ');
}

function updateSubService_(ctx) {
  var updated = patchById_('SubServices', 'SubServiceID', ctx.params.id, ctx.body);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deleteSubService_(ctx) {
  patchById_('SubServices', 'SubServiceID', ctx.params.id, { Active: 'FALSE' });
  writeLog_(ctx.session.empId, 'Deactivate', 'SubService:' + ctx.params.id, '');
  return ok_(true, 'ลบงานบริการย่อยสำเร็จ');
}

// ---------- Presets ----------
function listPresets_() {
  return ok_(getAll_('Presets'));
}

function applyPresets_(ctx) {
  var scopeType = ctx.query.scopeType;
  var scopeRefId = ctx.query.scopeRefId;
  var rows = getAll_('Presets');
  var matched = rows.filter(function (r) {
    return r.ScopeType === 'Global' || (r.ScopeType === scopeType && r.ScopeRefID === scopeRefId);
  });
  var map = {};
  matched.forEach(function (r) { map[r.Key] = { value: r.Value, detail: r.Detail }; });
  return ok_({ items: matched, map: map });
}

function createPreset_(ctx) {
  if (!ctx.body.ScopeType || !ctx.body.Key) throw HttpError_('BAD_REQUEST', 'กรุณาระบุ ScopeType และ Key');
  var record = {
    PresetID: genId_('PS'), ScopeType: ctx.body.ScopeType, ScopeRefID: ctx.body.ScopeRefID || '',
    Key: ctx.body.Key, Value: ctx.body.Value || '', Detail: ctx.body.Detail || '',
  };
  insertRow_('Presets', record);
  writeLog_(ctx.session.empId, 'Create', 'Preset:' + record.PresetID, JSON.stringify(record));
  return ok_(record, 'เพิ่มชุดข้อมูลสำเร็จรูปสำเร็จ');
}

function updatePreset_(ctx) {
  var updated = patchById_('Presets', 'PresetID', ctx.params.id, ctx.body);
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deletePreset_(ctx) {
  var existing = getById_('Presets', 'PresetID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบชุดข้อมูล');
  // Presets ไม่มีคอลัมน์ Active ตาม schema — ลบจริงด้วยการเคลียร์ทุกคอลัมน์ให้แถวว่างเปล่า
  // (readTable_ จะข้ามแถวที่ว่างทั้งหมดโดยอัตโนมัติในการอ่านครั้งถัดไป)
  patchById_('Presets', 'PresetID', ctx.params.id, {
    PresetID: '', ScopeType: '', ScopeRefID: '', Key: '', Value: '', Detail: '',
  });
  writeLog_(ctx.session.empId, 'Delete', 'Preset:' + ctx.params.id, '');
  return ok_(true, 'ลบสำเร็จ');
}
