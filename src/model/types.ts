// RoomSketch 2.0.1 — 统一工程文档模型（文档 §7）
// 对象字段与 1.0.0 保持一致（同名字段、同义语义），因此 1.0.0 工程文件
// 无需迁移即可打开；schemaVersion 仍为 1，appVersion 写 2.0.0。
// 坐标单位：毫米（mm）。对象原点 (x, y) + 局部坐标；rotation 为绕原点的度数。

export type ObjectType =
  | 'wall' | 'polyroom' | 'rect' | 'line' | 'polyline' | 'pdf'
  | 'furniture' | 'door' | 'window' | 'dimension' | 'label' | 'imagebg';

export type Point = [number, number];

export interface BaseObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  rotation?: number;
  stroke?: number;
  strokeColor?: string;
  label?: string;
  fill?: string;
}

export interface WallObject extends BaseObject {
  type: 'wall';
  /** 相对原点的折线点列（局部坐标） */
  points: Point[];
  wallWidth: number;
  wallHeight?: number;
}

export interface PolyroomObject extends BaseObject {
  type: 'polyroom';
  points: Point[];
}

export interface RectObject extends BaseObject {
  type: 'rect';
  w: number;
  h: number;
}

export interface LineObject extends BaseObject {
  type: 'line' | 'polyline' | 'pdf';
  points: Point[];
  closed?: boolean;
  /** PDF 导入产生的矢量对象 */
  pdfOrigin?: boolean;
  pdfStrokeColor?: string;
}

export interface FurnitureObject extends BaseObject {
  type: 'furniture';
  w: number;
  h: number;
  /** 三维高度（mm），默认由名称关键字推断 */
  furnH?: number;
}

export interface DoorObject extends BaseObject {
  type: 'door';
  w: number;
  /** 开向：1 顺时针 / -1 逆时针 */
  dir: 1 | -1;
  wallId?: string | null;
  wallSeg?: number | null;
  wallT?: number | null;
}

export interface WindowObject extends BaseObject {
  type: 'window';
  w: number;
  wallId?: string | null;
  wallSeg?: number | null;
  wallT?: number | null;
}

export interface DimensionObject extends BaseObject {
  type: 'dimension';
  length: number;
}

export interface LabelObject extends BaseObject {
  type: 'label';
  fontSize?: number;
}

export interface ImageBgObject extends BaseObject {
  type: 'imagebg';
  w: number;
  h: number;
  /** data URL（JPEG） */
  src: string;
  srcW?: number;
  srcH?: number;
  opacity?: number;
}

export type RsObject =
  | WallObject | PolyroomObject | RectObject | LineObject | FurnitureObject
  | DoorObject | WindowObject | DimensionObject | LabelObject | ImageBgObject;

export type OpeningObject = DoorObject | WindowObject;

export interface ViewBox { x: number; y: number; w: number; h: number }

export interface ProjectMeta {
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDoc {
  format: 'roomsketch';
  schemaVersion: number;
  appVersion: string;
  metadata: ProjectMeta;
  counter: number;
  objects: RsObject[];
  view: ViewBox;
  scale: number;
  pdfImported: boolean;
  pdfPageSize: { w: number; h: number } | null;
}

export const DEFAULT_VIEW: ViewBox = { x: 0, y: 0, w: 12000, h: 8000 };
export const DEFAULT_SCALE = 50;
