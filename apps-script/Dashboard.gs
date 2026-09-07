/**
 * Dashboard.gs — สรุปข้อมูลภาพรวมสำหรับหน้า Dashboard และ Orientation Checklist
 */

function dashboardSummary_() {
  var rows = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin'; });
  var counts = { onProbation: 0, passed: 0, extended: 0, notPassed: 0, resign: 0, terminated: 0, total: rows.length };
  var byPosition = {};
  rows.forEach(function (r) {
    switch (r.ProbationaryStatus || 'Active') {
      case 'Active': counts.onProbation++; break;
      case 'Passed': counts.passed++; break;
      case 'Extended': counts.extended++; break;
      case 'Not Passed': counts.notPassed++; break;
      case 'Resign': counts.resign++; break;
      case 'Terminated': counts.terminated++; break;
    }
    if ((r.ProbationaryStatus || 'Active') === 'Active' && r.Position) {
      byPosition[r.Position] = (byPosition[r.Position] || 0) + 1;
    }
  });
  var byPositionList = Object.keys(byPosition).map(function (p) { return { position: p, count: byPosition[p] }; });
  byPositionList.sort(function (a, b) { return b.count - a.count; });

  return ok_({
    statusCounts: counts,
    monthly: computeProbationMonthCounts_(rows),
    byPosition: byPositionList,
  });
}

function orientationSummary_() {
  var rows = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin'; });
  var monthly = computeProbationMonthCounts_(rows);
  var sentToHR = 0, notSentToHR = 0, completedAllMonths = 0, overdueOneYear = 0;
  var today = todayISO_();
  rows.forEach(function (r) {
    if (r.OrientSentHRDate) sentToHR++; else notSentToHR++;
    if (r.Orient1Date && r.Orient2Date && r.Orient3Date && r.Orient4Date) completedAllMonths++;
    if (r.HireDate && daysBetween_(r.HireDate, today) > 365 && !r.OrientSentHRDate) overdueOneYear++;
  });
  var checkedCounts = { m1: 0, m2: 0, m3: 0, m4: 0 };
  rows.forEach(function (r) {
    if (r.Orient1Date) checkedCounts.m1++;
    if (r.Orient2Date) checkedCounts.m2++;
    if (r.Orient3Date) checkedCounts.m3++;
    if (r.Orient4Date) checkedCounts.m4++;
  });
  return ok_({
    onProbation: monthly.total, totalStaff: rows.length, completedAllMonths: completedAllMonths,
    sentToHR: sentToHR, notSentToHR: notSentToHR, overdueOneYear: overdueOneYear, checkedCounts: checkedCounts,
  });
}

function monthOfEmployment_(hireDate) {
  if (!hireDate) return 0;
  var elapsed = Math.max(0, daysBetween_(hireDate, todayISO_()));
  return Math.floor(elapsed / 30) + 1;
}

/** แจ้งเตือนงานที่ต้องทำต่อเนื่อง หลัง Orientation Checklist 4 เดือนแรกผ่านไปแล้ว:
 *  - ส่ง Orientation Checklist ให้ HR: เดือนที่ 5-11 ของการทำงาน (ยังไม่ส่ง)
 *  - ดำเนินการ Apply Ladder Status: เดือนที่ 5, 8, 10 (ยังไม่ทำ/ยังเป็น NA) */
function dashboardReminders_() {
  var rows = getAll_('Staff').filter(function (r) {
    return r.Role !== 'Admin' && r.ProbationaryStatus !== 'Resign' && r.ProbationaryStatus !== 'Terminated';
  });
  var hrSendDue = [], ladderDue = [];
  rows.forEach(function (r) {
    var m = monthOfEmployment_(r.HireDate);
    if (m >= 5 && m <= 11 && !r.OrientSentHRDate) {
      hrSendDue.push({
        EmployeeID: r.EmployeeID, ThaiName: r.ThaiName, Month: m,
        Position: r.Position, CostCenterName: r.CostCenterName, HireDate: r.HireDate, ManagerName: r.ManagerName,
        Orient1Date: r.Orient1Date, Orient2Date: r.Orient2Date, Orient3Date: r.Orient3Date, Orient4Date: r.Orient4Date,
        OrientSentHRDate: r.OrientSentHRDate,
      });
    }
    if ((m === 5 || m === 8 || m === 10) && (!r.ApplyLadderStatus || r.ApplyLadderStatus === 'NA')) {
      ladderDue.push({
        EmployeeID: r.EmployeeID, ThaiName: r.ThaiName, Month: m, ApplyLadderStatus: r.ApplyLadderStatus || 'NA',
        Position: r.Position, CostCenterName: r.CostCenterName, HireDate: r.HireDate, ManagerName: r.ManagerName,
      });
    }
  });
  return ok_({ hrSendDue: hrSendDue, ladderDue: ladderDue, walkRoundDue: walkRoundDueList_() });
}

function orientationList_(ctx) {
  var q = ctx.query;
  var rows = getAll_('Staff').filter(function (r) { return r.Role !== 'Admin'; });
  if (q.status) rows = rows.filter(function (r) { return (r.ProbationaryStatus || 'Active') === q.status; });
  if (q.subServiceId) rows = rows.filter(function (r) { return r.SubServiceID === q.subServiceId; });
  if (q.costCenterId) rows = rows.filter(function (r) { return r.CostCenterID === q.costCenterId; });
  if (q.manager) rows = rows.filter(function (r) { return r.ManagerName === q.manager; });
  if (q.hrStatus === 'sent') rows = rows.filter(function (r) { return !!r.OrientSentHRDate; });
  if (q.hrStatus === 'pending') rows = rows.filter(function (r) { return !r.OrientSentHRDate; });
  if (q.search) {
    var s = String(q.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (r.EmployeeID || '').toLowerCase().indexOf(s) !== -1 || (r.ThaiName || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  return ok_(rows.map(sanitizeStaff_));
}
