import { index, rootRoute, route } from '@tanstack/virtual-file-routes';

// Every address of the app, once: files are named in English, addresses read in French (doctrine
// ARCHITECTURE_APP §3). A screen is a file of src/routes; an endpoint too, with server handlers.
export const routes = rootRoute('__root.tsx', [
  index('index.tsx'),
  route('/taches', 'tasks/index.tsx'),
  route('/taches/$taskId', 'tasks/$taskId.tsx'),
  route('/verification/$draftId', 'review/$draftId.tsx'),
  route('/journal', 'journal.tsx'),
  route('/auth/connexion', 'auth/sign-in.ts'),
  route('/auth/callback', 'auth/callback.ts'),
  route('/auth/sortie', 'auth/sign-out.ts'),
  route('/mcp', 'api/mcp.ts'),
  route('/api/v1/$', 'api/v1.ts'),
  route('/api/avis', 'api/feedback.ts'),
  route('/health', 'api/health.ts'),
  route('/.well-known/kete', 'well-known/kete.ts'),
  route('/.well-known/oauth-protected-resource', 'well-known/oauth-protected-resource.ts'),
]);
