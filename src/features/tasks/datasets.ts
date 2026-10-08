import { defineDataset } from '@kete/capabilities';
import { z } from 'zod';
import { taskRows } from './infrastructure/task.table';

/**
 * The tasks as a data set (kete-core spec 045): for people's dashboards, the assistant and other
 * apps, under the read permission — one row per task, dated by its creation.
 */
export const taskDatasets = [
  defineDataset({
    name: 'tasks',
    description: 'One row per task: its title, status, due day, creation day, and 1 when done.',
    permission: 'tasks:read',
    // How far its rows may travel (kete-core spec 049): the organization's people, not beyond.
    classification: 'internal',
    row: z.object({
      title: z.string(),
      status: z.enum(['open', 'done']),
      dueOn: z.string().nullable(),
      createdOn: z.string(),
      done: z.number(),
    }),
    time: 'createdOn',
    measures: ['done'],
    dimensions: ['status'],
    rows: (query, { db }) => taskRows(db, query),
  }),
];
