// RoomSketch 2.0.0 — 家具图库与外观分类（移植 1.0.0）
export interface FurnItem { label: string; w: number; h: number }
export interface FurnCategory { cat: string; items: FurnItem[] }

export const FURN_LIB: FurnCategory[] = [
  { cat: '卧室', items: [{ label: '双人床', w: 2000, h: 1500 }, { label: '单人床', w: 1200, h: 2000 }, { label: '圆床', w: 2200, h: 2200 }, { label: '衣柜', w: 1800, h: 600 }, { label: '床头柜', w: 500, h: 450 }, { label: '梳妆台', w: 1000, h: 450 }] },
  { cat: '客厅', items: [{ label: '三人沙发', w: 2100, h: 850 }, { label: '单人沙发', w: 900, h: 850 }, { label: '茶几', w: 1100, h: 600 }, { label: '圆形茶几', w: 800, h: 800 }, { label: '圆凳', w: 420, h: 420 }, { label: '电视柜', w: 1600, h: 450 }, { label: '地毯', w: 2400, h: 1600 }] },
  { cat: '餐厨', items: [{ label: '餐桌', w: 1400, h: 800 }, { label: '圆桌', w: 1200, h: 1200 }, { label: '餐椅', w: 450, h: 450 }, { label: '橱柜', w: 2400, h: 600 }, { label: '冰箱', w: 700, h: 700 }, { label: '灶台', w: 800, h: 500 }] },
  { cat: '卫浴', items: [{ label: '坐便器', w: 400, h: 650 }, { label: '浴缸', w: 1700, h: 750 }, { label: '圆形浴缸', w: 1600, h: 1600 }, { label: '洗手盆', w: 600, h: 450 }, { label: '立柱洗手盆', w: 500, h: 500 }, { label: '洗衣机', w: 600, h: 600 }, { label: '淋浴房', w: 900, h: 900 }] },
  { cat: '办公', items: [{ label: '办公桌', w: 1200, h: 600 }, { label: '会议桌', w: 2000, h: 1000 }, { label: '圆形会议桌', w: 1500, h: 1500 }, { label: '办公椅', w: 500, h: 500 }, { label: '文件柜', w: 900, h: 450 }, { label: '前台桌', w: 1600, h: 700 }] },
  { cat: '通用', items: [{ label: '楼梯段', w: 2600, h: 1000 }, { label: '花架', w: 600, h: 600 }, { label: '储物柜', w: 1000, h: 500 }, { label: '屏风隔断', w: 1500, h: 80 }, { label: '绿植', w: 600, h: 600 }, { label: '圆形地毯', w: 2000, h: 2000 }, { label: '圆形花坛', w: 1200, h: 1200 }] },
];

export const FURN_PRESETS: Record<string, [number, number, string]> = {
  table: [1400, 700, '桌子'], desk: [1200, 600, '办公桌'], cabinet: [900, 450, '柜子'],
  wardrobe: [1800, 600, '衣柜'], bed: [2000, 1500, '床'], sofa: [2100, 850, '沙发'],
  chair: [500, 500, '椅子'], roundtable: [1200, 1200, '圆桌'],
};

export type FurnKind =
  | 'toilet' | 'roundbath' | 'bath' | 'roundsink' | 'sink' | 'shower' | 'fridge'
  | 'stove' | 'washer' | 'roundtable' | 'roundbed' | 'roundstool' | 'roundcoffee'
  | 'roundcarpet' | 'wardrobe' | 'cabinet' | 'bed' | 'sofa' | 'chair' | 'stairs'
  | 'plant' | 'carpet' | 'screen' | 'table' | 'box';

export function furnKind(label: string | undefined): FurnKind {
  const s = label || '';
  if (/坐便器|马桶/.test(s)) return 'toilet';
  if (/圆形浴缸/.test(s)) return 'roundbath';
  if (/浴缸/.test(s)) return 'bath';
  if (/立柱洗手盆|独立洗手盆|圆洗手盆/.test(s)) return 'roundsink';
  if (/洗手盆|面盆/.test(s)) return 'sink';
  if (/淋浴/.test(s)) return 'shower';
  if (/冰箱/.test(s)) return 'fridge';
  if (/灶台/.test(s)) return 'stove';
  if (/洗衣机/.test(s)) return 'washer';
  if (/圆桌|圆台面|圆形会议桌/.test(s)) return 'roundtable';
  if (/圆床/.test(s)) return 'roundbed';
  if (/圆凳|吧台凳/.test(s)) return 'roundstool';
  if (/圆(形)?茶几|圆几/.test(s)) return 'roundcoffee';
  if (/圆形地毯|圆毯/.test(s)) return 'roundcarpet';
  if (/衣柜|文件柜|储物柜|电视柜|床头柜/.test(s)) return 'wardrobe';
  if (/柜/.test(s)) return 'cabinet';
  if (/床/.test(s)) return 'bed';
  if (/沙发/.test(s)) return 'sofa';
  if (/椅/.test(s)) return 'chair';
  if (/楼梯/.test(s)) return 'stairs';
  if (/绿植|植物|花坛/.test(s)) return 'plant';
  if (/地毯/.test(s)) return 'carpet';
  if (/屏风|隔断/.test(s)) return 'screen';
  if (/桌|台/.test(s)) return 'table';
  return 'box';
}

export const ROUND_KINDS: FurnKind[] = [
  'roundtable', 'roundbed', 'roundstool', 'roundcoffee',
  'roundbath', 'roundcarpet', 'roundsink', 'plant',
];

/** 家具三维高度（mm），按名称关键字推断。 */
export function furnH3D(label: string | undefined): number {
  const s = label || '';
  if (/衣柜|文件柜|储物柜|冰箱/.test(s)) return 1900;
  if (/屏风|隔断/.test(s)) return 1600;
  if (/绿植|花坛/.test(s)) return 1300;
  if (/沙发/.test(s)) return 800;
  if (/洗手盆|灶台|橱柜|洗衣机/.test(s)) return 850;
  if (/茶几/.test(s)) return 430;
  if (/凳/.test(s)) return 460;
  if (/地毯/.test(s)) return 30;
  if (/桌|台/.test(s)) return 740;
  if (/床/.test(s)) return 550;
  if (/浴缸/.test(s)) return 550;
  if (/马桶|坐便|椅/.test(s)) return 430;
  return 700;
}
