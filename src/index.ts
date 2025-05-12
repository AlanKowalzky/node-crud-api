import * as dotenv from 'dotenv';
import cluster from 'cluster';
import { startStandaloneServer } from './modes/standalone-server';
import { ClusterMain } from './cluster/cluster-main'; // Załóżmy, że klasa ClusterMain jest w tym pliku
import { startWorkerServer } from './modes/worker-server'; // Importujemy funkcję startującą workera

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

// Sprawdzamy zmienną środowiskową, aby zdecydować o trybie uruchomienia
if (process.env.CLUSTER_MODE === 'true') {
  if (cluster.isPrimary) {
    new ClusterMain(PORT).start();
  } else {
    // Jesteśmy w workerze, uruchamiamy serwer workera
    try {
      console.log(`[WORKER_INDEX_LOG] Worker ${process.pid} (id: ${cluster.worker?.id}) attempting to start server...`);
      startWorkerServer();
    } catch (err: any) { // Dodano typ dla err
      console.error(`[WORKER_INDEX_ERROR] Critical error starting worker ${process.pid} (id: ${cluster.worker?.id}): ${err.message}`, err.stack);
      process.exit(1); // Zapewnij wyjście workera przy krytycznym błędzie startu
    }
  }
} else {
  // Tryb pojedynczej instancji
  startStandaloneServer(PORT);
}
// Eksport serwera dla testów trybu standalone może być teraz w standalone-server.ts
// lub można go warunkowo eksportować stąd, jeśli jest potrzebny.
// Na razie usuwam eksport, aby uniknąć niejasności.