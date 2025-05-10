import request from 'supertest';
import server from '../index'; // Importujemy nasz serwer
import { users } from '../database'; // Importujemy naszą "bazę danych" w pamięci

describe('Users API - Basic Scenario', () => {
    let createdUserId: string;

    // Czyścimy bazę danych przed każdym testem w tym bloku describe
    // To ważne, aby testy były od siebie niezależne
    beforeAll(() => {
        users.length = 0; // Prosty sposób na wyczyszczenie tablicy w pamięci
    });

    // afterAll((done) => {
    //     server.close(done); // Zamykamy serwer po wszystkich testach w tym pliku
    afterAll(async () => {
        // Używamy async/await dla server.close(), które zwraca Promise, jeśli nie ma callbacka
        // To może pomóc w bardziej niezawodnym zamknięciu serwera.
        if (server.listening) {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    test('1. GET /api/users - should return an empty array initially', async () => {
        const response = await request(server).get('/api/users');
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('2. POST /api/users - should create a new user', async () => {
        const newUser = {
            username: 'Test User One',
            age: 30,
            hobbies: ['testing', 'coding']
        };
        const response = await request(server).post('/api/users').send(newUser);

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.username).toBe(newUser.username);
        expect(response.body.age).toBe(newUser.age);
        expect(response.body.hobbies).toEqual(newUser.hobbies);

        createdUserId = response.body.id; // Zapisujemy ID do późniejszego użycia
    });

    test('3. GET /api/users/{userId} - should retrieve the created user', async () => {
        // Ten test zależy od poprzedniego, upewnij się, że createdUserId jest ustawione
        expect(createdUserId).toBeDefined(); // Małe zabezpieczenie
        const response = await request(server).get(`/api/users/${createdUserId}`);
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(createdUserId);
        expect(response.body.username).toBe('Test User One'); // Sprawdź dane, które zostały utworzone
    });
});