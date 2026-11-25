import { buildProductIndex } from '../product-routes.js';

let catalogPromise = null;
let cachedCatalog = null;

/**
 * Lazy-load product catalog and slim image map so the homepage bundle
 * stays small and fast. Subsequent calls return the cached result.
 */
export function loadCatalog() {
  if (cachedCatalog) return Promise.resolve(cachedCatalog);
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      import('./all-products.json'),
      import('./product-image-slim.json'),
    ]).then(([productsMod, imageMapMod]) => {
      const products = productsMod.default || productsMod;
      const imageMap = imageMapMod.default || imageMapMod;
      const index = buildProductIndex(products);
      cachedCatalog = { products, index, imageMap };
      return cachedCatalog;
    });
  }
  return catalogPromise;
}

export function getCachedCatalog() {
  return cachedCatalog;
}

/**
 * Resolve product image URL from slim map.
 * @param {Record<string, string>|null} imageMap
 * @param {string} sku
 * @param {'thumb'|'compressed'|'main'} type
 * @returns {string|null}
 */
export function resolveProductImage(imageMap, sku, type = 'thumb') {
  const relImg = imageMap?.[sku];
  if (!relImg) return null;
  const baseName = relImg.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  if (type === 'thumb') return `/images/products/${baseName}_thumb.webp`;
  if (type === 'compressed') return `/images/products/${baseName}_compressed.webp`;
  return `/images/products/${relImg}`;
}
