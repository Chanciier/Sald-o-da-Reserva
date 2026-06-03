import { SetMetadata } from '@nestjs/common';

export const RESOURCE_OWNER_KEY = 'resource_owner_param';

/**
 * Marks a route as requiring ownership of a resource.
 * @param paramName - The route param name containing the owner's user ID.
 * ADMINs bypass this check automatically.
 */
export const ResourceOwner = (paramName: string) => SetMetadata(RESOURCE_OWNER_KEY, paramName);
