# Especificação Técnica Completa - Plataforma de E-commerce

## Visão Geral

Sistema de e-commerce para venda de produtos físicos com entrega nacional, possuindo:

* Painel Administrativo
* Painel de Vendas
* Painel de Usuário
* Sistema próprio de autenticação
* Integração com Mercado Pago
* Integração com Melhor Envio
* Sistema completo de gestão de produtos
* Sistema completo de pedidos
* Dashboard analítico
* Controle de estoque
* Gestão de usuários e permissões

---

# Stack Tecnológica

## Frontend

* Next.js (App Router)

## Backend

* NestJS

## Banco de Dados

* PostgreSQL

## Cache

* Redis

## Armazenamento

* Amazon S3

## Hospedagem

Frontend:

* Vercel

Backend:

* VPS Linux Ubuntu

## Infraestrutura

* Cloudflare
* SSL/TLS
* DNS Cloudflare

---

# Segurança Obrigatória

## Autenticação

Sistema próprio de login.

### Senhas

Utilizar:

* Argon2id

Nunca armazenar:

* Senha em texto puro
* Senha criptografada reversível

### Sessões

JWT Access Token

Expiração:

* 15 minutos

JWT Refresh Token

Expiração:

* 30 dias

Refresh Token armazenado:

* Hash no banco

---

## Proteções OWASP

Implementar:

### SQL Injection

* Prisma ORM
* Queries parametrizadas

### XSS

* Sanitização de entradas
* CSP

### CSRF

* CSRF Tokens
* SameSite Cookies

### SSRF

* Validação de URLs

### Path Traversal

* Bloqueio de caminhos externos

### Upload Malicioso

* Validação MIME Type
* Validação extensão
* Antivírus opcional

---

## Rate Limiting

Redis

Limites:

Login:

* 5 tentativas / minuto

Cadastro:

* 5 tentativas / minuto

API:

* 100 requisições / minuto

---

## Headers de Segurança

Content-Security-Policy

Strict-Transport-Security

X-Frame-Options

X-Content-Type-Options

Permissions-Policy

Referrer-Policy

---

## Proteção Anti-Bot

Cloudflare Turnstile

Aplicar em:

* Login
* Cadastro
* Recuperação de senha

---

## Auditoria

Registrar:

* Login
* Logout
* Criação produto
* Edição produto
* Exclusão produto
* Alteração estoque
* Alteração pedido
* Alteração permissões

---

# Controle de Acesso

RBAC

## ADMIN

Acesso total

## VENDEDOR

Produtos
Pedidos
Estoque

## CLIENTE

Compras
Pedidos próprios
Perfil

---

# Painel Administrativo

## Dashboard

Indicadores:

* Faturamento do dia
* Faturamento semanal
* Faturamento mensal
* Ticket médio
* Pedidos concluídos
* Pedidos pendentes
* Produtos mais vendidos
* Produtos menos vendidos
* Clientes recorrentes

---

## Gráficos

Vendas por:

* Dia
* Semana
* Mês
* Ano

---

## Gestão de Usuários

Criar usuários

Editar usuários

Bloquear usuários

Excluir usuários

Definir permissões

---

## Gestão Financeira

Receitas

Pedidos pagos

Pedidos cancelados

Pedidos reembolsados

---

# Painel de Vendas

## Produtos

Criar produto

Editar produto

Duplicar produto

Arquivar produto

Excluir produto

---

## Campos do Produto

Nome

Slug

Descrição

Categoria

Marca

SKU

Código interno

Preço

Preço promocional (opicional)

Peso (opicional)

Dimensões

Estoque

Imagens

Status

---

## Estoque

Controle automático

Entrada

Saída

Movimentações

Histórico

---

## Pedidos

Listagem

Filtro

Alteração status

Separação

Envio

Rastreamento

Entrega

Cancelamento

---

## Relatórios

Mais vendidos

Menos vendidos

Margem de lucro

Giro de estoque

Produtos sem venda

---

# Painel do Usuário

## Conta

Cadastro

Login

Alteração senha

Alteração dados

---

## Endereços

Cadastrar

Editar

Excluir

Selecionar padrão

---

## Pedidos

Visualizar pedidos

Acompanhar rastreio

Solicitar cancelamento

Solicitar devolução

---

## Favoritos

Adicionar

Remover

Listar

---

# Sistema de Frete

Integração:

Melhor Envio

Funcionalidades:

Cotação automática

PAC

SEDEX

Transportadoras

Geração etiqueta

Código rastreio

Atualização automática

---

# Sistema de Pagamentos

Mercado Pago

Métodos:

PIX

Cartão de Crédito

Boleto

---

## Webhooks

Pagamento aprovado

Pagamento recusado

Pagamento pendente

Estorno

Chargeback

---

# Sistema de E-mail

Provedor recomendado:

Resend

Motivos:

* Simples
* Barato
* Excelente API

---

## E-mails Automáticos

Cadastro

Confirmação de compra

Pagamento aprovado

Pedido enviado

Pedido entregue

Recuperação senha

Alteração senha

---

# Amazon S3

Buckets:

products/

users/

banners/

categories/

---

## Upload

Compressão automática

Conversão WebP

Validação tamanho

Validação extensão

---

# Banco de Dados

Principais tabelas

users

roles

permissions

products

categories

product_images

inventory

orders

order_items

payments

payment_logs

shipping

addresses

favorites

audit_logs

refresh_tokens

notifications

---

# Cache Redis

Produtos

Categorias

Sessões

Rate Limiting

Dashboard

Relatórios

---

# Monitoramento

Sentry

Logs centralizados

Health Check

Alertas

Monitoramento de APIs

---

# CI/CD

GitHub

GitHub Actions

Deploy automático

Testes automáticos

---

# Ordem de Desenvolvimento

Fase 1

* Infraestrutura
* Banco
* NestJS
* Next.js

Fase 2

* Autenticação
* RBAC
* Segurança

Fase 3

* Produtos
* Categorias
* Upload S3

Fase 4

* Carrinho
* Checkout

Fase 5

* Mercado Pago

Fase 6

* Melhor Envio

Fase 7

* Painéis

Fase 8

* Relatórios

Fase 9

* Auditoria

Fase 10

* Testes
* Deploy
* Produção

---

# Meta de Produção

Capacidade inicial:

* 10.000 produtos
* 100.000 usuários
* 5.000 pedidos/dia

Arquitetura preparada para crescimento sem necessidade de reescrita estrutural.