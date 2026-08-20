/**
 * Manuals.gs — คู่มือพนักงาน (Information tab) เก็บไฟล์ไว้ใน Google Drive โฟลเดอร์เดียว
 * User: ดูรายการ + เปิด/ดาวน์โหลดเท่านั้น. Admin: อัปโหลด/ลบ ได้เพิ่ม
 */

// โฟลเดอร์ Google Drive ที่ผู้ใช้กำหนดไว้ล่วงหน้าสำหรับเก็บไฟล์ Information
// (จาก https://drive.google.com/drive/folders/13fU014r7XuK3mNgBj-Ra6WFo-NGn1RTc) — ใช้แทนการสร้างโฟลเดอร์ใหม่ด้วย
// DriveApp.createFolder() ซึ่งต้องขอสิทธิ์ https://www.googleapis.com/auth/drive แบบเต็ม (มักถูกปฏิเสธในบัญชีองค์กรที่จำกัดสิทธิ์)
var DEFAULT_MANUALS_FOLDER_ID_ = '13fU014r7XuK3mNgBj-Ra6WFo-NGn1RTc';

// เรียกครั้งเดียวจากหน้า Apps Script Editor โดยตรง (เลือกฟังก์ชันนี้ในดรอปดาวน์ข้างปุ่ม Run แล้วกด Run) — ห้ามเรียกผ่าน
// Web App เพราะจะไม่มีหน้าจอขอสิทธิ์ให้กด Allow ปัญหา "ไม่สามารถเข้าถึงโฟลเดอร์ Information ได้ และสร้างโฟลเดอร์ใหม่ก็ไม่สำเร็จ"
// ทั้งที่โฟลเดอร์แชร์สิทธิ์ให้แล้ว มักเกิดจากสคริปต์นี้ไม่เคยได้รับอนุญาต (authorize) ให้เข้าถึง Google Drive เลยตั้งแต่แรก
// เพราะ Apps Script จะไม่ขอสิทธิ์ Drive อัตโนมัติตอนรันผ่าน doGet/doPost (Web App) ต้องรันฟังก์ชันที่แตะ DriveApp
// ตรง ๆ จาก editor อย่างน้อยหนึ่งครั้งก่อน ถึงจะขึ้นหน้าจอ "ตรวจสอบสิทธิ์" ให้กด Allow — พอ Allow แล้วครั้งเดียว
// Web App ที่ deploy ไว้จะเข้าถึง Drive ได้ตามปกติทันที ไม่ต้อง deploy ใหม่
function authorizeDriveAccess() {
  var folder = DriveApp.getRootFolder();
  Logger.log('เข้าถึง Google Drive ได้แล้ว: ' + folder.getName());
}

function manualsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('MANUALS_FOLDER_ID');
  var folderId = savedId || DEFAULT_MANUALS_FOLDER_ID_;
  var folder = null;
  try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
  if (!folder) {
    // เข้าโฟลเดอร์ที่กำหนดไว้ล่วงหน้าไม่ได้ (ยังไม่ได้แชร์สิทธิ์ให้บัญชีนี้) — สร้างโฟลเดอร์ใหม่ของตัวเองแทนแล้วจำ ID ไว้ใช้ครั้งถัดไป
    // เพื่อไม่ให้ผู้ใช้ติดค้างอัปโหลดไม่ได้ ระหว่างรอประสานเรื่องสิทธิ์แชร์โฟลเดอร์เดิม
    try {
      folder = DriveApp.createFolder('Nursing Probation - Manuals');
    } catch (e3) {
      var effectiveEmail = '';
      try { effectiveEmail = Session.getEffectiveUser().getEmail(); } catch (e2) { effectiveEmail = ''; }
      var hint = effectiveEmail
        ? 'กรุณาแชร์โฟลเดอร์นี้ให้บัญชี ' + effectiveEmail + ' สิทธิ์อย่างน้อย "ผู้แก้ไข (Editor)"'
        : 'กรุณาตรวจสอบว่าบัญชีที่รัน Apps Script มีสิทธิ์เข้าถึงโฟลเดอร์นี้';
      throw HttpError_('SERVER_ERROR', 'ไม่สามารถเข้าถึงโฟลเดอร์เก็บไฟล์ Information ใน Google Drive ได้ (Folder ID: ' + folderId +
        ') และสร้างโฟลเดอร์ใหม่เองก็ไม่สำเร็จเช่นกัน ' + hint + ' หรือให้สิทธิ์ Apps Script เข้าถึง Google Drive ก่อน');
    }
  }
  if (savedId !== folder.getId()) props.setProperty('MANUALS_FOLDER_ID', folder.getId());
  return folder;
}

function listManuals_() {
  var rows = getAll_('Manuals').sort(function (a, b) { return (b.UploadedAt || '').localeCompare(a.UploadedAt || ''); });
  return ok_(rows.map(function (r) { var out = {}; for (var k in r) { if (k !== '_row') out[k] = r[k]; } return out; }));
}

function base64ToBlob_(dataBase64, mimeType, fileName) {
  var b64 = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
  var bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (e) {
    throw HttpError_('BAD_REQUEST', 'ไฟล์ไม่ถูกต้อง');
  }
  return Utilities.newBlob(bytes, mimeType, fileName);
}

function uploadManual_(ctx) {
  var body = ctx.body;
  var title = String(body.title || '').trim();
  var fileName = String(body.fileName || '').trim();
  var dataBase64 = body.dataBase64;
  var mimeType = body.mimeType || 'application/octet-stream';
  var videoUrl = String(body.videoUrl || '').trim();
  if (!title) throw HttpError_('BAD_REQUEST', 'กรุณาระบุชื่อเรื่อง');
  if (!dataBase64 && !videoUrl) throw HttpError_('BAD_REQUEST', 'กรุณาแนบไฟล์ หรือใส่ลิงก์วิดีโอ อย่างน้อยหนึ่งอย่าง');

  var fileId = '', fileUrl = '';
  if (dataBase64) {
    var blob = base64ToBlob_(dataBase64, mimeType, fileName || title);
    var file = manualsFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();
    fileUrl = file.getUrl();
  }

  var coverFileId = '', coverUrl = '';
  if (body.coverImageBase64) {
    var coverBlob = base64ToBlob_(body.coverImageBase64, body.coverImageMimeType || 'image/jpeg', body.coverImageFileName || (title + '-cover'));
    var coverFile = manualsFolder_().createFile(coverBlob);
    coverFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    coverFileId = coverFile.getId();
    coverUrl = coverFile.getUrl();
  }

  var record = {
    ManualID: genId_('MN'), Title: title, FileName: fileName, FileID: fileId, FileURL: fileUrl, MimeType: mimeType,
    VideoURL: videoUrl, CoverImageFileID: coverFileId, CoverImageURL: coverUrl,
    StartDate: body.startDate || '', EndDate: body.endDate || '',
    Pinned: body.pinned ? 'TRUE' : 'FALSE', Featured: body.featured ? 'TRUE' : 'FALSE',
    UploadedBy: ctx.session.empId, UploadedAt: new Date().toISOString(),
  };
  insertRow_('Manuals', record);
  writeLog_(ctx.session.empId, 'Create', 'Manual:' + record.ManualID, title);
  return ok_(record, 'อัปโหลดสำเร็จ');
}

function updateManual_(ctx) {
  var existing = getById_('Manuals', 'ManualID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบเรื่องนี้');
  var body = ctx.body;
  var patch = {};
  if (body.title !== undefined) patch.Title = String(body.title).trim();
  if (body.videoUrl !== undefined) patch.VideoURL = String(body.videoUrl).trim();
  if (body.startDate !== undefined) patch.StartDate = body.startDate;
  if (body.endDate !== undefined) patch.EndDate = body.endDate;
  if (body.pinned !== undefined) patch.Pinned = body.pinned ? 'TRUE' : 'FALSE';
  if (body.featured !== undefined) patch.Featured = body.featured ? 'TRUE' : 'FALSE';
  var updated = patchById_('Manuals', 'ManualID', ctx.params.id, patch);
  writeLog_(ctx.session.empId, 'Update', 'Manual:' + ctx.params.id, JSON.stringify(patch));
  return ok_(updated, 'บันทึกสำเร็จ');
}

function deleteManual_(ctx) {
  var existing = getById_('Manuals', 'ManualID', ctx.params.id);
  if (!existing) throw HttpError_('NOT_FOUND', 'ไม่พบคู่มือนี้');
  if (existing.FileID) {
    try { DriveApp.getFileById(existing.FileID).setTrashed(true); } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว ไม่เป็นไร */ }
  }
  if (existing.CoverImageFileID) {
    try { DriveApp.getFileById(existing.CoverImageFileID).setTrashed(true); } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว ไม่เป็นไร */ }
  }
  updateRow_('Manuals', existing._row, {
    ManualID: '', Title: '', FileName: '', FileID: '', FileURL: '', MimeType: '', VideoURL: '',
    CoverImageFileID: '', CoverImageURL: '', StartDate: '', EndDate: '', Pinned: '', Featured: '',
    UploadedBy: '', UploadedAt: '',
  });
  writeLog_(ctx.session.empId, 'Delete', 'Manual:' + ctx.params.id, existing.Title);
  return ok_(true, 'ลบสำเร็จ');
}
