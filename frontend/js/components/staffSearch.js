import { escapeHtml } from '../utils.js';

// ผูก input ค้นหาพนักงาน (Employee ID / ชื่อ) ให้แสดง dropdown ผลลัพธ์ทันทีที่พิมพ์ (ไม่ต้องกดปุ่มค้นหา)
// ใช้ร่วมกันทุกฟอร์มที่ต้องเลือกพนักงาน (Walk Round, Consultation, AI Themes ฯลฯ) ให้ประสบการณ์ใช้งานเหมือนกันทั้งระบบ
export function attachStaffSearch({ searchInput, hiddenInput, resultsBox, allStaff, onSelect, formatLabel }) {
  const label = formatLabel || ((s) => `${s.EmployeeID} — ${s.ThaiName}`);
  const showMatches = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { resultsBox.classList.add('hidden'); resultsBox.innerHTML = ''; return; }
    // กันพัง: ถ้ามีข้อมูลพนักงานบางแถวผิดรูปแบบ (เช่น EmployeeID ว่าง/ไม่ใช่ string) การค้นหาข้อความไม่ควรพังไปทั้งฟังก์ชัน
    // ซึ่งจะทำให้ dropdown ไม่ขึ้นเลยสำหรับทุกคำค้นหาถัดไปด้วย (ไม่ใช่แค่แถวที่ผิดรูปแบบ)
    const matches = allStaff.filter((s) => {
      const empId = String(s?.EmployeeID ?? '').toLowerCase();
      const name = String(s?.ThaiName ?? '').toLowerCase();
      return empId.includes(q) || name.includes(q);
    }).slice(0, 20);
    resultsBox.innerHTML = matches.length
      ? matches.map((s) => `<div class="search-result-item" data-id="${escapeHtml(s.EmployeeID)}">${escapeHtml(label(s))}</div>`).join('')
      : '<div class="search-result-item empty">ไม่พบพนักงาน</div>';
    resultsBox.classList.remove('hidden');
    resultsBox.querySelectorAll('[data-id]').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const s = allStaff.find((x) => x.EmployeeID === item.dataset.id);
        hiddenInput.value = s.EmployeeID;
        searchInput.value = label(s);
        resultsBox.classList.add('hidden');
        if (onSelect) onSelect(s);
      });
    });
  };
  searchInput.addEventListener('input', () => { hiddenInput.value = ''; showMatches(); });
  searchInput.addEventListener('focus', showMatches);
  searchInput.addEventListener('blur', () => setTimeout(() => resultsBox.classList.add('hidden'), 150));
}
