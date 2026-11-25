import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_IMG_DIR = join(ROOT, 'public', 'images', 'products');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [productsRaw, mapRaw] = await Promise.all([
    readFile(join(ROOT, 'src/data/all-products.json'), 'utf8'),
    readFile(join(ROOT, 'src/data/product-image-map.json'), 'utf8'),
  ]);

  const products = JSON.parse(productsRaw);
  const fullMap = JSON.parse(mapRaw);
  const activeSkus = new Set(products.map((p) => p.sku).filter(Boolean));

  // Collect unique mapped image paths
  const uniqueImages = new Set();
  for (const [sku, info] of Object.entries(fullMap)) {
    if (!activeSkus.has(sku)) continue;
    if (!info?.image || info.image.includes('default')) continue;
    uniqueImages.add(info.image);
  }

  let generatedThumb = 0;
  let generatedComp = 0;
  let skipped = 0;
  let missingSource = 0;
  const webpReady = new Set();

  for (const relImg of uniqueImages) {
    const srcPath = join(PROD_IMG_DIR, relImg);
    if (!(await exists(srcPath))) {
      missingSource++;
      continue;
    }

    const baseRel = relImg.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const thumbPath = join(PROD_IMG_DIR, `${baseRel}_thumb.webp`);
    const compPath = join(PROD_IMG_DIR, `${baseRel}_compressed.webp`);

    let ok = true;
    try {
      if (!(await exists(thumbPath))) {
        await sharp(srcPath)
          .resize(160, 160, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbPath);
        generatedThumb++;
      } else {
        skipped++;
      }

      if (!(await exists(compPath))) {
        await sharp(srcPath)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(compPath);
        generatedComp++;
      } else {
        skipped++;
      }
    } catch (err) {
      ok = false;
      console.warn(`Failed to optimize ${relImg}: ${err.message}`);
    }

    if (ok) webpReady.add(relImg);
  }

  // Build slim runtime map: { [sku]: image } (only active SKUs with existing images)
  // Using array/object format: if webp is ready, store string relImg; if not, prefix with "raw:"
  const slimMap = {};
  for (const sku of activeSkus) {
    const info = fullMap[sku];
    if (!info?.image || info.image.includes('default')) continue;
    if (webpReady.has(info.image)) {
      slimMap[sku] = info.image;
    }
  }

  const slimPath = join(ROOT, 'src/data/product-image-slim.json');
  await writeFile(slimPath, JSON.stringify(slimMap));

  console.log(
    JSON.stringify(
      {
        activeSkus: activeSkus.size,
        uniqueImages: uniqueImages.size,
        webpReady: webpReady.size,
        generatedThumb,
        generatedComp,
        skippedExisting: skipped,
        missingSource,
        slimEntries: Object.keys(slimMap).length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
