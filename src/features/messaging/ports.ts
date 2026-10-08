import type { ChatChannel, ChatChannelName } from '@kete/notify';

// The ports of the messaging feature (constitution VII): the chassis' chat channel, and what a
// laundry's messages need beyond it. No vendor is named here; the adapters live in src/platform.

/** A message the provider refused, and why — in words the laundry can act on. */
export class ChannelError extends Error {
  constructor(
    readonly reason: 'outside_window' | 'recipient_unreachable' | 'provider_refused' | 'network',
    detail = '',
  ) {
    super(detail || reason);
    this.name = 'ChannelError';
  }
}

/**
 * A chat channel that may also send an approved template: some providers only let a business
 * write first with one.
 */
export interface CustomerChannel extends ChatChannel {
  sendTemplate?(
    to: string,
    template: { name: string; language: string; parameters: string[] },
  ): Promise<void>;
}

/** The channels of this deployment: connected, or not (null) — never simulated. */
export type Channels = Record<ChatChannelName, CustomerChannel | null>;
