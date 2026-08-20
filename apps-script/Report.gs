/**
 * Report.gs — สรุปค่าเฉลี่ยรายเดือน/รายปี/รายบุคคล/รายหน่วยงาน (แบบสอบถาม + การประเมิน)
 */

function loadJoined_(domain) {
  var staffRows = getAll_('Staff');
  var staffById = {};
  staffRows.forEach(function (s) { staffById[s.EmployeeID] = s; });

  if (domain === 'survey') {
    return getAll_('Responses').map(function (r) {
      var staff = staffById[r.RespondentID];
      return {
        employeeId: r.RespondentID, date: r.SubmitDate, score: Number(r.AvgScore || 0),
        costCenterId: staff ? staff.CostCenterID : '', subServiceId: staff ? staff.SubServiceID : '', raw: r,
      };
    });
  }
  return getAll_('Evaluations').map(function (r) {
    var staff = staffById[r.EmployeeID];
    return {
      employeeId: r.EmployeeID, date: r.EvalDate, score: Number(r.Percentage || 0),
      costCenterId: staff ? staff.CostCenterID : '', subServiceId: staff ? staff.SubServiceID : '', raw: r,
    };
  });
}

function applyFilters_(rows, q) {
  var out = rows;
  if (q.costCenterId) out = out.filter(function (r) { return r.costCenterId === q.costCenterId; });
  if (q.subServiceId) out = out.filter(function (r) { return r.subServiceId === q.subServiceId; });
  if (q.from) out = out.filter(function (r) { return r.date >= q.from; });
  if (q.to) out = out.filter(function (r) { return r.date <= q.to; });
  if (q.qid) out = out.filter(function (r) { return r.raw.QID === q.qid; });
  return out;
}

function average_(nums) {
  if (nums.length === 0) return 0;
  var sum = nums.reduce(function (a, b) { return a + b; }, 0);
  return Math.round((sum / nums.length) * 100) / 100;
}

function groupBy_(rows, keyFn) {
  var map = {};
  var order = [];
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(r);
  });
  return { map: map, keys: order };
}

function assertDomain_(domain) {
  if (domain !== 'survey' && domain !== 'evaluation') throw HttpError_('BAD_REQUEST', 'domain ต้องเป็น survey หรือ evaluation');
}

function reportMonthly_(ctx) {
  var domain = ctx.params.domain;
  assertDomain_(domain);
  var rows = applyFilters_(loadJoined_(domain), ctx.query);
  var grouped = groupBy_(rows, function (r) { return r.date.slice(0, 7); });
  var result = grouped.keys.map(function (month) {
    return { month: month, avgScore: average_(grouped.map[month].map(function (i) { return i.score; })), count: grouped.map[month].length };
  }).sort(function (a, b) { return a.month.localeCompare(b.month); });
  return ok_(result);
}

function reportYearly_(ctx) {
  var domain = ctx.params.domain;
  assertDomain_(domain);
  var rows = applyFilters_(loadJoined_(domain), ctx.query);

  var byYear = groupBy_(rows, function (r) { return r.date.slice(0, 4); });
  var years = byYear.keys.map(function (year) {
    return { year: year, avgScore: average_(byYear.map[year].map(function (i) { return i.score; })), count: byYear.map[year].length };
  }).sort(function (a, b) { return a.year.localeCompare(b.year); });

  var monthlyBreakdown = [];
  if (ctx.query.year) {
    var inYear = rows.filter(function (r) { return r.date.indexOf(ctx.query.year) === 0; });
    var byMonth = groupBy_(inYear, function (r) { return r.date.slice(0, 7); });
    monthlyBreakdown = byMonth.keys.map(function (month) {
      return { month: month, avgScore: average_(byMonth.map[month].map(function (i) { return i.score; })), count: byMonth.map[month].length };
    }).sort(function (a, b) { return a.month.localeCompare(b.month); });
  }

  return ok_({ years: years, monthlyBreakdown: monthlyBreakdown });
}

function reportIndividual_(ctx) {
  var domain = ctx.params.domain;
  assertDomain_(domain);
  var session = ctx.session;
  var employeeId = ctx.query.employeeId || session.empId;

  if (session.role !== 'Admin' && session.empId !== employeeId) {
    if (!canAccessStaff_(session, employeeId)) throw HttpError_('FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  }

  var rows = applyFilters_(loadJoined_(domain), ctx.query).filter(function (r) { return r.employeeId === employeeId; });
  rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
  var rounds = rows.map(function (r) { return { date: r.date, score: r.score, raw: r.raw }; });
  return ok_({ employeeId: employeeId, overallAvg: average_(rows.map(function (r) { return r.score; })), rounds: rounds });
}

function reportByCostCenter_(ctx) {
  var domain = ctx.params.domain;
  assertDomain_(domain);
  var rows = applyFilters_(loadJoined_(domain), ctx.query);
  var costCenters = getAll_('CostCenters');
  var byCC = groupBy_(rows, function (r) { return r.costCenterId || 'ไม่ระบุ'; });
  var result = byCC.keys.map(function (ccId) {
    var cc = costCenters.filter(function (c) { return c.CostCenterID === ccId; })[0];
    return {
      costCenterId: ccId, costCenterName: cc ? cc.Name : 'ไม่ระบุหน่วยงาน',
      avgScore: average_(byCC.map[ccId].map(function (i) { return i.score; })), count: byCC.map[ccId].length,
    };
  });
  return ok_(result);
}
