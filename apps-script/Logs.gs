/**
 * Logs.gs — บันทึกการใช้งาน (Audit trail)
 */

function writeLog_(user, action, target, detail) {
  try {
    appendRow_('Logs', {
      Timestamp: new Date().toISOString(),
      User: user,
      Action: action,
      Target: target,
      Detail: detail || '',
    });
  } catch (e) {
    // ไม่ให้การบันทึก log ที่ล้มเหลวไปขัดขวาง flow หลัก
  }
}

function listLogs_(ctx) {
  var rows = getAll_('Logs');
  if (ctx.query.user) rows = rows.filter(function (r) { return r.User === ctx.query.user; });
  if (ctx.query.action) rows = rows.filter(function (r) { return r.Action === ctx.query.action; });
  if (ctx.query.from) rows = rows.filter(function (r) { return r.Timestamp >= ctx.query.from; });
  if (ctx.query.to) rows = rows.filter(function (r) { return r.Timestamp <= ctx.query.to; });
  rows.sort(function (a, b) { return b.Timestamp.localeCompare(a.Timestamp); });
  var limit = ctx.query.limit ? Number(ctx.query.limit) : 500;
  return ok_(rows.slice(0, limit));
}
