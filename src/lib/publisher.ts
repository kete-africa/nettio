import { createServerFn } from '@tanstack/react-start';

/** Who publishes this deployment: said by its environment, never invented. Empty: not said yet. */
export interface Publisher {
  name: string;
  address: string;
  registration: string;
  email: string;
  host: string;
  /** The day its legal pages were last reviewed (YYYY-MM-DD), or empty. */
  updatedOn: string;
}

export const fetchPublisher = createServerFn({ method: 'GET' }).handler(
  (): Publisher => ({
    name: process.env.NETTIO_PUBLISHER_NAME ?? '',
    address: process.env.NETTIO_PUBLISHER_ADDRESS ?? '',
    registration: process.env.NETTIO_PUBLISHER_REGISTRATION ?? '',
    email: process.env.NETTIO_PUBLISHER_EMAIL ?? '',
    host: process.env.NETTIO_PUBLISHER_HOST ?? '',
    updatedOn: /^\d{4}-\d{2}-\d{2}$/.test(process.env.NETTIO_LEGAL_UPDATED_ON ?? '') ? (process.env.NETTIO_LEGAL_UPDATED_ON ?? '') : '',
  }),
);
