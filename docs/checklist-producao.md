# Checklist de Produção — Saldão da Reserva

## CRÍTICO — Segurança (fazer antes de qualquer deploy)

- [ ] Rotacionar `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (chaves expostas no .env)
- [ ] Rotacionar `MERCADO_PAGO_ACCESS_TOKEN` + `MERCADO_PAGO_PUBLIC_KEY`
- [ ] Rotacionar `MELHOR_ENVIO_TOKEN`
- [ ] Rotacionar `FOCUS_NFE_TOKEN`
- [ ] Rotacionar `RESEND_API_KEY`
- [ ] Confirmar que nenhuma chave está commitada: `git grep -i "access_key\|secret\|token" -- "*.env"`

---

## Railway (API)

- [ ] `DATABASE_URL` → string de conexão PostgreSQL de produção
- [ ] `REDIS_URL` → Redis de produção
- [ ] `JWT_SECRET` → string aleatória ≥ 64 caracteres
- [ ] `JWT_REFRESH_SECRET` → string aleatória ≥ 64 caracteres (diferente do JWT_SECRET)
- [ ] `FRONTEND_URL` → URL do Vercel (ex: `https://saldaodareserva.com.br`)
- [ ] `NODE_ENV=production`
- [ ] `AWS_ACCESS_KEY_ID` → nova chave rotacionada
- [ ] `AWS_SECRET_ACCESS_KEY` → nova chave rotacionada
- [ ] `AWS_S3_BUCKET` → bucket de produção
- [ ] `AWS_S3_REGION` → região do bucket
- [ ] `MERCADO_PAGO_ACCESS_TOKEN` → novo token rotacionado
- [ ] `MERCADO_PAGO_PUBLIC_KEY` → nova chave rotacionada
- [ ] `MERCADO_PAGO_WEBHOOK_SECRET` → webhook secret do painel MP
- [ ] `MELHOR_ENVIO_TOKEN` → novo token rotacionado
- [ ] `MELHOR_ENVIO_SANDBOX=false`
- [ ] `FOCUS_NFE_TOKEN` → novo token rotacionado
- [ ] `FOCUS_NFE_ENVIRONMENT=production`
- [ ] `FOCUS_NFE_CNPJ` → CNPJ do emitente
- [ ] `FOCUS_NFE_IE` → Inscrição Estadual do emitente
- [ ] `RESEND_API_KEY` → nova chave rotacionada
- [ ] `MAIL_FROM` → email verificado no Resend (ex: `noreply@seudominio.com.br`)
- [ ] `TURNSTILE_SECRET_KEY` → chave real do Cloudflare (não `skip`)

---

## Vercel (Frontend)

- [ ] `NEXT_PUBLIC_API_URL` → URL da API no Railway
- [ ] `NEXT_PUBLIC_MP_PUBLIC_KEY` → nova chave MP rotacionada
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` → site key do Cloudflare Turnstile

---

## Webhooks — Configurar nos painéis externos

- [ ] **Mercado Pago** → painel MP → notificações → URL: `https://sua-api.railway.app/webhooks/mercadopago`
- [ ] **Melhor Envio** → painel ME → webhooks → URL: `https://sua-api.railway.app/webhooks/melhorenvio`
- [ ] **Focus NF-e** → painel Focus → webhook URL: `https://sua-api.railway.app/webhooks/focus`

---

## DNS / Email (Resend)

- [ ] Adicionar registro **DKIM** no DNS do domínio de email
- [ ] Adicionar registro **SPF** no DNS
- [ ] Adicionar registro **DMARC** no DNS
- [ ] Verificar domínio no painel Resend antes de enviar emails reais

---

## Banco de Dados

- [ ] Rodar `npx prisma migrate deploy` (produção — NUNCA `migrate dev`)
- [ ] Criar usuário ADMIN via SQL ou seed no DB de produção

---

## Validação Final

- [ ] Build sem erros: `npm run build`
- [ ] API responde: `GET https://sua-api.railway.app/health`
- [ ] Login funciona com usuário admin real
- [ ] Criar pedido teste com PIX (valor mínimo)
- [ ] NF-e é emitida em ambiente de produção (não homologação)
- [ ] `MELHOR_ENVIO_SANDBOX=false` confirmado — cotação retorna valores reais
- [ ] Webhook MP recebe notificação e atualiza status do pedido
- [ ] Email de confirmação de pedido chega no destinatário
- [ ] DANFE abre corretamente no navegador
- [ ] Formulário de login exige CAPTCHA (`TURNSTILE_SECRET_KEY` não é `skip`)
