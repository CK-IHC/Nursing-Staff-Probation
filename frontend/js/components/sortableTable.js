// ทำให้ตาราง table.data-table ทุกตารางในแอปคลิกหัวคอลัมน์เพื่อเรียงลำดับได้ โดยเรียงแถวใน DOM โดยตรง
// (ไม่ต้องแก้โค้ดของแต่ละหน้าทีละไฟล์) ตรวจจับตารางที่โหลดทีหลัง (เช่น หลังกดแท็บย่อย/รายงาน) ด้วย MutationObserver
const SORT_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>';

function cellValue(td) {
  const text = (td?.textContent || '').trim();
  const num = Number(text.replace(/[,%฿\s]/g, ''));
  if (text !== '' && !Number.isNaN(num)) return { num, text };
  return { num: null, text: text.toLowerCase() };
}

function sortTableByColumn(table, colIdx, dir) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.children).filter((r) => r.tagName === 'TR');
  // แถวที่มี data-nosort (เช่น หัวข้อหมวด/แถวสรุป N=, AVERAGE ในตาราง pivot) ไม่ถูกจัดเรียง ให้อยู่ตำแหน่งท้ายตารางเสมอ
  const sortable = rows.filter((r) => r.children[colIdx] && !r.querySelector('.empty-state') && !r.hasAttribute('data-nosort'));
  const rest = rows.filter((r) => !sortable.includes(r));
  sortable.sort((a, b) => {
    const av = cellValue(a.children[colIdx]);
    const bv = cellValue(b.children[colIdx]);
    const cmp = av.num !== null && bv.num !== null ? av.num - bv.num : av.text.localeCompare(bv.text, 'th');
    return dir === 'asc' ? cmp : -cmp;
  });
  sortable.forEach((r) => tbody.appendChild(r));
  rest.forEach((r) => tbody.appendChild(r));
}

function makeSortable(table) {
  if (table.dataset.sortableInit) return;
  const headerRow = table.querySelector('thead tr:last-child');
  if (!headerRow) return;
  table.dataset.sortableInit = '1';
  let sortState = { colIdx: -1, dir: 'asc' };
  Array.from(headerRow.children).forEach((th, colIdx) => {
    if (th.hasAttribute('colspan') || th.hasAttribute('rowspan') || !th.textContent.trim()) return;
    th.classList.add('sortable-th');
    // แสดงไอคอนจางๆ ไว้ตลอดตั้งแต่แรก ให้เห็นชัดว่าคอลัมน์นี้กดเรียงลำดับได้ (ไม่ใช่โผล่มาแค่ตอนคลิกแล้ว)
    const caret = document.createElement('span');
    caret.className = 'sort-caret sort-caret-idle';
    caret.innerHTML = SORT_ICON;
    th.appendChild(caret);
    th.addEventListener('click', () => {
      sortState = { colIdx, dir: sortState.colIdx === colIdx && sortState.dir === 'asc' ? 'desc' : 'asc' };
      headerRow.querySelectorAll('.sort-caret').forEach((el) => {
        el.classList.add('sort-caret-idle');
        el.style.transform = '';
      });
      caret.classList.remove('sort-caret-idle');
      if (sortState.dir === 'desc') caret.style.transform = 'rotate(180deg)';
      sortTableByColumn(table, colIdx, sortState.dir);
    });
  });
}

export function initSortableTables(root) {
  root.querySelectorAll('table.data-table').forEach(makeSortable);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('table.data-table')) makeSortable(node);
        node.querySelectorAll?.('table.data-table').forEach(makeSortable);
      });
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}
