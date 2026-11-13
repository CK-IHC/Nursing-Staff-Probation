// แคชข้อมูลอ้างอิงที่ใช้บ่อยไว้ในตัวแปร JS (ไม่ใช้ localStorage) โหลดครั้งเดียวหลังล็อกอิน
import { api } from './api.js';

export const cache = {
  costCenters: [],
  subServices: [],
  settings: {},
  lists: {},
  isTeamSupervisor: false,
};

export async function loadReferenceData() {
  const [costCenters, subServices, settings, lists, team] = await Promise.all([
    api.get('/api/org/cost-centers'),
    api.get('/api/org/sub-services'),
    api.get('/api/settings'),
    api.get('/api/lists'),
    api.get('/api/staff/team').catch(() => []),
  ]);
  cache.costCenters = costCenters;
  cache.subServices = subServices;
  cache.settings = settings;
  cache.lists = lists;
  cache.isTeamSupervisor = team.length > 0;
  return cache;
}

export function costCenterName(id) {
  return cache.costCenters.find((c) => c.CostCenterID === id)?.Name || '';
}

export function subServiceName(id) {
  return cache.subServices.find((s) => s.SubServiceID === id)?.Name || '';
}

export function subServicesFor(costCenterId) {
  return cache.subServices.filter((s) => s.CostCenterID === costCenterId);
}

/** ค่ารายการ dropdown/tag ตามหมวดหมู่ (Position, JobFunction, ConsultationTopic, ...) จากชีต Lists */
export function listValues(category) {
  return (cache.lists[category] || []).map((r) => r.Value);
}

/** คู่จับคู่ตำแหน่ง (Position) -> Job Function ที่ตั้งไว้ใน Settings (Lists หมวด PositionJobFunctionMap, Value เป็น JSON) */
export function positionJobFunctionMap() {
  const map = {};
  (cache.lists.PositionJobFunctionMap || []).forEach((r) => {
    try {
      const parsed = JSON.parse(r.Value);
      if (parsed.position) map[parsed.position] = parsed.jobFunction || '';
    } catch { /* ignore */ }
  });
  return map;
}
