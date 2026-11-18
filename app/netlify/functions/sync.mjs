// Scheduled function: moves unfinished runs forward and saves their results, even when nobody has the page open.
import { syncPending } from '../../server/index.js';

export default async () => {
  const n = await syncPending();
  return new Response(JSON.stringify({ synced: n }), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '* * * * *' };
