import type { ChatChannel, ChatChannels } from '@kete/notify';

// The ports of the messaging feature (constitution VII) are the chassis' own since `@kete/notify`
// 0.3.0 ships the chat channels whole: the port, its adapters and what hears them. No vendor is
// named here; the names below are kept so that the feature reads as it did.

/** A message the provider refused, and why — in words the laundry can act on. */
export { ChatChannelError as ChannelError } from '@kete/notify';

/** A chat channel, which may also send an approved template: some providers require one to write first. */
export type CustomerChannel = ChatChannel;

/** The channels of this deployment: connected, or not (null) — never simulated. */
export type Channels = ChatChannels;
