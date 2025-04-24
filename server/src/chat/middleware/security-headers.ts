/**
 * Security Headers Middleware
 *
 * Adds security-related HTTP headers to all responses to improve
 * the overall security posture of the application.
 */

import { Request, Response, NextFunction } from 'express';

interface SecurityHeadersOptions {
  contentSecurityPolicy?: boolean | string;
  xssProtection?: boolean | string;
  noSniff?: boolean;
  frameOptions?: boolean | string;
  hsts?:
    | boolean
    | {
        maxAge: number;
        includeSubDomains: boolean;
        preload: boolean;
      };
  referrerPolicy?: boolean | string;
  permissionsPolicy?: boolean | string;
  cacheControl?: boolean | string;
  strictTransportSecurity?: boolean | string;
}

export function securityHeaders(options: SecurityHeadersOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Content-Security-Policy
    if (options.contentSecurityPolicy !== false) {
      const csp =
        typeof options.contentSecurityPolicy === 'string'
          ? options.contentSecurityPolicy
          : "default-src 'self'; script-src 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; connect-src 'self' wss:;";

      res.setHeader('Content-Security-Policy', csp);
    }

    // X-XSS-Protection
    if (options.xssProtection !== false) {
      const xssValue =
        typeof options.xssProtection === 'string'
          ? options.xssProtection
          : '1; mode=block';

      res.setHeader('X-XSS-Protection', xssValue);
    }

    // X-Content-Type-Options
    if (options.noSniff !== false) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (options.frameOptions !== false) {
      const frameValue =
        typeof options.frameOptions === 'string'
          ? options.frameOptions
          : 'DENY';

      res.setHeader('X-Frame-Options', frameValue);
    }

    // Strict-Transport-Security (HSTS)
    if (options.hsts !== false) {
      let hstsValue: string;

      if (typeof options.hsts === 'object') {
        hstsValue = `max-age=${options.hsts.maxAge}`;

        if (options.hsts.includeSubDomains) {
          hstsValue += '; includeSubDomains';
        }

        if (options.hsts.preload) {
          hstsValue += '; preload';
        }
      } else {
        hstsValue = 'max-age=31536000; includeSubDomains; preload';
      }

      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Referrer-Policy
    if (options.referrerPolicy !== false) {
      const referrerValue =
        typeof options.referrerPolicy === 'string'
          ? options.referrerPolicy
          : 'strict-origin-when-cross-origin';

      res.setHeader('Referrer-Policy', referrerValue);
    }

    // Permissions-Policy (formerly Feature-Policy)
    if (options.permissionsPolicy !== false) {
      const permissionsValue =
        typeof options.permissionsPolicy === 'string'
          ? options.permissionsPolicy
          : 'camera=(), microphone=(), geolocation=()';

      res.setHeader('Permissions-Policy', permissionsValue);
    }

    // Set sensible cache control if requested
    if (options.cacheControl) {
      const cacheValue =
        typeof options.cacheControl === 'string'
          ? options.cacheControl
          : 'no-store, no-cache, must-revalidate, private';

      res.setHeader('Cache-Control', cacheValue);
      res.setHeader('Pragma', 'no-cache');
    }

    next();
  };
}
