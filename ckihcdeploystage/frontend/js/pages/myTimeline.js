import { api, state } from '../api.js';
import { renderGuard } from '../utils.js';
import { renderTimeline } from '../components/timeline.js';
import { render as renderOrientationSection } from './myOrientation.js';
import { render as renderMeetingsSection } from './myMeetings.js';

export async function render(container) {
  const isCurrent = renderGuard(container);
  const s = await api.get(`/api/evaluations/probation/${state.user.EmployeeID}`);
  if (!isCurrent()) return;

  container.innerHTML = `
    <div id="timeline-slot"></div>
    <div class="section-title">Orientation Checklist</div>
    <div id="orientation-slot"></div>
    <div class="section-title">Monthly Meeting Record</div>
    <div id="meetings-slot"></div>`;

  renderTimeline(container.querySelector('#timeline-slot'), s);
  await Promise.all([
    renderOrientationSection(container.querySelector('#orientation-slot')),
    renderMeetingsSection(container.querySelector('#meetings-slot')),
  ]);
}
