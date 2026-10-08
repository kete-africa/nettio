import { Button, EmptyState, FormPage, FormSection, TextField } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { Profile, Staffing } from '@/features/business';
import { startBusiness } from '@/features/business/functions';
import { failure } from '@/lib/errors';
import { ChoiceField, ErrorNote, Note } from '@/lib/fields';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

// The guided start (specs/001-foundation, US1): three questions, and Nettio prepares the sites,
// the usual steps, four services with their routes and twelve articles. Never a price.
export const Route = createFileRoute('/_app/demarrage')({ component: StartPage });

function StartPage() {
  const { me } = Route.useRouteContext();
  const [businessName, setBusinessName] = useState('');
  const [profile, setProfile] = useState<Profile>('established');
  const [staffing, setStaffing] = useState<Staffing>('team');
  const [siteName, setSiteName] = useState('');
  const [siteCode, setSiteCode] = useState('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.organizationId) {
    return <EmptyState title={m.start_no_organization_title()}>{m.start_no_organization_body()}</EmptyState>;
  }
  if (!can(me, 'settings:manage')) {
    return <EmptyState title={m.start_wait_title()}>{m.start_wait_body()}</EmptyState>;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await startBusiness({
        data: {
          businessName,
          profile,
          staffing,
          siteName,
          siteCode,
          locale: getLocale() === 'en' ? 'en' : 'fr',
        },
      });
      setError(failure(outcome));
      if (outcome.ok) {
        // The frame decides where a person may be from what it knows of her laundry: refreshed
        // here, it sends her to her day; not refreshed, it sends her back here. So the whole app
        // is loaded again, on the diagram — once in a laundry's life.
        window.location.assign('/pressing/schema');
        return;
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const ready = businessName.trim() !== '' && siteName.trim() !== '' && /^[A-Za-z]{1,3}$/.test(siteCode);
  return (
    <FormPage
      breadcrumbs={[]}
      title={m.start_title()}
      description={m.start_description()}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" disabled={busy || !ready}>
          {m.start_submit()}
        </Button>
      }
    >
      <FormSection title={m.start_section_business()}>
        <TextField
          label={m.start_business_name()}
          value={businessName}
          required
          maxLength={120}
          autoComplete="organization"
          onChange={(event) => setBusinessName(event.target.value)}
        />
        <ChoiceField
          label={m.start_profile()}
          value={profile}
          onChange={setProfile}
          options={[
            { value: 'starting', label: m.profile_starting(), hint: m.profile_starting_hint() },
            {
              value: 'established',
              label: m.profile_established(),
              hint: m.profile_established_hint(),
            },
            { value: 'multi_site', label: m.profile_multi_site(), hint: m.profile_multi_site_hint() },
          ]}
        />
        <ChoiceField
          label={m.start_staffing()}
          value={staffing}
          onChange={setStaffing}
          options={[
            { value: 'solo', label: m.staffing_solo(), hint: m.staffing_solo_hint() },
            { value: 'team', label: m.staffing_team(), hint: m.staffing_team_hint() },
          ]}
        />
      </FormSection>
      <FormSection
        title={m.start_section_site()}
        description={
          profile === 'multi_site' ? m.start_site_description_chain() : m.start_site_description()
        }
      >
        <TextField
          label={m.site_name()}
          value={siteName}
          required
          maxLength={80}
          onChange={(event) => setSiteName(event.target.value)}
        />
        <TextField
          label={m.site_code()}
          hint={m.site_code_hint()}
          value={siteCode}
          required
          maxLength={3}
          onChange={(event) => setSiteCode(event.target.value.toUpperCase())}
        />
      </FormSection>
      <Note>{m.start_no_price()}</Note>
      <ErrorNote>{error}</ErrorNote>
    </FormPage>
  );
}
