-- Dois níveis de plano (Básico/Profissional), cada um com as 4 durações já
-- existentes. Em vez de acrescentar uma coluna `tier` (que obrigaria a
-- migrar subscriptions/subscription_history existentes), o nível fica
-- codificado no próprio valor do enum: os 4 valores actuais
-- (monthly/quarterly/semiannual/annual) passam a significar, implicitamente,
-- o nível Profissional — nenhuma linha existente precisa de mudar
-- ("grandfathering" automático de quem já paga). Só se acrescentam 4 novos
-- valores para o nível Básico.
--
-- Numa migração à parte de qualquer coisa que use os novos valores — o
-- Postgres não deixa usar um valor de enum recém-criado na mesma
-- transacção em que foi adicionado (mesma regra já aplicada nesta sessão
-- para 'awaiting-confirmation').
alter type public.billing_plan add value 'basic-monthly';
alter type public.billing_plan add value 'basic-quarterly';
alter type public.billing_plan add value 'basic-semiannual';
alter type public.billing_plan add value 'basic-annual';
