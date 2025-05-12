import request from 'supertest';
import { spawn, ChildProcess } from 'child_process'; // Upewnij się, że fork jest usunięty, jeśli nie używamy
import path from 'path';
import os from 'os'; // Dodajemy moduł os do obliczenia liczby CPU

const TEST_PORT = 4009; // Dedykowany, inny port dla tego minimalnego testu
const BASE_URL = `http://localhost:${TEST_PORT}`;
describe('Ultimate Diagnostic Startup Test', () => {
    let clusterProcess: ChildProcess | null = null;
    
    beforeAll((done) => {
        jest.setTimeout(25000); // Timeout dla startu

        console.log(`[DIAGNOSTIC_TEST_SETUP] __dirname: ${__dirname}`);
        // Poprawka ścieżki do głównego katalogu projektu
        const projectRoot = path.resolve(__dirname, '../../'); // __tests__ (w src) -> src (idziemy do góry) -> c:\progNodeJS\node-crud-api (katalog główny projektu)
        console.log(`[DIAGNOSTIC_TEST_SETUP] projectRoot: ${projectRoot}`);
        const distPath = path.join(projectRoot, 'dist', 'index.js');
        console.log(`[DIAGNOSTIC_TEST_SETUP] distPath: ${distPath}`);
        console.log(`[DIAGNOSTIC_TEST_SETUP] Attempting to start: node ${distPath} with cwd: ${projectRoot}`);

        clusterProcess = spawn('node', [distPath], { 
            cwd: projectRoot, 
            shell: false, // Usunięto shell: true dla większej przewidywalności
            stdio: ['ignore', 'pipe', 'pipe'], // Przekieruj stdout/stderr
            env: { 
                ...process.env, // Przekaż całe obecne środowisko
                CLUSTER_MODE: 'true', 
                PORT: TEST_PORT.toString(),
                // NODE_ENV: process.env.NODE_ENV || 'development', // Można nadpisać, jeśli potrzeba
                // Możesz włączyć NODE_DEBUG, jeśli chcesz zobaczyć więcej, ale na razie skupmy się na logach aplikacji
                // NODE_DEBUG: 'cluster,http,net,fs' 
            }
        });

        if (!clusterProcess.pid) { // Dodatkowe sprawdzenie, czy proces się w ogóle uruchomił
            console.error('[DIAGNOSTIC_TEST] Failed to spawn child process.');
            return done(new Error('Failed to spawn child process. Check spawn parameters and system resources.'));
        }

        // Now czekamy na workery, a nie tylko na główny serwer
        const numCPUs = os.cpus().length;
        const expectedWorkers = Math.max(1, numCPUs - 1); // Taka sama logika jak w ClusterMain
        let readyWorkersCount = 0;
        let masterReady = false; // Nadal śledzimy, czy master wystartował, ale gotowość testu zależy od workerów

        let serverReadyTimeout: NodeJS.Timeout | null = null; // Zmieniono na NodeJS.Timeout | null
        let prematureExitError: Error | null = null;

        serverReadyTimeout = setTimeout(() => {
            if (readyWorkersCount < expectedWorkers) {
                console.error('[DIAGNOSTIC_TEST] Server readiness timeout. Process might have exited or never reported ready.');
                clusterProcess?.kill('SIGKILL');
                done(new Error('[DIAGNOSTIC_TEST] Server readiness timeout.'));
            }
        }, 20000); // 20s na zgłoszenie gotowości

        clusterProcess.stdout?.on('data', (data) => {
            const output = data.toString(); // Loguj całe linie
            process.stdout.write(`[DIAGNOSTIC_STDOUT_CHILD]:\n${output}\n`); // Bezpośrednie wypisanie na stdout testu

            // Sprawdzamy, czy master zgłosił gotowość
            if (output.includes(`Main server on port ${TEST_PORT}`) && !masterReady) {
                masterReady = true;
            }

            // Sprawdzamy, czy MASTER potwierdził, że worker nasłuchuje (bardziej precyzyjny warunek)
            if (output.includes(' is now listening on port') && output.includes('Worker ') && masterReady) {
                readyWorkersCount++;
                // Wywołaj done() tylko wtedy, gdy wszystkie oczekiwane workery są gotowe
                if (readyWorkersCount >= expectedWorkers) {
                    if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
                    if (!prematureExitError) {
                        console.log(`[DIAGNOSTIC_TEST] All ${expectedWorkers} workers reported ready.`);
                        done(); // Sygnalizuj, że beforeAll jest zakończone
                    }
                }
            }
        });

        clusterProcess.stderr?.on('data', (data) => {
            const errorOutput = data.toString(); // Loguj całe linie
            process.stderr.write(`[DIAGNOSTIC_STDERR_CHILD]:\n${errorOutput}\n`); // Bezpośrednie wypisanie na stderr testu
        });

        clusterProcess.on('error', (err) => { // Dodano obsługę błędu 'error' dla spawn
            console.error('[DIAGNOSTIC_TEST] Spawn error:', err);
            if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
            prematureExitError = err; // Zapisz błąd
            if (readyWorkersCount < expectedWorkers) done(err); // Jeśli proces zawiódł zanim workery były gotowe, zakończ test błędem
        });

        clusterProcess.on('exit', (code, signal) => {
            console.log(`[DIAGNOSTIC_TEST] Server process exited with code ${code} and signal ${signal}. Master ready: ${masterReady}, Ready workers: ${readyWorkersCount}/${expectedWorkers}`);
            if (readyWorkersCount < expectedWorkers && !prematureExitError) { // Jeśli zakończył się zanim workery były gotowe i nie było błędu 'error'
                if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
                const exitError = new Error(`[DIAGNOSTIC_TEST] Server process exited prematurely with code ${code}, signal ${signal}. Check STDOUT/STDERR logs from child.`);
                prematureExitError = exitError;
                done(exitError);
            }
        });
    });

    afterAll((done) => {
        console.log('[DIAGNOSTIC_TEST] Running afterAll...');
        if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
            console.log(`[DIAGNOSTIC_TEST_TEARDOWN] Stopping cluster process PID: ${clusterProcess.pid}...`);
            
            const timeout = setTimeout(() => {
                console.warn(`[DIAGNOSTIC_TEST_TEARDOWN] Cluster process PID: ${clusterProcess?.pid} did not exit in time after SIGTERM. Sending SIGKILL.`);
                if (clusterProcess && clusterProcess.pid && !clusterProcess.killed) {
                    clusterProcess.kill('SIGKILL'); 
                }
                clusterProcess = null;
                done(); // Zapewnij, że done() jest wywoływane
            }, 5000); // 5 sekund na poprawne zamknięcie

            clusterProcess.on('exit', (code, signal) => {
                clearTimeout(timeout);
                console.log(`[DIAGNOSTIC_TEST_TEARDOWN] Cluster process exited with code ${code} and signal ${signal}.`);
                clusterProcess = null; 
                done();
            });

            clusterProcess.kill('SIGTERM');
        } else {
            console.log('[DIAGNOSTIC_TEST_TEARDOWN] No active cluster process to stop.');
            clusterProcess = null; 
            done();
        }
    });

    test('should respond to a basic request', async () => {
        // Ten test jest tutaj głównie po to, aby beforeAll miało szansę zadziałać (lub zawieść)
        // Jeśli beforeAll zawiedzie, ten test również zawiedzie.
        // Jeśli beforeAll przejdzie, ten test spróbuje wysłać żądanie.
        console.log('[DIAGNOSTIC_TEST] Attempting a basic request...');
        const response = await request(BASE_URL).get('/api/users'); // Proste żądanie
        expect(response.status).toBe(200); // Oczekujemy, że serwer odpowie
    });
});