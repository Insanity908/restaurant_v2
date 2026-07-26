import type { MenuItem } from '@/types/restaurant';
import { formatPrice } from './helpers';

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
}

export function buildProformaHTML(input: ProformaInput): string {
  const { items, brand, address, taxId, phone, logoUrl, clientName } = input;
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
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; }
  .wrap { max-width: 780px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
  header .brand { display: flex; align-items: center; gap: 12px; }
  header img { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
  header h1 { margin: 0; font-size: 20px; }
  header .biz p { margin: 2px 0; font-size: 12px; color: #444; }
  .meta { text-align: right; }
  .meta .doc { font-size: 24px; font-weight: bold; color: #333; letter-spacing: 2px; }
  .meta .num { font-size: 12px; color: #555; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th { text-align: left; background: #f4f4f4; padding: 8px; border-bottom: 1px solid #ccc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.cat td { background: #333; color: #fff; font-weight: bold; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  td.price { text-align: right; white-space: nowrap; font-weight: 600; }
  td.unit { color: #666; width: 60px; }
  td.name .desc { color: #666; font-size: 11px; margin-top: 2px; }
  .totals { margin-top: 16px; text-align: right; }
  .totals .row { font-size: 13px; padding: 4px 0; }
  .totals .total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; margin-top: 6px; }
  .stamp { margin-top: 24px; padding: 12px; border: 2px dashed #c00; color: #c00; text-align: center; font-weight: bold; letter-spacing: 2px; }
  .footer { margin-top: 24px; font-size: 11px; color: #666; text-align: center; }
  .actions { text-align: center; margin-top: 20px; }
  .actions button { padding: 8px 16px; margin: 0 4px; cursor: pointer; }
  @media print { .actions { display: none; } body { padding: 0; } }
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
      <div class="row">Itens: <strong>${items.length}</strong></div>
      <div class="row total">Total estimado: ${esc(formatPrice(total))}</div>
    </div>

    <div class="stamp">SEM VALOR FISCAL — DOCUMENTO PROFORMA</div>

    <div class="footer">
      Este documento é uma estimativa de preços e não substitui a fatura fiscal.
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
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
