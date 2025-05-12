import cluster, { Worker } from 'cluster';
import os from 'os';
import http from 'http';
import { User } from '../user.types';
import { users } from '../database';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config();

export class ClusterMain {
  private port: number;
  private numCPUs: number;

  private activeWorkers: { worker: Worker; port: number }[] = [];
  private nextWorkerIndex = 0;

  constructor(port: number) {
    this.port = port;
    this.numCPUs = os.cpus().length;
  }

  private workerMessageHandler(
    workerProcess: Worker,
    msg: {
      from: 'worker';
      requestId: string;
      type: string;
      payload?: unknown;
    },
  ) {
    if (msg.from === 'worker' && msg.requestId) {
      let responsePayload: User | User[] | { success: boolean } | undefined;
      let errorResponse: { message: string } | null = null;

      switch (msg.type) {
        case 'getUsers':
          responsePayload = [...users];
          break;
        case 'getUserById':
          const getUserPayload = msg.payload as { userId: string };
          const user = users.find((u) => u.id === getUserPayload.userId);
          if (user) responsePayload = { ...user };
          else
            errorResponse = {
              message: `User with id ${getUserPayload.userId} not found`,
            };
          break;
        case 'createUser':
          const createUserPayload = msg.payload as Omit<User, 'id'>;
          const newUser: User = {
            id: uuidv4(),
            ...createUserPayload,
          };
          users.push(newUser);
          responsePayload = { ...newUser };
          break;
        case 'updateUser':
          const updateUserPayload = msg.payload as {
            userId: string;
            userData: Omit<User, 'id'>;
          };
          const userIndexUpdate = users.findIndex(
            (u) => u.id === updateUserPayload.userId,
          );
          if (userIndexUpdate !== -1) {
            users[userIndexUpdate] = {
              ...users[userIndexUpdate],
              ...updateUserPayload.userData,
              id: updateUserPayload.userId,
            };
            responsePayload = { ...users[userIndexUpdate] };
          } else {
            errorResponse = {
              message: `User with id ${updateUserPayload.userId} not found for update`,
            };
          }
          break;
        case 'deleteUser':
          const deleteUserPayload = msg.payload as { userId: string };
          const userIndexDelete = users.findIndex(
            (u) => u.id === deleteUserPayload.userId,
          );
          if (userIndexDelete !== -1) {
            users.splice(userIndexDelete, 1);
            responsePayload = { success: true };
          } else {
            errorResponse = { message: 'User not found for deletion' };
          }
          break;
        default:
          errorResponse = { message: 'Unknown IPC message type from worker' };
      }
      workerProcess.send({
        requestId: msg.requestId,
        payload: responsePayload,
        error: errorResponse,
        from: 'primary',
      });
    }
  }

  public start() {
    console.log(
      `Primary process ${process.pid} is running. Main server on port ${this.port}.`,
    );
    const numWorkersToFork = Math.max(1, this.numCPUs - 1);
    console.log(`Forking ${numWorkersToFork} worker processes...`);

    for (let i = 0; i < numWorkersToFork; i++) {
      const workerPort = this.port + i + 1;
      const worker = cluster.fork({
        WORKER_PORT: workerPort.toString(),
        CLUSTER_MODE: 'true',
      });

      worker.on('listening', (address) => {
        console.log(
          `Worker ${worker.process.pid} is now listening on port ${address.port || workerPort}`,
        );

        if (
          !this.activeWorkers.find((wEntry) => wEntry.worker.id === worker.id)
        ) {
          this.activeWorkers.push({ worker, port: workerPort });
        }
      });

      worker.on('message', (msg) => this.workerMessageHandler(worker, msg));
    }

    cluster.on('exit', (exitedWorker, code, signal) => {
      console.log(
        `Worker ${exitedWorker.process.pid} died with code ${code} and signal ${signal}. Attempting to fork a new one...`,
      );

      const workerArrayIndex = this.activeWorkers.findIndex(
        (wEntry: { worker: Worker; port: number }) =>
          wEntry.worker.id === exitedWorker.id,
      );
      let portToUseForNewWorker: number;

      if (workerArrayIndex !== -1) {
        const workerEntry = this.activeWorkers[workerArrayIndex];
        if (workerEntry) {
          portToUseForNewWorker = workerEntry.port;
          this.activeWorkers.splice(workerArrayIndex, 1);
          console.log(
            `Worker ${exitedWorker.process.pid} was listening on port ${portToUseForNewWorker}. Attempting to reuse port for new worker.`,
          );
        } else {
          console.warn(
            `Exited worker ${exitedWorker.process.pid} found in activeWorkers by index, but entry was undefined. Assigning new port.`,
          );
          portToUseForNewWorker = this.findNextAvailablePort();
        }
      } else {
        console.warn(
          `Could not find exited worker ${exitedWorker.process.pid} in the active list. Assigning a new port.`,
        );
        portToUseForNewWorker = this.findNextAvailablePort();
      }

      setTimeout(() => {
        console.log(
          `Forking new worker to listen on port ${portToUseForNewWorker}.`,
        );
        const newWorker = cluster.fork({
          WORKER_PORT: portToUseForNewWorker.toString(),
          CLUSTER_MODE: 'true',
        });

        newWorker.on('listening', (address: { port?: number }) => {
          const listeningPort = address?.port || portToUseForNewWorker;
          console.log(
            `New worker ${newWorker.process.pid} is now listening on port ${listeningPort}`,
          );

          if (
            !this.activeWorkers.find(
              (wEntry) => wEntry.worker.id === newWorker.id,
            )
          ) {
            this.activeWorkers.push({
              worker: newWorker,
              port: listeningPort,
            });
          }
        });
        newWorker.on('message', (msg) =>
          this.workerMessageHandler(newWorker, msg),
        );
        newWorker.on('error', (err) => {
          console.error(`Error on new worker ${newWorker.process.pid}:`, err);
        });
      }, 250);
    });

    http
      .createServer((req, res) => {
        if (this.activeWorkers.length === 0) {
          res.writeHead(503, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              message: 'Service Unavailable - No workers available',
            }),
          );
          return;
        }

        this.nextWorkerIndex = this.nextWorkerIndex % this.activeWorkers.length;
        const targetWorkerEntry = this.activeWorkers[this.nextWorkerIndex];

        if (!targetWorkerEntry || !targetWorkerEntry.worker) {
          console.error(
            'Load balancer: Target worker entry or worker is undefined.',
          );
          res.writeHead(500, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              message: 'Internal server error: Could not select a worker.',
            }),
          );
          return;
        }
        const workerPort = targetWorkerEntry.port;

        const proxyReq = http.request(
          {
            host: 'localhost',
            port: workerPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          },
        );
        proxyReq.on('error', (_err) => {
          console.error(
            `Load balancer proxy error to worker ${targetWorkerEntry.worker.process?.pid || 'unknown'} on port ${workerPort}:`,
            _err,
          );
          res.writeHead(500, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({ message: 'Error connecting to worker service.' }),
          );
        });
        req.pipe(proxyReq, { end: true });
        this.nextWorkerIndex =
          (this.nextWorkerIndex + 1) % this.activeWorkers.length;
      })
      .listen(this.port);
  }

  private findNextAvailablePort(): number {
    const usedPorts = this.activeWorkers.map(
      (w: { worker: Worker; port: number }) => w.port,
    );
    let nextPort = this.port + 1;
    while (usedPorts.includes(nextPort)) {
      nextPort++;
    }
    return nextPort;
  }
}
