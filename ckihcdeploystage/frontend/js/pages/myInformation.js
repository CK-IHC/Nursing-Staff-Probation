import { api } from '../api.js';
import { escapeHtml, formatDateTH, renderGuard } from '../utils.js';
import { ICON_FILE_DOC, ICON_FILE_IMAGE, ICON_BOOK, ICON_PIN, ICON_STAR, ICON_PLAY, iconInline } from '../icons.js';

function fileIcon(r) {
  if (!r.FileURL && r.VideoURL) return ICON_PLAY;
  if ((r.MimeType || '').indexOf('image') !== -1) return ICON_FILE_IMAGE;
  return ICON_FILE_DOC;
}

// แสดงเฉพาะรายการที่อยู่ในช่วงวันที่กำหนด (ไม่กำหนดวันที่ = แสดงตลอด)
function inDisplayRange(r) {
  const today = new Date().toISOString().slice(0, 10);
  if (r.StartDate && today < r.StartDate) return false;
  if (r.EndDate && today > r.EndDate) return false;
  return true;
}

export async function render(container) {
  const isCurrent = renderGuard(container);
  container.innerHTML = `
    <div class="info-header">
      <h2>Information</h2>
      <span class="info-header-icon">${ICON_BOOK}</span>
    </div>
    <div id="mn-grid" class="info-grid" style="margin-top:14px;"></div>`;

  const rows = (await api.get('/api/manuals')).filter(inDisplayRange).sort((a, b) => {
    if ((b.Pinned === 'TRUE') !== (a.Pinned === 'TRUE')) return (b.Pinned === 'TRUE') - (a.Pinned === 'TRUE');
    if ((b.Featured === 'TRUE') !== (a.Featured === 'TRUE')) return (b.Featured === 'TRUE') - (a.Featured === 'TRUE');
    return (b.UploadedAt || '').localeCompare(a.UploadedAt || '');
  });
  if (!isCurrent()) return;
  const grid = document.getElementById('mn-grid');
  if (!grid) return;
  grid.innerHTML = rows.length === 0 ? '<div class="empty-state" style="grid-column:1/-1;">ยังไม่มี Information</div>' : rows.map((r) => {
    const badges = r.Pinned === 'TRUE' || r.Featured === 'TRUE'
      ? `<span class="info-card-badges">${r.Pinned === 'TRUE' ? iconInline(ICON_PIN, 'info-badge-pin') : ''}${r.Featured === 'TRUE' ? iconInline(ICON_STAR, 'info-badge-star') : ''}</span>` : '';
    const body = r.CoverImageURL
      ? `<div class="info-card-cover" style="background-image:url('${escapeHtml(r.CoverImageURL)}');"></div>
         <span class="info-card-title info-card-title-cover">${escapeHtml(r.Title)}</span>
         <span class="info-card-date">${formatDateTH((r.UploadedAt || '').slice(0, 10))}</span>`
      : `<span class="info-card-icon">${fileIcon(r)}</span>
         <span class="info-card-title">${escapeHtml(r.Title)}</span>
         <span class="info-card-date">${formatDateTH((r.UploadedAt || '').slice(0, 10))}</span>`;
    return `<a class="info-card ${r.CoverImageURL ? 'info-card-has-cover' : ''}" href="${escapeHtml(r.FileURL || r.VideoURL)}" target="_blank" rel="noopener">${badges}${body}</a>`;
  }).join('');
}
