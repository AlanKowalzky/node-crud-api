import cluster, { Worker } from 'cluster'; // Importujemy typ Worker
import os from 'os';
import http from 'http';
import { User } from '../user.types';
import { users } from '../database';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config(); // Aby odczytać PORT z .env

export class ClusterMain {
    private port: number;
    private numCPUs: number;
    // Zmieniamy typ, aby ułatwić zarządzanie portami
    // Będziemy tu przechowywać tylko workery, które potwierdziły gotowość
    private activeWorkers: { worker: Worker, port: number }[] = [];
    private nextWorkerIndex = 0;

    constructor(port: number) {
        this.port = port;
        this.numCPUs = os.cpus().length;
    }
    // Zmieniamy typ parametru workerProcess
    private workerMessageHandler(workerProcess: Worker, msg: any) { // Używamy zaimportowanego typu Worker
        if (msg.from === 'worker' && msg.requestId) {
            let responsePayload: any;
            let errorResponse: { message: string } | null = null;

            // Logika obsługi IPC (taka sama jak w poprzedniej implementacji cluster-main)
            switch (msg.type) {
                case 'getUsers':
                    responsePayload = [...users];
                    break;
                case 'getUserById':
                    const user = users.find(u => u.id === msg.payload.userId);
                    if (user) responsePayload = { ...user };
                    else errorResponse = { message: 'User not found' };
                    break;
                case 'createUser':
                    const newUser: User = { id: uuidv4(), ...msg.payload };
                    users.push(newUser);
                    responsePayload = { ...newUser };
                    break;
                case 'updateUser':
                    const userIndexUpdate = users.findIndex(u => u.id === msg.payload.userId);
                    if (userIndexUpdate !== -1) {
                        users[userIndexUpdate] = { ...users[userIndexUpdate], ...msg.payload.userData, id: msg.payload.userId };
                        responsePayload = { ...users[userIndexUpdate] };
                    } else {
                        errorResponse = { message: 'User not found for update' };
                    }
                    break;
                case 'deleteUser':
                    const userIndexDelete = users.findIndex(u => u.id === msg.payload.userId);
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
            workerProcess.send({ requestId: msg.requestId, payload: responsePayload, error: errorResponse, from: 'primary' });
        }
    }

    public start() {
        console.log(`Primary process ${process.pid} is running. Main server on port ${this.port}.`);
        const numWorkersToFork = Math.max(1, this.numCPUs - 1);
        console.log(`Forking ${numWorkersToFork} worker processes...`);

        // Ustawiamy, że workery mają uruchamiać główny plik index.ts,
        // który sam zdecyduje (na podstawie cluster.isWorker), aby uruchomić worker-server.ts
        // cluster.setupPrimary({ exec: './src/index.ts' }); // To jest domyślne zachowanie forka

        for (let i = 0; i < numWorkersToFork; i++) {
            const workerPort = this.port + i + 1;
            const worker = cluster.fork({ WORKER_PORT: workerPort.toString(), CLUSTER_MODE: 'true' });
            
            // Nasłuchuj na wiadomość 'listening' od workera, zanim dodasz go do puli aktywnych
            worker.on('listening', (address) => {
                console.log(`Worker ${worker.process.pid} is now listening on port ${address.port || workerPort}`);
                // Dodajemy workera do puli dopiero, gdy jest gotowy
                if (!this.activeWorkers.find(wEntry => wEntry.worker.id === worker.id)) {
                    this.activeWorkers.push({ worker, port: workerPort });
                }
            });

            worker.on('message', (msg) => this.workerMessageHandler(worker, msg));
            // console.log(`Worker ${worker.process.pid} forked, will be listening on port ${workerPort}`);
        }

        cluster.on('exit', (exitedWorker, _code, _signal) => { // Nieużywane code i signal
            console.log(`Worker ${exitedWorker.process.pid} died. Forking a new one...`);
            
            // Znajdź i usuń martwego workera z naszej listy
            const workerArrayIndex = this.activeWorkers.findIndex((wEntry: { worker: Worker, port: number }) => wEntry.worker && wEntry.worker.id === exitedWorker.id);
            let portToReuse: number;

            if (workerArrayIndex !== -1) {
                const workerEntry = this.activeWorkers[workerArrayIndex];
                if (workerEntry) { // Dodatkowe sprawdzenie
                    portToReuse = workerEntry.port;
                    this.activeWorkers.splice(workerArrayIndex, 1);
                    console.log(`Worker ${exitedWorker.process.pid} was listening on port ${portToReuse}. Attempting to reuse.`);
                } else { // Ten przypadek nie powinien wystąpić, ale dla bezpieczeństwa
                    portToReuse = this.findNextAvailablePort(); // Użyj this.findNextAvailablePort()
                }
            } else {
                // Jeśli z jakiegoś powodu nie znaleźliśmy go na liście, przypisz nowy port
                // Ta sytuacja nie powinna wystąpić przy poprawnej logice.
                console.warn(`Could not find exited worker ${exitedWorker.process.pid} in the active list. Assigning a new port.`);
                portToReuse = this.findNextAvailablePort();
            }

            const newWorker = cluster.fork({ WORKER_PORT: portToReuse.toString(), CLUSTER_MODE: 'true' });
            // Dodajemy nowego workera do activeWorkers dopiero po sygnale 'listening'
            newWorker.on('listening', (address: { port?: number }) => { // Dodano typ dla address
                console.log(`New worker ${newWorker.process.pid} is now listening on port ${address.port || portToReuse}`);
                if (!this.activeWorkers.find(wEntry => wEntry.worker.id === newWorker.id)) {
                    this.activeWorkers.push({ worker: newWorker, port: portToReuse });
                }
            });
            newWorker.on('message', (msg) => this.workerMessageHandler(newWorker, msg));
            // console.log(`New worker ${newWorker.process.pid} forked, will be listening on port ${portToReuse}`);
        });

        http.createServer((req, res) => {
            if (this.activeWorkers.length === 0) {
                res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ message: 'Service Unavailable - No workers available' }));
                return;
            }
            // Upewnij się, że nextWorkerIndex jest zawsze w zakresie
            this.nextWorkerIndex = this.nextWorkerIndex % this.activeWorkers.length;
            const targetWorkerEntry = this.activeWorkers[this.nextWorkerIndex];
            
            if (!targetWorkerEntry || !targetWorkerEntry.worker) { // Sprawdzenie, czy targetWorkerEntry i worker są zdefiniowane
                console.error('Load balancer: Target worker entry or worker is undefined.');
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ message: 'Internal server error: Could not select a worker.' }));
                return;
            }
            const workerPort = targetWorkerEntry.port;

            const proxyReq = http.request(
                { host: 'localhost', port: workerPort, path: req.url, method: req.method, headers: req.headers },
                (proxyRes) => { res.writeHead(proxyRes.statusCode || 500, proxyRes.headers); proxyRes.pipe(res, { end: true }); }
            );
            proxyReq.on('error', (_err) => { // Nieużywany err
                console.error(`Load balancer proxy error to worker ${targetWorkerEntry.worker.process?.pid || 'unknown'} on port ${workerPort}:`, _err);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ message: 'Error connecting to worker service.' }));
            });
            req.pipe(proxyReq, { end: true });
            this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.activeWorkers.length;
        }).listen(this.port);
    }

    private findNextAvailablePort(): number {
        // Prosta logika znajdująca następny wolny port, można ją ulepszyć
        const usedPorts = this.activeWorkers.map((w: { worker: Worker, port: number }) => w.port); // Dodano typ dla w
        let nextPort = this.port + 1;
        while(usedPorts.includes(nextPort)) {
            nextPort++;
        }
        return nextPort;
    }
}