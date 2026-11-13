import { api } from '../api.js';
import { escapeHtml, qs, debounce } from '../utils.js';
import { withLoading } from '../components/loading.js';

export async function render(container) {
  container.innerHTML = `
    <div class="toolbar">
      <input id="l-user" placeholder="กรองตามรหัสผู้ใช้" style="padding:9px 12px; border:1px solid var(--line); border-radius:9px;" />
      <input id="l-action" placeholder="กรองตาม Action" style="padding:9px 12px; border:1px solid var(--line); border-radius:9px;" />
    </div>
    <div class="table-wrap">
      <table class="data-table"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead><tbody id="l-body"></tbody></table>
    </div>`;

  async function run() {
    const rows = await withLoading(() => api.get(`/api/logs${qs({
      user: document.getElementById('l-user').value.trim(),
      action: document.getElementById('l-action').value.trim(),
    })}`));
    document.getElementById('l-body').innerHTML = rows.map((r) => `
      <tr><td>${new Date(r.Timestamp).toLocaleString('th-TH')}</td><td>${escapeHtml(r.User)}</td><td>${escapeHtml(r.Action)}</td><td>${escapeHtml(r.Target)}</td><td>${escapeHtml(r.Detail)}</td></tr>
    `).join('') || '<tr><td colspan="5" class="empty-state">ไม่พบข้อมูล</td></tr>';
  }

  const debouncedRun = debounce(run, 250);
  document.getElementById('l-user').addEventListener('input', debouncedRun);
  document.getElementById('l-action').addEventListener('input', debouncedRun);
  await run();
}
