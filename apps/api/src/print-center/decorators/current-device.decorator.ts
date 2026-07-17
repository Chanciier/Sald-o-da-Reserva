import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Dispositivo autenticado pelo DeviceTokenGuard (nunca o usuário JWT). */
export const CurrentDevice = createParamDecorator(
  (data: 'id' | 'name' | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.device?.[data] : request.device;
  },
);
