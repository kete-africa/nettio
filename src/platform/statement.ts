import type { SendingPorts } from '@/features/assistant/sending';
import { getChannels } from './channels';

// What the evening statement leaves through, in this deployment: the messaging channels, the
// e-mail sender, and the approved template a messaging provider may ask for. Each is connected or
// not — never simulated.

/** Whether an e-mail sender is connected: without its key, nothing leaves. */
export const emailIsConnected = (): boolean => Boolean(process.env.MAILKITE_API_KEY);

let ports: (() => Promise<SendingPorts>) | undefined;

async function fromEnvironment(): Promise<SendingPorts> {
  return {
    channels: getChannels(),
    mail: emailIsConnected()
      ? async (to, statement) => {
          // Loaded when an e-mail leaves: the queue and the template are not needed before.
          const [{ mailer }, { statementEmail }] = await Promise.all([
            import('./jobs'),
            import('@/features/assistant/ui/statement-email'),
          ]);
          await (await mailer()).send(statementEmail, {
            to,
            values: statement,
            locale: statement.language,
          });
        }
      : null,
    whatsappTemplate: process.env.WHATSAPP_STATEMENT_TEMPLATE ?? '',
  };
}

/** The ports of the statement's sending. */
export function sendingPorts(): Promise<SendingPorts> {
  return (ports ?? fromEnvironment)();
}

/** Tests: other ports (recorded exchanges, never the live services). */
export function useSendingPorts(next: (() => Promise<SendingPorts>) | undefined): void {
  ports = next;
}
