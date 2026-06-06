import { Order } from '@/types/restaurant';
import { buildReceiptHTML } from './receipt';
import { formatPrice } from './helpers';

interface BatchOptions {
  brand?: string;
  rangeLabel?: string;
}

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) return html;
  // Strip the auto-print script and action buttons block
  return match[1]
    .replace(/<div class="actions">[\s\S]*?<\/div>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function buildBatchReceiptsHTML(orders: Order[], opts: BatchOptions = {}): string {
  const brand = opts.brand ?? 'Restaurante';
  const rangeLabel = opts.rangeLabel ?? '';
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const totalRevenue = sorted.reduce((s, o) => s + o.total + (o.tip || 0), 0);

  const blocks = sorted
    .map(o => {
      const inner = extractBody(buildReceiptHTML(o, { brand }));
      return `<section class="page">${inner}</section>`;
    })
    .join('\n');

  const generatedAt = new Date().toLocaleString('pt', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Recibos — ${brand}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', ui-monospace, monospace; margin: 0; padding: 0; background: #f5f5f5; color: #000; }
  .cover { max-width: 600px; margin: 0 auto; padding: 24px; background: #fff; }
  .cover h1 { margin: 0 0 8px; font-size: 20px; }
  .cover p { margin: 2px 0; font-size: 12px; }
  .page { background: #fff; padding: 16px; margin: 0 auto; max-width: 360px; }
  .page + .page { margin-top: 16px; border-top: 2px dashed #999; }
  .toolbar { position: sticky; top: 0; background: #222; color: #fff; padding: 10px 16px; display: flex; gap: 8px; justify-content: center; z-index: 10; }
  .toolbar button { padding: 8px 14px; cursor: pointer; font-size: 12px; border: 0; border-radius: 4px; background: #fff; color: #000; font-weight: bold; }
  @media print {
    .toolbar, .cover { display: none; }
    body { background: #fff; }
    .page { page-break-after: always; max-width: none; padding: 0; }
    .page:last-child { page-break-after: auto; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
    <button onclick="window.close()">Fechar</button>
  </div>
  <div class="cover">
    <h1>${brand} — Recibos</h1>
    ${rangeLabel ? `<p><strong>Período:</strong> ${rangeLabel}</p>` : ''}
    <p><strong>Total de recibos:</strong> ${sorted.length}</p>
    <p><strong>Receita total:</strong> ${formatPrice(totalRevenue)}</p>
    <p><strong>Gerado em:</strong> ${generatedAt}</p>
  </div>
  ${blocks}
</body></html>`;
}

export function printBatchReceipts(orders: Order[], opts: BatchOptions = {}): void {
  const html = buildBatchReceiptsHTML(orders, opts);
  const w = window.open('', '_blank', 'width=480,height=720');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function downloadBatchReceiptsHTML(orders: Order[], opts: BatchOptions = {}): void {
  const html = buildBatchReceiptsHTML(orders, opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `recibos-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
