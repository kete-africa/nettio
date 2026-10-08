import { getJobs } from '@/platform/jobs';

// The worker role of the app's image: it works the jobs the web process sends (e-mails, events).
const jobs = getJobs(true);
await jobs.start();
console.log('[worker] working the jobs');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void jobs.stop().then(() => process.exit(0));
  });
}
