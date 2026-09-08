# Security test prompt (active testing, pre-production)

Paste this into a new session (after `.claude/skills/` has reloaded) to run the
active security test pass using the 10 cybersecurity skills copied into this
project.

---

Quero um teste de segurança ATIVO (testes reais, não só revisão de código) neste
projeto, usando as 8 skills de cybersecurity em .claude/skills/. O app AINDA NÃO
ESTÁ EM PRODUÇÃO — pode testar contra o projeto Supabase real
(bbpfoygfxqwjqsolisqw, já confirmado em memória como projeto de dev/teste seguro
pra escrever) e contra as Edge Functions reais, usando contas de teste (crie
contas novas em 2+ tenants se precisar, como já foi feito antes). NÃO teste rate
limiting — já foi confirmado funcionando e está fora de escopo aqui. Apenas
REPORTE os achados no final (não corrija nada ainda).

Para cada item abaixo, rode o teste de verdade (curl real, não hipotético),
mostre o request/response que prova o resultado, e classifique: Confirmado
(reproduzido de fato) / Não reproduzido / Não aplicável.

1. IDOR / Broken Object Level Authorization
   Skills: exploiting-idor-vulnerabilities, testing-api-for-broken-object-level-authorization
   - Crie 2 contas de teste em 2 tenants diferentes (ou use as existentes se
     já houver). Pegue um order_id, table_id e session_id reais do tenant A.
   - Autenticado como tenant B, tente ler e escrever esses IDs via:
     a) API REST automática do PostgREST (supabase.from('orders').select().eq('id', ...))
     b) Cada Edge Function em supabase/functions/ que aceita um ID no body/query
        (create-staff-account, delete-staff-account, resend-access-code,
        subscription-status, send-push, auto-activate-payment,
        check-payment-webhook-silence)
   - Teste também acesso sem autenticação nenhuma (anon key só) nos mesmos IDs.

2. Mass Assignment / Broken Object Property Level Authorization
   Skills: exploiting-mass-assignment-in-rest-apis, detecting-broken-object-property-level-authorization
   - Em cada Edge Function que faz insert/update (create-staff-account,
     bootstrap-tenant, import-legacy, subscription-status), tente injetar
     campos extra no payload que o frontend nunca envia (role: 'admin',
     is_admin: true, tenant_id: <outro-tenant>, subscription_status: 'active',
     access_code: <valor-escolhido-por-mim>) e veja se algum é aceito/persistido.
   - Via PostgREST direto (sem passar pela Edge Function), tente um update
     em staff_permissions, user_roles, tenants alterando campos sensíveis
     como usuário de role baixo (waiter) e confirme se RLS/grants bloqueiam.
   - Confira se algum select('*') devolve campos sensíveis que não deveriam
     ir pro cliente (senhas/hash, telefone completo de outro tenant, etc).

3. CORS
   Skill: testing-cors-misconfiguration
   - Para cada uma das 10 Edge Functions, mande um OPTIONS e um GET/POST real
     com `Origin: https://evil-test.example.com` e veja o que
     Access-Control-Allow-Origin/Allow-Credentials devolvem.
   - Teste também `Origin: null` e um subdomínio parecido
     (ex: https://evil-<dominio-real>.com) pra ver se há reflection ou
     regex mal ancorada.
   - Não precisa montar HTML de exfiltração real, só provar a resposta do
     header — isso já classifica o achado.

4. Headers de segurança HTTP
   Skill: performing-security-headers-audit
   - Rode curl -I contra a URL de produção/preview do frontend (Vercel) e
     contra as Edge Functions, e liste quais faltam: CSP, HSTS,
     X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
   - Confira atributos de cookie (Secure/HttpOnly/SameSite) se houver algum
     sendo setado (sessão de pagamento, etc).

5. JWT / Supabase Auth
   Skill: testing-for-json-web-token-vulnerabilities
   - Pegue um JWT real de login de teste, decodifique o payload (sem
     verificar assinatura) e veja o que ele expõe (role, tenant_id, etc).
   - Tente usar esse JWT modificado (alg: none, ou payload editado com role
     trocado, re-encodado sem assinatura válida) direto contra o endpoint
     REST do Supabase e contra as Edge Functions — confirme que é rejeitado.
   - Confirme que SUPABASE_SERVICE_ROLE_KEY não aparece em nenhum bundle
     do frontend (buscar no dist/build).

6. Secrets no git
   Skill: implementing-secret-scanning-with-gitleaks
   - Se gitleaks estiver disponível, rode contra o histórico completo do
     repo (`gitleaks detect --source . --log-opts="--all"`); se não estiver,
     faça grep manual no `git log -p` inteiro por padrões de chave Supabase,
     tokens de WhatsApp/SMS, e senhas.

7. Dependências vulneráveis
   Skill: performing-sca-dependency-scanning-with-snyk
   - Rode `npm audit --production` e liste vulnerabilidades alta/crítica com
     o pacote direto afetado (ignore transitivas de baixa severidade sem
     exploit conhecido).

8. Checklist OWASP API Top 10 (2023)
   Skill: testing-api-security-with-owasp-top-10
   - Passe pelas 10 categorias contra as 10 Edge Functions + API automática
     do PostgREST, PULANDO API4:2023 (Unrestricted Resource Consumption /
     rate limiting) que já está fora de escopo. Pra cada categoria já
     coberta por um item anterior (1-6), só referencie o achado, não repita
     o teste.

No final, gere uma tabela consolidada de achados por severidade
(Alta/Média/Baixa), com arquivo:linha ou nome do endpoint, e o request/response
real que prova cada um. Não altere nenhum código ainda — só reportar.
