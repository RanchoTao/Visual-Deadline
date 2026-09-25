export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancel_scheduled' | 'canceled' | 'expired';
export type ProviderEnvironment = 'sandbox' | 'production' | 'legacy_unknown';
export type EntitlementStatus = 'active' | 'inactive' | 'revoked' | 'expired';
export type EntitlementSourceType = 'subscription' | 'legacy_membership_grant' | 'legacy_membership' | 'admin_grant';
export type BillingEventSource = 'webhook' | 'reconciliation' | 'migration' | 'manual_admin';

export interface Subscription {
  id: string;
  user_id: string;
  provider: 'paddle';
  provider_environment: ProviderEnvironment;
  event_source: BillingEventSource;
  provider_subscription_id: string;
  provider_customer_id: string;
  plan_code: 'vd.plus.monthly.v1' | 'vd.plus.annual.v1';
  catalog_version: 'vd-recurring-v1';
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  scheduled_change: Record<string, unknown> | null;
  provider_updated_at: string;
  last_provider_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentReference {
  id: string;
  user_id: string;
  subscription_id: string | null;
  provider: 'paddle';
  provider_environment: ProviderEnvironment;
  provider_transaction_id: string;
  kind: 'subscription' | 'renewal' | 'adjustment';
  status: 'pending' | 'paid' | 'failed' | 'partially_refunded' | 'refunded';
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface Entitlement {
  id: string;
  user_id: string;
  capability: 'vd.plus';
  source_type: EntitlementSourceType;
  source_id: string;
  status: EntitlementStatus;
  valid_from: string;
  valid_until: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface BillingEvent {
  id: string;
  provider: 'paddle';
  provider_environment: ProviderEnvironment;
  event_type: string;
  payload_checksum: string | null;
  occurred_at: string | null;
  received_at: string;
  processing_status: 'received' | 'processing' | 'succeeded' | 'retryable_failed' | 'ignored';
  processing_attempts: number;
  last_error: string | null;
  subscription_id: string | null;
  payment_reference_id: string | null;
}

export interface EntitlementSourceDecision {
  sourceType: EntitlementSourceType;
  sourceId: string;
  validUntil: string | null;
}

export interface EntitlementDecision {
  allowed: boolean;
  capability: 'vd.plus';
  validUntil: string | null;
  sources: EntitlementSourceDecision[];
  reason: 'valid_entitlement_source' | 'no_valid_entitlement_source';
}
