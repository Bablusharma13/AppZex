import request from 'supertest';
import { app, auth, buildFixtures, TEST_PASSWORD, type Fixtures } from './helpers';
import { FileAsset } from '../src/models/FileAsset';
import { ensureStorageDir } from '../src/services/file.service';
import fs from 'fs';
import path from 'path';
import { env } from '../src/config/env';

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('File upload and authorized download', () => {
  let f: Fixtures;
  let sharedFileId: string;
  let internalFileId: string;
  let agencyBFileId: string;

  beforeEach(async () => {
    f = await buildFixtures();
    ensureStorageDir();

    // Agency A: a file shared with the client (visible) and an internal-only file.
    sharedFileId = await uploadFile(f.agencyAAdminToken, 'shared.png', 'CLIENT_VISIBLE', f.aProject1Id);
    internalFileId = await uploadFile(f.agencyAAdminToken, 'internal.png', 'INTERNAL', f.aProject1Id);

    // Agency B's own file, uploaded with agency B's token.
    agencyBFileId = await uploadFile(f.agencyBAdminToken, 'other-tenant.png', 'CLIENT_VISIBLE', f.bProject1Id);
  });

  /** Uploads through the real multipart endpoint so all middleware runs. */
  async function uploadFile(
    token: string,
    name: string,
    visibility: string,
    projectId: string,
  ): Promise<string> {
    const res = await request(app)
      .post('/api/files')
      .set(auth(token))
      .field('relatedEntityType', 'PROJECT')
      .field('relatedEntityId', projectId)
      .field('visibility', visibility)
      .attach('file', pngBytes, { filename: name, contentType: 'image/png' });

    if (res.status !== 201) {
      throw new Error(`upload failed (${name}): ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.id as string;
  }

  it('uploads a file and returns metadata without a direct URL', async () => {
    const res = await request(app).get('/api/files').set(auth(f.agencyAAdminToken));
    expect(res.status).toBe(200);

    const file = res.body.data.find((x: { id: string }) => x.id === sharedFileId);
    expect(file).toBeDefined();
    expect(file.originalName).toBe('shared.png');
    // There must be no public path in the payload.
    expect(file.url).toBeUndefined();
    expect(file.storageKey).toBeUndefined();
  });

  it('agency staff can download a file in their own tenant', async () => {
    const res = await request(app)
      .get(`/api/files/${sharedFileId}/download`)
      .set(auth(f.agencyAAdminToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.length).toBeGreaterThan(0);
  });

  // 9. Unauthorized file download is blocked
  it('9. a client can download a CLIENT_VISIBLE file on their own project', async () => {
    const res = await request(app)
      .get(`/api/files/${sharedFileId}/download`)
      .set(auth(f.agencyAClient1Token));

    expect(res.status).toBe(200);
  });

  it('9a. a client cannot download an INTERNAL file', async () => {
    const res = await request(app)
      .get(`/api/files/${internalFileId}/download`)
      .set(auth(f.agencyAClient1Token));

    expect([403, 404]).toContain(res.status);
  });

  it('9b. a client cannot download a file belonging to another client', async () => {
    // Client 1 vs a project owned by Client 2 in the same agency.
    const otherClientFile = await uploadFile(f.agencyAAdminToken, 'client2.png', 'CLIENT_VISIBLE', f.aProject2Id);

    const res = await request(app)
      .get(`/api/files/${otherClientFile}/download`)
      .set(auth(f.agencyAClient1Token));

    expect([403, 404]).toContain(res.status);
  });

  it('9c. agency A cannot download a file from agency B', async () => {
    const res = await request(app)
      .get(`/api/files/${agencyBFileId}/download`)
      .set(auth(f.agencyAAdminToken));

    expect([403, 404]).toContain(res.status);
  });

  it('9d. unauthenticated download is rejected', async () => {
    const res = await request(app).get(`/api/files/${sharedFileId}/download`);
    expect(res.status).toBe(401);
  });

  it('9e. client file listing excludes internal and foreign files', async () => {
    const res = await request(app)
      .get('/api/files?limit=100')
      .set(auth(f.agencyAClient1Token));

    expect(res.status).toBe(200);
    const ids = res.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(sharedFileId);
    expect(ids).not.toContain(internalFileId);
    expect(ids).not.toContain(agencyBFileId);
  });

  it('9f. stored files live outside the public web root', async () => {
    const file = await FileAsset.findById(sharedFileId).lean().exec();
    expect(file).toBeDefined();
    expect(path.isAbsolute(file!.storageKey)).toBe(false);
    // The on-disk name is generated, never the caller's filename.
    expect(file!.storageKey).not.toContain('shared.png');
    expect(fs.existsSync(path.join(env.storageDir, file!.storageKey))).toBe(true);
  });

  it('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/api/files')
      .set(auth(f.agencyAAdminToken))
      .field('relatedEntityType', 'PROJECT')
      .field('relatedEntityId', f.aProject1Id)
      .field('visibility', 'INTERNAL')
      .attach('file', Buffer.from('#!/bin/sh\nrm -rf /'), {
        filename: 'evil.sh',
        contentType: 'application/x-sh',
      });

    expect([400, 415]).toContain(res.status);
  });

  it('rejects attaching a file to a record in another tenant', async () => {
    const res = await request(app)
      .post('/api/files')
      .set(auth(f.agencyAAdminToken))
      .field('relatedEntityType', 'PROJECT')
      .field('relatedEntityId', f.bProject1Id)
      .field('visibility', 'INTERNAL')
      .attach('file', pngBytes, { filename: 'x.png', contentType: 'image/png' });

    expect([400, 404]).toContain(res.status);
  });
});

export { TEST_PASSWORD };