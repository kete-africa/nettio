import { Button, PageHeader, PageSection, TextField } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Barcode } from '@/features/device/ui/Barcode';
import { bauds, papers, readDevice, readScale, saveDevice, scaleIsSupported, type Paper } from '@/features/device/ui/device';
import { ChoiceField, ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatNumber } from '@/lib/format';
import * as m from '@/paraglide/messages.js';

// This device's own equipment (specs/031-device): the paper in its printer, its labels, its
// scale. Kept on the device: the tablet at another counter has its own.
export const Route = createFileRoute('/_app/pressing/appareil')({
  component: DevicePage,
});

const paperWords: Record<Paper, [() => string, () => string]> = {
  '58': [m.device_paper_58, m.device_paper_58_hint],
  '80': [m.device_paper_80, m.device_paper_80_hint],
  a4: [m.device_paper_a4, m.device_paper_a4_hint],
};

function DevicePage() {
  const [paper, setPaper] = useState<Paper>('a4');
  const [width, setWidth] = useState('50');
  const [height, setHeight] = useState('30');
  const [baud, setBaud] = useState('9600');
  const [supported, setSupported] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const device = readDevice();
    setPaper(device.paper);
    setWidth(String(device.labelWidth));
    setHeight(String(device.labelHeight));
    setBaud(String(device.baud));
    setSupported(scaleIsSupported());
  }, []);

  const sizes = { width: Number(width), height: Number(height) };
  const valid = sizes.width >= 20 && sizes.width <= 120 && sizes.height >= 15 && sizes.height <= 120;
  const save = (next: Paper = paper) => {
    if (!valid) return;
    saveDevice({ paper: next, labelWidth: sizes.width, labelHeight: sizes.height, baud: Number(baud) });
    setError(null);
    setSaid(m.device_saved());
  };

  async function weigh() {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const kilos = await readScale(Number(baud));
      if (kilos === null) setError(m.scale_nothing());
      else setSaid(m.scale_read({ kilos: formatNumber(kilos, 3) }));
    } catch {
      setError(m.scale_failed());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={m.nav_device()} description={m.device_description()} />
      <div className="mb-4 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>
      <PageSection first title={m.device_printer()}>
        <div className="max-w-xl">
          <ChoiceField
            label={m.device_paper()}
            value={paper}
            options={papers.map((value) => ({ value, label: paperWords[value][0](), hint: paperWords[value][1]() }))}
            onChange={(next) => {
              setPaper(next);
              save(next);
            }}
          />
        </div>
      </PageSection>
      <PageSection title={m.device_labels()}>
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-body-sm text-fg-muted">{m.device_labels_hint()}</p>
          <div className="flex flex-wrap gap-3">
            <TextField
              className="min-w-32 flex-1"
              label={m.device_label_width()}
              type="number"
              inputMode="numeric"
              min={20}
              max={120}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
            <TextField
              className="min-w-32 flex-1"
              label={m.device_label_height()}
              type="number"
              inputMode="numeric"
              min={15}
              max={120}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
          </div>
          <div className="max-w-60 rounded-box border border-line bg-white p-3 text-black">
            <p className="font-number font-semibold">A-0412</p>
            <Barcode text="A-0412" label={m.labels_barcode({ number: 'A-0412' })} />
          </div>
          <div>
            <Button variant="secondary" disabled={!valid} onClick={() => save()}>
              {m.device_save()}
            </Button>
          </div>
        </div>
      </PageSection>
      <PageSection title={m.device_scale()}>
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-body-sm text-fg-muted">{supported ? m.device_scale_hint() : m.device_scale_unsupported()}</p>
          <SelectField
            label={m.device_baud()}
            hint={m.device_baud_hint()}
            value={baud}
            onChange={(event) => setBaud(event.target.value)}
            options={bauds.map((value) => ({ value: String(value), label: String(value) }))}
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={!valid} onClick={() => save()}>
              {m.device_save()}
            </Button>
            {supported && (
              <Button variant="secondary" disabled={busy} onClick={() => void weigh()}>
                {m.scale_read_button()}
              </Button>
            )}
          </div>
        </div>
      </PageSection>
      <PageSection title={m.device_scanner()}>
        <p className="max-w-3xl">{m.device_scanner_hint()}</p>
      </PageSection>
    </>
  );
}
