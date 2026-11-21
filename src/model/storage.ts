// RoomSketch 2.0.2 — 本地存储与自动备份（文档 §7.4、§5.4）
// localStorage / IndexedDB 只是增强能力：不可用时仍须支持工程文件
// 打开、编辑和导出；缓存备份与工程文件保存状态必须分别显示；
// 缓存恢复不得覆盖用户主动打开的工程；恢复必须经用户确认。
import type { ProjectDoc } from './types.ts';
import { SCHEMA_VERSION } from '../version.ts';

export const BACKUP_KEY = 'roomsketch-autobackup-v2';

export interface BackupPayload {
  format: 'roomsketch';
  schemaVersion: number;
  appVersion: string;
  at: number;
  objects: ProjectDoc['objects'];
  view: ProjectDoc['view'];
  scale: number;
  pdfImported: boolean;
  pdfPageSize: ProjectDoc['pdfPageSize'];
  pdfPageSizes?: ProjectDoc['pdfPageSizes'];
  layers?: ProjectDoc['layers'];
  layerOrder?: ProjectDoc['layerOrder'];
  counter: number;
}

export interface StorageProbe {
  localStorage: boolean;
  localStorageError?: string;
  indexedDB: boolean;
  indexedDBError?: string;
}

/** 检测存储能力（写一删一的 localStorage 探针 + 打开 IndexedDB）。 */
export async function probeStorage(): Promise<StorageProbe> {
  const r: StorageProbe = { localStorage: false, indexedDB: false };
  try {
    localStorage.setItem('__rs_probe__', '1');
    r.localStorage = localStorage.getItem('__rs_probe__') === '1';
    localStorage.removeItem('__rs_probe__');
  } catch (e) {
    r.localStorageError = String(e);
  }
  if (!('indexedDB' in globalThis)) {
    r.indexedDBError = '无 indexedDB';
  } else {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 3000);
        const req = indexedDB.open('__rs_probe__', 1);
        req.onsuccess = () => { clearTimeout(t); req.result.close(); indexedDB.deleteDatabase('__rs_probe__'); resolve(true); };
        req.onerror = () => { clearTimeout(t); resolve(false); };
        req.onblocked = () => { clearTimeout(t); resolve(false); };
      });
      r.indexedDB = ok;
      if (!ok) r.indexedDBError = '打开失败/超时';
    } catch (e) {
      r.indexedDBError = String(e);
    }
  }
  return r;
}

export function readBackup(): BackupPayload | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as BackupPayload;
    // 备份可能来自 1.0.0（同 key、同 shape）或被外部改坏：逐项验形，
    // 不合形直接视为无备份——恢复条不出现，恢复不碰当前工程。
    if (!d || typeof d !== 'object') return null;
    if (d.schemaVersion != null && d.schemaVersion !== SCHEMA_VERSION) return null;
    if (!Array.isArray(d.objects) || d.objects.length === 0) return null;
    if (!d.objects.every(o => o && typeof o === 'object' && typeof (o as { type?: unknown }).type === 'string')) return null;
    if (d.view != null && (typeof d.view !== 'object' || !Number.isFinite(Number((d.view as { x?: unknown }).x)))) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeBackup(p: BackupPayload): boolean {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearBackup(): void {
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
}
