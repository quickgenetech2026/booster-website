/**
 * 修复已确认的错误映射：
 * 1. 221个 TIP SKU 仍然指向深孔板图片 → 按容量分配正确的吸头图片
 * 2. 88个 离心管 SKU 全部映射到 10mL 图片 → 按实际容量修正
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'src', 'data', 'product-image-map.json');

const imageMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
let updated = 0;

// ── 修复1：TIP SKU 错配到深孔板图片 ─────────────────────────────────────────
const WRONG_TIP_IMAGE = '移液处理_1.3mL圆孔U底深孔板_96.jpg';

for (const [sku, entry] of Object.entries(imageMap)) {
  if (!entry || entry.image !== WRONG_TIP_IMAGE) continue;
  if (!sku.includes('TIP')) continue;

  const desc = (entry.description || sku).toLowerCase();

  // 机械吸头
  if (desc.includes('tecan') || desc.includes('导电')) {
    imageMap[sku] = { ...entry, image: '机械吸头_200uL导电吸头Tecan吸头_130.jpg', matchType: 'category-fixed' };
  } else if (desc.includes('机械') && (desc.includes('50') || desc.includes('50ul'))) {
    imageMap[sku] = { ...entry, image: '机械吸头_50uL机械吸头_129.jpg', matchType: 'category-fixed' };
  } else if (desc.includes('机械') && (desc.includes('1000') || desc.includes('1,000'))) {
    imageMap[sku] = { ...entry, image: '机械吸头_1000uL机械吸头_131.jpg', matchType: 'category-fixed' };
  }
  // 按 SKU 中的容量
  else if (sku.includes('-1000UL') || sku.includes('-1200UL') || sku.includes('-1025UL')) {
    const isLong = desc.includes('加长');
    imageMap[sku] = { ...entry, image: isLong ? '普通吸头_1000uL普通加长吸头_118.jpg' : '普通吸头_1000uL普通吸头_117.jpg', matchType: 'category-fixed' };
  } else if (sku.includes('-300UL') || sku.includes('-250UL') || sku.includes('-200UL') || sku.includes('-150UL')) {
    const isLong = desc.includes('加长');
    imageMap[sku] = { ...entry, image: isLong ? '普通吸头_200uL普通加长吸头_116.jpg' : '普通吸头_200uL普通吸头_115.jpg', matchType: 'category-fixed' };
  } else if (sku.includes('-100UL') || sku.includes('-30UL') || sku.includes('-20UL') || sku.includes('-10UL')) {
    const isLong = desc.includes('加长');
    imageMap[sku] = { ...entry, image: isLong ? '移液处理_10uL加长普通吸头_102.jpg' : '移液处理_10uL普通吸头_98.jpg', matchType: 'category-fixed' };
  }
  // GEN 通用吸头 → 用200uL图作为默认
  else if (sku.includes('-GEN-')) {
    imageMap[sku] = { ...entry, image: '普通吸头_200uL普通吸头_115.jpg', matchType: 'category-fixed' };
  }
  // 其他按描述中的容量
  else {
    if (desc.match(/\b1[02]00\s*ul\b/) || desc.match(/1[02]00ul/)) {
      imageMap[sku] = { ...entry, image: '普通吸头_1000uL普通吸头_117.jpg', matchType: 'category-fixed' };
    } else if (desc.match(/\b[23]\d{2}\s*ul\b/) || desc.match(/[23]\d{2}ul/)) {
      imageMap[sku] = { ...entry, image: '普通吸头_200uL普通吸头_115.jpg', matchType: 'category-fixed' };
    } else {
      imageMap[sku] = { ...entry, image: '普通吸头_200uL普通吸头_115.jpg', matchType: 'category-fixed' };
    }
  }
  updated++;
}

// ── 修复2：离心管 全部指向 10mL 图片（应按容量分配）────────────────────────
const WRONG_CT_IMAGE = '微量离心管_10mL圆底离心管_229.jpg';

for (const [sku, entry] of Object.entries(imageMap)) {
  if (!entry || entry.image !== WRONG_CT_IMAGE) continue;

  const desc = (entry.description || sku).toLowerCase();

  // 跳过真正的 10mL 条目
  if (desc.includes('10ml') || desc.includes('10 ml') || desc.includes('10毫升')) continue;

  let newImage = null;

  if (desc.includes('50ml') || desc.includes('50 ml')) {
    if (desc.includes('自立') || desc.includes('可立')) {
      newImage = '微量离心管_50mL可立离心管_233.jpg';
    } else if (desc.includes('锥') || desc.includes('锥形')) {
      newImage = '微量离心管_50mL锥底离心管_231.jpg';
    } else {
      newImage = '微量离心管_50mL圆底离心管_232.jpg';
    }
  } else if (desc.includes('15ml') || desc.includes('15 ml')) {
    newImage = '微量离心管_15mL锥底离心管_230.jpg';
  } else if (desc.includes('5ml') || desc.includes('5 ml') || desc.includes('5.0ml') || desc.includes('5.0 ml')) {
    newImage = '微量离心管_5mL圆底离心管_228.jpg';
  } else if (desc.includes('2.0ml') || desc.includes('2.0 ml') || desc.includes('2ml') || desc.includes('2 ml')) {
    newImage = '样品保存_2mL锥底微量离心管_199.jpg';
  } else if (desc.includes('1.5ml') || desc.includes('1.5 ml')) {
    newImage = '样品保存_1.5mL锥底微量离心管_196.jpg';
  } else if (desc.includes('0.6ml') || desc.includes('0.6 ml') || desc.includes('0.5ml') || desc.includes('0.5 ml')) {
    newImage = '样品保存_0.6mL锥底微量离心管_193.jpg';
  }

  if (newImage) {
    imageMap[sku] = { ...entry, image: newImage, matchType: 'category-fixed' };
    updated++;
  }
}

fs.writeFileSync(MAP_PATH, JSON.stringify(imageMap, null, 2), 'utf8');
console.log(`✅ 修复完成，更新 ${updated} 条`);

// 验证
const remaining = Object.entries(imageMap).filter(([sku,v])=>
  v?.image === WRONG_TIP_IMAGE && sku.includes('TIP')
).length;
const remainingCT = Object.entries(imageMap).filter(([sku,v])=>
  v?.image === WRONG_CT_IMAGE && !((v.description||'').toLowerCase().includes('10ml') || (v.description||'').toLowerCase().includes('10 ml'))
).length;
console.log(`仍错配深孔板的TIP: ${remaining}个`);
console.log(`仍错配10mL的其他离心管: ${remainingCT}个`);
