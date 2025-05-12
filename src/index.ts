import * as dotenv from 'dotenv';
import cluster from 'cluster';
import { startStandaloneServer } from './modes/standalone-server';
import { ClusterMain } from './cluster/cluster-main';
import { startWorkerServer } from './modes/worker-server';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

if (process.env.CLUSTER_MODE === 'true') {
  if (cluster.isPrimary) {
    new ClusterMain(PORT).start();
  } else {
    try {
      console.log(
        `[WORKER_INDEX_LOG] Worker ${process.pid} (id: ${cluster.worker?.id}) attempting to start server...`,
      );
      startWorkerServer();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error starting worker';
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(
        `[WORKER_INDEX_ERROR] Critical error starting worker ${
          process.pid
        } (id: ${cluster.worker?.id}): ${errorMessage}`,
        errorStack,
      );
      process.exit(1);
    }
  }
} else {
  startStandaloneServer(PORT);
}
