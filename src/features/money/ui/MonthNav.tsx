import { Icon, IconButton } from '@kete/design';
import { currentMonth, formatMonth, shiftMonth } from '@/lib/format';
import * as m from '@/paraglide/messages.js';

/** The month a money screen shows, and the way to the one before and after. */
export function MonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label={m.month_previous()} onClick={() => onChange(shiftMonth(month, -1))}>
        <span className="inline-flex rotate-90">
          <Icon name="chevron" />
        </span>
      </IconButton>
      <span className="min-w-36 text-center font-semibold first-letter:uppercase">
        {formatMonth(month)}
      </span>
      <IconButton
        label={m.month_next()}
        disabled={month >= currentMonth()}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <span className="inline-flex -rotate-90">
          <Icon name="chevron" />
        </span>
      </IconButton>
    </div>
  );
}
