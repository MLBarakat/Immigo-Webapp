// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const deleteUser = vi.fn();
  const createClient = vi.fn(() => ({
    auth: { getUser, admin: { deleteUser } },
  }));
  return { getUser, deleteUser, createClient };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

const REQUIRED_ENV = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

function setEnv(configured: boolean): void {
  if (configured) {
    Object.assign(process.env, REQUIRED_ENV);
  } else {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  }
}

async function loadHandler(configured = true) {
  vi.resetModules();
  setEnv(configured);
  const module = await import('../handler');
  return module.handler;
}

function makeEvent(headers: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    headers,
    body: null,
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/delete-account',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/delete-account',
  };
}

function bodyOf(result: { body: string }): Record<string, unknown> {
  return JSON.parse(result.body) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.deleteUser.mockReset();
  mocks.createClient.mockClear();
});

describe('deleteAccount handler contract', () => {
  it('returns 500 when Supabase configuration is missing', async () => {
    const handler = await loadHandler(false);
    const result = await handler(makeEvent({ authorization: 'Bearer token' }));

    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).error).toMatch(/not configured/i);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const handler = await loadHandler();
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(401);
    expect(bodyOf(result).error).toMatch(/missing bearer token/i);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase rejects the token', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const handler = await loadHandler();
    const result = await handler(makeEvent({ authorization: 'Bearer bad-token' }));

    expect(result.statusCode).toBe(401);
    expect(bodyOf(result).error).toMatch(/invalid token/i);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes only the authenticated caller and returns { deleted: true }', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
    const handler = await loadHandler();

    const result = await handler(makeEvent({ Authorization: 'Bearer good-token' }));

    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toEqual({ deleted: true });
    expect(mocks.getUser).toHaveBeenCalledWith('good-token');
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('does not claim success when the admin delete fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.deleteUser.mockResolvedValue({ error: { message: 'database offline' } });
    const handler = await loadHandler();

    const result = await handler(makeEvent({ authorization: 'Bearer good-token' }));

    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).deleted).toBeUndefined();
    expect(bodyOf(result).error).toMatch(/deletion failed/i);
  });

  it('returns 500 with a safe message when an unexpected exception is thrown', async () => {
    mocks.getUser.mockRejectedValue(new Error('network down'));
    const handler = await loadHandler();

    const result = await handler(makeEvent({ authorization: 'Bearer good-token' }));

    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).error).toMatch(/account deletion error/i);
  });
});
