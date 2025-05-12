import request from 'supertest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

const TEST_PORT = 4009;
const BASE_URL = `http://localhost:${TEST_PORT}`;
describe('Ultimate Diagnostic Startup Test', () => {
  let clusterProcess: ChildProcess | null = null;

  beforeAll((done) => {
    jest.setTimeout(25000);

    console.log(`[DIAGNOSTIC_TEST_SETUP] __dirname: ${__dirname}`);

    const projectRoot = path.resolve(__dirname, '../../');
    console.log(`[DIAGNOSTIC_TEST_SETUP] projectRoot: ${projectRoot}`);
    const distPath = path.join(projectRoot, 'dist', 'index.js');
    console.log(`[DIAGNOSTIC_TEST_SETUP] distPath: ${distPath}`);
    console.log(
      `[DIAGNOSTIC_TEST_SETUP] Attempting to start: node ${distPath} with cwd: ${projectRoot}`,
    );

    clusterProcess = spawn('node', [distPath], {
      cwd: projectRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLUSTER_MODE: 'true',
        PORT: TEST_PORT.toString(),
      },
    });

    if (!clusterProcess.pid) {
      console.error('[DIAGNOSTIC_TEST] Failed to spawn child process.');
      return done(
        new Error(
          'Failed to spawn child process. Check spawn parameters and system resources.',
        ),
      );
    }

    const numCPUs = os.cpus().length;
    const expectedWorkers = Math.max(1, numCPUs - 1);
    let readyWorkersCount = 0;
    let masterReady = false;

    let serverReadyTimeout: NodeJS.Timeout | null = null;
    let prematureExitError: Error | null = null;

    serverReadyTimeout = setTimeout(() => {
      if (readyWorkersCount < expectedWorkers) {
        console.error(
          '[DIAGNOSTIC_TEST] Server readiness timeout. Process might have exited or never reported ready.',
        );
        clusterProcess?.kill('SIGKILL');
        done(new Error('[DIAGNOSTIC_TEST] Server readiness timeout.'));
      }
    }, 20000);

    clusterProcess.stdout?.on('data', (data) => {
      const output = data.toString();

      if (output.includes(`Main server on port ${TEST_PORT}`) && !masterReady) {
        masterReady = true;
      }

      if (
        output.includes(' is now listening on port') &&
        output.includes('Worker ') &&
        masterReady
      ) {
        readyWorkersCount++;

        if (readyWorkersCount >= expectedWorkers) {
          if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
          if (!prematureExitError) {
            console.log(
              `[DIAGNOSTIC_TEST] All ${expectedWorkers} workers reported ready.`,
            );
            done();
          }
        }
      }
    });

    clusterProcess.stderr?.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`[DIAGNOSTIC_STDERR_CHILD]: ${errorOutput.trim()}`);
    });

    clusterProcess.on('error', (err) => {
      console.error('[DIAGNOSTIC_TEST] Spawn error:', err);
      if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
      prematureExitError = err;
      if (readyWorkersCount < expectedWorkers) done(err);
    });

    clusterProcess.on('exit', (code, signal) => {
      console.log(
        `[DIAGNOSTIC_TEST] Server process exited with code ${code} and signal ${signal}. Master ready: ${masterReady}, Ready workers: ${readyWorkersCount}/${expectedWorkers}`,
      );
      if (readyWorkersCount < expectedWorkers && !prematureExitError) {
        if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
        const exitError = new Error(
          `[DIAGNOSTIC_TEST] Server process exited prematurely with code ${code}, signal ${signal}. Check STDOUT/STDERR logs from child.`,
        );
        prematureExitError = exitError;
        done(exitError);
      }
    });
  });

  afterAll((done) => {
    jest.setTimeout(10000);
    console.log('[DIAGNOSTIC_TEST] Running afterAll...');
    if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
      console.log(
        `[DIAGNOSTIC_TEST_TEARDOWN] Stopping cluster process PID: ${clusterProcess.pid}...`,
      );

      let killTimeout: NodeJS.Timeout | null = null;

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (killTimeout) clearTimeout(killTimeout);
        console.log(
          `[DIAGNOSTIC_TEST_TEARDOWN] Cluster process exited with code ${code} and signal ${signal}.`,
        );
        clusterProcess = null;
        done();
      };

      clusterProcess.once('exit', onExit);

      clusterProcess.kill('SIGTERM');

      killTimeout = setTimeout(() => {
        console.warn(
          `[DIAGNOSTIC_TEST_TEARDOWN] Cluster process PID: ${clusterProcess?.pid} did not exit in time after SIGTERM. Sending SIGKILL.`,
        );
        if (clusterProcess && !clusterProcess.killed) {
          clusterProcess.removeListener('exit', onExit);
          clusterProcess.kill('SIGKILL');

          done();
        }
      }, 7000);
    } else {
      console.log(
        '[DIAGNOSTIC_TEST_TEARDOWN] No active cluster process to stop.',
      );
      clusterProcess = null;
      done();
    }
  }, 10000); 

  test('should respond to a basic request', async () => {
    console.log('[DIAGNOSTIC_TEST] Attempting a basic request...');
    const response = await request(BASE_URL).get('/api/users');
    expect(response.status).toBe(200);
  });
});
