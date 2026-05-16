// Unit parsing & conversion helpers for recipe ingredient quantities.

export type UnitFamily = 'mass' | 'volume' | 'count';

// Conversion factor to the family's base unit
//  - mass base: g
//  - volume base: ml
//  - count base: un
const UNIT_MAP: Record<string, { family: UnitFamily; toBase: number; canonical: string }> = {
  // mass
  mg: { family: 'mass', toBase: 0.001, canonical: 'g' },
  g: { family: 'mass', toBase: 1, canonical: 'g' },
  grama: { family: 'mass', toBase: 1, canonical: 'g' },
  gramas: { family: 'mass', toBase: 1, canonical: 'g' },
  kg: { family: 'mass', toBase: 1000, canonical: 'kg' },
  quilo: { family: 'mass', toBase: 1000, canonical: 'kg' },
  quilos: { family: 'mass', toBase: 1000, canonical: 'kg' },
  // volume
  ml: { family: 'volume', toBase: 1, canonical: 'ml' },
  cl: { family: 'volume', toBase: 10, canonical: 'ml' },
  dl: { family: 'volume', toBase: 100, canonical: 'ml' },
  l: { family: 'volume', toBase: 1000, canonical: 'L' },
  litro: { family: 'volume', toBase: 1000, canonical: 'L' },
  litros: { family: 'volume', toBase: 1000, canonical: 'L' },
  // count
  un: { family: 'count', toBase: 1, canonical: 'un' },
  und: { family: 'count', toBase: 1, canonical: 'un' },
  unid: { family: 'count', toBase: 1, canonical: 'un' },
  unidade: { family: 'count', toBase: 1, canonical: 'un' },
  unidades: { family: 'count', toBase: 1, canonical: 'un' },
  pc: { family: 'count', toBase: 1, canonical: 'un' },
  pcs: { family: 'count', toBase: 1, canonical: 'un' },
  pç: { family: 'count', toBase: 1, canonical: 'un' },
};

export interface ParsedQty {
  value: number;
  unit: string; // raw unit token as typed (lowercased)
  family: UnitFamily;
  canonical: string;
  toBase: number; // multiplier to convert value -> base unit of family
}

/**
 * Parses qty strings like "200 g", "0,25kg", "200g", "1 un".
 * Returns null when number is missing or unit is unknown.
 */
export function parseQty(raw: string): ParsedQty | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d]+(?:[.,][\d]+)?)\s*([a-zA-ZçÇ]+)?$/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (isNaN(value) || value <= 0) return null;
  const unitToken = (m[2] || '').toLowerCase();
  if (!unitToken) return null;
  const info = UNIT_MAP[unitToken];
  if (!info) return null;
  return {
    value,
    unit: unitToken,
    family: info.family,
    canonical: info.canonical,
    toBase: info.toBase,
  };
}

export function getUnitInfo(unit: string) {
  return UNIT_MAP[unit.trim().toLowerCase()] || null;
}

/** True when both units belong to the same family (e.g. g ↔ kg, ml ↔ L). */
export function areUnitsCompatible(a: string, b: string): boolean {
  const ai = getUnitInfo(a);
  const bi = getUnitInfo(b);
  if (!ai || !bi) return false;
  return ai.family === bi.family;
}

/**
 * Convert a parsed qty into the target unit's scale.
 * Returns null if units are incompatible.
 */
export function convertQty(parsed: ParsedQty, targetUnit: string): number | null {
  const target = getUnitInfo(targetUnit);
  if (!target || target.family !== parsed.family) return null;
  const inBase = parsed.value * parsed.toBase;
  return inBase / target.toBase;
}

/**
 * Validate that a recipe qty string is compatible with the inventory unit.
 * Returns an error message in PT-MZ, or null when valid.
 */
export function validateQtyAgainstUnit(qty: string, inventoryUnit: string): string | null {
  if (!qty?.trim()) return 'Quantidade obrigatória';
  const parsed = parseQty(qty);
  if (!parsed) {
    return `Formato inválido. Use número + unidade (ex: 200 g, 0,25 kg)`;
  }
  if (!areUnitsCompatible(parsed.unit, inventoryUnit)) {
    return `Unidade "${parsed.unit}" incompatível com inventário (${inventoryUnit})`;
  }
  return null;
}
