import { Button, EmptyState, FormPage, FormSection, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { Staffing, Tracking } from '@/features/business';
import { fetchBusiness, saveSettings } from '@/features/business/functions';
import { failure } from '@/lib/errors';
import { CheckField, ChoiceField, ErrorNote } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';

// How the laundry works: its delays, its tracking grain, its ceilings, the cost of a minute.
export const Route = createFileRoute('/_app/pressing/reglages')({
  loader: () => fetchBusiness(),
  component: SettingsPage,
});

function SettingsPage() {
  const business = Route.useLoaderData();
  const router = useRouter();
  const settings = business?.settings;
  const [form, setForm] = useState(() => ({
    businessName: settings?.businessName ?? '',
    staffing: (settings?.staffing ?? 'team') as Staffing,
    tracking: (settings?.tracking ?? 'bag') as Tracking,
    promisedHours: String(settings?.promisedHours ?? 48),
    expressHours: String(settings?.expressHours ?? 24),
    expressPercent: String(settings?.expressPercent ?? 0),
    discountCeilingPercent: String(settings?.discountCeilingPercent ?? 10),
    workingDays: String(settings?.workingDays ?? 26),
    laborIsVariable: settings?.laborIsVariable ?? false,
    laborMinuteCost: String(settings?.laborMinuteCost ?? 0),
    dormantDays: String(settings?.dormantDays ?? 30),
    phonePrefix: settings?.phonePrefix ?? '228',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!settings) return <EmptyState title={m.error_not_allowed()} />;

  const set = <Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const number = (key: keyof typeof form, label: string, hint?: string, step = 1) => (
    <TextField
      label={label}
      {...(hint ? { hint } : {})}
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={String(form[key])}
      onChange={(event) => set(key, event.target.value as never)}
    />
  );

  async function submit() {
    setBusy(true);
    setSaved(false);
    try {
      const outcome = await saveSettings({
        data: {
          businessName: form.businessName,
          staffing: form.staffing,
          tracking: form.tracking,
          promisedHours: Number(form.promisedHours),
          expressHours: Number(form.expressHours),
          expressPercent: Number(form.expressPercent),
          discountCeilingPercent: Number(form.discountCeilingPercent),
          workingDays: Number(form.workingDays),
          laborIsVariable: form.laborIsVariable,
          laborMinuteCost: Number(form.laborMinuteCost),
          dormantDays: Number(form.dormantDays),
          phonePrefix: form.phonePrefix,
        },
      });
      setError(failure(outcome));
      if (outcome.ok) {
        setSaved(true);
        await router.invalidate();
      }
    } catch {
      setError(m.error_invalid_input());
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormPage
      breadcrumbs={[]}
      title={m.nav_settings()}
      description={m.settings_description()}
      onSubmit={() => void submit()}
      actions={
        <>
          {saved && <Tag tone="validated">{m.state_saved()}</Tag>}
          <Button type="submit" disabled={busy || !form.businessName.trim()}>
            {m.action_save()}
          </Button>
        </>
      }
    >
      <FormSection title={m.settings_section_business()}>
        <TextField
          label={m.start_business_name()}
          value={form.businessName}
          maxLength={120}
          onChange={(event) => set('businessName', event.target.value)}
        />
        <ChoiceField
          label={m.start_staffing()}
          value={form.staffing}
          onChange={(value) => set('staffing', value)}
          options={[
            { value: 'solo', label: m.staffing_solo(), hint: m.staffing_solo_hint() },
            { value: 'team', label: m.staffing_team(), hint: m.staffing_team_hint() },
          ]}
        />
      </FormSection>
      <FormSection title={m.settings_section_counter()} description={m.settings_counter_hint()}>
        {number('promisedHours', m.settings_promised_hours())}
        {number('expressHours', m.settings_express_hours())}
        {number('expressPercent', m.settings_express_percent(), m.settings_express_percent_hint())}
        {number(
          'discountCeilingPercent',
          m.settings_discount_ceiling(),
          m.settings_discount_ceiling_hint(),
        )}
        {number('dormantDays', m.settings_dormant_days(), m.settings_dormant_days_hint())}
        <TextField
          label={m.settings_phone_prefix()}
          hint={m.settings_phone_prefix_hint()}
          inputMode="numeric"
          maxLength={4}
          value={form.phonePrefix}
          onChange={(event) => set('phonePrefix', event.target.value.replace(/D/g, ''))}
        />
      </FormSection>
      <FormSection title={m.settings_section_workshop()}>
        <ChoiceField
          label={m.settings_tracking()}
          value={form.tracking}
          onChange={(value) => set('tracking', value)}
          options={[
            { value: 'bag', label: m.tracking_bag(), hint: m.tracking_bag_hint() },
            { value: 'piece', label: m.tracking_piece(), hint: m.tracking_piece_hint() },
          ]}
        />
      </FormSection>
      <FormSection title={m.settings_section_costs()} description={m.settings_costs_hint()}>
        {number('workingDays', m.settings_working_days())}
        {number(
          'laborMinuteCost',
          m.settings_labor_minute_cost(),
          m.settings_labor_minute_cost_hint(),
          0.01,
        )}
        <CheckField
          label={m.settings_labor_is_variable()}
          hint={m.settings_labor_is_variable_hint()}
          checked={form.laborIsVariable}
          onChange={(checked) => set('laborIsVariable', checked)}
        />
      </FormSection>
      <ErrorNote>{error}</ErrorNote>
    </FormPage>
  );
}
