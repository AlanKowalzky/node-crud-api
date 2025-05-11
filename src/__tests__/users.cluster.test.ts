import request from 'supertest';
import { exec, ChildProcess } from 'child_process';
import path from 'path';
// import { v4 as uuidv4 } from 'uuid'; // Usunięto, jeśli nie jest używany
import * as dotenv from 'dotenv';

dotenv.config(); // Aby odczytać PORT z .env dla żądań

const PORT = parseInt(process.env.PORT || '4000', 10);
const BASE_URL = `http://localhost:${PORT}`;

describe('Users API - Cluster Mode E2E Tests', () => {
    let clusterProcess: ChildProcess | null = null;
    let createdUserForBasicScenario: { id?: string, username?: string, age?: number, hobbies?: string[] } = {};
    let createdUserForConsistencyTest: { id?: string, username?: string, age?: number, hobbies?: string[] } = {};

    beforeAll((done) => {
        // Ścieżka do głównego katalogu projektu
        const projectRoot = path.resolve(__dirname, '../../../'); 

        // Uruchamiamy aplikację w trybie klastra
        // Używamy ts-node bezpośrednio, aby uniknąć problemów z kompilacją w locie dla testów
        // Upewnij się, że ścieżka do ts-node jest poprawna lub jest w PATH
        // Alternatywnie, można by uruchomić "npm run start:multi"
        clusterProcess = exec( // TODO: Rozważyć użycie `spawn` dla lepszej kontroli nad strumieniami i sygnałami
            `cross-env CLUSTER_MODE=true ts-node ./src/index.ts`,
            { cwd: projectRoot }, // Uruchom w głównym katalogu projektu
            (error, stdout, stderr) => {
                if (error && !error.killed) { // Ignoruj błąd, jeśli proces został zabity przez nas
                    console.error(`Error starting cluster: ${error.message}`);
                    return done(error);
                }
                if (stderr) {
                    console.warn(`Cluster stderr: ${stderr}`);
                }
                if (stdout) {
                    // console.log(`Cluster stdout: ${stdout}`); // Opcjonalnie loguj stdout
                }
            }
        );

        // Dajemy trochę czasu na uruchomienie wszystkich workerów i load balancera
        // W bardziej zaawansowanym scenariuszu można by nasłuchiwać na logi lub próbować pingować serwer
        console.log('Waiting for cluster to start...');
        setTimeout(() => {
            console.log('Cluster should be started. Proceeding with tests.');
            done();
        }, process.env.CI ? 15000 : 7000); // Dłuższy czas dla CI
    });

    afterAll((done) => {
        if (clusterProcess) {
            console.log('Stopping cluster process...');
            clusterProcess.kill(); // Zabij proces główny klastra
            clusterProcess.on('exit', () => {
                console.log('Cluster process stopped.');
                done();
            });
        } else {
            done();
        }
    });

    // --- Scenariusz 1: Podstawowe operacje CRUD (podobne do standalone) ---
    describe('Basic CRUD Operations (Cluster Mode)', () => {
        test('1.1 POST /api/users - should create a new user', async () => {
            const newUser = {
                username: 'Cluster User Alpha',
                age: 30,
                hobbies: ['alpha testing', 'clustering']
            };
            const response = await request(BASE_URL).post('/api/users').send(newUser);
    
            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            expect(response.body.username).toBe(newUser.username);
            createdUserForBasicScenario = response.body;
        });
    
        test('1.2 GET /api/users/{userId} - should retrieve the created user', async () => {
            expect(createdUserForBasicScenario.id).toBeDefined();
            const response = await request(BASE_URL).get(`/api/users/${createdUserForBasicScenario.id}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(createdUserForBasicScenario.id);
            expect(response.body.username).toBe(createdUserForBasicScenario.username);
        });

        test('1.3 PUT /api/users/{userId} - should update the user', async () => {
            expect(createdUserForBasicScenario.id).toBeDefined();
            const updatedData = {
                username: 'Cluster User Alpha (Updated)',
                age: 31,
                hobbies: ['alpha testing', 'clustering', 'scaling']
            };
            const response = await request(BASE_URL).put(`/api/users/${createdUserForBasicScenario.id}`).send(updatedData);
            expect(response.status).toBe(200);
            expect(response.body.username).toBe(updatedData.username);
            expect(response.body.age).toBe(updatedData.age);
        });

        test('1.4 DELETE /api/users/{userId} - should delete the user', async () => {
            expect(createdUserForBasicScenario.id).toBeDefined();
            const response = await request(BASE_URL).delete(`/api/users/${createdUserForBasicScenario.id}`);
            expect(response.status).toBe(204);
        });

        test('1.5 GET /api/users/{userId} - should return 404 for the deleted user', async () => {
            expect(createdUserForBasicScenario.id).toBeDefined();
            const response = await request(BASE_URL).get(`/api/users/${createdUserForBasicScenario.id}`);
            expect(response.status).toBe(404);
        });
    });

    // --- Scenariusz 2: Obsługa błędów (podobne do standalone) ---
    describe('Error Handling (Cluster Mode)', () => {
        test('2.1 GET /api/users/{invalidUserId} - should return 400 for invalid userId', async () => {
            const response = await request(BASE_URL).get('/api/users/not-a-uuid');
            expect(response.status).toBe(400);
        });

        test('2.2 POST /api/users - should return 400 for missing required fields', async () => {
            const response = await request(BASE_URL).post('/api/users').send({ username: 'Missing Age' });
            expect(response.status).toBe(400);
        });
        
        test('2.3 GET /non-existent-endpoint - should return 404', async () => {
            const response = await request(BASE_URL).get('/api/non-existent');
            expect(response.status).toBe(404);
        });
    });

    // --- Scenariusz 3: Test spójności danych między workerami (specyficzny dla klastra) ---
    describe('Data Consistency Across Workers (Cluster Mode)', () => {
        const consistencyUser = {
            username: 'Consistency Test User',
            age: 42,
            hobbies: ['consistency', 'ipc']
        };

        test('3.1 POST /api/users - create user for consistency test', async () => {
            const response = await request(BASE_URL).post('/api/users').send(consistencyUser);
            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            createdUserForConsistencyTest = response.body;
        });

        test('3.2 GET /api/users/{userId} - retrieve user multiple times to hit different workers', async () => {
            expect(createdUserForConsistencyTest.id).toBeDefined();
            const numRequests = 5; // Wykonaj kilka żądań, aby zwiększyć szansę trafienia na różne workery
            for (let i = 0; i < numRequests; i++) {
                const response = await request(BASE_URL).get(`/api/users/${createdUserForConsistencyTest.id}`);
                expect(response.status).toBe(200);
                expect(response.body.id).toBe(createdUserForConsistencyTest.id);
                expect(response.body.username).toBe(consistencyUser.username);
                // console.log(`Consistency GET ${i+1} - Status: ${response.status}, User: ${response.body.username}`);
            }
        });

        test('3.3 PUT /api/users/{userId} - update user for consistency test', async () => {
            expect(createdUserForConsistencyTest.id).toBeDefined();
            const updatedConsistencyUser = {
                username: 'Consistency Test User (Updated)',
                age: 43,
                hobbies: ['consistency', 'ipc', 'updated']
            };
            const response = await request(BASE_URL).put(`/api/users/${createdUserForConsistencyTest.id}`).send(updatedConsistencyUser);
            expect(response.status).toBe(200);
            expect(response.body.username).toBe(updatedConsistencyUser.username);
            createdUserForConsistencyTest.username = updatedConsistencyUser.username; // Zaktualizuj oczekiwaną wartość
        });

        test('3.4 GET /api/users/{userId} - retrieve updated user multiple times', async () => {
            expect(createdUserForConsistencyTest.id).toBeDefined();
            const numRequests = 5;
            for (let i = 0; i < numRequests; i++) {
                const response = await request(BASE_URL).get(`/api/users/${createdUserForConsistencyTest.id}`);
                expect(response.status).toBe(200);
                expect(response.body.id).toBe(createdUserForConsistencyTest.id);
                expect(response.body.username).toBe(createdUserForConsistencyTest.username); // Sprawdź zaktualizowaną nazwę
            }
        });

        test('3.5 DELETE /api/users/{userId} - delete user for consistency test', async () => {
            expect(createdUserForConsistencyTest.id).toBeDefined();
            const response = await request(BASE_URL).delete(`/api/users/${createdUserForConsistencyTest.id}`);
            expect(response.status).toBe(204);
        });

        test('3.6 GET /api/users/{userId} - verify user is deleted across workers', async () => {
            expect(createdUserForConsistencyTest.id).toBeDefined();
            const numRequests = 5;
            for (let i = 0; i < numRequests; i++) {
                const response = await request(BASE_URL).get(`/api/users/${createdUserForConsistencyTest.id}`);
                expect(response.status).toBe(404);
            }
        });
    });
});