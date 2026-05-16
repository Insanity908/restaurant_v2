import { Order, OrderItem } from '@/types/restaurant';
import { formatPrice } from './helpers';

interface ReceiptOptions {
  /** When provided, only these items are listed (e.g. itens servidos). */
  items?: OrderItem[];
  /** Receipt title shown at the top. */
  title?: string;
  /** Subtitle / kind label. */
  subtitle?: string;
  /** Whether to show totals/payment block. Defaults to true when items not filtered. */
  showTotals?: boolean;
  /** Restaurant brand. */
  brand?: string;
}

function escape(str: string): string {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export function buildReceiptHTML(order: Order, opts: ReceiptOptions = {}): string {
  const items = opts.items ?? order.items;
  const showTotals = opts.showTotals ?? !opts.items;
  const brand = opts.brand ?? 'Restaurante';
  const title = opts.title ?? 'Recibo';
  const subtitle = opts.subtitle
    ?? (order.type === 'dine-in' ? `Mesa ${order.tableNumber ?? '—'}`
      : order.type === 'takeaway' ? 'Takeaway' : 'Entrega');

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tip = order.tip ?? 0;
  const total = showTotals ? order.total + tip : subtotal;

  const date = new Date().toLocaleString('pt', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsRows = items.map(i => `
    <tr>
      <td class="qty">${i.quantity}x</td>
      <td class="name">${escape(i.name)}${i.notes ? `<div class="notes">${escape(i.notes)}</div>` : ''}</td>
      <td class="price">${escape(formatPrice(i.price * i.quantity))}</td>
    </tr>`).join('');

  const totalsBlock = showTotals ? `
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${escape(formatPrice(order.total))}</span></div>
      ${tip > 0 ? `<div class="row"><span>Gorjeta</span><span>${escape(formatPrice(tip))}</span></div>` : ''}
      <div class="row total"><span>Total</span><span>${escape(formatPrice(total))}</span></div>
      ${order.paymentMethod ? `<div class="row small"><span>Pagamento</span><span>${escape(order.paymentMethod)}</span></div>` : ''}
    </div>` : `
    <div class="totals">
      <div class="row total"><span>Subtotal itens</span><span>${escape(formatPrice(subtotal))}</span></div>
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escape(title)} #${order.id.slice(-4)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', ui-monospace, monospace; margin: 0; padding: 16px; color: #000; background: #fff; }
  .receipt { max-width: 320px; margin: 0 auto; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 12px; margin-bottom: 12px; }
  .meta { font-size: 11px; margin-bottom: 8px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; }
  .meta div { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 3px 0; vertical-align: top; }
  td.qty { width: 28px; }
  td.price { text-align: right; white-space: nowrap; }
  td.name .notes { font-size: 10px; color: #444; font-style: italic; }
  .totals { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; margin-top: 4px; padding-top: 6px; }
  .totals .row.small { font-size: 11px; }
  .footer { text-align: center; font-size: 11px; margin-top: 12px; padding-top: 8px; border-top: 1px dashed #000; }
  .actions { text-align: center; margin-top: 16px; }
  .actions button { padding: 8px 16px; font-size: 12px; cursor: pointer; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="receipt">
    <h1>${escape(brand)}</h1>
    <div class="sub">${escape(title)} — ${escape(subtitle)}</div>
    <div class="meta">
      <div><span>Pedido</span><span>#${order.id.slice(-4)}</span></div>
      <div><span>Data</span><span>${escape(date)}</span></div>
      ${order.customerName ? `<div><span>Cliente</span><span>${escape(order.customerName)}</span></div>` : ''}
    </div>
    <table>
      <tbody>${itemsRows || '<tr><td colspan="3" style="text-align:center;font-style:italic">Sem itens</td></tr>'}</tbody>
    </table>
    ${totalsBlock}
    <div class="footer">Obrigado pela preferência!</div>
    <div class="actions">
      <button onclick="window.print()">Imprimir</button>
      <button onclick="window.close()">Fechar</button>
    </div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;
}

export function printReceipt(order: Order, opts: ReceiptOptions = {}): void {
  const html = buildReceiptHTML(order, opts);
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function printServedItems(order: Order): void {
  const served = order.items.filter(i => i.status === 'served' || i.status === 'ready');
  printReceipt(order, {
    items: served,
    title: 'Itens Servidos',
    showTotals: false,
  });
}
