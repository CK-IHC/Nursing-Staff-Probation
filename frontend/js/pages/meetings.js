import { api } from '../api.js';
import { listValues } from '../state.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { attachStaffSearch } from '../components/staffSearch.js';
import { escapeHtml, formatDateTH, debounce, exportCsv, printReport, printIsolated } from '../utils.js';

function printMeetingDetail(m) {
  const html = `<div class="card">
    <div class="form-grid">
      <div class="field"><label>วันที่ประชุม</label><input value="${formatDateTH(m.Date)}" disabled /></div>
      <div class="field"><label>เวลา</label><input value="${escapeHtml(m.Time || '—')}" disabled /></div>
      <div class="field field-full"><label>หัวข้อ</label><input value="${escapeHtml(m.Title)}" disabled /></div>
      <div class="field"><label>สถานะ</label><input value="${escapeHtml(m.Status)}" disabled /></div>
      <div class="field"><label>ผู้บันทึก</label><input value="${escapeHtml(m.RecordedBy || '—')}" disabled /></div>
      ${m.Detail ? `<div class="field field-full"><label>รายละเอียด/หมายเหตุ</label><textarea rows="2" disabled>${escapeHtml(m.Detail)}</textarea></div>` : ''}
    </div>
    <div class="section-title">ผู้เข้าร่วม (${m.Attendees.length} คน)</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>แผนก</th></tr></thead>
        <tbody>${m.Attendees.length === 0 ? '<tr><td colspan="4" class="empty-state">ยังไม่มีผู้เข้าร่วม</td></tr>' : m.Attendees.map((a) => `
          <tr><td>${escapeHtml(a.EmployeeID)}</td><td>${escapeHtml(a.ThaiName || '')}</td><td>${escapeHtml(a.Position || '')}</td><td>${escapeHtml(a.CostCenterName || '')}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  </div>`;
  printIsolated('รายละเอียดการประชุม', m.Title, html);
}

function opts(list, placeholder, selected) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
}

async function meetingForm(record, onSaved) {
  const [auto, allStaff] = await Promise.all([api.get('/api/meetings/probation-counts'), api.get('/api/staff')]);
  const attendees = record ? [...record.Attendees] : [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <form id="mt-form">
      <div class="form-grid">
        <div class="field"><label>วันที่ประชุม *</label><input type="date" id="mt-date" value="${record?.Date || new Date().toISOString().slice(0, 10)}" required /></div>
        <div class="field"><label>เวลา</label><input type="time" id="mt-time" value="${record?.Time || ''}" /></div>
        <div class="field"><label>สถานะ</label><select id="mt-status">${opts(listValues('MeetingStatus'), '-- เลือก --', record?.Status || 'ยังไม่ดำเนินการ')}</select></div>
        <div class="field field-full"><label>หัวข้อการประชุม *</label><input id="mt-title" value="${escapeHtml(record?.Title || 'Mentoring Support for New Nursing Staff')}" required /></div>
        <div class="field field-full"><label>รายละเอียด/หมายเหตุ</label><textarea id="mt-detail" rows="2">${escapeHtml(record?.Detail || '')}</textarea></div>
      </div>
      <div class="card" style="background:#FBF7EE; margin:14px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <label style="margin:0;">จำนวน Staff On Probation (Manual Override)</label>
          <input type="number" id="mt-manual" style="max-width:160px;" placeholder="ปล่อยว่างเพื่อใช้ค่าจากระบบ" value="${record?.ManualCount || ''}" />
        </div>
        <p style="font-size:13.5px; color:var(--muted); margin:6px 0 0;">ค่าอัตโนมัติจากระบบ ณ ปัจจุบัน: M1 ${auto.m1} · M2 ${auto.m2} · M3 ${auto.m3} · M4 ${auto.m4} · รวม ${auto.total} คน</p>
      </div>
      <div class="field" style="position:relative;">
        <label>เพิ่มผู้เข้าร่วมประชุม (พิมพ์ Employee ID หรือชื่อ)</label>
        <input id="mt-attendee-input" placeholder="พิมพ์ Employee ID หรือชื่อ..." autocomplete="off" />
        <input type="hidden" id="mt-attendee-hidden" />
        <div id="mt-attendee-results" class="search-dropdown hidden"></div>
      </div>
      <div class="table-wrap" style="margin-top:10px;">
        <table class="data-table">
          <thead><tr><th>Employee ID</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>แผนก</th><th></th></tr></thead>
          <tbody id="mt-attendee-body"></tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mt-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`;
  const body = openModal(record ? 'แก้ไขการประชุม' : 'บันทึกการประชุม', wrap, { wide: true });
  body.querySelector('#mt-cancel').addEventListener('click', closeModal);

  function renderAttendees() {
    body.querySelector('#mt-attendee-body').innerHTML = attendees.length === 0
      ? '<tr><td colspan="5" class="empty-state">ยังไม่มีผู้เข้าร่วม</td></tr>'
      : attendees.map((a) => `<tr><td>${escapeHtml(a.EmployeeID)}</td><td>${escapeHtml(a.ThaiName || '')}</td><td>${escapeHtml(a.Position || '')}</td><td>${escapeHtml(a.CostCenterName || '')}</td><td><button type="button" class="btn btn-danger btn-sm" data-rm="${a.EmployeeID}">ลบ</button></td></tr>`).join('');
    body.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = attendees.findIndex((a) => a.EmployeeID === btn.dataset.rm);
        if (idx !== -1) attendees.splice(idx, 1);
        renderAttendees();
      });
    });
  }
  renderAttendees();

  const attendeeInput = body.querySelector('#mt-attendee-input');
  const attendeeHidden = body.querySelector('#mt-attendee-hidden');
  attachStaffSearch({
    searchInput: attendeeInput,
    hiddenInput: attendeeHidden,
    resultsBox: body.querySelector('#mt-attendee-results'),
    allStaff,
    onSelect: (s) => {
      if (attendees.some((a) => a.EmployeeID === s.EmployeeID)) { toastError('มีรายชื่อนี้อยู่แล้ว'); }
      else attendees.push({ EmployeeID: s.EmployeeID, ThaiName: s.ThaiName, Position: s.Position, CostCenterName: s.CostCenterName });
      attendeeInput.value = '';
      attendeeHidden.value = '';
      renderAttendees();
    },
  });

  body.querySelector('#mt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      Date: body.querySelector('#mt-date').value, Time: body.querySelector('#mt-time').value,
      Title: body.querySelector('#mt-title').value.trim(), Detail: body.querySelector('#mt-detail').value.trim(),
      Status: body.querySelector('#mt-status').value, ManualCount: body.querySelector('#mt-manual').value,
      Attendees: attendees.map((a) => a.EmployeeID),
    };
    try {
      await withLoading(() => (record ? api.put(`/api/meetings/${record.MeetingID}`, payload) : api.post('/api/meetings', payload)));
      toastSuccess('บันทึกการประชุมสำเร็จ');
      closeModal();
      onSaved();
    } catch (err) {
      toastError(err.message);
    }
  });
}

export async function render(container) {
  container.innerHTML = `
    <div class="toolbar">
      <input id="mt-search" class="field" style="max-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:9px;" placeholder="ค้นหาหัวข้อ..." />
      <select id="mt-filter-status">${opts(listValues('MeetingStatus'), 'ทุก Status')}</select>
      <button id="mt-reset" class="btn btn-ghost">Reset</button>
      <span class="spacer"></span>
      <button id="mt-add" class="btn btn-primary">+ บันทึกการประชุม</button>
      <button id="mt-export" class="btn btn-secondary">Export Excel</button>
      <button id="mt-print" class="btn btn-primary">Print Report</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>#</th><th>วันที่ประชุม</th><th>เวลา</th><th>หัวข้อ</th><th>ผู้เข้าร่วม</th><th>สถานะ</th><th>ผู้บันทึก</th><th>จัดการ</th></tr></thead>
        <tbody id="mt-body"></tbody>
      </table>
    </div>`;

  let allRows = [];
  function filtered() {
    const search = document.getElementById('mt-search').value.trim().toLowerCase();
    const status = document.getElementById('mt-filter-status').value;
    let rows = allRows;
    if (search) rows = rows.filter((r) => r.Title.toLowerCase().includes(search));
    if (status) rows = rows.filter((r) => r.Status === status);
    return rows;
  }
  function renderTable() {
    const rows = filtered();
    const body = document.getElementById('mt-body');
    if (!body) return; // ผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอ reload() หลังบันทึก/ลบ
    if (rows.length === 0) { body.innerHTML = '<tr><td colspan="8" class="empty-state">ยังไม่มีข้อมูลการประชุม</td></tr>'; return; }
    body.innerHTML = rows.map((m, i) => `
      <tr>
        <td>${i + 1}</td><td>${formatDateTH(m.Date)}</td><td>${escapeHtml(m.Time || '—')}</td><td>${escapeHtml(m.Title)}</td>
        <td>${m.Attendees.map((a) => `${escapeHtml(a.EmployeeID)} ${escapeHtml(a.ThaiName || '')}`).join(', ') || '—'}</td>
        <td><span class="badge ${m.Status === 'เสร็จสิ้น' ? 'badge-green' : m.Status === 'กำลังดำเนินการ' ? 'badge-gold' : 'badge-gray'}">${escapeHtml(m.Status)}</span></td>
        <td>${escapeHtml(m.RecordedBy || '')}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${m.MeetingID}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-print="${m.MeetingID}">Print detail</button>
          <button class="btn btn-danger btn-sm" data-del="${m.MeetingID}">Del</button>
        </td>
      </tr>`).join('');
    body.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => meetingForm(allRows.find((r) => r.MeetingID === btn.dataset.edit), reload));
    });
    body.querySelectorAll('[data-print]').forEach((btn) => {
      btn.addEventListener('click', () => printMeetingDetail(allRows.find((r) => r.MeetingID === btn.dataset.print)));
    });
    body.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog('ต้องการลบข้อมูลการประชุมนี้หรือไม่?'))) return;
        try {
          await withLoading(() => api.del(`/api/meetings/${btn.dataset.del}`));
          toastSuccess('ลบข้อมูลสำเร็จ');
          reload();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }
  async function reload() {
    allRows = await api.get('/api/meetings');
    renderTable();
  }

  document.getElementById('mt-search').addEventListener('input', debounce(renderTable, 200));
  document.getElementById('mt-filter-status').addEventListener('change', renderTable);
  document.getElementById('mt-reset').addEventListener('click', () => {
    document.getElementById('mt-search').value = '';
    document.getElementById('mt-filter-status').value = '';
    renderTable();
  });
  document.getElementById('mt-add').addEventListener('click', () => meetingForm(null, reload));
  document.getElementById('mt-print').addEventListener('click', () => printReport('Monthly Meetings Report', ''));
  document.getElementById('mt-export').addEventListener('click', () => {
    exportCsv('monthly-meetings.csv', filtered().map((m) => ({
      วันที่: m.Date, เวลา: m.Time || '', หัวข้อ: m.Title, ผู้เข้าร่วม: m.Attendees.map((a) => a.EmployeeID).join('; '), สถานะ: m.Status,
    })));
  });

  await reload();
}
