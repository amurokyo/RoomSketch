// RoomSketch 2.0.1 — 工程文件校验与版本迁移入口（文档 §7）
// 格式：{format:'roomsketch', schemaVersion:1, appVersion:'2.0.1', metadata, ...}
// 兼容：旧版 {app:'RoomSketch', version:2} 打开时升级为当前格式；
// 不支持的 schemaVersion 明确报错，绝不静默覆盖或静默忽略。
import { APP_VERSION, FORMAT, SCHEMA_VERSION } from '../version.ts';
import type { ProjectDoc, RsObject } from './types.ts';
import { DEFAULT_SCALE, DEFAULT_VIEW } from './types.ts';
import { normalizeOpenings } from './wallLink.ts';

export function createEmptyProject(): ProjectDoc {
  const now = new Date().toISOString();
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    metadata: { name: 'RoomSketch 工程', createdAt: now, updatedAt: now },
    counter: 1,
    objects: [],
    view: { ...DEFAULT_VIEW },
    scale: DEFAULT_SCALE,
    pdfImported: false,
    pdfPageSize: null,
  };
}

export interface ValidateResult {
  ok: boolean;
  doc?: ProjectDoc;
  error?: string;
  upgradedFromOld?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeObjects(raw: unknown): RsObject[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RsObject[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object' || typeof (o as { type?: unknown }).type !== 'string') return null;
    out.push(o as RsObject);
  }
  return out;
}

function finishDoc(d: ProjectDoc, upgradedFromOld: boolean): ValidateResult {
  // 打开后校验门窗关联（墙不存在 / 段号越界 / wallT 非有限则脱离并重算位置）。
  normalizeOpenings(d.objects);
  return { ok: true, doc: d, upgradedFromOld };
}

/**
 * 校验并规范化工程文件数据。缺失字段补安全默认值；
 * schemaVersion 不支持 / 结构损坏时返回 ok:false + 可理解的错误信息，
 * 调用方不得用失败数据覆盖当前工程。
 */
export function validateProject(data: unknown): ValidateResult {
  if (!isRecord(data)) return { ok: false, error: '工程文件不是有效的 JSON 对象' };
  const isNew = data.format === FORMAT;
  const isOld = data.app === 'RoomSketch';
  if (!isNew && !isOld) return { ok: false, error: '工程文件格式不正确（不是 RoomSketch 工程）' };

  if (isNew && data.schemaVersion !== undefined && data.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `工程格式版本 ${String(data.schemaVersion)} 不受支持（本版本支持 ${SCHEMA_VERSION}）` };
  }

  const objects = sanitizeObjects(data.objects);
  if (!objects) return { ok: false, error: '工程对象数据异常' };

  const now = new Date().toISOString();
  const viewRaw = isRecord(data.view) ? data.view : {};
  const view = {
    x: Number.isFinite(Number(viewRaw.x)) ? Number(viewRaw.x) : DEFAULT_VIEW.x,
    y: Number.isFinite(Number(viewRaw.y)) ? Number(viewRaw.y) : DEFAULT_VIEW.y,
    w: Math.max(1, Number.isFinite(Number(viewRaw.w)) ? Number(viewRaw.w) : DEFAULT_VIEW.w),
    h: Math.max(1, Number.isFinite(Number(viewRaw.h)) ? Number(viewRaw.h) : DEFAULT_VIEW.h),
  };
  const meta = isRecord(data.metadata) ? data.metadata : {};
  const doc: ProjectDoc = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    metadata: {
      name: typeof meta.name === 'string' ? meta.name : 'RoomSketch 工程',
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now,
    },
    counter: Math.max(1, Number(data.counter) || 1),
    objects: objects.map(o => ({ ...o, id: typeof o.id === 'string' ? o.id : '' })),
    view,
    scale: Number(data.scale) || DEFAULT_SCALE,
    pdfImported: !!data.pdfImported,
    pdfPageSize: isRecord(data.pdfPageSize) && Number.isFinite(Number(data.pdfPageSize.w))
      ? { w: Number(data.pdfPageSize.w), h: Number(data.pdfPageSize.h) }
      : null,
  };
  return finishDoc(doc, isOld);
}

/** 序列化保存（更新 updatedAt）。 */
export function serializeProject(doc: ProjectDoc): string {
  const now = new Date().toISOString();
  const out: ProjectDoc = {
    ...doc,
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    metadata: { ...doc.metadata, updatedAt: now },
  };
  return JSON.stringify(out, null, 2);
}
