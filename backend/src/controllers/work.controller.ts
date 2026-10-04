import type { Request, Response } from 'express';
import * as clientService from '../services/client.service';
import * as projectService from '../services/project.service';
import * as milestoneService from '../services/milestone.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response';
import { actorFrom, clientActorFrom } from '../utils/actorContext';
import type {
  CreateClientInput, ListClientsParams,
} from '../services/client.service';
import type {
  CreateProjectInput, ListProjectsParams,
} from '../services/project.service';
import type { ListMilestonesParams, CreateMilestoneInput } from '../services/milestone.service';

// ---------------------------------------------------------------- clients ---

export const listClients = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientService.listClients(actorFrom(req), req.query as unknown as ListClientsParams);
  return sendPaginated(res, result);
});

export const getClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientService.getClientById(actorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientService.createClient(actorFrom(req), req.body as CreateClientInput);
  return sendCreated(res, result);
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientService.updateClient(actorFrom(req), req.params.id as string, req.body);
  return sendSuccess(res, result);
});

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  await clientService.deleteClient(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Client deleted' });
});

export const createClientUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientService.createClientUser(actorFrom(req), req.params.id as string, req.body);
  return sendCreated(res, result);
});

// --------------------------------------------------------------- projects ---

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectService.listProjects(
    clientActorFrom(req),
    req.query as unknown as ListProjectsParams,
  );
  return sendPaginated(res, result);
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectService.getProjectById(clientActorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectService.createProject(actorFrom(req), req.body as CreateProjectInput);
  return sendCreated(res, result);
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectService.updateProject(
    actorFrom(req),
    req.params.id as string,
    req.body as Partial<CreateProjectInput>,
  );
  return sendSuccess(res, result);
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  await projectService.deleteProject(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Project deleted' });
});

// ------------------------------------------------------------- milestones ---

export const listMilestones = asyncHandler(async (req: Request, res: Response) => {
  const result = await milestoneService.listMilestones(
    actorFrom(req),
    req.query as unknown as ListMilestonesParams,
  );
  return sendPaginated(res, result);
});

export const getMilestone = asyncHandler(async (req: Request, res: Response) => {
  const result = await milestoneService.getMilestoneById(actorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createMilestone = asyncHandler(async (req: Request, res: Response) => {
  const result = await milestoneService.createMilestone(
    actorFrom(req),
    req.body as CreateMilestoneInput,
  );
  return sendCreated(res, result);
});

export const updateMilestone = asyncHandler(async (req: Request, res: Response) => {
  const result = await milestoneService.updateMilestone(
    actorFrom(req),
    req.params.id as string,
    req.body as Partial<CreateMilestoneInput>,
  );
  return sendSuccess(res, result);
});

export const deleteMilestone = asyncHandler(async (req: Request, res: Response) => {
  await milestoneService.deleteMilestone(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Milestone deleted' });
});