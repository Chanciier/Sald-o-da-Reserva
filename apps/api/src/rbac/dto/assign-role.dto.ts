import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class AssignRoleDto {
  @IsEnum(Role, { message: 'Perfil inválido. Use: ADMIN, VENDEDOR ou CLIENTE.' })
  role: Role;
}
