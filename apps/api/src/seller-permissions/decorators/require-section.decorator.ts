import { SetMetadata } from '@nestjs/common';
import { AdminSection } from '@prisma/client';

export const REQUIRE_SECTION_KEY = 'require_section';

/**
 * Restringe uma rota a uma (ou mais) seção do painel admin. ADMIN sempre
 * passa; para VENDEDOR, o acesso depende da SellerSectionPermission
 * configurada. Quando mais de uma seção é informada, basta ter acesso
 * desbloqueado a uma delas (semântica OR, igual a @Roles).
 */
export const RequireSection = (...sections: AdminSection[]) =>
  SetMetadata(REQUIRE_SECTION_KEY, sections);
