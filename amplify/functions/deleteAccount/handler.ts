import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';

type WebSocketLikeConstructor = NonNullable<NonNullable<NonNullable<Parameters<typeof createClient>[2]>['realtime']>['transport']>;

const LambdaUnsupportedRealtimeTransport: WebSocketLikeConstructor = class {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url: string;
  readonly protocol = '';
  readonly bufferedAmount = 0;

  binaryType?: string;
  onopen: ((this: unknown, ev: Event) => unknown) | null = null;
  onmessage: ((this: unknown, ev: MessageEvent) => unknown) | null = null;
  onclose: ((this: unknown, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: unknown, ev: Event) => unknown) | null = null;

  constructor(address: string | URL, _subprotocols?: string | string[]) {
    this.url = address.toString();
  }

  close(): void { }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    throw new Error('Supabase Realtime is not available in the Lambda runtime.');
  }

  addEventListener(_type: string, _listener: EventListener): void { }

  removeEventListener(_type: string, _listener: EventListener): void { }
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function header(headers: Record<string, string | undefined>, target: string): string | undefined {
  const t = target.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === t) return headers[k];
  return undefined;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key,x-correlation-trace-id',
  };

  try {
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('[DeleteAccount] Missing Supabase configuration (url/anon/service-role).');
      return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Server not configured for account deletion.' }) };
    }

    // 1) Validate the caller's JWT and resolve THEIR user id.
    const authHeader = header(event.headers || {}, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized: missing bearer token.' }) };
    }
    const token = authHeader.replace('Bearer ', '').trim();

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      realtime: { transport: LambdaUnsupportedRealtimeTransport },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData?.user) {
      return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized: invalid token.' }) };
    }
    const userId = userData.user.id;

    // 2) Delete the user with the service-role client. Cascade removes all data.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      realtime: { transport: LambdaUnsupportedRealtimeTransport },
    });
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error(`[DeleteAccount] Failed to delete user ${userId}: ${deleteError.message}`);
      return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Account deletion failed. Please contact support.' }) };
    }

    console.log(`[DeleteAccount] Deleted user ${userId} and cascaded associated data.`);
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ deleted: true }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unhandled exception.';
    console.error(`[DeleteAccount] Exception: ${message}`);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: `Account deletion error: ${message}` }) };
  }
};
