import type { Request, Response } from 'express';
import * as teamService from '../services/team.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response';
import { actorFrom } from '../utils/actorContext';
import type { ListTeamParams } from '../services/team.service';

/** Team management endpoints for the agency workspace. */
export const listTeam = asyncHandler(async (req: Request, res: Response) => {
  const result = await teamService.listTeam(actorFrom(req), req.query as unknown as ListTeamParams);
  return sendPaginated(res, result);
});

export const getTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const result = await teamService.getTeamMember(actorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const result = await teamService.createTeamMember(actorFrom(req), req.body);
  return sendCreated(res, result);
});

export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const result = await teamService.updateTeamMember(
    actorFrom(req),
    req.params.id as string,
    req.body as { name?: string; jobTitle?: string; phone?: string; role?: string; isActive?: boolean },
  );
  return sendSuccess(res, result);
});