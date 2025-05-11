import { ServerCore } from '../core/server-core';
import cluster from 'cluster';
import * as dotenv from 'dotenv';

dotenv.config(); // Aby odczytać domyślny PORT, jeśli WORKER_PORT nie jest ustawiony

export function startWorkerServer() {
  const defaultPort = parseInt(process.env.PORT || '4000', 10);
  const port = parseInt(process.env.WORKER_PORT || `${defaultPort + (cluster.worker?.id || 0)}`, 10);
  const server = ServerCore.createServer();

  server.listen(port, () => {
    console.log(`Worker ${process.pid} listening on port ${port}`);
  });

  return server; // Może być przydatne, choć rzadziej testuje się workery bezpośrednio
}