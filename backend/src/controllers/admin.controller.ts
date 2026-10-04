import type { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import * as teamService from '../services/team.service';
import * as dashboardService from '../services/dashboard.service';
import * as clientDashboardService from '../services/clientDashboard.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { sendPaginated, sendSuccess } from '../utils/response';
import { actorFrom, platformActorFrom, requireClientId } from '../utils/actorContext';
import { AGENCY_STATUS } from '../types/enums';
import type { ListAgenciesParams } from '../services/admin.service';
import type { ListTeamParams } from '../services/team.service';

// ---------------------------------------------------- super admin portal ----

export const getMetrics = asyncHandler(async (_req: Request, res: Response) => {
  const result = await adminService.getPlatformMetrics();
  return sendSuccess(res, result);
});

export const listAgencies = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.listAgencies(req.query as unknown as ListAgenciesParams);
  return sendPaginated(res, result);
});

export const getAgency = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getAgencyById(req.params.id as string);
  return sendSuccess(res, result);
});

export const getAgencyDetail = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getAgencyDetail(req.params.id as string);
  return sendSuccess(res, result);
});

export const updateAgency = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.updateAgency(
    platformActorFrom(req),
    req.params.id as string,
    req.body as Record<string, unknown>,
  );
  return sendSuccess(res, result);
});

/** Activate / suspend / deactivate an agency. */
export const setAgencyStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, reason } = req.body as { status: string; reason?: string };
  const result = await adminService.setAgencyStatus(
    platformActorFrom(req),
    req.params.id as string,
    status,
    reason,
  );
  return sendSuccess(res, result);
});

export const listPlatformActivity = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.listPlatformActivity(
    req.query as unknown as { page: number; limit: number },
  );
  return sendPaginated(res, result);
});

// ---------------------------------------------------------- support mode ---

export const startSupportSession = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.startSupportSession(
    platformActorFrom(req),
    req.body as { agencyId: string; reason: string; scope: string; durationMinutes: number },
    { ip: req.ip, userAgent: req.headers['user-agent'] },
  );
  return sendSuccess(res, result);
});

export const getSupportSession = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.getSupportSession(
    platformActorFrom(req),
    (req.headers['x-support-session'] as string) ?? (req.query.sessionId as string),
  );
  return sendSuccess(res, result);
});

export const endSupportSession = asyncHandler(async (req: Request, res: Response) => {
  // Accept the session id from the header, the body or the query string. The
  // browser sends it as a query parameter on the DELETE, and the service always
  // re-checks ownership against the authenticated super admin regardless.
  const sessionId =
    (req.headers['x-support-session'] as string) ||
    (req.body?.sessionId as string) ||
    (req.query.sessionId as string) ||
    '';

  if (!sessionId) {
    throw AppError.badRequest('A support session id is required');
  }

  await adminService.endSupportSession(platformActorFrom(req), sessionId);
  return sendSuccess(res, { message: 'Support mode ended' });
});

export const listAgencySupportSessions = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.listSupportSessions(req.params.id as string);
  return sendSuccess(res, result);
});

// ------------------------------------------------------------ agency team ---

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
  return sendSuccess(res, result);
});

export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const result = await teamService.updateTeamMember(
    actorFrom(req),
    req.params.id as string,
    req.body as { name?: string; jobTitle?: string; phone?: string; role?: string; isActive?: boolean },
  );
  return sendSuccess(res, result);
});

// -------------------------------------------------------------- dashboards ---

export const agencyDashboard = asyncHandler(async (req: Request, res: Response) => {
  const result = await dashboardService.getAgencyDashboard(actorFrom(req).agencyId);
  return sendSuccess(res, result);
});

export const clientDashboard = asyncHandler(async (req: Request, res: Response) => {
  const clientId = requireClientId(req);
  const result = await clientDashboardService.getClientDashboard(
    actorFrom(req).agencyId,
    clientId,
  );
  return sendSuccess(res, result);
});

export { AGENCY_STATUS };