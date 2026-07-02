-- CreateEnum
CREATE TYPE "AdminSection" AS ENUM ('DASHBOARD', 'PRODUTOS', 'PRODUTOS_CRIAR', 'PRODUTOS_EDITAR', 'PEDIDOS', 'VENDAS', 'CLIENTES', 'CUPONS', 'CONFIGURACOES', 'RELATORIOS', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "SectionAccessMode" AS ENUM ('NONE', 'FREE', 'PASSWORD', 'AUTHORIZATION');

-- CreateEnum
CREATE TYPE "SectionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "seller_section_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "section" "AdminSection" NOT NULL,
    "mode" "SectionAccessMode" NOT NULL DEFAULT 'NONE',
    "password_hash" TEXT,
    "password_granted_at" TIMESTAMP(3),
    "password_grant_expires_at" TIMESTAMP(3),
    "authorization_granted_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_section_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_access_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "section" "AdminSection" NOT NULL,
    "status" "SectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_section_permissions_user_id_idx" ON "seller_section_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_section_permissions_user_id_section_key" ON "seller_section_permissions"("user_id", "section");

-- CreateIndex
CREATE INDEX "seller_access_requests_user_id_section_idx" ON "seller_access_requests"("user_id", "section");

-- CreateIndex
CREATE INDEX "seller_access_requests_status_idx" ON "seller_access_requests"("status");

-- AddForeignKey
ALTER TABLE "seller_section_permissions" ADD CONSTRAINT "seller_section_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_access_requests" ADD CONSTRAINT "seller_access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_access_requests" ADD CONSTRAINT "seller_access_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: hoje todo Role.VENDEDOR já tem acesso irrestrito a Produtos
-- (criar/editar) sem nenhuma granularidade. Para o novo sistema de permissões
-- não revogar silenciosamente esse acesso já em uso, gravamos FREE para os
-- vendedores existentes nessas 3 seções. As demais seções ficam sem linha
-- (equivalente a NONE), que é exatamente o comportamento atual, já que essas
-- rotas eram restritas a ADMIN.
INSERT INTO "seller_section_permissions" ("id", "user_id", "section", "mode", "created_at", "updated_at")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || "users"."id" || section."value"), 1, 25),
  "users"."id",
  section."value"::"AdminSection",
  'FREE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
CROSS JOIN (VALUES ('PRODUTOS'), ('PRODUTOS_CRIAR'), ('PRODUTOS_EDITAR')) AS section("value")
WHERE "users"."role" = 'VENDEDOR';
