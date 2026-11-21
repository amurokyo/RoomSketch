// RoomSketch 2.0.2 — 家具图库与稳定外观类型
export type FurnKind =
  | 'toilet' | 'roundbath' | 'bath' | 'roundsink' | 'sink' | 'kitchensink' | 'shower' | 'fridge'
  | 'stove' | 'washer' | 'dishwasher' | 'oven' | 'microwave' | 'island'
  | 'roundtable' | 'roundbed' | 'roundstool' | 'roundcoffee' | 'roundcarpet'
  | 'wardrobe' | 'cabinet' | 'bookshelf' | 'shoecabinet' | 'bed' | 'crib' | 'sofa' | 'lsofa'
  | 'chair' | 'stairs' | 'plant' | 'carpet' | 'screen' | 'table' | 'desk' | 'workstation'
  | 'vanity' | 'urinal' | 'squat' | 'printer' | 'cooler' | 'rack' | 'bench'
  | 'firehydrant' | 'extinguisher' | 'box';

export interface FurnItem { label: string; w: number; h: number; kind: FurnKind; height?: number }
export interface FurnCategory { cat: string; items: FurnItem[] }

const f = (label: string, w: number, h: number, kind?: FurnKind, height?: number): FurnItem => ({ label, w, h, kind: kind || furnKind(label), ...(height ? { height } : {}) });

export const FURN_LIB: FurnCategory[] = [
  { cat: '卧室', items: [
    f('双人床', 2000, 1500), f('单人床', 1200, 2000), f('圆床', 2200, 2200), f('衣柜', 1800, 600),
    f('床头柜', 500, 450), f('梳妆台', 1000, 450), f('榻榻米', 2400, 2000, 'bed', 420),
    f('儿童床', 1600, 800, 'bed'), f('婴儿床', 1200, 700, 'crib'), f('鞋柜', 1000, 350, 'shoecabinet'),
  ] },
  { cat: '客厅', items: [
    f('三人沙发', 2100, 850), f('双人沙发', 1600, 850, 'sofa'), f('L 型沙发', 2600, 1800, 'lsofa'),
    f('单人沙发', 900, 850), f('单人躺椅', 1500, 750, 'chair'), f('茶几', 1100, 600),
    f('圆形茶几', 800, 800), f('圆凳', 420, 420), f('电视柜', 1600, 450), f('地毯', 2400, 1600),
    f('书架', 1200, 350, 'bookshelf'), f('边几', 500, 500, 'roundcoffee'),
  ] },
  { cat: '餐厨', items: [
    f('餐桌', 1400, 800), f('圆桌', 1200, 1200), f('餐椅', 450, 450), f('橱柜', 2400, 600),
    f('冰箱', 700, 700), f('灶台', 800, 500), f('厨房水槽', 800, 550, 'kitchensink'),
    f('洗碗机', 600, 600, 'dishwasher'), f('消毒柜', 600, 600, 'cabinet'),
    f('烤箱', 600, 600, 'oven'), f('微波炉', 550, 400, 'microwave'),
    f('厨房中岛', 1800, 900, 'island'), f('吧台', 1800, 600, 'table'), f('吧椅', 420, 420, 'roundstool'),
  ] },
  { cat: '卫浴', items: [
    f('坐便器', 400, 650), f('浴缸', 1700, 750), f('圆形浴缸', 1600, 1600), f('洗手盆', 600, 450),
    f('立柱洗手盆', 500, 500), f('洗衣机', 600, 600), f('淋浴房', 900, 900),
    f('浴室柜', 1000, 550, 'vanity'), f('小便器', 400, 650, 'urinal'),
    f('蹲便器', 450, 650, 'squat'), f('拖把池', 600, 500, 'sink'),
  ] },
  { cat: '办公', items: [
    f('办公桌', 1200, 600), f('电脑桌', 1400, 700, 'desk'), f('双人工作台', 2400, 1200, 'workstation'),
    f('会议桌', 2000, 1000), f('圆形会议桌', 1500, 1500), f('办公椅', 500, 500),
    f('文件柜', 900, 450), f('前台桌', 1600, 700), f('办公书架', 1200, 350, 'bookshelf'),
    f('打印机', 600, 550, 'printer'), f('复印机', 800, 700, 'printer'), f('饮水机', 350, 350, 'cooler'),
    f('洽谈桌', 900, 900, 'roundtable'), f('服务器机柜', 600, 1000, 'rack'), f('监控操作席', 1800, 800, 'workstation'),
  ] },
  { cat: '通用', items: [
    f('楼梯段', 2600, 1000), f('花架', 600, 600), f('储物柜', 1000, 500), f('屏风隔断', 1500, 80),
    f('绿植', 600, 600), f('圆形地毯', 2000, 2000), f('圆形花坛', 1200, 1200),
    f('设备机柜', 600, 800, 'rack'), f('UPS 电池柜', 800, 800, 'rack'),
    f('消防栓', 700, 250, 'firehydrant'), f('灭火器', 300, 200, 'extinguisher'),
    f('长凳', 1500, 400, 'bench'), f('移动白板', 1200, 100, 'screen'), f('折叠椅', 450, 450, 'chair'),
  ] },
];

export const FURN_PRESETS: Record<string, [number, number, string]> = {
  table: [1400, 700, '桌子'], desk: [1200, 600, '办公桌'], cabinet: [900, 450, '柜子'],
  wardrobe: [1800, 600, '衣柜'], bed: [2000, 1500, '床'], sofa: [2100, 850, '沙发'],
  chair: [500, 500, '椅子'], roundtable: [1200, 1200, '圆桌'],
};

export function furnKind(label: string | undefined): FurnKind {
  const s = label || '';
  if (/L\s*型|转角沙发/.test(s)) return 'lsofa';
  if (/书架/.test(s)) return 'bookshelf';
  if (/鞋柜/.test(s)) return 'shoecabinet';
  if (/婴儿床/.test(s)) return 'crib';
  if (/坐便器|马桶/.test(s)) return 'toilet';
  if (/小便器/.test(s)) return 'urinal';
  if (/蹲便器/.test(s)) return 'squat';
  if (/圆形浴缸/.test(s)) return 'roundbath';
  if (/浴缸/.test(s)) return 'bath';
  if (/立柱洗手盆|独立洗手盆|圆洗手盆/.test(s)) return 'roundsink';
  if (/厨房水槽/.test(s)) return 'kitchensink';
  if (/浴室柜/.test(s)) return 'vanity';
  if (/洗手盆|面盆|拖把池/.test(s)) return 'sink';
  if (/淋浴/.test(s)) return 'shower';
  if (/冰箱/.test(s)) return 'fridge';
  if (/洗碗机/.test(s)) return 'dishwasher';
  if (/烤箱/.test(s)) return 'oven';
  if (/微波炉/.test(s)) return 'microwave';
  if (/中岛/.test(s)) return 'island';
  if (/灶台/.test(s)) return 'stove';
  if (/洗衣机/.test(s)) return 'washer';
  if (/圆桌|圆台面|圆形会议桌|洽谈桌/.test(s)) return 'roundtable';
  if (/圆床/.test(s)) return 'roundbed';
  if (/圆凳|吧台凳|吧椅/.test(s)) return 'roundstool';
  if (/圆(形)?茶几|圆几/.test(s)) return 'roundcoffee';
  if (/圆形地毯|圆毯/.test(s)) return 'roundcarpet';
  if (/服务器|设备机柜|电池柜|机柜/.test(s)) return 'rack';
  if (/打印机|复印机/.test(s)) return 'printer';
  if (/饮水机/.test(s)) return 'cooler';
  if (/工作台|操作席/.test(s)) return 'workstation';
  if (/电脑桌/.test(s)) return 'desk';
  if (/长凳/.test(s)) return 'bench';
  if (/消防栓/.test(s)) return 'firehydrant';
  if (/灭火器/.test(s)) return 'extinguisher';
  if (/衣柜|文件柜|储物柜|电视柜|床头柜/.test(s)) return 'wardrobe';
  if (/柜/.test(s)) return 'cabinet';
  if (/床|榻榻米/.test(s)) return 'bed';
  if (/沙发/.test(s)) return 'sofa';
  if (/椅/.test(s)) return 'chair';
  if (/楼梯/.test(s)) return 'stairs';
  if (/绿植|植物|花坛/.test(s)) return 'plant';
  if (/地毯/.test(s)) return 'carpet';
  if (/屏风|隔断|白板/.test(s)) return 'screen';
  if (/桌|台/.test(s)) return 'table';
  return 'box';
}

export const ROUND_KINDS: FurnKind[] = [
  'roundtable', 'roundbed', 'roundstool', 'roundcoffee',
  'roundbath', 'roundcarpet', 'roundsink', 'plant',
];

/** 家具三维高度（mm），优先使用图库高度，旧工程按名称关键字回退。 */
export function furnH3D(label: string | undefined): number {
  const s = label || '';
  if (/书架|鞋柜/.test(s)) return 2000;
  if (/机柜|电池柜/.test(s)) return 2000;
  if (/衣柜|文件柜|储物柜|冰箱/.test(s)) return 1900;
  if (/屏风|隔断|白板/.test(s)) return 1600;
  if (/绿植|花坛/.test(s)) return 1300;
  if (/沙发/.test(s)) return 800;
  if (/洗手盆|灶台|橱柜|洗衣机|洗碗机|中岛|浴室柜/.test(s)) return 850;
  if (/茶几/.test(s)) return 430;
  if (/凳/.test(s)) return 460;
  if (/地毯/.test(s)) return 30;
  if (/打印机|复印机/.test(s)) return 500;
  if (/桌|台/.test(s)) return 740;
  if (/床|榻榻米/.test(s)) return 550;
  if (/浴缸/.test(s)) return 550;
  if (/马桶|坐便|椅/.test(s)) return 430;
  return 700;
}
