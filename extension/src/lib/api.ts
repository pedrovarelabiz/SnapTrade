import type { TradeExecution } from '../types';
import { API_BASE, API_MAX_RETRIES } from './constants';

interface ApiResponse<T> {
  data: T;
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiFetch<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
      }

      const response = await fetch(url, init);

      // Don't retry auth errors
      if (response.status === 401 || response.status === 403) {
        const errorBody = await response.text();
        throw new Error(
          `API ${method} ${path} failed (${response.status}): ${errorBody}`,
        );
      }

      if (!response.ok) {
        const errorBody = await response.text();
        lastError = new Error(
          `API ${method} ${path} failed (${response.status}): ${errorBody}`,
        );
        continue; // retry
      }

      const json = await response.json();

      if (json && typeof json === 'object' && 'error' in json && json.error) {
        throw new Error(json.error as string);
      }

      if (json && typeof json === 'object' && 'data' in json) {
        return json.data as T;
      }

      return json as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry on auth errors
      if (lastError.message.includes('(401)') || lastError.message.includes('(403)')) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error(`API ${method} ${path} failed after retries`);
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  return apiFetch<T>('GET', path, token);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return apiFetch<T>('POST', path, token, body);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return apiFetch<T>('PATCH', path, token, body);
}

export interface VerifyTokenResult {
  email: string;
  role: 'admin' | 'premium' | 'free';
  subscriptionStatus: string;
}

export async function verifyToken(token: string): Promise<VerifyTokenResult> {
  return apiPost<VerifyTokenResult>('/extension/auth', { extensionToken: token }, token);
}

export async function reportTrade(
  trade: TradeExecution,
  token: string,
): Promise<void> {
  await apiPost<void>('/extension/trades', trade, token);
}
