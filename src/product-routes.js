const visibleIdentity = (product) => JSON.stringify([
  product.sku, product.name, product.spec, product.cat, product.sub, product.brand,
]);

export const SECTION_PATHS = {
  home: '/',
  products: '/products/',
  solutions: '/solutions/',
  peptideqc: '/peptide-qc/',
  contact: '/contact/',
};

export const CATEGORY_SLUGS = {
  '实验耗材': 'lab-consumables',
  '化学试剂与小分子': 'chemical-reagents',
  '超滤离心管': 'ultrafiltration-tubes',
  '质控试剂盒': 'qc-kits',
  '早期研发': 'early-rd',
  '质控分析工具酶': 'qc-enzymes',
};

export const SLUG_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([cat, slug]) => [slug, cat])
);

export function sectionPath(section) {
  return SECTION_PATHS[section] || '/';
}

export function categoryPath(category) {
  const slug = category && CATEGORY_SLUGS[category];
  return slug ? `/products/category/${slug}/` : '/products/';
}

export function buildProductIndex(items) {
  const products = new Map();
  const conflicts = new Set();
  for (const product of items) {
    const sku = product.sku;
    if (!sku || conflicts.has(sku)) continue;
    const existing = products.get(sku);
    if (existing && visibleIdentity(existing) !== visibleIdentity(product)) {
      products.delete(sku);
      conflicts.add(sku);
    } else if (!existing) {
      products.set(sku, product);
    }
  }
  return { products, conflicts };
}

export function productPath(product, index) {
  if (!product?.sku || !index.products.has(product.sku)) return null;
  return `/products/${encodeURIComponent(product.sku)}/`;
}

export function readRoute(pathname, index) {
  if (pathname === '/') return { section: 'home', product: null };
  if (pathname === '/solutions' || pathname === '/solutions/') {
    return { section: 'solutions', product: null };
  }
  if (pathname === '/peptide-qc' || pathname === '/peptide-qc/') {
    return { section: 'peptideqc', product: null };
  }
  if (pathname === '/contact' || pathname === '/contact/') {
    return { section: 'contact', product: null };
  }
  if (pathname === '/products' || pathname === '/products/') {
    return { section: 'products', product: null };
  }
  const catMatch = pathname.match(/^\/products\/category\/([^/]+)\/?$/);
  if (catMatch) {
    const category = SLUG_TO_CATEGORY[catMatch[1]];
    if (category) return { section: 'products', product: null, category };
    return { section: 'notfound', product: null };
  }
  const match = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (match && index?.products) {
    try {
      const product = index.products.get(decodeURIComponent(match[1]));
      if (product) return { section: 'products', product };
    } catch { /* malformed URL is not a product */ }
  }
  return { section: 'notfound', product: null };
}
