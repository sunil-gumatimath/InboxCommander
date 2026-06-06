/**
 * shared/messaging.ts
 * One canonical way to call the service worker from any UI surface.
 * The router expects { type, data } shape; this helper wraps and unwraps.
 */

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data: T;
  error: string | null;
  timestamp: number;
}

export type SendResult<T> = T | { error: string };

// Default T = any to preserve permissive behavior of the original local helpers.
// Pass an explicit type parameter at the call site for stricter typing.
export function sendToBackground<T = any>(message: {
  type: string;
  [key: string]: any;
}): Promise<SendResult<T>> {
  const { type, ...rest } = message;
  const wrapped = { type, data: rest };
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(wrapped, (response: ExtensionResponse<T> | unknown) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Unknown runtime error'));
        return;
      }
      if (response && typeof response === 'object' && 'success' in response) {
        const r = response as ExtensionResponse<T>;
        if (r.success) {
          resolve(r.data);
        } else {
          resolve({ error: r.error || 'Unknown error' });
        }
      } else {
        resolve(response as T);
      }
    });
  });
}
