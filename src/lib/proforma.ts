import type { MenuItem } from '@/types/restaurant';
import { formatPrice } from './helpers';
import { getCachedUrl, isStoragePath, LOGO_BUCKET } from './storage';
import { toast } from 'sonner';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

interface ProformaInput {
  items: MenuItem[];
  brand: string;
  address?: string;
  taxId?: string;
  phone?: string;
  logoUrl?: string;
  clientName?: string;
  /** Cor de marca do restaurante (ver AppSettings) — usada nos destaques em
   *  vez do preto sólido genérico, para o documento parecer do restaurante. */
  primaryHue?: number;
  primarySaturation?: number;
  primaryLightness?: number;
}

export function buildProformaHTML(input: ProformaInput): string {
  const { items, brand, address, taxId, phone, clientName } = input;
  // logoUrl pode chegar como caminho no bucket (settings.receiptLogo) em vez
  // de URL — sem isto a imagem ficava simplesmente partida no documento.
  const rawLogo = input.logoUrl;
  const logoUrl = isStoragePath(rawLogo) ? (getCachedUrl(LOGO_BUCKET, rawLogo) || undefined) : rawLogo;
  const ph = input.primaryHue ?? 30;
  const ps = input.primarySaturation ?? 90;
  const pl = input.primaryLightness ?? 45;
  const accent = `hsl(${ph} ${ps}% ${pl}%)`;
  const accentSoft = `hsl(${ph} ${Math.max(0, ps - 55)}% 96%)`;
  const accentDark = `hsl(${ph} ${Math.min(100, ps)}% ${Math.max(0, pl - 15)}%)`;
  const total = items.reduce((s, i) => s + i.price, 0);
  const date = new Date().toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const number = `PRO-${Date.now().toString().slice(-6)}`;

  // group by category
  const byCat: Record<string, MenuItem[]> = {};
  items.forEach(i => { (byCat[i.category] ||= []).push(i); });

  const rows = Object.entries(byCat).map(([cat, list]) => `
    <tr class="cat"><td colspan="3">${esc(cat)}</td></tr>
    ${list.map(i => `
      <tr>
        <td class="name">${esc(i.name)}${i.description ? `<div class="desc">${esc(i.description)}</div>` : ''}</td>
        <td class="unit">un</td>
        <td class="price">${esc(formatPrice(i.price))}</td>
      </tr>`).join('')}
  `).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Fatura Proforma ${number}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 32px 28px; color: #1a1a1a; background: #fff; }
  .wrap { max-width: 780px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 3px solid ${accent}; padding-bottom: 16px; margin-bottom: 20px; }
  header .brand { display: flex; align-items: center; gap: 14px; }
  header img { width: 60px; height: 60px; object-fit: contain; border-radius: 10px; border: 1px solid #eee; }
  header h1 { margin: 0; font-size: 21px; letter-spacing: -0.2px; }
  header .biz p { margin: 2px 0; font-size: 12px; color: #666; }
  .meta { text-align: right; }
  .meta .doc { font-size: 26px; font-weight: 800; color: ${accentDark}; letter-spacing: 3px; }
  .meta .num { font-size: 12px; color: #777; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13px; }
  thead th { text-align: left; background: ${accentSoft}; color: ${accentDark}; padding: 9px 10px; border-bottom: 1px solid #eee; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
  td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr.cat td { background: ${accent}; color: #fff; font-weight: 700; padding: 7px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; }
  td.price { text-align: right; white-space: nowrap; font-weight: 700; color: #222; }
  td.unit { color: #999; width: 56px; }
  td.name .desc { color: #888; font-size: 11px; margin-top: 2px; }
  .totals { margin-top: 18px; display: flex; justify-content: flex-end; }
  .totals .box { min-width: 220px; }
  .totals .row { font-size: 13px; padding: 4px 0; color: #555; display: flex; justify-content: space-between; gap: 16px; }
  .totals .total { font-size: 19px; font-weight: 800; border-top: 2px solid ${accent}; padding-top: 10px; margin-top: 6px; display: flex; justify-content: space-between; color: ${accentDark}; }
  .stamp { margin-top: 28px; padding: 12px; border: 2px dashed #c00; border-radius: 8px; color: #c00; text-align: center; font-weight: 700; letter-spacing: 1.5px; font-size: 12px; }
  .footer { margin-top: 20px; font-size: 11px; color: #999; text-align: center; line-height: 1.5; }
  .actions { text-align: center; margin-top: 24px; }
  .actions button { padding: 9px 18px; margin: 0 4px; cursor: pointer; border-radius: 8px; border: 1px solid #ddd; background: #fff; font-size: 13px; }
  .actions button:first-child { background: ${accent}; color: #fff; border-color: ${accent}; }
  @media print { .actions { display: none; } body { padding: 12px; } }
</style></head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ''}
        <div class="biz">
          <h1>${esc(brand)}</h1>
          ${address ? `<p>${esc(address)}</p>` : ''}
          ${taxId ? `<p>NUIT: ${esc(taxId)}</p>` : ''}
          ${phone ? `<p>Tel: ${esc(phone)}</p>` : ''}
        </div>
      </div>
      <div class="meta">
        <div class="doc">PROFORMA</div>
        <div class="num">Nº ${number}</div>
        <div class="num">Data: ${esc(date)}</div>
        ${clientName ? `<div class="num">Cliente: ${esc(clientName)}</div>` : ''}
      </div>
    </header>

    <table>
      <thead>
        <tr>
          <th>Descrição</th>
          <th>Un</th>
          <th style="text-align:right">Preço</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#888;padding:24px">Sem itens</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div class="box">
        <div class="row"><span>Itens</span><strong>${items.length}</strong></div>
        <div class="total"><span>Total estimado</span><span>${esc(formatPrice(total))}</span></div>
      </div>
    </div>

    <div class="stamp">SEM VALOR FISCAL — DOCUMENTO PROFORMA</div>

    <div class="footer">
      Este documento é uma estimativa de preços e não substitui a fatura fiscal.<br />
      Preços sujeitos a alteração sem aviso prévio.
    </div>

    <div class="actions">
      <button onclick="window.print()">Imprimir</button>
      <button onclick="window.close()">Fechar</button>
    </div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;
}

export function printProforma(input: ProformaInput): void {
  const html = buildProformaHTML(input);
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { toast.error('Não foi possível abrir a janela de impressão — verifique se o navegador bloqueou o pop-up'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
