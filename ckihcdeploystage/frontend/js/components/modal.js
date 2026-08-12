// Modal อย่างง่าย: openModal(title, innerHtmlOrNode) -> คืน element ของ body ให้ผู้เรียกผูก event เอง
let backdrop = null;

export function openModal(title, contentEl, { wide = false } = {}) {
  closeModal();
  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box ${wide ? 'modal-wide' : ''}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="ปิด">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>`;
  const body = backdrop.querySelector('.modal-body');
  if (typeof contentEl === 'string') body.innerHTML = contentEl;
  else body.appendChild(contentEl);

  backdrop.querySelector('.modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  return body;
}

export function closeModal() {
  if (backdrop) {
    backdrop.remove();
    backdrop = null;
  }
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.innerHTML = `
      <p class="confirm-message">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">ยกเลิก</button>
        <button class="btn btn-danger" data-act="ok">ยืนยัน</button>
      </div>`;
    const body = openModal('ยืนยันการทำรายการ', box);
    body.querySelector('[data-act="ok"]').addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
    body.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
  });
}
