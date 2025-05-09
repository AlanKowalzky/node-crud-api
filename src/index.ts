import http from 'http';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { User } from './user.types';
import { users } from './database';

dotenv.config();

const PORT = process.env.PORT || 4000;

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // Logika dla /api/users
  if (url && url.startsWith('/api/users')) {
    const urlParts = url.split('/');
    const userId = urlParts.length > 3 ? urlParts[3] : null;

    // GET /api/users
    if (method === 'GET' && !userId) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(users));
      return;
    }

    // GET /api/users/{userId}
    if (method === 'GET' && userId) {
      // TODO: Implement GET /api/users/{userId}
      // Pamiętaj o walidacji UUID (400), nieznalezionym użytkowniku (404)
      res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Not Implemented Yet' }));
      return;
    }

    // POST /api/users
    if (method === 'POST' && !userId) {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { username, age, hobbies } = JSON.parse(body);
          if (!username || typeof age !== 'number' || !Array.isArray(hobbies)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: 'Request body does not contain required fields or fields are of incorrect type' }));
            return;
          }

          const newUser: User = { id: uuidv4(), username, age, hobbies };
          users.push(newUser);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(newUser));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ message: 'Invalid JSON in request body' }));
        }
      });
      return;
    }

    // TODO: Implement PUT /api/users/{userId}
    // TODO: Implement DELETE /api/users/{userId}

  } else {
    // Obsługa nieistniejących endpointów (zostanie dopracowana w Etapie 2)
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Resource not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});