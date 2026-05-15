import type { NextFunction, Request, Response } from 'express';

export type ApiHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ApiRouteOptions = {
  method: ApiHttpMethod;
  path: string;
  args?: (req: Request) => unknown[];
  raw?: boolean;
};

export type ApiRouteMetadata = ApiRouteOptions & {
  handler: string;
};

export type RawApiRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

export function api(options: ApiRouteOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    if (!target._apiRoutes) {
      target._apiRoutes = [];
    }

    target._apiRoutes.push({
      method: options.method,
      path: options.path,
      args: options.args,
      raw: options.raw,
      handler: propertyKey,
    });

    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      return originalMethod.apply(this, args);
    };
  };
}
