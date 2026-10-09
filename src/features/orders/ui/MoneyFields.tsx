import { Chip, ChipGroup, TextField } from '@kete/design';
import * as m from '@/paraglide/messages.js';
import { moneyMethods, type PaymentMethod } from '../domain/order';
import { methodWords } from './words';

/** An amount and the way it is paid: cash, Mobile Money, card or transfer. */
export function MoneyFields({
  amount,
  method,
  hint,
  methods = moneyMethods,
  onAmount,
  onMethod,
}: {
  amount: string;
  method: PaymentMethod;
  hint?: string;
  /** The ways offered: the customer's credit only when she has some. */
  methods?: PaymentMethod[];
  onAmount: (amount: string) => void;
  onMethod: (method: PaymentMethod) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={m.money_amount()}
        {...(hint ? { hint } : {})}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={amount}
        onChange={(event) => onAmount(event.target.value)}
      />
      <ChipGroup label={m.money_method()}>
        {methods.map((entry) => (
          <Chip key={entry} pressed={entry === method} onClick={() => onMethod(entry)}>
            {methodWords[entry]()}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

/** A whole, positive amount typed in a field, or null. */
export function wholeAmount(text: string): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : null;
}

/** A key for a gesture: sent twice, it runs once. */
export const gestureKey = (prefix: string): string =>
  `${prefix}-${globalThis.crypto.randomUUID()}`;
