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
    startWorkerServer();
  }
} else {
  // Tryb pojedynczej instancji
  startStandaloneServer(PORT);
}
// Eksport serwera dla testów trybu standalone może być teraz w standalone-server.ts
// lub można go warunkowo eksportować stąd, jeśli jest potrzebny.
// Na razie usuwam eksport, aby uniknąć niejasności.