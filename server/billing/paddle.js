import { parseHttpResponse } from './runtime.js';

export function createPaddleClient(runtime) {
  async function request(path, init = {}) {
    if (!runtime.apiKey) throw new Error('Paddle API key is not configured for the selected environment.');
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${runtime.apiKey}`);
    headers.set('Paddle-Version', '1');
    headers.set('Content-Type', 'application/json');
    return parseHttpResponse(await fetch(`${runtime.apiBaseUrl}${path}`, { ...init, headers }));
  }
  return {
    request,
    async createTransaction(payload) { return request('/transactions', { method: 'POST', body: JSON.stringify(payload) }); },
    async getSubscription(id) { return request(`/subscriptions/${encodeURIComponent(id)}`); },
    async getTransaction(id) { return request(`/transactions/${encodeURIComponent(id)}`); },
    async createPortalSession(customerId, subscriptionIds) {
      return request(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
        method: 'POST', body: JSON.stringify({ subscription_ids: subscriptionIds }),
      });
    },
  };
}
