/**
 * 修复错误的分类级映射 + 补充未映射的中文分类图片
 * 规则：
 *  1. 从图片文件名解析 volume（容量）和特征关键词
 *  2. 对 matchType=category 且图片与 SKU 品类不匹配的条目进行修正
 *  3. 不覆盖 exact / keyword / gsbio-crawl 已有的精确映射
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'src', 'data', 'product-image-map.json');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'products');

// ── 手动维护的精确图片映射规则 ──────────────────────────────────────────────
// key: 匹配条件函数（传入产品 SKU 和描述），value: 图片文件名
const RULES = [
  // ──── 普通吸头 ────
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && desc.includes('200') && desc.includes('加长'),
    image: '普通吸头_200uL普通加长吸头_116.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && desc.includes('200') && !desc.includes('加长') && !desc.includes('低吸附'),
    image: '普通吸头_200uL普通吸头_115.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && (desc.includes('1000') || desc.includes('1,000')) && desc.includes('加长'),
    image: '普通吸头_1000uL普通加长吸头_118.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && (desc.includes('1000') || desc.includes('1,000')) && !desc.includes('加长') && !desc.includes('低吸附'),
    image: '普通吸头_1000uL普通吸头_117.jpg',
  },
  // 10uL 吸头 - 使用已有的移液处理图
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && desc.includes('10 ul') && desc.includes('加长'),
    image: '移液处理_10uL加长普通吸头_102.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && (desc.startsWith('0.1-10') || desc.startsWith('10ul')) && !desc.includes('低吸附'),
    image: '移液处理_10uL普通吸头_98.jpg',
  },
  // ──── 机械吸头 ────
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && desc.includes('50') && desc.includes('机械'),
    image: '机械吸头_50uL机械吸头_129.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && (desc.includes('Tecan') || desc.includes('导电')),
    image: '机械吸头_200uL导电吸头Tecan吸头_130.jpg',
  },
  {
    test: (sku, desc) => sku.startsWith('BSD-HC-TIP') && (desc.includes('1000') || desc.includes('1,000')) && desc.includes('机械'),
    image: '机械吸头_1000uL机械吸头_131.jpg',
  },
  // ──── 深孔板 ────
  {
    test: (sku, desc) => desc.includes('深孔') && desc.includes('1.3') && desc.includes('U底'),
    image: '深孔板_1.3mL圆孔U底深孔板_143.jpg',
  },
  {
    test: (sku, desc) => desc.includes('深孔') && desc.includes('2.2') && desc.includes('U底'),
    image: '深孔板_2.2mL方孔U底深孔板_144.jpg',
  },
  {
    test: (sku, desc) => desc.includes('深孔') && desc.includes('2.2') && desc.includes('V底'),
    image: '深孔板_2.2mL方孔V底深孔板_145.jpg',
  },
  // ──── 离心管 ────
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('5mL'),
    image: '微量离心管_5mL圆底离心管_228.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('10mL'),
    image: '微量离心管_10mL圆底离心管_229.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('15mL'),
    image: '微量离心管_15mL锥底离心管_230.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('50mL') && desc.includes('可立'),
    image: '微量离心管_50mL可立离心管_233.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('50mL') && desc.includes('锥底'),
    image: '微量离心管_50mL锥底离心管_231.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('离心管') || sku.includes('-CT-')) && desc.includes('50mL'),
    image: '微量离心管_50mL圆底离心管_232.jpg',
  },
  // ──── 保存管 / 冻存管 ────
  {
    test: (sku, desc) => desc.includes('0.5') && (desc.includes('保存管') || desc.includes('冻存管')),
    image: '样品保存_0.5ml保存管_194.jpg',
  },
  {
    test: (sku, desc) => desc.includes('1.5') && (desc.includes('保存管') || desc.includes('冻存管') || desc.includes('微量离心')),
    image: '样品保存_1.5mL保存管_197.jpg',
  },
  {
    test: (sku, desc) => desc.includes('2.0') && (desc.includes('保存管') || desc.includes('冻存管')),
    image: '样品保存_2.0mL保存管_200.jpg',
  },
  // ──── 试剂瓶 ────
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('60'),
    image: '试剂瓶_60mL广口试剂瓶_247.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('125'),
    image: '试剂瓶_125mL广口试剂瓶_248.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('250'),
    image: '试剂瓶_250mL广口试剂瓶_249.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('500'),
    image: '试剂瓶_500mL广口试剂瓶_250.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('1000'),
    image: '试剂瓶_1000mL广口试剂瓶_251.jpg',
  },
  {
    test: (sku, desc) => (desc.includes('试剂瓶') || sku.includes('-RB-')) && desc.includes('4mL') && desc.includes('窄口'),
    image: '试剂瓶_4mL窄口试剂瓶_252.jpg',
  },
  // ──── PCR 相关 ────
  {
    test: (sku, desc) => desc.includes('PCR封板膜') || desc.includes('封板膜'),
    image: '分子生物类_PCR封板膜_4.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.1mL') && desc.includes('8联管') && desc.includes('带缺口'),
    image: '分子生物类_0.1mL_PCR_8联管（带缺口）_10.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('8联管') && desc.includes('带缺口'),
    image: '分子生物类_0.2mL_PCR_8联管（带缺口）_12.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.1mL') && desc.includes('高裙边') && desc.includes('96'),
    image: '分子生物类_0.1mL高裙边96孔PCR板_15.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('高裙边') && desc.includes('96'),
    image: '分子生物类_0.2mL高裙边96孔PCR板_17.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('无裙边') && desc.includes('96'),
    image: '分子生物类_0.2mL无裙边96孔PCR板_7.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('半裙边') && desc.includes('96'),
    image: '分子生物类_0.2mL半裙边96孔PCR板_11.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('宽裙边') && desc.includes('96'),
    image: '分子生物类_0.2mL宽裙边96孔PCR板_13.jpg',
  },
  {
    test: (sku, desc) => desc.includes('0.2mL') && desc.includes('12联管'),
    image: '分子生物类_0.2mL_PCR_12联管_16.jpg',
  },
  {
    test: (sku, desc) => desc.includes('透明平盖单管'),
    image: '分子生物类_透明平盖单管_18.jpg',
  },
  // ──── 细胞培养 ────
  {
    test: (sku, desc) => desc.includes('细胞工厂'),
    image: '细胞培养类_细胞工厂_259.jpg',
  },
  {
    test: (sku, desc) => desc.includes('96孔') && desc.includes('透明底') && desc.includes('培养板'),
    image: '细胞培养类_96孔透明底细胞培养板_260.jpg',
  },
  {
    test: (sku, desc) => desc.includes('96孔') && desc.includes('避光') && desc.includes('培养板'),
    image: '细胞培养类_96孔避光细胞培养板_261.jpg',
  },
  {
    test: (sku, desc) => desc.includes('384孔') && desc.includes('透明底'),
    image: '细胞培养类_384孔透明底细胞培养板_262.jpg',
  },
  {
    test: (sku, desc) => desc.includes('384孔') && desc.includes('避光'),
    image: '细胞培养类_384孔避光细胞培养板_263.jpg',
  },
  {
    test: (sku, desc) => desc.includes('细胞培养皿') || (desc.includes('培养皿') && !desc.includes('细菌')),
    image: '细胞培养类_细胞培养皿_266.jpg',
  },
  {
    test: (sku, desc) => desc.includes('细胞培养瓶') || (desc.includes('培养瓶') && !desc.includes('三角') && !desc.includes('方形')),
    image: '细胞培养类_细胞培养瓶_265.jpg',
  },
  {
    test: (sku, desc) => desc.includes('三角摇瓶') && !desc.includes('带挡板') && !desc.includes('高效'),
    image: '细胞培养类_三角摇瓶_268.jpg',
  },
  {
    test: (sku, desc) => desc.includes('带挡板'),
    image: '细胞培养类_带挡板三角摇瓶_269.jpg',
  },
  {
    test: (sku, desc) => desc.includes('高效摇瓶'),
    image: '细胞培养类_高效摇瓶_270.jpg',
  },
  {
    test: (sku, desc) => desc.includes('方形培养基瓶'),
    image: '细胞培养类_方形培养基瓶_271.jpg',
  },
  // ──── 培养皿（微生物类）────
  {
    test: (sku, desc) => desc.includes('细菌培养皿') || (desc.includes('培养皿') && desc.includes('细菌')),
    image: '细菌培养皿_培养皿_181.jpg',
  },
  // ──── 移液管 ────
  {
    test: (sku, desc) => desc.includes('宽口移液管') || desc.includes('宽⼝移液管'),
    image: '血清移液管_宽⼝移液管_159.jpg',
  },
  {
    test: (sku, desc) => desc.includes('短款移液管'),
    image: '移液处理_短款移液管_99.jpg',
  },
  {
    test: (sku, desc) => desc.includes('移液管') && !desc.includes('宽') && !desc.includes('短'),
    image: '移液处理_普通移液管_95.jpg',
  },
  // ──── 铝箔封板膜 ────
  {
    test: (sku, desc) => desc.includes('铝箔封板膜'),
    image: '深孔板_铝箔封板膜_142.jpg',
  },
];

// ── 加载数据 ──────────────────────────────────────────────────────────────────
const imageMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// 验证图片文件存在
const existingImages = new Set(fs.readdirSync(IMG_DIR).filter(f => !fs.statSync(path.join(IMG_DIR, f)).isDirectory()));

let updated = 0;
let skipped = 0;

// ── 应用规则 ──────────────────────────────────────────────────────────────────
for (const [sku, entry] of Object.entries(imageMap)) {
  if (!entry) continue;

  // 不覆盖高精度映射
  const mt = entry.matchType;
  if (mt === 'exact' || mt === 'keyword' || mt === 'gsbio-crawl') {
    skipped++;
    continue;
  }

  const desc = (entry.description || sku).toLowerCase();
  const skuLower = sku.toLowerCase();

  for (const rule of RULES) {
    if (rule.test(sku, desc) && existingImages.has(rule.image)) {
      imageMap[sku] = {
        ...entry,
        image: rule.image,
        matchType: 'category-fixed',
      };
      updated++;
      break;
    }
  }
}

// ── 写回 ──────────────────────────────────────────────────────────────────────
fs.writeFileSync(MAP_PATH, JSON.stringify(imageMap, null, 2), 'utf8');

console.log(`\n✅ 修复完成:`);
console.log(`   更新: ${updated} 条`);
console.log(`   跳过(已有精确映射): ${skipped} 条`);

// 统计 matchType 分布
const counts = {};
for (const v of Object.values(imageMap)) {
  const t = v?.matchType || 'unknown';
  counts[t] = (counts[t] || 0) + 1;
}
console.log('\nmatchType 分布:', counts);
