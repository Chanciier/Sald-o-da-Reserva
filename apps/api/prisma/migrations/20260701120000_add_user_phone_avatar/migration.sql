-- Perfil do usuário: telefone de contato e foto de perfil (avatar).
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
