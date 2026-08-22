-- `subscription_history` guardava só o plano (ex.: "monthly"), nunca o preço
-- pago naquele momento — o "total pago" era sempre recalculado com o preço
-- ACTUAL de `billing_plans`, por isso mudar um preço reescrevia silenciosamente
-- o histórico financeiro de subscrições já activadas no passado. Snapshot
-- resolve isto: o preço fica gravado na própria linha, na hora da activação.
alter table public.subscription_history
  add column if not exists price numeric;

comment on column public.subscription_history.price is
  'Preço (em MT) do plano no momento da activação — snapshot, não recalculado a partir de billing_plans.';
