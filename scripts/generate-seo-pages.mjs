import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildProductIndex,
  productPath,
  categoryPath,
  CATEGORY_SLUGS,
} from '../src/product-routes.js';

const SITE = 'https://tflabservice.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const serializeJsonLd = (data) =>
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

function getCompressedImageUrl(imageMap, sku, site = SITE) {
  const rel = imageMap?.[sku];
  if (!rel) return null;
  const base = rel.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return `${site}/images/products/${encodeURI(base)}_compressed.webp`;
}

function pageWithMetadata(template, {
  title,
  description,
  keywords,
  canonical,
  ogImage,
  jsonLd,
  summary,
}) {
  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(description)}${e}`)
    .replace(/(<meta property="og:title" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(title)}${e}`)
    .replace(/(<meta property="og:description" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(description)}${e}`)
    .replace(/(<meta property="og:url" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(canonical)}${e}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(title)}${e}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(description)}${e}`)
    .replace(/(<link rel="canonical" href=")[^"]*("\s*\/>)/, (_, s, e) => `${s}${escapeHtml(canonical)}${e}`)
    .replace('<div id="root"></div>', () => `<div id="root">${summary}</div>`);

  if (keywords) {
    html = html.replace(
      /(<meta name="keywords" content=")[^"]*("\s*\/>)/,
      (_, s, e) => `${s}${escapeHtml(keywords)}${e}`
    );
  }
  if (ogImage) {
    html = html.replace(
      /(<meta property="og:image" content=")[^"]*("\s*\/>)/,
      (_, s, e) => `${s}${escapeHtml(ogImage)}${e}`
    );
  }
  if (jsonLd) {
    const scripts = (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
      .map((item) => `    <script type="application/ld+json">${serializeJsonLd(item)}</script>`)
      .join('\n');
    html = html.replace('</head>', () => `${scripts}\n  </head>`);
  }
  return html;
}

export function buildHomePage(template, index, site = SITE) {
  const counts = {};
  for (const p of index.products.values()) {
    counts[p.cat] = (counts[p.cat] || 0) + 1;
  }
  const catLinks = Object.keys(CATEGORY_SLUGS)
    .map((cat) => `<li><a href="${categoryPath(cat)}">${escapeHtml(cat)}（${counts[cat] || 0} 款产品）</a></li>`)
    .join('');

  const summary = [
    '<main>',
    '<h1>博仕达生物（BOOSTER）— 降本增效，助力科研前行</h1>',
    '<p>上海博仕达生物工程有限公司是一站式实验室解决方案提供商，提供高质量的国产化替代方案，涵盖实验耗材、化学试剂与小分子、超滤离心管、质控试剂盒、早期研发及质控分析工具酶等 1900+ 产品型号。</p>',
    '<nav aria-label="主导航"><ul>',
    '<li><a href="/products/">产品中心</a></li>',
    '<li><a href="/solutions/">节能空调解决方案</a></li>',
    '<li><a href="/peptide-qc/">多肽 QC 全链质控解决方案</a></li>',
    '<li><a href="/contact/">联系我们</a></li>',
    '</ul></nav>',
    `<section><h2>产品分类</h2><ul>${catLinks}</ul></section>`,
    '</main>',
  ].join('');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: '上海博仕达生物工程有限公司',
      alternateName: '博仕达生物 BOOSTER',
      url: `${site}/`,
      logo: `${site}/favicon.svg`,
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+86-139-1641-3233',
        email: 'service@tflabservice.com',
        contactType: 'sales',
        areaServed: 'CN',
        availableLanguage: ['zh-CN', 'en'],
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: '浦东新区锦绣东路2777弄19号楼10层',
        addressLocality: '上海市',
        addressCountry: 'CN',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '博仕达生物 BOOSTER',
      url: `${site}/`,
    },
  ];

  return pageWithMetadata(template, {
    title: '博仕达生物 - 一站式实验室解决方案 | 分子生物学试剂 | 实验耗材 | 化学试剂',
    description: '博仕达生物 - 一站式实验室解决方案提供商，提供高质量的国产化替代方案，涵盖分子生物学、实验耗材、化学试剂、质控分析工具酶和质控试剂盒等产品。',
    canonical: `${site}/`,
    jsonLd,
    summary,
  });
}

export function buildProductPage(template, product, site = SITE, options = {}) {
  const { imageMap = null, related = [], index = null } = options;
  const url = `${site}/products/${encodeURIComponent(product.sku)}/`;
  const name = product.name || product.sku;
  const title = `${name} · ${product.sku} | 博仕达生物`;
  const description = `${name}，货号 ${product.sku}，规格 ${product.spec || '请咨询'}。${product.cat ? `所属分类：${product.cat}${product.sub ? ` / ${product.sub}` : ''}。` : ''}博仕达生物产品信息与询价。`;
  const keywords = [product.sku, name, product.brand, product.cat, product.sub, '博仕达生物', '实验室耗材', '国产替代']
    .filter(Boolean)
    .join(', ');
  const imgUrl = getCompressedImageUrl(imageMap, product.sku, site);
  const catUrlPath = product.cat && CATEGORY_SLUGS[product.cat] ? categoryPath(product.cat) : '/products/';

  const relatedHtml = related.length > 0
    ? `<section><h2>相关产品</h2><ul>${related
        .map((r) => {
          const rPath = index ? productPath(r, index) : `/products/${encodeURIComponent(r.sku)}/`;
          return rPath ? `<li><a href="${rPath}">${escapeHtml(r.name || r.sku)}（${escapeHtml(r.sku)}）</a></li>` : '';
        })
        .join('')}</ul></section>`
    : '';

  const faqItems = [
    {
      q: `${name}（货号 ${product.sku}）是否提供产品说明书（Datasheet）和质检报告（CoA）？`,
      a: `提供。博仕达生物所有${product.cat || '实验室'}产品均支持随货或在线索取电子版产品说明书与批次质检报告（CoA），点击页面「产品说明书」即可申请。`,
    },
    {
      q: `该产品是否支持国产化替代验证与样品试用？`,
      a: `支持。针对高校、科研院所及生物医药企业，我们提供技术选型对接及常用型号的试用评估支持，协助完成降本增效与供应链国产化替代。`,
    },
    {
      q: `常规货期、储存运输条件及开票方式如何？`,
      a: `常规现货产品 1–3 个工作日内发货，按产品特性采用常温或 2–8°C / -20°C 冷链运输；支持对公转账及增值税专用发票/普通发票。`,
    },
  ];

  const faqHtml = `<section><h2>常见采购问题</h2>${faqItems
    .map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`)
    .join('')}</section>`;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const summary = [
    '<main>',
    `<nav aria-label="面包屑"><a href="/">首页</a> / <a href="/products/">产品中心</a>${product.cat ? ` / <a href="${catUrlPath}">${escapeHtml(product.cat)}</a>` : ''} / <span>${escapeHtml(product.sku)}</span></nav>`,
    `<h1>${escapeHtml(name)}</h1>`,
    imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(name)}" />` : '',
    `<p>货号：${escapeHtml(product.sku)}</p>`,
    product.brand ? `<p>品牌：${escapeHtml(product.brand)}</p>` : '',
    product.cat ? `<p>分类：${escapeHtml(product.cat)}${product.sub ? ` / ${escapeHtml(product.sub)}` : ''}</p>` : '',
    `<p>规格：${escapeHtml(product.spec || '请咨询')}</p>`,
    `<p>${escapeHtml(product.brand || '博仕达生物')} ${escapeHtml(name)}，适用于${escapeHtml(product.cat || '实验室')}相关科研与质控应用。支持在线询价、多货号批量询价及说明书（CoA/Datasheet）索取。</p>`,
    faqHtml,
    relatedHtml,
    '</main>',
  ].join('');

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description,
    brand: { '@type': 'Brand', name: product.brand || '博仕达生物 BOOSTER' },
    category: [product.cat, product.sub].filter(Boolean).join(' > ') || undefined,
    image: imgUrl ? [imgUrl] : undefined,
    url,
  };

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: '首页', item: `${site}/` },
    { '@type': 'ListItem', position: 2, name: '产品中心', item: `${site}/products/` },
  ];
  if (product.cat && CATEGORY_SLUGS[product.cat]) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: product.cat,
      item: `${site}${catUrlPath}`,
    });
  }
  breadcrumbItems.push({
    '@type': 'ListItem',
    position: breadcrumbItems.length + 1,
    name: `${name} (${product.sku})`,
    item: url,
  });

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  return pageWithMetadata(template, {
    title,
    description,
    keywords,
    canonical: url,
    ogImage: imgUrl || undefined,
    jsonLd: [productSchema, breadcrumbSchema, faqSchema],
    summary,
  });
}

export function buildCategoryPage(template, category, items, index, site = SITE) {
  const path = categoryPath(category);
  const url = `${site}${path}`;
  const subs = [...new Set(items.map((p) => p.sub).filter(Boolean))];
  const title = `${category} - 博仕达生物产品中心 | 共 ${items.length} 款产品`;
  const description = `浏览博仕达生物${category}全系列产品（共 ${items.length} 款），涵盖${subs.slice(0, 6).join('、') || category}，支持按货号查询规格参数并在线询价。`;
  const keywords = [category, ...subs.slice(0, 8), '博仕达生物', '国产替代', '实验室解决方案'].join(', ');

  const linksHtml = items
    .map((p) => {
      const pUrl = productPath(p, index);
      return pUrl
        ? `<li><a href="${pUrl}">${escapeHtml(p.name || p.sku)} — ${escapeHtml(p.sku)}${p.spec ? `（${escapeHtml(p.spec)}）` : ''}</a></li>`
        : '';
    })
    .join('');

  const summary = [
    '<main>',
    `<nav aria-label="面包屑"><a href="/">首页</a> / <a href="/products/">产品中心</a> / <span>${escapeHtml(category)}</span></nav>`,
    `<h1>${escapeHtml(category)}（${items.length} 款产品）</h1>`,
    `<p>${escapeHtml(description)}</p>`,
    `<ul>${linksHtml}</ul>`,
    '</main>',
  ].join('');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${category} | 博仕达生物`,
      description,
      url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: '产品中心', item: `${site}/products/` },
        { '@type': 'ListItem', position: 3, name: category, item: url },
      ],
    },
  ];

  return pageWithMetadata(template, {
    title,
    description,
    keywords,
    canonical: url,
    jsonLd,
    summary,
  });
}

export function buildStaticSectionPages(template, site = SITE) {
  const solutions = pageWithMetadata(template, {
    title: '节能空调解决方案 - IDC机房/热泵/R436C制冷剂 | 博仕达生物',
    description: '博仕达节能空调解决方案涵盖机房空调节能机组（节能30%+，降PUE 0.1-0.4）、片式蒸发冷高效热泵机组（SCOP 4.5+）、多联机预冷节能器、R436C高效节能制冷剂与中温水大温差机组。',
    keywords: '节能空调解决方案, 机房空调节能机组, IDC降PUE, 片式蒸发冷热泵, 多联机预冷节能器, R436C制冷剂, 中温水大温差, 博仕达',
    canonical: `${site}/solutions/`,
    summary: [
      '<main>',
      '<nav aria-label="面包屑"><a href="/">首页</a> / <span>节能空调解决方案</span></nav>',
      '<h1>节能空调解决方案</h1>',
      '<p>临界相变 · 中温水大温差 — 节能、节水、节地、节材，助力数据中心、GMP厂房与实验室降本增效。</p>',
      '<ul>',
      '<li><h2>机房空调节能机组</h2><p>IDC数据机房改造专用，制冷节能30%以上，降低PUE 0.1-0.4。</p><img src="/solutions/sol-1-idc.webp" alt="上海电信IDC机房空调节能机组改造案例实景，总体节能率超40%" /></li>',
      '<li><h2>片式蒸发冷高效热泵机组</h2><p>板管蒸发冷却技术，SCOP 4.5+ 远超国家一级能效标准。</p><img src="/solutions/sol-2-heatpump.webp" alt="片式蒸发冷高效热泵机组产业园与光电厂节电30%-40%案例实景" /></li>',
      '<li><h2>多联机预冷节能器</h2><p>外置预冷节能15%以上，分段式设计适用于各类多联机品牌。</p><img src="/solutions/sol-3-vrf.webp" alt="多联机预冷节能器办公楼与总部大楼改造前后实景对比，节电20%-23%" /></li>',
      '<li><h2>R436C高效节能制冷剂</h2><p>充注量仅为R22的40%，低压力高效率，ODP为0。</p><img src="/solutions/sol-4-r436c.webp" alt="R436C高效节能制冷剂适用范围与权威机构检测报告" /></li>',
      '<li><h2>中温水大温差机组</h2><p>9/17℃中温水大温差水系统，系统综合节能15-20%。</p><img src="/solutions/sol-5-deltat.webp" alt="中温水大温差机组苏州企业大楼机房改造实景，节电率达25.5%" /></li>',
      '</ul>',
      '</main>',
    ].join(''),
  });

  const peptideqc = pageWithMetadata(template, {
    title: '多肽 QC 全链质控解决方案 - FDA 0.5%杂质 & EMA合规 | 博仕达生物',
    description: '应对多肽产能放大与FDA 0.5%杂质红线、EMA最新指南（367182/2025），博仕达提供测序级胰蛋白酶、Glu-C、Lys-C、Asp-N正交酶切矩阵、HCP ELISA、HCD qPCR、rFC重组内毒素试剂盒与宽孔径RP-HPLC多肽分离耗材。',
    keywords: '多肽QC方案, 多肽质控, FDA 0.5%杂质, EMA 367182/2025, 测序级胰蛋白酶, Glu-C, Lys-C, Asp-N, HCP ELISA试剂盒, HCD qPCR, rFC内毒素, 宽孔径RP-HPLC柱',
    canonical: `${site}/peptide-qc/`,
    summary: [
      '<main>',
      '<nav aria-label="面包屑"><a href="/">首页</a> / <span>多肽 QC 方案</span></nav>',
      '<h1>多肽 QC 全链质控解决方案：从粗肽到 GMP 放行</h1>',
      '<p>面对 FDA 0.5% 杂质触发红线与 EMA 最新审查指南（367182/2025），覆盖生物发酵法与化学固相合成（SPPS）双路线全链质控。</p>',
      '<ul>',
      '<li><h2>结构确证特异性酶矩阵</h2><p>测序级胰蛋白酶（TPCK处理）、Glu-C（V8蛋白酶）、Lys-C 赖氨酸蛋白酶、Asp-N 天冬氨酸蛋白酶，满足 EMA 强制正交酶切序列确证（覆盖度 ≥95%）。</p></li>',
      '<li><h2>生物安全检测试剂盒</h2><p>HCP ELISA 宿主细胞蛋白试剂盒、HCD 宿主细胞 DNA qPCR 试剂盒、rFC 重组因子 C 内毒素检测试剂盒（ChP 2025）、LAL 鲎试剂定量检测套装。</p></li>',
      '<li><h2>多肽专用分离耗材</h2><p>宽孔径 300Å RP-HPLC 反相柱（C4/C8）、低吸附 C18 SPE 固相萃取柱、低吸附 PES 超滤浓缩管、多肽图谱制样试剂盒。</p></li>',
      '</ul>',
      '<p><a href="/products/">浏览相关质控产品</a> · <a href="/contact/">联系我们获取方案</a></p>',
      '</main>',
    ].join(''),
  });

  const contact = pageWithMetadata(template, {
    title: '联系我们 - 上海博仕达生物工程有限公司 | 询价与技术支持',
    description: '联系上海博仕达生物工程有限公司（BOOSTER），获取实验室耗材、分子生物学试剂、多肽QC及节能方案报价与技术支持。地址：上海市浦东新区锦绣东路2777弄19号楼10层，电话：139-1641-3233。',
    keywords: '联系博仕达生物, 上海博仕达生物工程有限公司, 实验室耗材询价, 试剂报价, service@tflabservice.com',
    canonical: `${site}/contact/`,
    summary: [
      '<main>',
      '<nav aria-label="面包屑"><a href="/">首页</a> / <span>联系我们</span></nav>',
      '<h1>联系我们 — 上海博仕达生物工程有限公司</h1>',
      '<p>公司地址：上海市浦东新区锦绣东路2777弄19号楼10层</p>',
      '<p>联系电话：139-1641-3233</p>',
      '<p>电子邮箱：service@tflabservice.com</p>',
      '<p>工作时间：周一至周五 9:00-18:00</p>',
      '</main>',
    ].join(''),
  });

  return { solutions, peptideqc, contact };
}

export function buildSitemap(index, site = SITE, extraPaths = [], lastmod = null) {
  const urls = [
    `${site}/`,
    `${site}/products/`,
    ...extraPaths.map((p) => `${site}${p}`),
    ...[...index.products.values()].map((product) => `${site}${productPath(product, index)}`),
  ];
  const lastmodTag = lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc>${lastmodTag}</url>`).join('\n')}\n</urlset>\n`;
}

export function buildNotFoundPage(template) {
  return template
    .replace(/<meta name="robots"[^>]*\/?>/, '')
    .replace('<head>', '<head><meta name="robots" content="noindex" />')
    .replace(/<link rel="canonical"[^>]*\/?>/, '')
    .replace(/<title>[^<]*<\/title>/, '<title>页面未找到 | 博仕达生物</title>')
    .replace('<div id="root"></div>', '<div id="root"><main><h1>页面未找到</h1><p><a href="/">返回首页</a></p></main></div>');
}

async function main() {
  const products = JSON.parse(await readFile(join(ROOT, 'src/data/all-products.json'), 'utf8'));
  let imageMap = {};
  try {
    imageMap = JSON.parse(await readFile(join(ROOT, 'src/data/product-image-slim.json'), 'utf8'));
  } catch { /* slim map optional */ }

  const index = buildProductIndex(products);
  const output = join(ROOT, 'dist');
  const template = await readFile(join(output, 'index.html'), 'utf8');
  const today = new Date().toISOString().slice(0, 10);

  // 1. Pre-rendered Homepage
  await writeFile(join(output, 'index.html'), buildHomePage(template, index));

  // 2. Group products by category & subcategory for category pages and related links
  const byCategory = new Map();
  const byCatSub = new Map();
  for (const product of index.products.values()) {
    if (!byCategory.has(product.cat)) byCategory.set(product.cat, []);
    byCategory.get(product.cat).push(product);
    const key = `${product.cat}||${product.sub || ''}`;
    if (!byCatSub.has(key)) byCatSub.set(key, []);
    byCatSub.get(key).push(product);
  }

  // 3. Products listing page with category links + featured product links
  const catListHtml = Object.keys(CATEGORY_SLUGS)
    .map((cat) => `<li><a href="${categoryPath(cat)}">${escapeHtml(cat)}（${(byCategory.get(cat) || []).length}）</a></li>`)
    .join('');
  const featuredHtml = [...index.products.values()]
    .slice(0, 40)
    .map((p) => `<li><a href="${productPath(p, index)}">${escapeHtml(p.name || p.sku)}（${escapeHtml(p.sku)}）</a></li>`)
    .join('');

  const listing = pageWithMetadata(template, {
    title: '产品中心 | 博仕达生物 - 1900+ 实验室耗材与科研试剂',
    description: '浏览博仕达生物实验耗材、化学试剂、超滤离心管、质控分析工具酶与质控试剂盒，按货号查看产品信息并在线询价。',
    canonical: `${SITE}/products/`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '产品中心 | 博仕达生物',
      url: `${SITE}/products/`,
    },
    summary: `<main><nav aria-label="面包屑"><a href="/">首页</a> / <span>产品中心</span></nav><h1>产品中心（${index.products.size} 款产品）</h1><section><h2>产品分类</h2><ul>${catListHtml}</ul></section><section><h2>热门产品</h2><ul>${featuredHtml}</ul></section></main>`,
  });
  const listingPath = join(output, 'products', 'index.html');
  await mkdir(dirname(listingPath), { recursive: true });
  await writeFile(listingPath, listing);

  // 4. Category landing pages
  const categoryUrls = [];
  for (const [cat, slug] of Object.entries(CATEGORY_SLUGS)) {
    const items = byCategory.get(cat) || [];
    const catFile = join(output, 'products', 'category', slug, 'index.html');
    await mkdir(dirname(catFile), { recursive: true });
    await writeFile(catFile, buildCategoryPage(template, cat, items, index));
    categoryUrls.push(`/products/category/${slug}/`);
  }

  // 5. Dedicated section pages (/solutions/, /peptide-qc/, /contact/)
  const { solutions, peptideqc, contact } = buildStaticSectionPages(template);
  for (const [dir, html] of [
    ['solutions', solutions],
    ['peptide-qc', peptideqc],
    ['contact', contact],
  ]) {
    const p = join(output, dir, 'index.html');
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, html);
  }

  // 6. All product pages with Product + BreadcrumbList JSON-LD, images, and related links
  for (const product of index.products.values()) {
    const key = `${product.cat}||${product.sub || ''}`;
    const related = (byCatSub.get(key) || [])
      .filter((r) => r.sku !== product.sku)
      .slice(0, 6);
    const path = join(output, 'products', encodeURIComponent(product.sku), 'index.html');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buildProductPage(template, product, SITE, { imageMap, related, index }));
  }

  // 7. Sitemap & 404
  const extraPaths = ['/solutions/', '/peptide-qc/', '/contact/', ...categoryUrls];
  await writeFile(join(output, 'sitemap.xml'), buildSitemap(index, SITE, extraPaths, today));
  await writeFile(join(output, '404.html'), buildNotFoundPage(template));

  console.log(
    `Generated homepage, 3 section pages, ${categoryUrls.length} category pages, and ${index.products.size} product pages; excluded ${index.conflicts.size} conflicting SKUs.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
