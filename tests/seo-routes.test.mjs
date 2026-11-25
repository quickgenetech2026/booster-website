import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductIndex, productPath, readRoute, categoryPath } from '../src/product-routes.js';
import {
  buildNotFoundPage,
  buildProductPage,
  buildSitemap,
  buildHomePage,
  buildCategoryPage,
  buildStaticSectionPages,
} from '../scripts/generate-seo-pages.mjs';

const products = [
  { sku: 'BSD-A.2', name: '亲水过滤器', spec: '0.22 µm', cat: '实验耗材', sub: '过滤器', brand: 'Booster', price: 10 },
  { sku: 'BSD-A.2', name: '亲水过滤器', spec: '0.22 µm', cat: '实验耗材', sub: '过滤器', brand: 'Booster', price: 20 },
  { sku: 'BSD-B', name: '疏水过滤器', spec: '0.45 µm', cat: '实验耗材', sub: '过滤器', brand: 'Booster' },
  { sku: 'BSD-B', name: '亲水过滤器', spec: '0.45 µm', cat: '实验耗材', sub: '过滤器', brand: 'Booster' },
  { sku: 'BSD-C', name: '普通吸头', spec: '96/盒', cat: '实验耗材', sub: '吸头', brand: 'Booster' },
];

const template = '<!doctype html><html><head><meta name="description" content="首页描述" /><meta property="og:title" content="首页标题" /><meta property="og:description" content="首页描述" /><link rel="canonical" href="https://tflabservice.com/" /><title>首页标题</title></head><body><div id="root"></div></body></html>';

test('identical visible products share one URL but conflicting SKUs have none', () => {
  const index = buildProductIndex(products);
  assert.deepEqual([...index.products.keys()], ['BSD-A.2', 'BSD-C']);
  assert.deepEqual([...index.conflicts], ['BSD-B']);
  assert.equal(productPath(products[0], index), '/products/BSD-A.2/');
  assert.equal(productPath(products[2], index), null);
});

test('direct product URLs resolve and unrelated paths do not become home', () => {
  const index = buildProductIndex(products);
  assert.deepEqual(readRoute('/', index), { section: 'home', product: null });
  assert.deepEqual(readRoute('/products/', index), { section: 'products', product: null });
  assert.equal(readRoute('/products/BSD-A.2/', index).product?.sku, 'BSD-A.2');
  assert.deepEqual(readRoute('/products/BSD-B/', index), { section: 'notfound', product: null });
  assert.deepEqual(readRoute('/about', index), { section: 'notfound', product: null });
});

test('product HTML has its own canonical, title and visible product facts', () => {
  const html = buildProductPage(template, products[0], 'https://tflabservice.com');
  assert.match(html, /<link rel="canonical" href="https:\/\/tflabservice\.com\/products\/BSD-A\.2\/"/);
  assert.match(html, /<title>亲水过滤器 · BSD-A\.2 \| 博仕达生物<\/title>/);
  assert.match(html, /<h1>亲水过滤器<\/h1>/);
  assert.match(html, /0\.22 µm/);
  assert.doesNotMatch(html, /首页描述/);
});

test('product names are escaped without interpreting replacement tokens', () => {
  const html = buildProductPage(template, { ...products[0], name: 'A & <B> $&' }, 'https://tflabservice.com');
  assert.match(html, /<title>A &amp; &lt;B&gt; \$&amp; · BSD-A\.2/);
  assert.doesNotMatch(html, /<B>/);
  assert.doesNotMatch(html, /<title>首页标题<\/title>/);
});

test('sitemap contains only real canonical routes and excludes conflicting products', () => {
  const xml = buildSitemap(buildProductIndex(products), 'https://tflabservice.com');
  assert.match(xml, /<loc>https:\/\/tflabservice\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/tflabservice\.com\/products\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/tflabservice\.com\/products\/BSD-A\.2\/<\/loc>/);
  assert.doesNotMatch(xml, /BSD-B|\/about|booster-bio/);
  assert.equal((xml.match(/<loc>/g) || []).length, 4);
});

test('unknown routes use a non-indexable 404 page instead of the homepage', () => {
  const html = buildNotFoundPage(template);
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.match(html, /<h1>页面未找到<\/h1>/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('section and category routes resolve cleanly', () => {
  const index = buildProductIndex(products);
  assert.deepEqual(readRoute('/solutions/', index), { section: 'solutions', product: null });
  assert.deepEqual(readRoute('/peptide-qc/', index), { section: 'peptideqc', product: null });
  assert.deepEqual(readRoute('/contact/', index), { section: 'contact', product: null });
  assert.deepEqual(readRoute('/products/category/lab-consumables/', index), {
    section: 'products',
    product: null,
    category: '实验耗材',
  });
  assert.deepEqual(readRoute('/products/category/unknown/', index), { section: 'notfound', product: null });
  assert.equal(categoryPath('实验耗材'), '/products/category/lab-consumables/');
});

test('SEO pages include JSON-LD, breadcrumbs, and internal links', () => {
  const index = buildProductIndex(products);
  const prodHtml = buildProductPage(template, products[0], 'https://tflabservice.com', {
    related: [products[4]],
    index,
  });
  assert.match(prodHtml, /application\/ld\+json/);
  assert.match(prodHtml, /"@type":"Product"/);
  assert.match(prodHtml, /"@type":"BreadcrumbList"/);
  assert.match(prodHtml, /href="\/products\/BSD-C\/"/);

  const homeHtml = buildHomePage(template, index, 'https://tflabservice.com');
  assert.match(homeHtml, /"@type":"Organization"/);
  assert.match(homeHtml, /href="\/peptide-qc\/"/);
  assert.match(homeHtml, /href="\/products\/category\/lab-consumables\/"/);

  const catHtml = buildCategoryPage(template, '实验耗材', [products[0], products[4]], index, 'https://tflabservice.com');
  assert.match(catHtml, /"@type":"CollectionPage"/);
  assert.match(catHtml, /href="\/products\/BSD-A\.2\/"/);

  const sections = buildStaticSectionPages(template, 'https://tflabservice.com');
  assert.match(sections.peptideqc, /FDA 0\.5%/);
  assert.match(sections.solutions, /R436C/);
  assert.match(sections.contact, /139-1641-3233/);
});
