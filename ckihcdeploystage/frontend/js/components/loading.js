// สปินเนอร์แสดงระหว่างเรียก API — คลุมทั้งหน้าจอด้วย overlay โปร่งแสง
let overlay = null;
let pending = 0;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(overlay);
  return overlay;
}

export function showLoading() {
  pending += 1;
  ensureOverlay().classList.add('visible');
}

export function hideLoading() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) ensureOverlay().classList.remove('visible');
}

export async function withLoading(fn) {
  showLoading();
  try {
    return await fn();
  } finally {
    hideLoading();
  }
}
