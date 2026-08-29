-- T1.5 (docs/analise-sistema.md): botão "Fale connosco" na Landing,
-- deferido para "T2" na altura mas nunca chegou a ser feito (ver
-- [[general_review_2026_08_22]]). A Landing é pública/pré-signup — a
-- policy existente de system_payment_accounts só cobria `authenticated`,
-- por isso um visitante anónimo não conseguia ler o número de WhatsApp do
-- superadmin. Estes dados já são para mostrar publicamente (é o número
-- para onde os clientes pagam/falam), sem informação sensível — alargar a
-- leitura a `anon` não introduz risco novo (escrita continua restrita ao
-- superadmin).
grant select on public.system_payment_accounts to anon;

create policy "Anyone reads payment accounts"
on public.system_payment_accounts for select to anon
using (true);
