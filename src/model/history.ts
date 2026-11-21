// RoomSketch 2.0.2 — 历史记录（撤销 / 重做，文档 §6.8）
// 快照内容 = 工程状态（对象 + PDF 导入状态 + 计数器），与 1.0.0 一致；
// 视图状态（view、选中）不进历史，选中由调用方在恢复后重建。
// 上限 80 步，批量操作由调用方合并为一次快照。
// 注意：两个栈必须是响应式数组——store 用 computed(() => history.undoDepth)
// 驱动撤销/重做按钮的 disabled 状态；普通数组的 push/pop 不会触发 computed
// 重算，按钮会永远 disabled（快捷键直接调 undo()/redo()，不受影响）。
// 清空栈时用 length = 0 而不要整体换新数组，否则会丢掉响应式包装。
import { reactive } from 'vue';
import type { ProjectDoc, RsObject } from './types.ts';

export interface HistoryState {
  objects: RsObject[];
  pdfImported: boolean;
  pdfPageSize: ProjectDoc['pdfPageSize'];
  counter: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class History {
  readonly maxSteps = 80;
  private undoStack: HistoryState[] = reactive([]);
  private redoStack: HistoryState[] = reactive([]);

  get undoDepth(): number { return this.undoStack.length; }
  get redoDepth(): number { return this.redoStack.length; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** 操作前调用：把当前状态压栈，并清空重做栈。 */
  snapshot(state: HistoryState): void {
    this.undoStack.push(clone(state));
    if (this.undoStack.length > this.maxSteps) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** 撤销：返回应恢复的状态；无历史返回 null。 */
  undo(current: HistoryState): HistoryState | null {
    if (!this.undoStack.length) return null;
    this.redoStack.push(clone(current));
    return clone(this.undoStack.pop() as HistoryState);
  }

  /** 重做：返回应恢复的状态；无历史返回 null。 */
  redo(current: HistoryState): HistoryState | null {
    if (!this.redoStack.length) return null;
    this.undoStack.push(clone(current));
    return clone(this.redoStack.pop() as HistoryState);
  }

  /** 撤销一次“误拍”的快照（例如拖动未实际移动时），与 1.0.0 的 undoStack.pop() 等价。 */
  dropLastSnapshot(): void {
    this.undoStack.pop();
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
