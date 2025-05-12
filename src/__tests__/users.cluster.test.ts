import request from 'supertest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

import * as dotenv from 'dotenv';

dotenv.config();

const TEST_E2E_CLUSTER_PORT = 4008;
const BASE_URL = `http://localhost:${TEST_E2E_CLUSTER_PORT}`;

describe('Users API - Cluster Mode E2E Tests', () => {
  jest.setTimeout(35000);

  let clusterProcess: ChildProcess | null = null;
  let createdUserForBasicScenario: {
    id?: string;
    username?: string;
    age?: number;
    hobbies?: string[];
  } = {};
  let createdUserForConsistencyTest: {
    id?: string;
    username?: string;
    age?: number;
    hobbies?: string[];
  } = {};

  beforeAll((done) => {
    const projectRoot = path.resolve(__dirname, '../../');
    const distPath = path.join(projectRoot, 'dist', 'index.js');

    console.log(
      `[CLUSTER_TEST_SETUP] Attempting to start cluster from: ${distPath}`,
    );

    const command = 'node';
    const args = [distPath];

    clusterProcess = spawn(command, args, {
      cwd: projectRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLUSTER_MODE: 'true',
        PORT: TEST_E2E_CLUSTER_PORT.toString(),
      },
    });

    if (!clusterProcess) {
      return done(new Error('Failed to spawn cluster process.'));
    }

    const numCPUs = os.cpus().length;
    const expectedWorkers = Math.max(1, numCPUs - 1);
    let readyWorkersCount = 0;
    let masterReady = false;
    let serverReadyTimeout: NodeJS.Timeout | null = null;
    let prematureExitError: Error | null = null;

    clusterProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();

      output.split('\n').forEach((line: string) => {
        console.log(`[Cluster STDOUT]: ${line}`);

        if (
          line.includes(`Main server on port ${TEST_E2E_CLUSTER_PORT}`) &&
          !masterReady
        ) {
          masterReady = true;
          console.log('[CLUSTER_TEST_SETUP] Master process reported ready.');
        }

        if (
          line.includes(' is now listening on port') &&
          line.includes('Worker ') &&
          masterReady
        ) {
          readyWorkersCount++;
          console.log(
            `[CLUSTER_TEST_SETUP] Worker reported ready. Total ready workers: ${readyWorkersCount}/${expectedWorkers}`,
          );
          if (readyWorkersCount >= expectedWorkers) {
            if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
            if (!prematureExitError) {
              console.log(
                `[CLUSTER_TEST_SETUP] All ${expectedWorkers} workers reported ready. Proceeding with tests.`,
              );
              done();
            }
          }
        }
      });
    });

    clusterProcess.stderr?.on('data', (data) => {
      const errorOutput = data.toString().trim();

      errorOutput.split('\n').forEach((line: string) => {
        console.error(`[Cluster STDERR RAW]: ${line}`);
      });
    });

    clusterProcess.on('error', (err) => {
      console.error(
        '[CLUSTER_TEST_SETUP] Failed to start cluster process (spawn error):',
        err,
      );
      if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
      prematureExitError = err;
    });

    clusterProcess.on('exit', (code, signal) => {
      console.log(
        `[CLUSTER_TEST_SETUP] Cluster process exited with code ${code} and signal ${signal}. Master ready: ${masterReady}, Ready workers: ${readyWorkersCount}/${expectedWorkers}`,
      );
      if (readyWorkersCount < expectedWorkers && !prematureExitError) {
        if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
        const exitError = new Error(
          `[CLUSTER_TEST_SETUP] Cluster process exited prematurely with code ${code}, signal ${signal}`,
        );
        prematureExitError = exitError;
        done(exitError);
      }
    });

    serverReadyTimeout = setTimeout(
      () => {
        if (readyWorkersCount < expectedWorkers) {
          console.error(
            `[CLUSTER_TEST_SETUP] Cluster did not report ${expectedWorkers} workers ready in time. Only ${readyWorkersCount} were ready.`,
          );
          if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
            clusterProcess.kill('SIGKILL');
          }
          done(new Error('Cluster readiness timeout. Check server logs.'));
        }
      },
      process.env.CI ? 30000 : 20000,
    );
  });

  afterAll((done) => {
    if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
      console.log(
        `[CLUSTER_TEST_TEARDOWN] Stopping cluster process PID: ${clusterProcess.pid}...`,
      );

      const timeout = setTimeout(() => {
        console.warn(
          `[CLUSTER_TEST_TEARDOWN] Cluster process PID: ${clusterProcess?.pid} did not exit in time after SIGTERM. Sending SIGKILL.`,
        );
        if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
          clusterProcess.kill('SIGKILL');
        }
        clusterProcess = null;
        done();
      }, 5000);

      clusterProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        console.log(
          `[CLUSTER_TEST_TEARDOWN] Cluster process exited with code ${code} and signal ${signal}.`,
        );
        clusterProcess = null;
        done();
      });

      clusterProcess.kill('SIGTERM');
    } else {
      console.log('[CLUSTER_TEST_TEARDOWN] No active cluster process to stop.');
      clusterProcess = null;
      done();
    }
  });

  describe('Basic CRUD Operations (Cluster Mode)', () => {
    test('1.1 POST /api/users - should create a new user', async () => {
      const newUser = {
        username: 'Cluster User Alpha',
        age: 30,
        hobbies: ['alpha testing', 'clustering'],
      };
      const response = await request(BASE_URL).post('/api/users').send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.username).toBe(newUser.username);
      createdUserForBasicScenario = response.body;
    });

    test('1.2 GET /api/users/{userId} - should retrieve the created user', async () => {
      expect(createdUserForBasicScenario.id).toBeDefined();
      const response = await request(BASE_URL).get(
        `/api/users/${createdUserForBasicScenario.id}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createdUserForBasicScenario.id);
      expect(response.body.username).toBe(createdUserForBasicScenario.username);
    });

    test('1.3 PUT /api/users/{userId} - should update the user', async () => {
      expect(createdUserForBasicScenario.id).toBeDefined();
      const updatedData = {
        username: 'Cluster User Alpha (Updated)',
        age: 31,
        hobbies: ['alpha testing', 'clustering', 'scaling'],
      };
      const response = await request(BASE_URL)
        .put(`/api/users/${createdUserForBasicScenario.id}`)
        .send(updatedData);
      expect(response.status).toBe(200);
      expect(response.body.username).toBe(updatedData.username);
      expect(response.body.age).toBe(updatedData.age);
    });

    test('1.4 DELETE /api/users/{userId} - should delete the user', async () => {
      expect(createdUserForBasicScenario.id).toBeDefined();
      const response = await request(BASE_URL).delete(
        `/api/users/${createdUserForBasicScenario.id}`,
      );
      expect(response.status).toBe(204);
    });

    test('1.5 GET /api/users/{userId} - should return 404 for the deleted user', async () => {
      expect(createdUserForBasicScenario.id).toBeDefined();
      const response = await request(BASE_URL).get(
        `/api/users/${createdUserForBasicScenario.id}`,
      );
      expect(response.status).toBe(404);
    });
  });

  describe('Error Handling (Cluster Mode)', () => {
    test('2.1 GET /api/users/{invalidUserId} - should return 400 for invalid userId', async () => {
      const response = await request(BASE_URL).get('/api/users/not-a-uuid');
      expect(response.status).toBe(400);
    });

    test('2.2 POST /api/users - should return 400 for missing required fields', async () => {
      const response = await request(BASE_URL)
        .post('/api/users')
        .send({ username: 'Missing Age' });
      expect(response.status).toBe(400);
    });

    test('2.3 GET /non-existent-endpoint - should return 404', async () => {
      const response = await request(BASE_URL).get('/api/non-existent');
      expect(response.status).toBe(404);
    });
  });

  describe('Data Consistency Across Workers (Cluster Mode)', () => {
    const consistencyUser = {
      username: 'Consistency Test User',
      age: 42,
      hobbies: ['consistency', 'ipc'],
    };

    test('3.1 POST /api/users - create user for consistency test', async () => {
      const response = await request(BASE_URL)
        .post('/api/users')
        .send(consistencyUser);
      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      createdUserForConsistencyTest = response.body;
    });

    test('3.2 GET /api/users/{userId} - retrieve user multiple times to hit different workers', async () => {
      expect(createdUserForConsistencyTest.id).toBeDefined();
      const numRequests = 5;
      for (let i = 0; i < numRequests; i++) {
        const response = await request(BASE_URL).get(
          `/api/users/${createdUserForConsistencyTest.id}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(createdUserForConsistencyTest.id);
        expect(response.body.username).toBe(consistencyUser.username);
      }
    });

    test('3.3 PUT /api/users/{userId} - update user for consistency test', async () => {
      expect(createdUserForConsistencyTest.id).toBeDefined();
      const updatedConsistencyUser = {
        username: 'Consistency Test User (Updated)',
        age: 43,
        hobbies: ['consistency', 'ipc', 'updated'],
      };
      const response = await request(BASE_URL)
        .put(`/api/users/${createdUserForConsistencyTest.id}`)
        .send(updatedConsistencyUser);
      expect(response.status).toBe(200);
      expect(response.body.username).toBe(updatedConsistencyUser.username);
      createdUserForConsistencyTest.username = updatedConsistencyUser.username;
    });

    test('3.4 GET /api/users/{userId} - retrieve updated user multiple times', async () => {
      expect(createdUserForConsistencyTest.id).toBeDefined();
      const numRequests = 5;
      for (let i = 0; i < numRequests; i++) {
        const response = await request(BASE_URL).get(
          `/api/users/${createdUserForConsistencyTest.id}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(createdUserForConsistencyTest.id);
        expect(response.body.username).toBe(
          createdUserForConsistencyTest.username,
        );
      }
    });

    test('3.5 DELETE /api/users/{userId} - delete user for consistency test', async () => {
      expect(createdUserForConsistencyTest.id).toBeDefined();
      const response = await request(BASE_URL).delete(
        `/api/users/${createdUserForConsistencyTest.id}`,
      );
      expect(response.status).toBe(204);
    });

    test('3.6 GET /api/users/{userId} - verify user is deleted across workers', async () => {
      expect(createdUserForConsistencyTest.id).toBeDefined();
      const numRequests = 5;
      for (let i = 0; i < numRequests; i++) {
        const response = await request(BASE_URL).get(
          `/api/users/${createdUserForConsistencyTest.id}`,
        );
        expect(response.status).toBe(404);
      }
    });
  });
});
