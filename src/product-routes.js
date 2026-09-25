const visibleIdentity = (product) => JSON.stringify([
  product.sku, product.name, product.spec, product.cat, product.sub, product.brand,
]);

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
  if (pathname === '/products' || pathname === '/products/') {
    return { section: 'products', product: null };
  }
  const match = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (match) {
    try {
      const product = index.products.get(decodeURIComponent(match[1]));
      if (product) return { section: 'products', product };
    } catch { /* malformed URL is not a product */ }
  }
  return { section: 'notfound', product: null };
}
