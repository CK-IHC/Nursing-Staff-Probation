import { api } from '../api.js';
import { cache } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH, exportCsv, printIsolated } from '../utils.js';

const STATUS_BADGE = { Draft: 'badge-gray', Active: 'badge-green', Closed: 'badge-red' };
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}
function daysBetween(a, b) {
  return Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
}
// ระยะเวลาทำงาน (Years of Service) เป็นทศนิยม — ใช้กรองตัวกรอง YOS ในหน้ารายงาน
function yearsOfService(hireDate) {
  if (!hireDate) return null;
  const hire = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hire.getTime())) return null;
  return (Date.now() - hire.getTime()) / (365.25 * 86400000);
}
function scoreColorClass(v) {
  if (v === null || v === undefined) return '';
  if (v >= 4) return 'score-good';
  if (v >= 3) return 'score-mid';
  return 'score-low';
}
// หา 2 เดือนล่าสุดที่มีข้อมูล (N>0) ไว้เทียบผลต่าง (Diff) — ถ้ามีข้อมูลไม่ถึง 2 เดือนคืน null (ไม่แสดงคอลัมน์)
function lastTwoMonthIdx(monthCounts) {
  const withData = monthCounts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i !== -1);
  if (withData.length < 2) return null;
  return [withData[withData.length - 2], withData[withData.length - 1]];
}
function diffOf(monthAvgs, idx) {
  if (!idx) return null;
  const [a, b] = idx;
  if (monthAvgs[a] === null || monthAvgs[b] === null) return null;
  return Math.round((monthAvgs[b] - monthAvgs[a]) * 100) / 100;
}
// แสดงค่าเดือนก่อนหน้า -> เดือนปัจจุบัน พร้อมผลต่าง (Δ) ในเซลล์เดียว ให้เห็นทั้งค่าจริงสองเดือนไม่ใช่แค่ตัวเลขผลต่าง
function diffCell(monthAvgs, diffIdx) {
  if (!diffIdx) return '<td>—</td>';
  const [a, b] = diffIdx;
  const prevVal = monthAvgs[a], currVal = monthAvgs[b];
  if (prevVal === null || prevVal === undefined || currVal === null || currVal === undefined) return '<td>—</td>';
  const v = Math.round((currVal - prevVal) * 100) / 100;
  const cls = v > 0 ? 'diff-pos' : v < 0 ? 'diff-neg' : '';
  return `<td class="${cls}">${prevVal.toFixed(2)} → ${currVal.toFixed(2)} (${v > 0 ? '+' : ''}${v.toFixed(2)})</td>`;
}
// ตาราง label/value แนวตั้ง — ใช้ทุกจุดที่พิมพ์รายงาน "1 รายการที่เลือก" (pivot/individual/byUser)
function verticalFieldsHtml(fields) {
  return `<table class="data-table vertical-fields"><tbody>${fields.map(([l, v]) => `<tr><th>${l}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
}
// ผูก checkbox รายแถว + select-all + ป้ายจำนวนที่เลือก + ปุ่ม Print Selection เข้าด้วยกัน — ใช้ร่วมกันทั้ง 3 แท็บของรายงาน
function wireSelectionUi(pane, checkboxSelector, selectAllId, countEl, printBtn, labelFn) {
  const selectAll = pane.querySelector(`#${selectAllId}`);
  function update() {
    const all = pane.querySelectorAll(checkboxSelector);
    const checked = pane.querySelectorAll(`${checkboxSelector}:checked`).length;
    countEl.textContent = labelFn(checked);
    printBtn.disabled = checked === 0;
    selectAll.checked = all.length > 0 && checked === all.length;
  }
  pane.querySelectorAll(checkboxSelector).forEach((cb) => cb.addEventListener('change', update));
  selectAll.addEventListener('change', (e) => {
    pane.querySelectorAll(checkboxSelector).forEach((cb) => { cb.checked = e.target.checked; });
    update();
  });
  update();
}
// คำถามปลายเปิด (Type=text): จัดกลุ่มคำตอบตามข้อคำถาม (ไม่แสดง Employee ID/ชื่อ/วันที่ตอบ) ใช้แสดงด้านล่างสุดของทั้ง 3 แท็บรายงาน
function buildTextAnswers(questions, responses) {
  const textQ = questions.filter((q) => q.Type === 'text').sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  const groups = textQ.map((q) => ({ question: q.QuestionText, answers: [] }));
  responses.forEach((r) => {
    let answers = {};
    try { answers = JSON.parse(r.Answers_JSON || '{}'); } catch { /* ignore */ }
    textQ.forEach((q, qi) => {
      const ans = answers[q.QuestionID];
      if (ans !== undefined && ans !== null && String(ans).trim() !== '') groups[qi].answers.push(String(ans));
    });
  });
  return { textQ, groups };
}
function textAnswersHtml(textAnswers) {
  const { textQ, groups } = textAnswers;
  if (!textQ.length) return '';
  const body = groups.map((g) => `
    <div style="margin-top:12px;">
      <div style="font-weight:700;">${escapeHtml(g.question)}</div>
      ${g.answers.length
        ? `<ul style="margin:6px 0 0 20px; padding:0;">${g.answers.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
        : '<div class="empty-state">ไม่มีคำตอบ</div>'}
    </div>`).join('');
  return `<div class="section-title" style="margin-top:18px;">คำถามปลายเปิด</div>${body}`;
}

// สรุปคะแนนรายคำถามแยกตามเดือน (Jan-Dec ของปีที่เลือก) จัดกลุ่มตามหมวด (Topic) — ใช้ ScoreMap ของแต่ละคำถามแปลงคำตอบเป็นคะแนน
function buildPivot(questions, responses, year) {
  const ratingQ = questions.filter((q) => q.Type === 'rating' || q.Type === 'single')
    .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  const inYear = responses.filter((r) => (r.SubmitDate || '').slice(0, 4) === year);
  const monthCounts = MONTH_LABELS.map((_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    return inYear.filter((r) => r.SubmitDate.slice(5, 7) === mm).length;
  });
  const rows = ratingQ.map((q) => {
    let scoreMap = {};
    try { scoreMap = JSON.parse(q.ScoreMap_JSON || '{}'); } catch { /* ignore */ }
    const byMonth = MONTH_LABELS.map(() => []);
    inYear.forEach((r) => {
      let answers = {};
      try { answers = JSON.parse(r.Answers_JSON || '{}'); } catch { /* ignore */ }
      const ans = answers[q.QuestionID];
      const score = scoreMap[ans];
      if (score !== undefined) {
        const mIdx = Number(r.SubmitDate.slice(5, 7)) - 1;
        if (mIdx >= 0 && mIdx < 12) byMonth[mIdx].push(score);
      }
    });
    const monthAvgs = byMonth.map((arr) => average(arr));
    const allScores = byMonth.flat();
    return { topic: q.Topic || 'ทั่วไป', text: q.QuestionText, monthAvgs, ytd: average(allScores) };
  });
  const diffIdx = lastTwoMonthIdx(monthCounts);
  rows.forEach((r) => { r.diff = diffOf(r.monthAvgs, diffIdx); });
  const topicOrder = [];
  const byTopic = {};
  rows.forEach((r) => {
    if (!byTopic[r.topic]) { byTopic[r.topic] = []; topicOrder.push(r.topic); }
    byTopic[r.topic].push(r);
  });
  const topics = topicOrder.map((topic) => {
    const items = byTopic[topic];
    const monthAvgs = MONTH_LABELS.map((_, i) => average(items.map((it) => it.monthAvgs[i]).filter((v) => v !== null)));
    const ytd = average(items.map((it) => it.ytd).filter((v) => v !== null));
    const diff = diffOf(monthAvgs, diffIdx);
    return { topic, items, monthAvgs, ytd, diff };
  });
  const overallMonthAvgs = MONTH_LABELS.map((_, i) => average(rows.map((r) => r.monthAvgs[i]).filter((v) => v !== null)));
  const overallYtd = average(rows.map((r) => r.ytd).filter((v) => v !== null));
  const overallDiff = diffOf(overallMonthAvgs, diffIdx);
  const diffLabel = diffIdx ? `${MONTH_LABELS[diffIdx[0]]}-${MONTH_LABELS[diffIdx[1]]} ${year.slice(2)}` : '';
  return { topics, monthCounts, overallMonthAvgs, overallYtd, overallDiff, diffLabel, diffIdx };
}

// pivot.topics[].items[] แต่ละข้อคำถาม (leaf) เลือกได้ด้วย checkbox — แถวหมวด (category)/N=/AVERAGE ไม่ใช่แถวที่เลือกได้
function pivotTableHtml(pivot) {
  const cell = (v) => `<td class="${scoreColorClass(v)}">${v === null || v === undefined ? '—' : v.toFixed(2)}</td>`;
  let no = 0;
  const topicRows = pivot.topics.map((t, ti) => {
    no++;
    const catRow = `<tr class="pivot-cat-row" data-nosort><td></td><td>${no}</td><td colspan="2">${escapeHtml(t.topic)}</td>${t.monthAvgs.map(cell).join('')}${diffCell(t.monthAvgs, pivot.diffIdx)}${cell(t.ytd)}</tr>`;
    const subRows = t.items.map((it, ii) => `<tr><td><input type="checkbox" class="pv-select" data-pid="${ti}-${ii}" /></td><td></td><td>${no}.${ii + 1}</td><td>${escapeHtml(it.text)}</td>${it.monthAvgs.map(cell).join('')}${diffCell(it.monthAvgs, pivot.diffIdx)}${cell(it.ytd)}</tr>`).join('');
    return catRow + subRows;
  }).join('');
  return `<div class="table-wrap"><table class="data-table pivot-table">
    <thead><tr><th><input type="checkbox" id="pv-select-all" /></th><th>No.</th><th colspan="2">ข้อคำถามประเมิน</th>${MONTH_LABELS.map((m) => `<th>${m}</th>`).join('')}<th>Diff${pivot.diffLabel ? `<br><small>${escapeHtml(pivot.diffLabel)}</small>` : ''}</th><th>YTD</th></tr></thead>
    <tbody>
      ${topicRows}
      <tr class="pivot-n-row" data-nosort><td></td><td></td><td colspan="2">Total</td>${pivot.monthCounts.map((n) => `<td>${n || ''}</td>`).join('')}<td></td><td></td></tr>
      <tr class="pivot-avg-row" data-nosort><td></td><td></td><td colspan="2">AVERAGE SCORE</td>${pivot.overallMonthAvgs.map(cell).join('')}${diffCell(pivot.overallMonthAvgs, pivot.diffIdx)}${cell(pivot.overallYtd)}</tr>
    </tbody>
  </table></div>`;
}

// แถวเดียวที่เลือก -> พิมพ์แนวตั้ง (label/value) / เลือกหลายแถว -> พิมพ์เป็นตารางแนวนอนเหมือนตารางหลัก
function pivotItemVerticalHtml(item, diffLabel, diffIdx) {
  const fmt = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));
  const prevVal = diffIdx ? item.monthAvgs[diffIdx[0]] : null;
  const currVal = diffIdx ? item.monthAvgs[diffIdx[1]] : null;
  const diffText = prevVal === null || prevVal === undefined || currVal === null || currVal === undefined
    ? '—' : `${fmt(prevVal)} → ${fmt(currVal)} (${item.diff > 0 ? '+' : ''}${item.diff.toFixed(2)})`;
  const fields = [
    ['หัวข้อ (Topic)', escapeHtml(item.topic)],
    ['ข้อคำถาม', escapeHtml(item.text)],
    ...MONTH_LABELS.map((m, i) => [m, fmt(item.monthAvgs[i])]),
    [`Diff${diffLabel ? ` (${diffLabel})` : ''}`, diffText],
    ['YTD', fmt(item.ytd)],
  ];
  return verticalFieldsHtml(fields);
}
function pivotItemsHorizontalHtml(items, diffLabel, diffIdx) {
  const cell = (v) => `<td class="${scoreColorClass(v)}">${v === null || v === undefined ? '—' : v.toFixed(2)}</td>`;
  const body = items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(it.topic)}</td><td>${escapeHtml(it.text)}</td>${it.monthAvgs.map(cell).join('')}${diffCell(it.monthAvgs, diffIdx)}${cell(it.ytd)}</tr>`).join('');
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>No.</th><th>หัวข้อ</th><th>ข้อคำถาม</th>${MONTH_LABELS.map((m) => `<th>${m}</th>`).join('')}<th>Diff${diffLabel ? `<br><small>${escapeHtml(diffLabel)}</small>` : ''}</th><th>YTD</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

// ตารางวิเคราะห์รายข้อ-รายบุคคล: 1 แถวต่อ 1 การตอบ, 1 คอลัมน์ต่อ 1 คำถาม (rating/single) — ดูคำตอบดิบของแต่ละคนแต่ละข้อ
// เสริมจาก pivot (สรุปรวมรายเดือน) ให้เห็นระดับรายบุคคลด้วย ตามที่ pivot อย่างเดียวไม่ตอบโจทย์ + คอลัมน์ Average เฉลี่ยคะแนนทุกข้อของแต่ละแถว
function buildIndividualMatrix(questions, responses, staffById) {
  const ratingQ = questions.filter((q) => q.Type === 'rating' || q.Type === 'single')
    .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  const scoreMaps = ratingQ.map((q) => { try { return JSON.parse(q.ScoreMap_JSON || '{}'); } catch { return {}; } });
  const rows = responses.map((r) => {
    let answers = {};
    try { answers = JSON.parse(r.Answers_JSON || '{}'); } catch { /* ignore */ }
    const staff = staffById[r.RespondentID];
    const rawAnswers = ratingQ.map((q) => answers[q.QuestionID] ?? '—');
    const scores = ratingQ.map((q, i) => {
      const sc = scoreMaps[i][answers[q.QuestionID]];
      return sc === undefined ? null : Number(sc);
    });
    return {
      EmployeeID: r.RespondentID, ThaiName: staff?.ThaiName || '—', CostCenterName: staff?.CostCenterName || '—',
      SubmitDate: r.SubmitDate, answers: rawAnswers, avg: average(scores.filter((v) => v !== null)),
    };
  }).sort((a, b) => (b.SubmitDate || '').localeCompare(a.SubmitDate || ''));
  return { ratingQ, rows };
}

function individualMatrixHtml(matrix) {
  const { ratingQ, rows } = matrix;
  const body = rows.map((r, i) => `
    <tr>
      <td><input type="checkbox" class="iv-select" data-idx="${i}" /></td>
      <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>${escapeHtml(r.CostCenterName)}</td>
      <td>${r.SubmitDate ? formatDateTH(r.SubmitDate.slice(0, 10)) : '—'}</td>
      ${r.answers.map((a) => `<td>${escapeHtml(String(a))}</td>`).join('')}
      <td class="${scoreColorClass(r.avg)}">${r.avg ?? '—'}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th><input type="checkbox" id="iv-select-all" /></th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>วันที่ตอบ</th>
      ${ratingQ.map((q, i) => `<th title="${escapeHtml(q.QuestionText)}">ข้อ ${i + 1}</th>`).join('')}<th>Average</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${6 + ratingQ.length}" class="empty-state">ไม่มีข้อมูล</td></tr>`}</tbody>
  </table></div>
  <div class="table-wrap" style="margin-top:10px;"><table class="data-table">
    <thead><tr><th>ข้อ</th><th>ข้อคำถาม</th></tr></thead>
    <tbody>${ratingQ.map((q, i) => `<tr><td>ข้อ ${i + 1}</td><td>${escapeHtml(q.QuestionText)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">ไม่มีข้อมูล</td></tr>'}</tbody>
  </table></div>`;
}

// แถวเดียวที่เลือก -> พิมพ์แนวตั้ง / เลือกหลายแถว -> พิมพ์เป็นตารางแนวนอน (ตัดตารางอ้างอิงข้อคำถามออกตอนพิมพ์เฉพาะที่เลือก)
function individualRowsHtml(matrix, selectedRows) {
  const { ratingQ } = matrix;
  if (selectedRows.length === 1) {
    const r = selectedRows[0];
    const fields = [
      ['Employee ID', escapeHtml(r.EmployeeID)], ['ชื่อ-นามสกุล', escapeHtml(r.ThaiName)], ['หน่วยงาน', escapeHtml(r.CostCenterName)],
      ['วันที่ตอบ', r.SubmitDate ? formatDateTH(r.SubmitDate.slice(0, 10)) : '—'],
      ...ratingQ.map((q, i) => [q.QuestionText, escapeHtml(String(r.answers[i]))]),
      ['Average', r.avg ?? '—'],
    ];
    return verticalFieldsHtml(fields);
  }
  const body = selectedRows.map((r) => `
    <tr>
      <td>${escapeHtml(r.EmployeeID)}</td><td>${escapeHtml(r.ThaiName)}</td><td>${escapeHtml(r.CostCenterName)}</td>
      <td>${r.SubmitDate ? formatDateTH(r.SubmitDate.slice(0, 10)) : '—'}</td>
      ${r.answers.map((a) => `<td>${escapeHtml(String(a))}</td>`).join('')}
      <td class="${scoreColorClass(r.avg)}">${r.avg ?? '—'}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>วันที่ตอบ</th>
      ${ratingQ.map((q, i) => `<th title="${escapeHtml(q.QuestionText)}">ข้อ ${i + 1}</th>`).join('')}<th>Average</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function individualMatrixExportRows(matrix) {
  const { ratingQ, rows } = matrix;
  return rows.map((r) => {
    const row = { EmployeeID: r.EmployeeID, 'ชื่อ-นามสกุล': r.ThaiName, หน่วยงาน: r.CostCenterName, วันที่ตอบ: r.SubmitDate || '' };
    ratingQ.forEach((q, i) => { row[`ข้อ ${i + 1}: ${q.QuestionText}`] = r.answers[i]; });
    row.Average = r.avg ?? '';
    return row;
  });
}

function pivotExportRows(pivot) {
  const rows = [];
  const diffKey = pivot.diffLabel ? `Diff (${pivot.diffLabel})` : 'Diff';
  pivot.topics.forEach((t, ti) => {
    const catRow = { 'No.': ti + 1, 'ข้อคำถามประเมิน': t.topic };
    MONTH_LABELS.forEach((m, i) => { catRow[m] = t.monthAvgs[i] ?? ''; });
    catRow[diffKey] = t.diff ?? '';
    catRow.YTD = t.ytd ?? '';
    rows.push(catRow);
    t.items.forEach((it, i) => {
      const r = { 'No.': `${ti + 1}.${i + 1}`, 'ข้อคำถามประเมิน': it.text };
      MONTH_LABELS.forEach((m, mi) => { r[m] = it.monthAvgs[mi] ?? ''; });
      r[diffKey] = it.diff ?? '';
      r.YTD = it.ytd ?? '';
      rows.push(r);
    });
  });
  return rows;
}

// question = null สำหรับเพิ่มคำถามใหม่, หรือ object คำถามเดิมสำหรับแก้ไข (ดึงค่าเดิมมาเติมให้ในฟอร์ม)
function questionForm(qid, question, onSaved, existingTopics, prefillTopic) {
  const isEdit = !!question;
  let existingOptions = [];
  let existingScoreMap = {};
  if (isEdit) {
    try { existingOptions = JSON.parse(question.Options_JSON || '[]'); } catch { /* ignore */ }
    try { existingScoreMap = JSON.parse(question.ScoreMap_JSON || '{}'); } catch { /* ignore */ }
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="q-form">
      <div class="field field-full"><label>คำถาม</label><input id="q-text" value="${escapeHtml(question?.QuestionText || '')}" required /></div>
      <div class="form-grid">
        <div class="field"><label>หมวดหมู่ / Section</label>
          <input id="q-topic" list="q-topic-list" placeholder="เช่น สภาพแวดล้อมการทำงาน" value="${escapeHtml(question?.Topic || prefillTopic || '')}" />
          <datalist id="q-topic-list">${(existingTopics || []).map((t) => `<option value="${escapeHtml(t)}"></option>`).join('')}</datalist>
        </div>
        <div class="field"><label>ประเภทคำถาม</label>
          <select id="q-type">
            <option value="rating" ${question?.Type === 'rating' ? 'selected' : ''}>Rating (ให้คะแนน)</option>
            <option value="single" ${question?.Type === 'single' ? 'selected' : ''}>Multiple Choice (เลือกเดียว)</option>
            <option value="multi" ${question?.Type === 'multi' ? 'selected' : ''}>Multiple Choice (เลือกได้หลายข้อ)</option>
            <option value="text" ${question?.Type === 'text' ? 'selected' : ''}>คำถามปลายเปิด (ข้อความ)</option>
          </select>
        </div>
        <div class="field"><label>บังคับตอบ</label>
          <select id="q-required">
            <option value="true" ${!isEdit || question?.Required === 'TRUE' ? 'selected' : ''}>ใช่ (บังคับ)</option>
            <option value="false" ${isEdit && question?.Required !== 'TRUE' ? 'selected' : ''}>ไม่ใช่ (ไม่บังคับ)</option>
          </select>
        </div>
      </div>
      <div id="q-options-wrap"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="q-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกคำถาม</button>
      </div>
    </form>`;
  const body = openModal(isEdit ? 'แก้ไขคำถาม' : 'เพิ่มคำถาม', wrap, { wide: true });

  function renderOptionsEditor() {
    const type = body.querySelector('#q-type').value;
    const optWrap = body.querySelector('#q-options-wrap');
    if (type === 'text') {
      optWrap.innerHTML = '';
      return;
    }
    optWrap.innerHTML = `
      <div class="section-title" style="margin-top:14px;">ตัวเลือก + คะแนน (ScoreMap)</div>
      <div id="option-rows"></div>
      <button type="button" id="add-option-row" class="btn btn-ghost btn-sm">+ เพิ่มตัวเลือก</button>`;
    const rows = optWrap.querySelector('#option-rows');
    if (isEdit && existingOptions.length && type === question.Type) {
      existingOptions.forEach((label) => addOptionRow(rows, label, existingScoreMap[label] ?? 0));
    } else {
      const defaults = type === 'rating'
        ? [['มากที่สุด', 5], ['มาก', 4], ['ปานกลาง', 3], ['น้อย', 2], ['น้อยที่สุด', 1]]
        : [['ตัวเลือกที่ 1', 1], ['ตัวเลือกที่ 2', 0]];
      defaults.forEach(([label, score]) => addOptionRow(rows, label, score));
    }
    optWrap.querySelector('#add-option-row').addEventListener('click', () => addOptionRow(rows, '', 0));
  }

  function addOptionRow(rows, label, score) {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `<input class="opt-label" placeholder="ข้อความตัวเลือก" value="${escapeHtml(label)}" style="flex:2; padding:6px 8px; border:1px solid var(--line); border-radius:6px;" />
      <input class="opt-score" type="number" placeholder="คะแนน" value="${score}" style="width:80px; padding:6px 8px; border:1px solid var(--line); border-radius:6px;" />
      <button type="button" class="btn btn-ghost btn-sm remove-opt">ลบ</button>`;
    row.querySelector('.remove-opt').addEventListener('click', () => row.remove());
    rows.appendChild(row);
  }

  body.querySelector('#q-type').addEventListener('change', renderOptionsEditor);
  renderOptionsEditor();
  body.querySelector('#q-cancel').addEventListener('click', closeModal);

  body.querySelector('#q-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = body.querySelector('#q-type').value;
    const options = [];
    const scoreMap = {};
    body.querySelectorAll('.option-row').forEach((row) => {
      const label = row.querySelector('.opt-label').value.trim();
      const score = Number(row.querySelector('.opt-score').value || 0);
      if (label) {
        options.push(label);
        scoreMap[label] = score;
      }
    });
    const payload = {
      QuestionText: body.querySelector('#q-text').value.trim(),
      Type: type,
      Topic: body.querySelector('#q-topic').value.trim(),
      options,
      scoreMap,
      Required: body.querySelector('#q-required').value === 'true' ? 'TRUE' : 'FALSE',
    };
    try {
      await withLoading(() => (isEdit
        ? api.put(`/api/surveys/questions/${question.QuestionID}`, payload)
        : api.post(`/api/surveys/${qid}/questions`, payload)));
      toastSuccess(isEdit ? 'บันทึกการแก้ไขสำเร็จ' : 'เพิ่มคำถามสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) { toastError(err.message); }
  });
}

const ROUND_LABELS = ['เดือนที่ 1 (0-30 วัน)', 'เดือนที่ 2 (31-60 วัน)', 'เดือนที่ 3 (61-90 วัน)', 'เดือนที่ 4 (91-120 วัน)'];

// รอบที่ 0-3 (=รอบ 1-4) ตามจำนวนวันที่ทำงานแล้ว ณ วันที่ตอบแบบสอบถาม — null ถ้าไม่มี HireDate หรือเกิน 120 วัน
function roundIndexOf(hireDate, submitDate) {
  if (!hireDate || !submitDate) return null;
  const elapsed = daysBetween(submitDate.slice(0, 10), hireDate);
  if (elapsed < 0) return null;
  if (elapsed <= 30) return 0;
  if (elapsed <= 60) return 1;
  if (elapsed <= 90) return 2;
  if (elapsed <= 120) return 3;
  return null;
}

async function renderReportTab(pane, qid, questions, qnTitle) {
  pane.innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  const [responses, allStaff] = await Promise.all([
    api.get(`/api/responses/questionnaire/${qid}`),
    api.get('/api/staff'),
  ]);
  const staffById = Object.fromEntries(allStaff.map((s) => [s.EmployeeID, s]));
  const years = [...new Set(responses.map((r) => (r.SubmitDate || '').slice(0, 4)))].sort().reverse();
  const currentYear = String(new Date().getFullYear());
  const defaultYear = years.includes(currentYear) ? currentYear : (years[0] || currentYear);
  const positions = [...new Set(allStaff.map((s) => s.Position).filter(Boolean))].sort();

  pane.innerHTML = `
    <div class="tabs" id="rep-subtabs">
      <button type="button" class="tab-btn active" data-rtab="pivot">สรุปตามหัวข้อคำถาม (รายเดือน)</button>
      <button type="button" class="tab-btn" data-rtab="individual">วิเคราะห์รายข้อ-รายบุคคล</button>
      <button type="button" class="tab-btn" data-rtab="byuser">Report by User</button>
    </div>
    <div class="toolbar" id="rep-filters">
      <input type="text" id="rf-search" placeholder="ค้นหา ID/ชื่อ" style="max-width:180px; padding:6px 10px; border:1px solid var(--line); border-radius:8px;" />
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">เริ่มงานตั้งแต่<input type="date" id="rf-hire-from" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">ถึง<input type="date" id="rf-hire-to" style="padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /></label>
      <select id="rf-position"><option value="">ทุกตำแหน่ง</option>${positions.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}</select>
      <select id="rf-cc"><option value="">ทุก Cost Center</option>${cache.costCenters.map((c) => `<option value="${c.CostCenterID}">${escapeHtml(c.Name)}</option>`).join('')}</select>
      <select id="rf-ss"><option value="">ทุก Sub Services</option>${cache.subServices.map((s) => `<option value="${s.SubServiceID}">${escapeHtml(s.Name)}</option>`).join('')}</select>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">YOS ตั้งแต่<input type="number" id="rf-yos-min" min="0" step="0.1" style="width:64px; padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /> ปี</label>
      <label style="font-size:13px; color:var(--muted); display:flex; align-items:center; gap:4px;">ถึง<input type="number" id="rf-yos-max" min="0" step="0.1" style="width:64px; padding:6px 8px; border:1px solid var(--line); border-radius:8px;" /> ปี</label>
      <button id="rf-reset" class="btn btn-ghost btn-sm">Reset ตัวกรอง</button>
    </div>
    <div class="tab-pane" data-rpane="pivot">
      <div class="toolbar">
        <label style="font-size:13.5px; font-weight:600; color:var(--muted);">ปี</label>
        <select id="rep-year">${years.length ? years.map((y) => `<option value="${y}" ${y === defaultYear ? 'selected' : ''}>${y}</option>`).join('') : `<option value="${defaultYear}">${defaultYear}</option>`}</select>
        <span class="spacer"></span>
        <button id="rep-pivot-export" class="btn btn-secondary btn-sm">Export Excel</button>
        <button id="rep-pivot-print" class="btn btn-primary btn-sm">Print Report</button>
      </div>
      <div class="toolbar">
        <span id="pv-selected-count" style="font-size:13px; color:var(--muted);">ยังไม่ได้เลือกข้อคำถาม</span>
        <span class="spacer"></span>
        <button id="pv-print-selected" class="btn btn-secondary btn-sm" disabled>Print Selection</button>
      </div>
      <div id="rep-pivot-box"></div>
      <div id="rep-pivot-text-box"></div>
    </div>
    <div class="tab-pane hidden" data-rpane="individual">
      <div class="toolbar"><span style="font-size:13px; color:var(--muted);">คำตอบดิบของแต่ละคนแต่ละข้อ (rating/single) พร้อมคะแนนเฉลี่ยต่อคน (Average) — ดูควบคู่กับตารางสรุปรายเดือนด้านบน</span><span class="spacer"></span>
        <button id="rep-individual-export" class="btn btn-secondary btn-sm">Export Excel</button>
        <button id="rep-individual-print" class="btn btn-primary btn-sm">Print Report</button>
      </div>
      <div class="toolbar">
        <span id="iv-selected-count" style="font-size:13px; color:var(--muted);">ยังไม่ได้เลือกรายการ</span>
        <span class="spacer"></span>
        <button id="iv-print-selected" class="btn btn-secondary btn-sm" disabled>Print Selection</button>
      </div>
      <div id="rep-individual-box"></div>
      <div id="rep-individual-text-box"></div>
    </div>
    <div class="tab-pane hidden" data-rpane="byuser">
      <div class="toolbar"><span class="spacer"></span>
        <button id="rep-user-export" class="btn btn-secondary btn-sm">Export Excel</button>
        <button id="rep-user-print" class="btn btn-primary btn-sm">Print Report</button>
      </div>
      <div class="toolbar">
        <span id="bu-selected-count" style="font-size:13px; color:var(--muted);">ยังไม่ได้เลือกพนักงาน</span>
        <span class="spacer"></span>
        <button id="bu-print-selected" class="btn btn-secondary btn-sm" disabled>Print Selection</button>
      </div>
      <div id="rep-user-box"></div>
      <div id="rep-user-text-box"></div>
    </div>`;

  // ตัวกรองร่วม (ตำแหน่ง/Cost Center/Sub Services/วันเริ่มงาน/YOS) ใช้ร่วมกันทั้ง 3 แท็บ — กรองจากข้อมูลพนักงานของผู้ตอบแต่ละคน
  function filteredResponses() {
    const search = pane.querySelector('#rf-search').value.trim().toLowerCase();
    const hireFrom = pane.querySelector('#rf-hire-from').value;
    const hireTo = pane.querySelector('#rf-hire-to').value;
    const position = pane.querySelector('#rf-position').value;
    const cc = pane.querySelector('#rf-cc').value;
    const ss = pane.querySelector('#rf-ss').value;
    const yosMin = pane.querySelector('#rf-yos-min').value;
    const yosMax = pane.querySelector('#rf-yos-max').value;
    if (!search && !hireFrom && !hireTo && !position && !cc && !ss && !yosMin && !yosMax) return responses;
    return responses.filter((r) => {
      const staff = staffById[r.RespondentID];
      if (!staff) return false;
      if (search && !`${r.RespondentID} ${staff.ThaiName || ''}`.toLowerCase().includes(search)) return false;
      if (hireFrom && (!staff.HireDate || staff.HireDate < hireFrom)) return false;
      if (hireTo && (!staff.HireDate || staff.HireDate > hireTo)) return false;
      if (position && staff.Position !== position) return false;
      if (cc && staff.CostCenterID !== cc) return false;
      if (ss && staff.SubServiceID !== ss) return false;
      const yos = yearsOfService(staff.HireDate);
      if (yosMin && (yos === null || yos < Number(yosMin))) return false;
      if (yosMax && (yos === null || yos > Number(yosMax))) return false;
      return true;
    });
  }

  // Report by User: ผลตอบแบบสอบถามแยกตามรอบ 1-4 (ตามอายุงาน ณ วันที่ตอบ) ของแต่ละคน + Total Average (เฉลี่ยของรอบที่มีข้อมูล)
  function byUserRows() {
    const byUser = {};
    filteredResponses().forEach((r) => {
      if (!byUser[r.RespondentID]) byUser[r.RespondentID] = [];
      byUser[r.RespondentID].push(r);
    });
    return Object.keys(byUser).map((empId) => {
      const rows = byUser[empId];
      const staff = staffById[empId];
      const roundScores = [[], [], [], []];
      rows.forEach((r) => {
        const idx = roundIndexOf(staff?.HireDate, r.SubmitDate);
        if (idx !== null) roundScores[idx].push(Number(r.AvgScore || 0));
      });
      const roundAvgs = roundScores.map((arr) => average(arr));
      const last = rows.map((r) => r.SubmitDate).sort().slice(-1)[0];
      return {
        EmployeeID: empId, ThaiName: staff?.ThaiName || '—', CostCenterName: staff?.CostCenterName || '—',
        count: rows.length, roundAvgs, totalAvg: average(roundAvgs.filter((v) => v !== null)), last,
      };
    }).sort((a, b) => b.count - a.count);
  }
  function byUserHtml(rows) {
    const cell = (v) => `<td class="${scoreColorClass(v)}">${v === null || v === undefined ? '—' : v}</td>`;
    const body = rows.map((u) => `
      <tr>
        <td><input type="checkbox" class="bu-select" data-id="${escapeHtml(u.EmployeeID)}" /></td>
        <td>${escapeHtml(u.EmployeeID)}</td><td>${escapeHtml(u.ThaiName)}</td><td>${escapeHtml(u.CostCenterName)}</td>
        ${u.roundAvgs.map(cell).join('')}${cell(u.totalAvg)}
        <td>${u.count}</td><td>${u.last ? formatDateTH(u.last.slice(0, 10)) : '—'}</td>
      </tr>`).join('');
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th><input type="checkbox" id="bu-select-all" /></th><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th>${ROUND_LABELS.map((l) => `<th>${l}</th>`).join('')}<th>Total Average</th><th>จำนวนครั้งที่ตอบ</th><th>ตอบล่าสุด</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${7 + ROUND_LABELS.length}" class="empty-state">ไม่มีข้อมูล</td></tr>`}</tbody>
    </table></div>`;
  }
  // ตารางแนวนอนสำหรับพิมพ์เฉพาะที่เลือก (หลายคน) — เวอร์ชัน "สะอาด" ไม่มี checkbox/ไอดีที่ชนกับตารางจริงบนหน้าจอ
  function byUserRowsHtml(rows) {
    const cell = (v) => `<td class="${scoreColorClass(v)}">${v === null || v === undefined ? '—' : v}</td>`;
    const body = rows.map((u) => `
      <tr>
        <td>${escapeHtml(u.EmployeeID)}</td><td>${escapeHtml(u.ThaiName)}</td><td>${escapeHtml(u.CostCenterName)}</td>
        ${u.roundAvgs.map(cell).join('')}${cell(u.totalAvg)}
        <td>${u.count}</td><td>${u.last ? formatDateTH(u.last.slice(0, 10)) : '—'}</td>
      </tr>`).join('');
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th>${ROUND_LABELS.map((l) => `<th>${l}</th>`).join('')}<th>Total Average</th><th>จำนวนครั้งที่ตอบ</th><th>ตอบล่าสุด</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${7 + ROUND_LABELS.length}" class="empty-state">ไม่มีข้อมูล</td></tr>`}</tbody>
    </table></div>`;
  }
  // คนเดียวที่เลือก -> พิมพ์แนวตั้ง / เลือกหลายคน -> พิมพ์เป็นตารางแนวนอน (renderer สะอาด ไม่มี checkbox)
  function byUserPersonHtml(selectedRows) {
    if (selectedRows.length === 1) {
      const u = selectedRows[0];
      const fields = [
        ['Employee ID', escapeHtml(u.EmployeeID)], ['ชื่อ-นามสกุล', escapeHtml(u.ThaiName)], ['หน่วยงาน', escapeHtml(u.CostCenterName)],
        ...ROUND_LABELS.map((l, i) => [l, u.roundAvgs[i] ?? '—']),
        ['Total Average', u.totalAvg ?? '—'], ['จำนวนครั้งที่ตอบ', u.count],
        ['ตอบล่าสุด', u.last ? formatDateTH(u.last.slice(0, 10)) : '—'],
      ];
      return verticalFieldsHtml(fields);
    }
    return byUserRowsHtml(selectedRows);
  }
  function byUserExportRows(rows) {
    return rows.map((u) => {
      const row = { EmployeeID: u.EmployeeID, 'ชื่อ-นามสกุล': u.ThaiName, หน่วยงาน: u.CostCenterName };
      ROUND_LABELS.forEach((l, i) => { row[l] = u.roundAvgs[i] ?? ''; });
      row['Total Average'] = u.totalAvg ?? '';
      row.จำนวนครั้งที่ตอบ = u.count;
      row.ตอบล่าสุด = u.last || '';
      return row;
    });
  }

  function renderPivot() {
    const year = pane.querySelector('#rep-year').value;
    const filtered = filteredResponses();
    const pivot = buildPivot(questions, filtered, year);
    const textAnswers = buildTextAnswers(questions, filtered);
    pane.querySelector('#rep-pivot-box').innerHTML = pivotTableHtml(pivot);
    pane.querySelector('#rep-pivot-text-box').innerHTML = textAnswersHtml(textAnswers);
    pane.querySelector('#rep-pivot-export').onclick = () => exportCsv(`survey-report-${qid}-${year}.csv`, pivotExportRows(pivot));
    pane.querySelector('#rep-pivot-print').onclick = () => printIsolated(qnTitle, `สรุปตามหัวข้อคำถาม (รายเดือน) — ${year}`, pane.querySelector('#rep-pivot-box').innerHTML + pane.querySelector('#rep-pivot-text-box').innerHTML);

    const countEl = pane.querySelector('#pv-selected-count');
    const printBtn = pane.querySelector('#pv-print-selected');
    wireSelectionUi(pane, '.pv-select', 'pv-select-all', countEl, printBtn, (n) => (n ? `เลือกแล้ว ${n} ข้อ` : 'ยังไม่ได้เลือกข้อคำถาม'));
    printBtn.onclick = () => {
      const selected = [...pane.querySelectorAll('.pv-select:checked')].map((cb) => {
        const [ti, ii] = cb.dataset.pid.split('-').map(Number);
        return { ...pivot.topics[ti].items[ii], topic: pivot.topics[ti].topic };
      });
      if (!selected.length) return;
      const body = selected.length === 1 ? pivotItemVerticalHtml(selected[0], pivot.diffLabel, pivot.diffIdx) : pivotItemsHorizontalHtml(selected, pivot.diffLabel, pivot.diffIdx);
      printIsolated(qnTitle, `สรุปตามหัวข้อคำถาม (รายเดือน) — ${year} · ${selected.length === 1 ? selected[0].text : `${selected.length} ข้อที่เลือก`}`, body);
    };
  }

  function renderIndividual() {
    const filtered = filteredResponses();
    const individualMatrix = buildIndividualMatrix(questions, filtered, staffById);
    const textAnswers = buildTextAnswers(questions, filtered);
    pane.querySelector('#rep-individual-box').innerHTML = individualMatrixHtml(individualMatrix);
    pane.querySelector('#rep-individual-text-box').innerHTML = textAnswersHtml(textAnswers);
    pane.querySelector('#rep-individual-export').onclick = () => {
      exportCsv(`survey-report-individual-${qid}.csv`, individualMatrixExportRows(individualMatrix));
    };
    pane.querySelector('#rep-individual-print').onclick = () => {
      printIsolated(qnTitle, 'วิเคราะห์รายข้อ-รายบุคคล', pane.querySelector('#rep-individual-box').innerHTML + pane.querySelector('#rep-individual-text-box').innerHTML);
    };

    const countEl = pane.querySelector('#iv-selected-count');
    const printBtn = pane.querySelector('#iv-print-selected');
    wireSelectionUi(pane, '.iv-select', 'iv-select-all', countEl, printBtn, (n) => (n ? `เลือกแล้ว ${n} รายการ` : 'ยังไม่ได้เลือกรายการ'));
    printBtn.onclick = () => {
      const selected = [...pane.querySelectorAll('.iv-select:checked')].map((cb) => individualMatrix.rows[Number(cb.dataset.idx)]);
      if (!selected.length) return;
      printIsolated(qnTitle, `วิเคราะห์รายข้อ-รายบุคคล${selected.length === 1 ? ` — ${selected[0].ThaiName}` : ` — ${selected.length} คนที่เลือก`}`, individualRowsHtml(individualMatrix, selected));
    };
  }

  function renderByUser() {
    const rows = byUserRows();
    const textAnswers = buildTextAnswers(questions, filteredResponses());
    pane.querySelector('#rep-user-box').innerHTML = byUserHtml(rows);
    pane.querySelector('#rep-user-text-box').innerHTML = textAnswersHtml(textAnswers);
    pane.querySelector('#rep-user-export').onclick = () => exportCsv(`survey-report-by-user-${qid}.csv`, byUserExportRows(rows));
    pane.querySelector('#rep-user-print').onclick = () => printIsolated(qnTitle, 'Report by User', pane.querySelector('#rep-user-box').innerHTML + pane.querySelector('#rep-user-text-box').innerHTML);

    const countEl = pane.querySelector('#bu-selected-count');
    const printBtn = pane.querySelector('#bu-print-selected');
    wireSelectionUi(pane, '.bu-select', 'bu-select-all', countEl, printBtn, (n) => (n ? `เลือกแล้ว ${n} คน` : 'ยังไม่ได้เลือกพนักงาน'));
    printBtn.onclick = () => {
      const selectedIds = new Set([...pane.querySelectorAll('.bu-select:checked')].map((cb) => cb.dataset.id));
      const selected = rows.filter((u) => selectedIds.has(u.EmployeeID));
      if (!selected.length) return;
      printIsolated(qnTitle, `Report by User${selected.length === 1 ? ` — ${selected[0].ThaiName}` : ` — ${selected.length} คนที่เลือก`}`, byUserPersonHtml(selected));
    };
  }

  function renderAll() {
    renderPivot();
    renderIndividual();
    renderByUser();
  }

  const FILTER_IDS = ['rf-search', 'rf-hire-from', 'rf-hire-to', 'rf-position', 'rf-cc', 'rf-ss', 'rf-yos-min', 'rf-yos-max'];
  pane.querySelector('#rep-year').addEventListener('change', renderPivot);
  FILTER_IDS.forEach((id) => {
    const evt = id === 'rf-search' ? 'input' : 'change';
    pane.querySelector(`#${id}`).addEventListener(evt, renderAll);
  });
  pane.querySelector('#rf-reset').addEventListener('click', () => {
    FILTER_IDS.forEach((id) => { pane.querySelector(`#${id}`).value = ''; });
    renderAll();
  });
  renderAll();

  pane.querySelectorAll('#rep-subtabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      pane.querySelectorAll('#rep-subtabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      pane.querySelectorAll('[data-rpane]').forEach((p) => p.classList.toggle('hidden', p.dataset.rpane !== btn.dataset.rtab));
    });
  });
}

// ถามชื่อ Header/Section ใหม่ (ข้อความสั้น ๆ) — ใช้ก่อนเปิดฟอร์มเพิ่มคำถามข้อแรกของหมวดนั้น
function headerNamePrompt() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="field field-full"><label>ชื่อ Header / หมวดหมู่ใหม่</label><input id="hdr-name" placeholder="เช่น ความพึงพอใจต่อสภาพแวดล้อมการทำงาน" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">ยกเลิก</button>
        <button type="button" class="btn btn-primary" data-act="ok">ถัดไป</button>
      </div>`;
    const body = openModal('เพิ่ม Header / Section', box);
    const input = body.querySelector('#hdr-name');
    input.focus();
    body.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) return;
      closeModal();
      resolve(name);
    });
    body.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      closeModal();
      resolve(null);
    });
  });
}

async function openQuestionnaire(container, qid) {
  const { questionnaire, questions } = await api.get(`/api/surveys/${qid}`);
  container.innerHTML = `
    <button id="back-btn" class="btn btn-ghost btn-sm">&larr; กลับไปรายการแบบสอบถาม</button>
    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0;">${escapeHtml(questionnaire.Title)}</h3>
        <span class="spacer"></span>
        <span class="badge ${STATUS_BADGE[questionnaire.Status]}">${questionnaire.Status}</span>
      </div>
      <div class="toolbar">
        ${['Draft', 'Active', 'Closed'].map((st) => `<button class="btn btn-ghost btn-sm" data-status="${st}" ${questionnaire.Status === st ? 'disabled' : ''}>ตั้งเป็น ${st}</button>`).join('')}
        <span class="spacer"></span>
        <button id="add-header-btn" class="btn btn-secondary btn-sm">+ เพิ่ม Header</button>
        <button id="add-question-btn" class="btn btn-primary btn-sm">+ เพิ่มคำถาม</button>
      </div>
      <div class="tabs" id="qn-tabs">
        <button type="button" class="tab-btn active" data-qtab="questions">คำถาม</button>
        <button type="button" class="tab-btn" data-qtab="report">รายงาน</button>
      </div>
      <div class="tab-pane" data-qpane="questions"><div id="q-list"></div></div>
      <div class="tab-pane hidden" data-qpane="report"></div>
    </div>`;

  const existingTopics = [...new Set(questions.map((q) => q.Topic).filter(Boolean))];

  container.querySelector('#back-btn').addEventListener('click', () => render(container));
  container.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
    await withLoading(() => api.put(`/api/surveys/${qid}`, { Status: btn.dataset.status }));
    toastSuccess('อัปเดตสถานะสำเร็จ');
    openQuestionnaire(container, qid);
  }));
  container.querySelector('#add-question-btn').addEventListener('click', () => questionForm(qid, null, () => openQuestionnaire(container, qid), existingTopics));
  container.querySelector('#add-header-btn').addEventListener('click', async () => {
    const name = await headerNamePrompt();
    if (!name) return;
    questionForm(qid, null, () => openQuestionnaire(container, qid), existingTopics, name);
  });

  let reportLoaded = false;
  container.querySelectorAll('#qn-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#qn-tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      container.querySelectorAll('[data-qpane]').forEach((p) => p.classList.toggle('hidden', p.dataset.qpane !== btn.dataset.qtab));
      if (btn.dataset.qtab === 'report' && !reportLoaded) {
        reportLoaded = true;
        renderReportTab(container.querySelector('[data-qpane="report"]'), qid, questions, questionnaire.Title);
      }
    });
  });

  // จัดกลุ่มคำถามตามหมวดหมู่ (Topic) แยกเป็น section พร้อม header — เรียงตามลำดับที่หมวดปรากฏครั้งแรก (ตาม Order ของคำถาม)
  const list = container.querySelector('#q-list');
  const topicOrder = [];
  const byTopic = {};
  questions.forEach((q) => {
    const topic = q.Topic || 'ทั่วไป';
    if (!byTopic[topic]) { byTopic[topic] = []; topicOrder.push(topic); }
    byTopic[topic].push(q);
  });
  const questionCardHtml = (q) => `
    <div class="question-card">
      <div class="q-text">${q.Order}. ${escapeHtml(q.QuestionText)} <span class="badge badge-gray">${q.Type}</span>
        <span class="badge ${q.Required === 'TRUE' ? 'badge-gold' : 'badge-gray'}">${q.Required === 'TRUE' ? 'บังคับตอบ' : 'ไม่บังคับ'}</span>
      </div>
      <div class="row-actions" style="margin-top:8px;">
        <button class="btn btn-ghost btn-sm" data-edit-q="${q.QuestionID}">แก้ไข</button>
        <button class="btn btn-danger btn-sm" data-del-q="${q.QuestionID}">ลบคำถาม</button>
      </div>
    </div>`;
  list.innerHTML = topicOrder.length ? topicOrder.map((topic) => `
    <div class="section-title">${escapeHtml(topic)}</div>
    ${byTopic[topic].map(questionCardHtml).join('')}`).join('') : '<div class="empty-state">ยังไม่มีคำถาม</div>';

  list.querySelectorAll('[data-edit-q]').forEach((btn) => btn.addEventListener('click', () => {
    const q = questions.find((x) => x.QuestionID === btn.dataset.editQ);
    questionForm(qid, q, () => openQuestionnaire(container, qid), existingTopics);
  }));
  list.querySelectorAll('[data-del-q]').forEach((btn) => btn.addEventListener('click', async () => {
    await withLoading(() => api.del(`/api/surveys/questions/${btn.dataset.delQ}`));
    toastSuccess('ลบคำถามสำเร็จ');
    openQuestionnaire(container, qid);
  }));
}

function newQuestionnaireForm(onSaved) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="qn-form">
      <div class="field field-full"><label>ชื่อแบบสอบถาม</label><input id="qn-title" required /></div>
      <div class="field field-full"><label>คำอธิบาย</label><textarea id="qn-desc" rows="2"></textarea></div>
      <div class="form-grid">
        <div class="field"><label>กลุ่มเป้าหมาย</label>
          <select id="qn-scope">
            <option value="All">ทุกคน</option>
            ${cache.costCenters.map((c) => `<option value="CostCenter:${c.CostCenterID}">หน่วยงาน: ${escapeHtml(c.Name)}</option>`).join('')}
            ${cache.subServices.map((s) => `<option value="SubService:${s.SubServiceID}">งานบริการย่อย: ${escapeHtml(s.Name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>อนุญาตให้ตอบซ้ำได้</label><select id="qn-resubmit"><option value="FALSE">ไม่ได้</option><option value="TRUE">ได้</option></select></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="qn-cancel">ยกเลิก</button><button type="submit" class="btn btn-primary">สร้างแบบสอบถาม</button></div>
    </form>`;
  const body = openModal('สร้างแบบสอบถามใหม่', wrap, { wide: true });
  body.querySelector('#qn-cancel').addEventListener('click', closeModal);
  body.querySelector('#qn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await withLoading(() => api.post('/api/surveys', {
        Title: body.querySelector('#qn-title').value.trim(),
        Description: body.querySelector('#qn-desc').value.trim(),
        TargetScope: body.querySelector('#qn-scope').value,
        AllowResubmit: body.querySelector('#qn-resubmit').value,
      }));
      toastSuccess('สร้างแบบสอบถามสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) { toastError(err.message); }
  });
}

export async function render(container) {
  const list = await api.get('/api/surveys');
  container.innerHTML = `
    <div class="toolbar">
      <span style="color:var(--muted); font-size:13px;">ชีต Responses: คำตอบแต่ละหัวข้อจะถูกแยกเป็นคอลัมน์ของตัวเองอัตโนมัติเมื่อมีการตอบใหม่</span>
      <span class="spacer"></span>
      <button id="sync-columns-btn" class="btn btn-ghost btn-sm" title="แยกคำตอบเดิม (Answers_JSON) ที่เคยตอบไว้แล้วออกเป็นคอลัมน์ในชีต">ซิงก์คำตอบเดิมลงคอลัมน์</button>
      <button id="new-qn-btn" class="btn btn-primary">+ สร้างแบบสอบถามใหม่</button>
    </div>
    <div class="grid-2" id="qn-grid"></div>`;
  const grid = document.getElementById('qn-grid');
  grid.innerHTML = list.map((q) => `
    <div class="card">
      <div class="toolbar"><h3 style="margin:0;">${escapeHtml(q.Title)}</h3><span class="spacer"></span><span class="badge ${STATUS_BADGE[q.Status]}">${q.Status}</span></div>
      <p style="font-size:14px; color:var(--muted);">${escapeHtml(q.Description || '')}</p>
      <p style="font-size:13px; color:var(--muted);">กลุ่มเป้าหมาย: ${escapeHtml(q.TargetScope)}</p>
      <div class="row-actions">
        <button class="btn btn-primary btn-sm" data-open="${q.QID}">จัดการคำถาม</button>
        <button class="btn btn-danger btn-sm" data-del-qn="${q.QID}">ลบ</button>
      </div>
    </div>`).join('') || '<div class="empty-state">ยังไม่มีแบบสอบถาม</div>';

  grid.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openQuestionnaire(container, btn.dataset.open)));
  grid.querySelectorAll('[data-del-qn]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!(await confirmDialog('ลบแบบสอบถามนี้หรือไม่? คำถามที่ผูกอยู่จะถูกลบไปด้วย (คำตอบเดิมยังเก็บไว้เป็นข้อมูลย้อนหลัง)'))) return;
    try {
      await withLoading(() => api.del(`/api/surveys/${btn.dataset.delQn}`));
      toastSuccess('ลบแบบสอบถามสำเร็จ');
      render(container);
    } catch (err) { toastError(err.message); }
  }));
  document.getElementById('new-qn-btn').addEventListener('click', () => newQuestionnaireForm(() => render(container)));
  document.getElementById('sync-columns-btn').addEventListener('click', async () => {
    try {
      const result = await withLoading(() => api.post('/api/responses/sync-columns', {}));
      toastSuccess(`ซิงก์คำตอบลงคอลัมน์สำเร็จ (${result.updated} รายการ)`);
    } catch (err) { toastError(err.message); }
  });
}
