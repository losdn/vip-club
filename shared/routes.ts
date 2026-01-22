import { z } from 'zod';
import { insertUserSchema, insertModelSchema, insertPermissionSchema, users, models, permissions, type InsertUser, type UpdateUserRequest } from './schema';

// Re-export types for convenience
export type { InsertUser, UpdateUserRequest };

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login',
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(), // Returns User object (without password ideally)
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/users',
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/users/:id',
      input: insertUserSchema.partial(),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/users/:id',
      responses: {
        204: z.void(),
      },
    },
  },
  models: {
    list: {
      method: 'GET' as const,
      path: '/api/models',
      responses: {
        200: z.array(z.custom<typeof models.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/models',
      input: insertModelSchema,
      responses: {
        201: z.custom<typeof models.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/models/:id',
      input: insertModelSchema.partial(),
      responses: {
        200: z.custom<typeof models.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/models/:id',
      responses: {
        204: z.void(),
      },
    },
  },
  permissions: {
    list: {
      method: 'GET' as const,
      path: '/api/permissions',
      responses: {
        200: z.array(z.any()), // Complex join response
      },
    },
    assign: {
      method: 'POST' as const,
      path: '/api/permissions',
      input: insertPermissionSchema,
      responses: {
        201: z.custom<typeof permissions.$inferSelect>(),
      },
    },
    revoke: {
      method: 'DELETE' as const,
      path: '/api/permissions/:id',
      responses: {
        204: z.void(),
      },
    },
  },
  automation: {
    start: {
      method: 'POST' as const,
      path: '/api/automation/start',
      input: z.object({ modelId: z.number() }),
      responses: {
        200: z.object({
          status: z.enum(["success", "failed", "processing"]),
          message: z.string(),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
