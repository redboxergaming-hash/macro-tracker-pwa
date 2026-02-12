import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCachedProduct } from '../src/offClient.js';

test('normalizeCachedProduct returns null for falsy product', () => {
  assert.equal(normalizeCachedProduct(null), null);
});

test('normalizeCachedProduct parses numeric fields and nulls invalid values', () => {
  const normalized = normalizeCachedProduct({
    barcode: '123',
    nutrition: {
      kcal100g: '99.4',
      p100g: '7',
      c100g: undefined,
      f100g: 'abc',
      micronutrients: {
        saturatedFat100g: '2.5',
        monounsaturatedFat100g: '',
        polyunsaturatedFat100g: '1.3',
        omega3Fat100g: '0',
        omega6Fat100g: null,
        transFat100g: 'x'
      }
    }
  });

  assert.equal(normalized.nutrition.kcal100g, 99.4);
  assert.equal(normalized.nutrition.p100g, 7);
  assert.equal(normalized.nutrition.c100g, null);
  assert.equal(normalized.nutrition.f100g, null);

  assert.deepEqual(normalized.nutrition.micronutrients, {
    saturatedFat100g: 2.5,
    monounsaturatedFat100g: 0,
    polyunsaturatedFat100g: 1.3,
    omega3Fat100g: 0,
    omega6Fat100g: 0,
    transFat100g: null
  });
});
