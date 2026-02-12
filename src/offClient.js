const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickFirstNumber(obj, keys) {
  for (const key of keys) {
    const value = parseNumber(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeMicronutrientsPer100g(nutriments) {
  return {
    saturatedFat100g: pickFirstNumber(nutriments, ['saturated-fat_100g', 'saturated-fat']),
    monounsaturatedFat100g: pickFirstNumber(nutriments, ['monounsaturated-fat_100g', 'monounsaturated-fat']),
    polyunsaturatedFat100g: pickFirstNumber(nutriments, ['polyunsaturated-fat_100g', 'polyunsaturated-fat']),
    omega3Fat100g: pickFirstNumber(nutriments, ['omega-3-fat_100g', 'omega-3-fat']),
    omega6Fat100g: pickFirstNumber(nutriments, ['omega-6-fat_100g', 'omega-6-fat']),
    transFat100g: pickFirstNumber(nutriments, ['trans-fat_100g', 'trans-fat'])
  };
}

export function normalizeCachedProduct(product) {
  if (!product) return null;
  const nutrition = product.nutrition || {};

  return {
    ...product,
    nutrition: {
      kcal100g: parseNumber(nutrition.kcal100g),
      p100g: parseNumber(nutrition.p100g),
      c100g: parseNumber(nutrition.c100g),
      f100g: parseNumber(nutrition.f100g),
      micronutrients: {
        saturatedFat100g: parseNumber(nutrition?.micronutrients?.saturatedFat100g),
        monounsaturatedFat100g: parseNumber(nutrition?.micronutrients?.monounsaturatedFat100g),
        polyunsaturatedFat100g: parseNumber(nutrition?.micronutrients?.polyunsaturatedFat100g),
        omega3Fat100g: parseNumber(nutrition?.micronutrients?.omega3Fat100g),
        omega6Fat100g: parseNumber(nutrition?.micronutrients?.omega6Fat100g),
        transFat100g: parseNumber(nutrition?.micronutrients?.transFat100g)
      }
    }
  };
}

function normalizePer100g(product, barcode) {
  const nutriments = product?.nutriments || {};

  const kcal = pickFirstNumber(nutriments, ['energy-kcal_100g', 'energy-kcal']);
  const kj = pickFirstNumber(nutriments, ['energy-kj_100g', 'energy-kj']);
  const kcalNormalized = kcal ?? (kj !== null ? kj / 4.184 : null);

  return normalizeCachedProduct({
    barcode,
    productName: product?.product_name || 'Unknown product',
    brands: product?.brands || '',
    imageUrl: product?.image_front_small_url || product?.image_front_url || '',
    nutrition: {
      kcal100g: kcalNormalized,
      p100g: pickFirstNumber(nutriments, ['proteins_100g', 'proteins']),
      c100g: pickFirstNumber(nutriments, ['carbohydrates_100g', 'carbohydrates']),
      f100g: pickFirstNumber(nutriments, ['fat_100g', 'fat']),
      micronutrients: normalizeMicronutrientsPer100g(nutriments)
    },
    source: 'Open Food Facts',
    fetchedAt: Date.now()
  });
}

export async function lookupOpenFoodFacts(barcode) {
  const response = await fetch(`${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json`);
  if (!response.ok) {
    throw new Error(`OFF lookup failed: ${response.status}`);
  }

  const data = await response.json();
  if (data?.status !== 1 || !data?.product) {
    throw new Error('Product not found in Open Food Facts');
  }

  return normalizePer100g(data.product, barcode);
}
