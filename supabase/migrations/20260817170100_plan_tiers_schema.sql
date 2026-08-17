-- Preços/serviços do nível Básico (60% do Profissional, sem os recursos
-- restritos) e ajusta os "serviços" do Profissional para deixar claro o
-- que se ganha a mais ao subir de nível.
insert into public.billing_plans (id, label, months, price, savings, features) values
  ('basic-monthly', 'Mensal', 1, 2200, null,
   '["Até 10 mesas", "Até 5 funcionários", "Suporte por email"]'),
  ('basic-quarterly', 'Trimestral', 3, 5500, 'Poupa 17%',
   '["Até 10 mesas", "Até 5 funcionários", "Suporte por email"]'),
  ('basic-semiannual', 'Semestral', 6, 9800, 'Poupa 26%',
   '["Até 10 mesas", "Até 5 funcionários", "Suporte por email"]'),
  ('basic-annual', 'Anual', 12, 18300, 'Poupa 31%',
   '["Até 10 mesas", "Até 5 funcionários", "Suporte por email"]')
on conflict (id) do nothing;

update public.billing_plans
set features = '["Mesas e funcionários ilimitados", "Programa de fidelização", "Pedido pelo cliente (QR / entrega)", "Relatórios completos com exportação CSV/PDF"]'
where id in ('monthly', 'quarterly', 'semiannual', 'annual');

-- Número de WhatsApp do superadmin — usado pelas páginas de preços/
-- faturação para abrir uma conversa a pedir activação do plano escolhido,
-- em vez de checkout automático.
alter table public.system_payment_accounts add column superadmin_whatsapp text;
