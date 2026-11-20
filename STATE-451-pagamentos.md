# 451.sh — domínio, e-mail e pagamentos (19/11/2026)

## No ar
- Domínio 451sh.com (Vercel, time dwadwdwas-projects, renova sozinho US$ 12,03/ano). www → 308 → 451sh.com.
- E-mail Zoho Mail Free (5 caixas, só webmail/app): contato@451sh.com (admin) + apelido suporte@451sh.com.
  DNS na Vercel: MX mx/mx2/mx3.zoho.com, SPF include:zoho.com, DKIM zmail._domainkey, DMARC p=none, TXT zoho-verification.
- Pix: AbacatePay API v2 (chave abc_prod, conta também tem produtos do Synapse). Produtos 451sh-pro-{mensal,trimestral,anual}
  = 4999/12990/39990 centavos. Checkout hospedado + ?skip_customer=true. Status por GET /v2/checkouts/get (fonte da verdade).
  Webhook webh_prod_DsFBH2YK6YsCSZSMEnXr4mpR → https://451sh.com/api/pay/abacatepay (checkout.completed), segredo só na env da Vercel.
- Cripto: NOWPayments (custódia ligada, sem carteira de saque cadastrada: o dinheiro fica no saldo da NOWPayments).
- Envs prod: ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET, NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, PUBLIC_URL=https://451sh.com.

## Correções que já estavam quebradas em produção
- vercel.json: rewrite /api/:path* → /api/[[...route]] (rotas de 2 níveis davam 404: status do pedido, IPN, conversas).
- src/plans.js keyFrom: aceita x-451-key (app pós-rebrand) e x-heretic-key; device id x-451-client também.

## Deploys (CLI, sem commit — pasta tem trabalho de outras conversas)
- antes: dpl_29dyZAyd4yt39mKDAyKb7nJEKk8w https://451sh-9p4b79h95-dwadwdwas-projects.vercel.app
- agora: dpl_HEaPaHuotgcEJxpVQskkWEsmyK4i https://451sh-f1dzd12fl-dwadwdwas-projects.vercel.app
- undo: npx vercel alias set https://451sh-9p4b79h95-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects

## Pendente
- Pagamento real ponta a ponta (Pix R$ 49,99 / cripto) não feito: precisa de dinheiro de verdade.
- Pro Plus aparece na landing mas o backend só vende o Pro.
- Commit dos arquivos: src/payments.js, src/app.js, src/plans.js, vercel.json, site/landing-viva/landing.dc.html, ryan-ui/heretic/src/pay.tsx.
