import type { Request, Response } from 'express';
import { listAgencyActivity } from '../services/activity.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated } from '../utils/response';
import { actorFrom } from '../utils/actorContext';
import type { ActivityQuery } from '../services/activity.service';
import type { Visibility } from '../types/enums';

/**
 * Tenant activity feed.
 *
 * The tenant id comes from `actorFrom`, which reads the server-resolved tenant.
 * A client account additionally only sees CLIENT_VISIBLE entries.
 */
export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ActivityQuery;
  const actor = actorFrom(req);

  const result = await listAgencyActivity(actor.agencyId, query, {
    clientId: req.user?.clientId ?? null,
  } as { clientId?: string | null });

  return sendPaginated(res, result);
});

export type { Visibility };