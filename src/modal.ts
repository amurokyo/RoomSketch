// RoomSketch 2.0.2 — 轻量确认框服务（替代 1.0.0 的 innerHTML 弹窗）
import { reactive } from 'vue';

export interface ModalState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
}

export const modalState = reactive<ModalState>({
  open: false, title: '', message: '', confirmText: '确认', danger: false, onConfirm: null, onCancel: null,
});

export function showConfirm(opts: {
  title: string; message: string; confirmText?: string; danger?: boolean;
  onConfirm: () => void; onCancel?: () => void;
}): void {
  modalState.title = opts.title;
  modalState.message = opts.message;
  modalState.confirmText = opts.confirmText ?? '确认';
  modalState.danger = !!opts.danger;
  modalState.onConfirm = opts.onConfirm;
  modalState.onCancel = opts.onCancel ?? null;
  modalState.open = true;
}

export function closeModal(): void {
  modalState.open = false;
  modalState.onConfirm = null;
  modalState.onCancel = null;
}

/** 用户明确取消：执行 onCancel 后统一清理。 */
export function cancelModal(): void {
  const fn = modalState.onCancel;
  closeModal();
  fn?.();
}

export function confirmModal(): void {
  const fn = modalState.onConfirm;
  modalState.open = false;
  modalState.onConfirm = null;
  modalState.onCancel = null;
  fn?.();
}
