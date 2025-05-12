import { ServerCore } from '../core/server-core';
import cluster from 'cluster';
import * as dotenv from 'dotenv';

dotenv.config(); // Aby odczytać domyślny PORT, jeśli WORKER_PORT nie jest ustawiony

export function startWorkerServer() {
  try {
    console.log(`[WORKER_SERVER_LOG] Worker ${process.pid} (id: ${cluster.worker?.id}) inside startWorkerServer().`);
    const defaultPort = parseInt(process.env.PORT || '4000', 10);
    const workerId = cluster.worker?.id || 0; // Domyślnie 0, jeśli id jest niezdefiniowane
    console.log(`[WORKER_SERVER_LOG] Worker ${process.pid} (id: ${workerId}) - defaultPort: ${defaultPort}, env.WORKER_PORT: ${process.env.WORKER_PORT}`);

    const port = parseInt(process.env.WORKER_PORT || `${defaultPort + workerId}`, 10);
    console.log(`[WORKER_SERVER_LOG] Worker ${process.pid} (id: ${workerId}) calculated port: ${port}`);

    if (isNaN(port)) {
      console.error(`[WORKER_SERVER_ERROR] Worker ${process.pid} (id: ${workerId}) - Invalid port calculated: NaN. WORKER_PORT: ${process.env.WORKER_PORT}, defaultPort: ${defaultPort}, workerId: ${workerId}`);
      throw new Error("Invalid port NaN for worker.");
    }

    console.log(`[WORKER_SERVER_LOG] Worker ${process.pid} (id: ${workerId}) attempting ServerCore.createServer().`);
    const server = ServerCore.createServer();
    console.log(`[WORKER_SERVER_LOG] Worker ${process.pid} (id: ${workerId}) ServerCore.createServer() returned. Attempting server.listen() on port ${port}.`);

    server.on('error', (err: any) => { // Przechwytywanie błędów na instancji serwera, np. EADDRINUSE
      console.error(`[WORKER_SERVER_ERROR] HTTP Server error for worker ${process.pid} (id: ${workerId}) on port ${port}: ${err.message}`, err.stack);
      process.exit(1); // Wyjdź, jeśli serwer nie może się uruchomić
    });

    server.listen(port, () => {
      console.log(`Worker ${process.pid} (id: ${workerId}) listening on port ${port}`);
    });

    return server;
  } catch (err: any) { // Dodano typ dla err
    console.error(`[WORKER_SERVER_ERROR] Critical error in startWorkerServer for worker ${process.pid} (id: ${cluster.worker?.id}): ${err.message}`, err.stack);
    process.exit(1); // Zapewnij wyjście workera przy krytycznym błędzie startu
  }
}