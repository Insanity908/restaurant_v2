-- Permite ao superadmin apagar registos já revistos em
-- checkout_match_failures e feedback_submissions — pedido explícito de
-- Carlos em 28/08/2026, depois de as duas listas acumularem entradas de
-- teste sem forma nenhuma de as limpar pela app (checkout_match_failures
-- era propositadamente só-leitura, ver migração 20260826140100; decisão
-- revertida aqui a pedido de quem opera o sistema no dia-a-dia).
grant delete on public.checkout_match_failures to authenticated;
create policy "Superadmin deletes checkout match failures"
on public.checkout_match_failures for delete to authenticated
using (public.is_superadmin(auth.uid()));

grant delete on public.feedback_submissions to authenticated;
create policy "Superadmin deletes feedback"
on public.feedback_submissions for delete to authenticated
using (public.is_superadmin(auth.uid()));
