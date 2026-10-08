import { createFileRoute } from '@tanstack/react-router';
import { handleApi } from '@/platform/api';

// The app's API (kete-core spec 045): capabilities and data sets, under the caller's rights.
export const Route = createFileRoute('/api/v1/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleApi(request),
      POST: ({ request }) => handleApi(request),
    },
  },
});
