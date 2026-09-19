import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  downloadImportTemplate, parseImportFile, runHistoricalImport,
  type ParsedImportData, type ImportRowError,
} from '@/lib/importExcel';

const ROW_ERRORS_SHOWN = 20;

export default function ImportDataPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedImportData | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setParsed(null);
    setResult(null);
    setFileName(file.name);
    try {
      const { data, errors } = await parseImportFile(file);
      setParsed(data);
      setRowErrors(errors);
    } catch (e) {
      toast.error('Não foi possível ler este ficheiro — confirme que é um .xlsx válido');
      console.error(e);
    } finally {
      setParsing(false);
    }
  };

  const totalRows = parsed
    ? parsed.menuItems.length + parsed.customers.length + parsed.inventory.length + parsed.sales.length
    : 0;

  const handleImport = async () => {
    const t = user?.tenantId;
    if (!t || !parsed) return;
    setImporting(true);
    try {
      const res = await runHistoricalImport(t, parsed);
      if (!res.ok) {
        toast.error(res.error ?? 'Falha na importação');
        return;
      }
      setResult(res.imported ?? {});
      toast.success('Importação concluída');
    } finally {
      setImporting(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <PageShell title="Importar Dados Antigos">
        <p className="text-sm text-muted-foreground">Só o administrador pode importar dados antigos.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Importar Dados Antigos"
      subtitle="Traga o cardápio, clientes, inventário e histórico de vendas de antes de usar este sistema"
    >
      <div className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Descarregue o modelo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O ficheiro tem 4 folhas (Cardápio, Clientes, Inventário, Vendas). Preencha só as que precisar —
              as outras podem ficar vazias.
            </p>
            <Button variant="outline" className="gap-2" onClick={downloadImportTemplate}>
              <Download className="w-4 h-4" /> Descarregar modelo (.xlsx)
            </Button>
            <p className="text-xs text-muted-foreground">
              É o mesmo layout da "Cópia completa" que se pode gerar periodicamente em{' '}
              <Link to="/data-archive" className="text-primary underline">Arquivo de Dados</Link> — um ficheiro
              gerado lá carrega aqui sem precisar de alterar nada.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Carregue o ficheiro preenchido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
            />
            <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {fileName || 'Escolher ficheiro .xlsx'}
            </Button>

            {parsed && (
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2 text-sm bg-secondary/60 rounded-lg p-3">
                  <FileSpreadsheet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{totalRows} linha{totalRows === 1 ? '' : 's'} válida{totalRows === 1 ? '' : 's'} encontrada{totalRows === 1 ? '' : 's'}</p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <li>{parsed.menuItems.length} itens de cardápio</li>
                      <li>{parsed.customers.length} clientes</li>
                      <li>{parsed.inventory.length} itens de inventário</li>
                      <li>{parsed.sales.length} linhas de vendas</li>
                    </ul>
                  </div>
                </div>

                {rowErrors.length > 0 && (
                  <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium">
                        {rowErrors.length} linha{rowErrors.length === 1 ? '' : 's'} ignorada{rowErrors.length === 1 ? '' : 's'} por erro — o resto do ficheiro importa na mesma
                      </p>
                      <ul className="text-xs space-y-0.5">
                        {rowErrors.slice(0, ROW_ERRORS_SHOWN).map((e, i) => (
                          <li key={i}>{e.sheet}, linha {e.row}: {e.message}</li>
                        ))}
                        {rowErrors.length > ROW_ERRORS_SHOWN && <li>… e mais {rowErrors.length - ROW_ERRORS_SHOWN}</li>}
                      </ul>
                    </div>
                  </div>
                )}

                <Button className="gap-2" onClick={handleImport} disabled={importing || totalRows === 0}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Confirmar importação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" /> Importação concluída
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>{result.menuItems ?? 0} itens de cardápio adicionados</li>
                <li>{result.customers ?? 0} clientes adicionados</li>
                <li>{result.inventory ?? 0} itens de inventário adicionados</li>
                <li>{result.sales ?? 0} vendas históricas adicionadas</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-3">
                Itens já existentes (mesmo nome/telefone) ou já importados antes foram ignorados — pode
                carregar o mesmo ficheiro outra vez em segurança sem duplicar nada.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
