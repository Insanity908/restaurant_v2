// Validation and masking helpers for Mozambique payment / business fields.

const digits = (s: string) => s.replace(/\D/g, '');

// ---- Masks ----------------------------------------------------------------

/** Mozambique mobile: "8X XXX XXXX" (9 digits starting with 8). */
export function maskMzPhone(raw: string): string {
  const d = digits(raw).slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean);
  return parts.join(' ');
}

/** International phone with +258 prefix preserved if present. */
export function maskIntlPhone(raw: string): string {
  const hasPlus = raw.trim().startsWith('+');
  const d = digits(raw).slice(0, 12); // 258 + 9
  if (!d) return hasPlus ? '+' : '';
  if (d.startsWith('258')) {
    const rest = d.slice(3, 12);
    const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 9)].filter(Boolean);
    return `+258${parts.length ? ' ' + parts.join(' ') : ''}`;
  }
  return (hasPlus ? '+' : '') + d;
}

/** Bank account: groups of 4 digits, max 16. */
export function maskBankAccount(raw: string): string {
  const d = digits(raw).slice(0, 16);
  return d.replace(/(.{4})/g, '$1 ').trim();
}

/** IBAN MZ: "MZ" + 23 digits, grouped 4 chars. */
export function maskIban(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 25);
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/** NUIT: 9 digits. */
export function maskNuit(raw: string): string {
  return digits(raw).slice(0, 9);
}

// ---- Validators -----------------------------------------------------------

export type ValidationResult = string | null; // null = ok, string = error message (PT)

export function validateMpesa(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const d = digits(raw);
  if (d.length !== 9) return 'Deve ter 9 dígitos (ex: 84 123 4567)';
  if (!/^8[45]/.test(d)) return 'M-Pesa deve começar por 84 ou 85 (Vodacom)';
  return null;
}

export function validateEmola(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const d = digits(raw);
  if (d.length !== 9) return 'Deve ter 9 dígitos (ex: 86 123 4567)';
  if (!/^8[67]/.test(d)) return 'e-Mola deve começar por 86 ou 87 (Movitel)';
  return null;
}

export function validateBankAccount(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const d = digits(raw);
  if (d.length < 8 || d.length > 16) return 'Conta deve ter entre 8 e 16 dígitos';
  return null;
}

export function validateIban(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const c = raw.toUpperCase().replace(/\s/g, '');
  if (!/^MZ\d{23}$/.test(c)) return 'IBAN inválido. Formato: MZ + 23 dígitos';
  return null;
}

export function validateNuit(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const d = digits(raw);
  if (d.length !== 9) return 'NUIT deve ter 9 dígitos';
  return null;
}

export function validateIntlPhone(raw: string): ValidationResult {
  if (!raw.trim()) return null;
  const d = digits(raw);
  if (d.startsWith('258')) {
    if (d.length !== 12) return 'Telefone deve ter +258 seguido de 9 dígitos';
    if (!/^2588[2-7]/.test(d)) return 'Número móvel moçambicano inválido';
    return null;
  }
  if (d.length < 8) return 'Telefone demasiado curto';
  return null;
}
