import request from 'supertest';
import { startStandaloneServer } from '../modes/standalone-server';
import { users } from '../database';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';

let serverInstance: http.Server;
const TEST_PORT = 4004;

beforeAll(() => {
  serverInstance = startStandaloneServer(TEST_PORT);
});

afterAll(async () => {
  if (serverInstance && serverInstance.listening) {
    await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
  }
});

describe('Users API - Standalone Mode - Basic CRUD Operations', () => {
  beforeEach(() => {
    users.length = 0;
  });

  test('1.1 GET /api/users - should return an empty array initially', async () => {
    const response = await request(serverInstance).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('1.2 POST /api/users - should create a new user', async () => {
    const newUserPayload = {
      username: 'Standalone User Alpha',
      age: 30,
      hobbies: ['alpha testing', 'standalone mode'],
    };
    const response = await request(serverInstance)
      .post('/api/users')
      .send(newUserPayload);

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.username).toBe(newUserPayload.username);
    expect(response.body.age).toBe(newUserPayload.age);
    expect(response.body.hobbies).toEqual(newUserPayload.hobbies);
  });

  test('1.3 GET /api/users/{userId} - should retrieve the created user', async () => {
    const newUserPayload = {
      username: 'User To Get',
      age: 25,
      hobbies: ['getting'],
    };
    const postResponse = await request(serverInstance)
      .post('/api/users')
      .send(newUserPayload);
    const userId = postResponse.body.id;

    const response = await request(serverInstance).get(`/api/users/${userId}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(userId);
    expect(response.body.username).toBe(newUserPayload.username);
  });

  test('1.4 PUT /api/users/{userId} - should update the user', async () => {
    const newUserPayload = {
      username: 'User To Update',
      age: 40,
      hobbies: ['updating'],
    };
    const postResponse = await request(serverInstance)
      .post('/api/users')
      .send(newUserPayload);
    const userId = postResponse.body.id;

    const updatedData = {
      username: 'User Updated Successfully',
      age: 41,
      hobbies: ['updating', 'testing'],
    };

    const response = await request(serverInstance)
      .put(`/api/users/${userId}`)
      .send(updatedData);

    expect(response.status).toBe(200);
    expect(response.body.username).toBe(updatedData.username);
    expect(response.body.age).toBe(updatedData.age);
    expect(response.body.hobbies).toEqual(updatedData.hobbies);
  });

  test('1.5 DELETE /api/users/{userId} - should delete the user', async () => {
    const newUserPayload = {
      username: 'User To Delete',
      age: 50,
      hobbies: ['deleting'],
    };
    const postResponse = await request(serverInstance)
      .post('/api/users')
      .send(newUserPayload);
    const userId = postResponse.body.id;

    const response = await request(serverInstance).delete(
      `/api/users/${userId}`,
    );

    expect(response.status).toBe(204);

    const getResponse = await request(serverInstance).get(
      `/api/users/${userId}`,
    );
    expect(getResponse.status).toBe(404);
  });
});

describe('Users API - Standalone Mode - Error Handling', () => {
  beforeEach(async () => {
    users.length = 0;
  });

  test('2.1 GET /api/users/{invalidUserId} - should return 400 for invalid userId format', async () => {
    const response = await request(serverInstance).get(
      '/api/users/not-a-valid-uuid',
    );
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Invalid userId format (not a valid UUID)',
    );
  });

  test('2.2 GET /api/users/{nonExistentUserId} - should return 404 for non-existent userId', async () => {
    const nonExistentId = uuidv4();
    const response = await request(serverInstance).get(
      `/api/users/${nonExistentId}`,
    );
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(
      `User with id ${nonExistentId} not found`,
    );
  });

  test('2.3 POST /api/users - should return 400 for missing required fields (e.g., username)', async () => {
    const response = await request(serverInstance)
      .post('/api/users')
      .send({ age: 30, hobbies: ['testing'] });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'Request body does not contain required fields or fields are of incorrect type',
    );
  });

  test('2.4 PUT /api/users/{nonExistentUserId} - should return 404 when trying to update non-existent user', async () => {
    const nonExistentId = uuidv4();
    const updateData = { username: 'Ghost', age: 99, hobbies: [] };
    const response = await request(serverInstance)
      .put(`/api/users/${nonExistentId}`)
      .send(updateData);
    expect(response.status).toBe(404);
  });

  test('2.5 DELETE /api/users/{nonExistentUserId} - should return 404 when trying to delete non-existent user', async () => {
    const nonExistentId = uuidv4();
    const response = await request(serverInstance).delete(
      `/api/users/${nonExistentId}`,
    );
    expect(response.status).toBe(404);
  });

  test('2.6 GET /api/test-500-error - should return 500 for an intentional server error', async () => {
    const response = await request(serverInstance).get('/api/test-500-error');
    expect(response.status).toBe(500);

    expect(response.body.message).toBe(
      'Internal Server Error - An unexpected error occurred.', // Komentarz wyjaśniający
    );
  });
});

describe('Users API - Standalone Mode - Non-existent Endpoints', () => {
  beforeEach(() => {
    users.length = 0;
  });

  test('3.1 GET /api/non-existent-path - should return 404', async () => {
    const response = await request(serverInstance).get(
      '/api/non-existent-path',
    );
    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Resource not found');
  });

  test('3.2 POST /completely/different/path - should return 404', async () => {
    const response = await request(serverInstance)
      .post('/completely/different/path')
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Resource not found');
  });
});
