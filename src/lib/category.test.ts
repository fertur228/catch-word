/**
 * Юнит-тесты нормализации темы: регресс на дубли секций в Коллекции «По темам»
 * (АКСЕССУАР и Аксессуар из распознавания давали две секции с одним названием).
 */
import { describe, expect, test } from 'vitest';

import { normalizeCategory } from './category';
import { CATEGORIES } from './mock-data';

describe('normalizeCategory', () => {
  test('пустое → null', () => {
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
    expect(normalizeCategory('')).toBeNull();
    expect(normalizeCategory('   ')).toBeNull();
  });

  test('известная тема приводится к канону из CATEGORIES независимо от регистра', () => {
    const canon = CATEGORIES[0];
    expect(normalizeCategory(canon.toUpperCase())).toBe(canon);
    expect(normalizeCategory(canon.toLowerCase())).toBe(canon);
    expect(normalizeCategory(`  ${canon}  `)).toBe(canon);
  });

  test('незнакомая тема: одна форма для любого регистра/пробелов', () => {
    expect(normalizeCategory('АКСЕССУАР')).toBe('Аксессуар');
    expect(normalizeCategory('аксессуар ')).toBe('Аксессуар');
    expect(normalizeCategory('Аксессуар')).toBe('Аксессуар');
  });

  test('латиница нормализуется так же', () => {
    expect(normalizeCategory('ACCESSORY')).toBe('Accessory');
    expect(normalizeCategory(' accessory')).toBe('Accessory');
  });
});
