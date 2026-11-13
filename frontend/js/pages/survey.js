import { api, state } from '../api.js';
import { cache } from '../state.js';
import { openModal, closeModal } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { escapeHtml, formatDateTH, renderGuard } from '../utils.js';
import { ICON_CHECK_CIRCLE, ICON_CLOCK } from '../icons.js';

// รอบเดือนที่ 1-4 ของการทดลองงาน (0-30/31-60/61-90/91-119 วัน) — ใช้เกณฑ์เดียวกับ Orientation Checklist/Dashboard
const SURVEY_MONTHS = [
  { label: 'เดือนที่ 1', maxDays: 30 },
  { label: 'เดือนที่ 2', maxDays: 60 },
  { label: 'เดือนที่ 3', maxDays: 90 },
  { label: 'เดือนที่ 4', maxDays: 119 },
];

// จัดกลุ่มคำตอบแบบสอบถามความพึงพอใจรายเดือนของผู้ใช้เอง เข้ากับรอบเดือนที่ 1-4 ตามวันเริ่มงาน
async function monthlySurveyStatusHtml() {
  const qid = cache.settings.MonthlySurveyQID;
  const hireDate = state.user?.HireDate;
  if (!qid || !hireDate) return '';
  const responses = await api.get(`/api/responses/my?qid=${encodeURIComponent(qid)}`);
  const hire = new Date(`${hireDate}T00:00:00`);
  const buckets = SURVEY_MONTHS.map(() => null);
  responses.forEach((r) => {
    const days = Math.round((new Date(r.SubmitDate) - hire) / 86400000);
    const idx = SURVEY_MONTHS.findIndex((m) => days <= m.maxDays);
    if (idx !== -1 && (!buckets[idx] || r.SubmitDate > buckets[idx].SubmitDate)) buckets[idx] = r;
  });
  const rows = SURVEY_MONTHS.map((m, i) => {
    const done = buckets[i];
    return `<div class="checklist-item ${done ? 'done' : ''}">
      <span class="checklist-icon">${done ? ICON_CHECK_CIRCLE : ICON_CLOCK}</span>
      <div><div class="checklist-label">${m.label}</div><div class="checklist-date">${done ? `Completed (${formatDateTH(done.SubmitDate.slice(0, 10))})` : 'Pending'}</div></div>
    </div>`;
  }).join('');
  return `<div class="card">
    <h3>สถานะแบบสอบถามความพึงพอใจรายเดือน</h3>
    <div class="checklist-grid">${rows}</div>
  </div>`;
}

function renderQuestionField(q) {
  const options = JSON.parse(q.Options_JSON || '[]');
  const req = q.Required === 'TRUE' ? '<span class="required-mark">*</span>' : '';
  if (q.Type === 'text') {
    return `<div class="question-card" data-qid="${q.QuestionID}" data-type="text">
      <div class="q-text">${escapeHtml(q.QuestionText)}${req}</div>
      <textarea rows="3" class="q-input"></textarea>
    </div>`;
  }
  if (q.Type === 'multi') {
    return `<div class="question-card" data-qid="${q.QuestionID}" data-type="multi">
      <div class="q-text">${escapeHtml(q.QuestionText)}${req}</div>
      ${options.map((o) => `<label class="option-row"><input type="checkbox" name="${q.QuestionID}" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`).join('')}
    </div>`;
  }
  // single / rating
  return `<div class="question-card" data-qid="${q.QuestionID}" data-type="single">
    <div class="q-text">${escapeHtml(q.QuestionText)}${req}</div>
    ${options.map((o) => `<label class="option-row"><input type="radio" name="${q.QuestionID}" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`).join('')}
  </div>`;
}

function collectAnswers(formEl) {
  const answers = {};
  formEl.querySelectorAll('.question-card').forEach((card) => {
    const qid = card.dataset.qid;
    const type = card.dataset.type;
    if (type === 'text') {
      const v = card.querySelector('textarea').value.trim();
      if (v) answers[qid] = v;
    } else if (type === 'multi') {
      const checked = [...card.querySelectorAll('input:checked')].map((i) => i.value);
      if (checked.length) answers[qid] = checked;
    } else {
      const checked = card.querySelector('input:checked');
      if (checked) answers[qid] = checked.value;
    }
  });
  return answers;
}

// ตรวจว่าทุกคำถามที่บังคับตอบ (Required) มีคำตอบครบแล้ว — คืนรายชื่อคำถามที่ยังขาด (ว่างถ้าครบ)
function missingRequired(formEl, questions, answers) {
  const missing = [];
  questions.forEach((q) => {
    if (q.Required !== 'TRUE') return;
    const v = answers[q.QuestionID];
    const answered = Array.isArray(v) ? v.length > 0 : !!v;
    if (!answered) missing.push(q.QuestionText);
  });
  return missing;
}

async function openSurvey(qid) {
  const { questionnaire, questions } = await api.get(`/api/surveys/${qid}`);
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p style="color:var(--muted); margin-top:-6px;">${escapeHtml(questionnaire.Description || '')}</p>
    <form id="survey-form">
      ${questions.map(renderQuestionField).join('')}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="survey-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ส่งแบบสอบถาม</button>
      </div>
    </form>`;
  const body = openModal(questionnaire.Title, wrap, { wide: true });
  body.querySelector('#survey-cancel').addEventListener('click', closeModal);
  body.querySelector('#survey-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers = collectAnswers(e.target);
    const missing = missingRequired(e.target, questions, answers);
    if (missing.length) {
      toastError(`กรุณาตอบคำถามที่บังคับให้ครบ: ${missing[0]}${missing.length > 1 ? ` (และอีก ${missing.length - 1} ข้อ)` : ''}`);
      return;
    }
    try {
      await withLoading(() => api.post('/api/responses', { qid, answers }));
      toastSuccess('ส่งแบบสอบถามสำเร็จ ขอบคุณสำหรับความคิดเห็น');
      closeModal();
      render(document.getElementById('app-content'));
    } catch (err) {
      toastError(err.message);
    }
  });
}

export async function render(container) {
  const isCurrent = renderGuard(container);
  const [list, monthlyStatusHtml] = await Promise.all([api.get('/api/surveys/active'), monthlySurveyStatusHtml()]);
  if (!isCurrent()) return;
  container.innerHTML = `
    ${monthlyStatusHtml}
    <div class="grid-2" id="survey-list"></div>`;
  const listEl = document.getElementById('survey-list');
  if (list.length === 0) {
    listEl.outerHTML = '<div class="empty-state">ยังไม่มีแบบสอบถามที่เปิดรับคำตอบในขณะนี้</div>';
    return;
  }
  listEl.innerHTML = list.map((q) => `
    <div class="card">
      <h3>${escapeHtml(q.Title)}</h3>
      <p style="color:var(--muted); font-size:14.5px;">${escapeHtml(q.Description || '')}</p>
      <button class="btn ${q.alreadySubmitted && q.AllowResubmit !== 'TRUE' ? 'btn-ghost' : 'btn-primary'}" data-qid="${q.QID}" ${q.alreadySubmitted && q.AllowResubmit !== 'TRUE' ? 'disabled' : ''}>
        ${q.alreadySubmitted ? (q.AllowResubmit === 'TRUE' ? 'ตอบอีกครั้ง' : 'ตอบแล้ว') : 'ทำแบบสอบถาม'}
      </button>
    </div>`).join('');
  listEl.querySelectorAll('button[data-qid]').forEach((btn) => {
    btn.addEventListener('click', () => openSurvey(btn.dataset.qid));
  });
}
