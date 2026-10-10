import { createFileRoute } from '@tanstack/react-router';
import { perform, ScreenError } from '@/platform/screen';

// The laundry's data in one file (specs/030-standalone): the owner downloads it, signed in, with
// her own rights — the same reading a capability gives, nothing more.
async function exported(): Promise<Response> {
  try {
    const read = await perform('data_export', {});
    if (!read.ok) return new Response(null, { status: 403 });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(read.output, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="nettio-${day}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ScreenError) return new Response(null, { status: 401 });
    throw error;
  }
}

export const Route = createFileRoute('/api/export')({
  server: { handlers: { GET: () => exported() } },
});
