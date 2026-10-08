import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cx = (...classes: (string | false | undefined)[]): string =>
  classes.filter(Boolean).join(' ');

// Form pieces @kete/design does not have yet (a choice in a list, a tick, a message under a form),
// made of its semantic tokens only and shaped like its TextField (constitution VIII). To raise to
// kete-core once a second app needs them.

/** A choice in a list, labelled like a TextField. */
export function SelectField({
  label,
  hint,
  options,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body-sm font-semibold text-fg">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-(--control-height) rounded-control border border-line-strong bg-surface-control px-3 font-ui text-body text-fg"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A tick with its label, 44 px high at least: reachable with a thumb. */
export function CheckField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx('flex min-h-11 items-start gap-3 py-2', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-(--color-action)"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-fg">{label}</span>
        {hint && <span className="block text-body-sm text-fg-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** What stopped a gesture, said under its form; announced to assistive technology. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control border border-state-error bg-state-error-surface px-3 py-2 text-body-sm text-state-error-fg"
    >
      <span className="mt-1.5 inline-block size-2 shrink-0 bg-state-error" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Something to know before acting: a missing price, a business not yet set up. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-state-info bg-state-info-surface px-3 py-2 text-body-sm text-state-info-fg">
      {children}
    </p>
  );
}

/** One choice among a few, each with what it means: a group of radios, 44 px high at least. */
export function ChoiceField<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { value: Value; label: string; hint?: string }[];
  onChange: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-body-sm font-semibold text-fg">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx(
            'flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5',
            option.value === value
              ? 'border-line-selected bg-surface-selected'
              : 'border-line-control bg-surface-control hover:bg-surface-hover',
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5 size-5 shrink-0 accent-(--color-action)"
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className="min-w-0">
            <span className="block font-semibold text-fg">{option.label}</span>
            {option.hint && <span className="block text-body-sm text-fg-muted">{option.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
