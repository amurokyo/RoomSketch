import type { PolyroomObject, RsObject } from './types.ts';
import { polyArea } from './geometry.ts';

export const ROOM_COLORS = ['#2e6ed8', '#159a9c', '#7a5af8', '#d97706', '#db5375', '#4b8b3b', '#0077b6', '#8d6e63'];
export const ROOM_ZONES = ['公共区', '办公区', '休息区', '服务区', '设备区', '其他'];

export interface RoomStat {
  id: string;
  name: string;
  zone: string;
  areaMm2: number;
  color: string;
  vertices: number;
  included: boolean;
}

export interface ZoneStat { zone: string; count: number; areaMm2: number }
export interface RoomStats { rooms: RoomStat[]; zones: ZoneStat[]; count: number; totalMm2: number }

export function isRoomObject(o: RsObject): o is PolyroomObject {
  return o.type === 'polyroom' && Array.isArray(o.points) && o.points.length >= 3;
}

export function roomAreaM2(o: PolyroomObject): number {
  return polyArea(o.points) / 1e6;
}

export function roomLabelText(o: PolyroomObject): { name: string; area: string } {
  return {
    name: o.label?.trim() || '未命名房间',
    area: `${roomAreaM2(o).toFixed(2)} m²${o.zone ? ` · ${o.zone}` : ''}`,
  };
}

export function collectRoomStats(objects: RsObject[]): RoomStats {
  const rooms = objects.filter(isRoomObject).map(o => ({
    id: o.id,
    name: o.label?.trim() || '未命名房间',
    zone: o.zone?.trim() || '未分区',
    areaMm2: polyArea(o.points),
    color: o.fill || '#2e6ed8',
    vertices: o.points.length,
    included: o.includeInTotal !== false,
  }));
  const included = rooms.filter(r => r.included);
  const byZone = new Map<string, ZoneStat>();
  for (const room of included) {
    const z = byZone.get(room.zone) ?? { zone: room.zone, count: 0, areaMm2: 0 };
    z.count++;
    z.areaMm2 += room.areaMm2;
    byZone.set(room.zone, z);
  }
  return {
    rooms,
    zones: [...byZone.values()].sort((a, b) => b.areaMm2 - a.areaMm2),
    count: included.length,
    totalMm2: included.reduce((sum, r) => sum + r.areaMm2, 0),
  };
}

export function formatArea(mm2: number): string {
  return `${(mm2 / 1e6).toFixed(2)} m²`;
}
