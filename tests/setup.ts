import { loadRepositoryEnv } from '@kete/testing';

// Local runs read .env; CI provides the variables, or KETE_TEST_POSTGRES=container.
loadRepositoryEnv(import.meta.dirname);
