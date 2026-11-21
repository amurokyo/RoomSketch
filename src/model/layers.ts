import type { LayerId, LayerStateMap, ProjectDoc, RsObject } from './types.ts';

export const DEFAULT_LAYER_ORDER: LayerId[] = [
  'background', 'pdf', 'rooms', 'walls', 'furniture', 'openings', 'annotations',
];

export const LAYER_NAMES: Record<LayerId, string> = {
  background: '图片底图', pdf: 'PDF 矢量', rooms: '房间 / 分区', walls: '墙体',
  furniture: '家具陈列', openings: '门窗', annotations: '标注 / 辅助线',
};

export function defaultLayers(): LayerStateMap {
  return Object.fromEntries(DEFAULT_LAYER_ORDER.map(id => [id, { visible: true, locked: false }])) as LayerStateMap;
}

export function normalizeLayerOrder(raw: unknown): LayerId[] {
  const input = Array.isArray(raw) ? raw : [];
  const valid = input.filter((v): v is LayerId => typeof v === 'string' && DEFAULT_LAYER_ORDER.includes(v as LayerId));
  return [...new Set([...valid, ...DEFAULT_LAYER_ORDER])];
}

export function normalizeLayers(raw: unknown): LayerStateMap {
  const defaults = defaultLayers();
  if (!raw || typeof raw !== 'object') return defaults;
  const record = raw as Record<string, unknown>;
  for (const id of DEFAULT_LAYER_ORDER) {
    const value = record[id];
    if (value && typeof value === 'object') {
      defaults[id] = {
        visible: (value as { visible?: unknown }).visible !== false,
        locked: (value as { locked?: unknown }).locked === true,
      };
    }
  }
  return defaults;
}

export function layerForObject(o: RsObject): LayerId {
  if (o.type === 'imagebg') return 'background';
  if (o.type === 'pdf') return 'pdf';
  if (o.type === 'polyroom' || (o.type === 'rect' && !!o.label)) return 'rooms';
  if (o.type === 'wall') return 'walls';
  if (o.type === 'furniture') return 'furniture';
  if (o.type === 'door' || o.type === 'window') return 'openings';
  return 'annotations';
}

export function layerState(doc: ProjectDoc, id: LayerId): { visible: boolean; locked: boolean } {
  return doc.layers?.[id] ?? { visible: true, locked: false };
}

export function isObjectVisible(doc: ProjectDoc, o: RsObject): boolean {
  return layerState(doc, layerForObject(o)).visible;
}

export function isObjectLocked(doc: ProjectDoc, o: RsObject): boolean {
  return layerState(doc, layerForObject(o)).locked;
}

/** 渲染、命中测试、适合窗口与导出共用的顺序：图层顺序优先，同层保持数组顺序。 */
export function orderedVisibleObjects(doc: ProjectDoc): RsObject[] {
  const order = normalizeLayerOrder(doc.layerOrder);
  const rank = new Map(order.map((id, i) => [id, i]));
  return doc.objects
    .map((o, index) => ({ o, index }))
    .filter(({ o }) => isObjectVisible(doc, o))
    .sort((a, b) => (rank.get(layerForObject(a.o)) ?? 0) - (rank.get(layerForObject(b.o)) ?? 0) || a.index - b.index)
    .map(({ o }) => o);
}
