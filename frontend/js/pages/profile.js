import { api, state } from '../api.js';
import { cache, listValues, subServicesFor, positionJobFunctionMap } from '../state.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { withLoading } from '../components/loading.js';
import { formatDateTH, escapeHtml } from '../utils.js';

function opts(list, selected, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
}
function ccOpts(selected) {
  return `<option value="">— เลือก —</option>${cache.costCenters.map((c) => `<option value="${c.CostCenterID}" data-name="${escapeHtml(c.Name)}" ${c.CostCenterID === selected ? 'selected' : ''}>${escapeHtml(c.Code || '')} ${escapeHtml(c.Name)}</option>`).join('')}`;
}
function ssOpts(costCenterId, selected) {
  return `<option value="">— เลือก —</option>${subServicesFor(costCenterId).map((s) => `<option value="${s.SubServiceID}" ${s.SubServiceID === selected ? 'selected' : ''}>${escapeHtml(s.Name)}</option>`).join('')}`;
}

export async function render(container) {
  const staff = await api.get(`/api/staff/${state.user.EmployeeID}`);

  container.innerHTML = `
    <div class="card" style="max-width:560px;">
      <h3>ข้อมูลส่วนตัว</h3>
      <form id="profile-form" class="form-grid cols-1">
        <div class="field"><label>รหัสพนักงาน</label><input value="${escapeHtml(staff.EmployeeID)}" disabled /></div>
        <div class="field"><label>ชื่อ-นามสกุล</label><input id="p-ThaiName" value="${escapeHtml(staff.ThaiName)}" required /></div>
        <div class="field"><label>ชื่อเล่น</label><input id="p-NickName" value="${escapeHtml(staff.NickName || '')}" required /></div>
        <div class="field"><label>ตำแหน่ง</label><select id="p-Position">${opts(listValues('Position'), staff.Position, '-- เลือก --')}</select></div>
        <div class="field"><label>Cost Center</label><select id="p-CostCenterID">${ccOpts(staff.CostCenterID)}</select></div>
        <div class="field"><label>Sub Services</label><select id="p-SubServiceID">${ssOpts(staff.CostCenterID || '', staff.SubServiceID)}</select></div>
        <div class="field"><label>Job Function</label><select id="p-JobFunction">${opts(listValues('JobFunction'), staff.JobFunction, '-- เลือก --')}</select></div>
        <div class="field"><label>Preceptor/Mentor</label><input id="p-Preceptor" value="${escapeHtml(staff.Preceptor || '')}" /></div>
        <div class="field"><label>Manager</label><input id="p-ManagerName" value="${escapeHtml(staff.ManagerName || '')}" /></div>
        <div class="field"><label>Full/Part Time</label><select id="p-FullPartTime">${opts(listValues('FullPartTime'), staff.FullPartTime, '-- เลือก --')}</select></div>
        <div class="field"><label>เบอร์มือถือ (ใช้เข้าสู่ระบบ)</label><input type="tel" id="p-Phone" inputmode="numeric" value="${escapeHtml(staff.Phone || '')}" required /></div>
        <div class="field"><label>วันเริ่มงาน</label><input value="${formatDateTH(staff.HireDate)}" disabled /></div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;">บันทึกการแก้ไข</button>
      </form>
    </div>`;

  document.getElementById('p-CostCenterID').addEventListener('change', (e) => {
    document.getElementById('p-SubServiceID').innerHTML = ssOpts(e.target.value, '');
  });
  document.getElementById('p-Position').addEventListener('change', (e) => {
    const jobFunction = positionJobFunctionMap()[e.target.value];
    if (jobFunction) document.getElementById('p-JobFunction').value = jobFunction;
  });

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (id) => document.getElementById(id).value.trim();
    const ccSel = document.getElementById('p-CostCenterID');
    const payload = {
      ThaiName: g('p-ThaiName'), NickName: g('p-NickName'), Position: g('p-Position'),
      CostCenterID: g('p-CostCenterID'), CostCenterName: ccSel.selectedOptions[0]?.dataset.name || '',
      SubServiceID: g('p-SubServiceID'), JobFunction: g('p-JobFunction'),
      Preceptor: g('p-Preceptor'), ManagerName: g('p-ManagerName'), FullPartTime: g('p-FullPartTime'), Phone: g('p-Phone'),
    };
    try {
      await withLoading(() => api.put(`/api/staff/${staff.EmployeeID}/profile`, payload));
      toastSuccess('บันทึกข้อมูลส่วนตัวสำเร็จ');
    } catch (err) {
      toastError(err.message);
    }
  });
}
