export type AccountStatus = 'active' | 'blocked' | 'fraud_review';

export const CALL_ENDED_REASONS = [
  'star_exit',
  'caller_hangup',
  'time_expired',
  'system_error',
  'backend_revoke',
  'openai_error',
  'bridge_error',
  'telephony_disconnect',
] as const;
export type CallEndedReason = (typeof CALL_ENDED_REASONS)[number];

export const DENY_PROMPTS = [
  'no_minutes',
  'system_error',
  'account_blocked',
  'account_under_review',
  'active_call_exists',
] as const;
export type DenyPrompt = (typeof DENY_PROMPTS)[number];

export const BRIDGE_COMMANDS = ['play_warning', 'force_end'] as const;
export type BridgeCommandType = (typeof BRIDGE_COMMANDS)[number];

export const PAYMENT_RESULT_PROMPTS = [
  'payment_success',
  'payment_failed',
  'payment_cancelled',
  'payment_unavailable',
] as const;

export const CALL_STATES = ['preflighted', 'connected', 'warning_sent', 'ended'] as const;
export type CallState = (typeof CALL_STATES)[number];

export const LEDGER_ENTRY_TYPES = [
  'purchase_credit',
  'call_debit',
  'admin_credit',
  'admin_debit',
  'refund_debit',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
