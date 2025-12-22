import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark routes as public (bypass JWT authentication)
 * Usage: @Public()
 *
 * ADDED: Part of authentication system integration
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
