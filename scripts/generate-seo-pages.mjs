import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildProductIndex, productPath } from '../src/product-routes.js';

const SITE = 'https://tflabservice.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function pageWithMetadata(template, { title, description, canonical, summary }) {
  return template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*("\s*\/>)/, (_, start, end) => `${start}${escapeHtml(description)}${end}`)
    .replace(/(<meta property="og:title" content=")[^"]*("\s*\/>)/, (_, start, end) => `${start}${escapeHtml(title)}${end}`)
    .replace(/(<meta property="og:description" content=")[^"]*("\s*\/>)/, (_, start, end) => `${start}${escapeHtml(description)}${end}`)
    .replace(/(<link rel="canonical" href=")[^"]*("\s*\/>)/, (_, start, end) => `${start}${escapeHtml(canonical)}${end}`)
    .replace('<div id="root"></div>', () => `<div id="root">${summary}</div>`);
}

export function buildProductPage(template, product, site = SITE) {
  const url = `${site}/products/${encodeURIComponent(product.sku)}/`;
  const title = `${product.name || product.sku} · ${product.sku} | 博仕达生物`;
  const description = `${product.name || product.sku}，货号 ${product.sku}，规格 ${product.spec || '请咨询'}。博仕达生物产品信息与询价。`;
  const summary = `<main><h1>${escapeHtml(product.name || product.sku)}</h1><p>货号：${escapeHtml(product.sku)}</p><p>规格：${escapeHtml(product.spec || '请咨询')}</p></main>`;
  return pageWithMetadata(template, { title, description, canonical: url, summary });
}

export function buildSitemap(index, site = SITE) {
  const urls = [`${site}/`, `${site}/products/`,
    ...[...index.products.values()].map((product) => `${site}${productPath(product, index)}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
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
  const index = buildProductIndex(products);
  const output = join(ROOT, 'dist');
  const template = await readFile(join(output, 'index.html'), 'utf8');
  const listing = pageWithMetadata(template, {
    title: '产品中心 | 博仕达生物',
    description: '浏览博仕达生物实验耗材、试剂与质控产品，按货号查看产品信息并询价。',
    canonical: `${SITE}/products/`,
    summary: '<main><h1>产品中心</h1><p>浏览博仕达生物产品与货号。</p></main>',
  });
  const listingPath = join(output, 'products', 'index.html');
  await mkdir(dirname(listingPath), { recursive: true });
  await writeFile(listingPath, listing);
  for (const product of index.products.values()) {
    const path = join(output, 'products', encodeURIComponent(product.sku), 'index.html');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buildProductPage(template, product));
  }
  await writeFile(join(output, 'sitemap.xml'), buildSitemap(index));
  await writeFile(join(output, '404.html'), buildNotFoundPage(template));
  console.log(`Generated ${index.products.size} product pages; excluded ${index.conflicts.size} conflicting SKUs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
