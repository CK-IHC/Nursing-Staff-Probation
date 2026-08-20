/**
 * Utils.gs — ฟังก์ชันช่วยเหลือทั่วไป: response envelope, วันที่, สร้าง ID, HttpError
 * ใช้ร่วมกันทุกไฟล์ (Apps Script รวมทุกไฟล์เป็น scope เดียวกัน ไม่ต้อง import)
 */

// ---------- Response envelope ----------
function ok_(data, message) {
  return { success: true, data: data === undefined ? null : data, message: message || '' };
}

function fail_(message, code) {
  return { success: false, data: null, message: message, code: code || 'BAD_REQUEST' };
}

/** โยน error พร้อม code มาตรฐาน ให้ router ใน Code.gs จับแล้วแปลงเป็น fail_() */
function HttpError_(code, message) {
  var e = new Error(message);
  e.name = 'HttpError';
  e.code = code;
  return e;
}

// ---------- ID generator ----------
function genId_(prefix) {
  var time = Date.now().toString(36).toUpperCase();
  var rand = Math.floor(Math.random() * 1679616).toString(36).toUpperCase(); // 0-ZZZZ base36
  return prefix + '-' + time + rand;
}

// ---------- Date helpers (ISO yyyy-MM-dd, UTC ล้วนเพื่อความคงที่) ----------
function todayISO_() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
}

function addDays_(dateStr, days) {
  var d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(days));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function daysBetween_(fromStr, toStr) {
  var from = new Date(fromStr + 'T00:00:00Z').getTime();
  var to = new Date(toStr + 'T00:00:00Z').getTime();
  return Math.round((to - from) / 86400000);
}

function probationMonthNumber_(startDate, probationDays) {
  var elapsed = Math.max(0, daysBetween_(startDate, todayISO_()));
  var totalMonths = Math.max(1, Math.round(Number(probationDays) / 30));
  return Math.min(totalMonths, Math.floor(elapsed / 30) + 1);
}

/** นับจำนวนพนักงานที่ยังอยู่ระหว่างทดลองงาน (ProbationaryStatus=Active) แบ่งตามช่วงเดือน M1(0-30d) M2(31-60d) M3(61-90d) M4(91-119d+) */
function computeProbationMonthCounts_(staffRows) {
  var today = todayISO_();
  var counts = { m1: 0, m2: 0, m3: 0, m4: 0, total: 0 };
  staffRows.forEach(function (r) {
    if (r.ProbationaryStatus !== 'Active' || !r.HireDate) return;
    var elapsed = daysBetween_(r.HireDate, today);
    counts.total++;
    if (elapsed <= 30) counts.m1++;
    else if (elapsed <= 60) counts.m2++;
    else if (elapsed <= 90) counts.m3++;
    else counts.m4++;
  });
  return counts;
}

// ---------- Base64url (สำหรับ session token) ----------
function base64UrlEncode_(bytesOrStr) {
  var bytes = typeof bytesOrStr === 'string' ? Utilities.newBlob(bytesOrStr).getBytes() : bytesOrStr;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function base64UrlDecodeToString_(str) {
  var padded = str + new Array((4 - (str.length % 4)) % 4 + 1).join('=');
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}
