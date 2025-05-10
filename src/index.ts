import http from 'http';
import * as dotenv from 'dotenv';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
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
      if (!uuidValidate(userId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }));
        return;
      }

      const user = users.find(u => u.id === userId);

      if (user) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(user));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `User with id ${userId} not found` }));
      }
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
          if (typeof username !== 'string' || typeof age !== 'number' || !Array.isArray(hobbies) || !hobbies.every(h => typeof h === 'string')) {
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

    // PUT /api/users/{userId}
    if (method === 'PUT' && userId) {
      if (!uuidValidate(userId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }));
        return;
      }

      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `User with id ${userId} not found` }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        // Sprawdź ponownie, czy użytkownik pod userIndex nadal istnieje.
        // Pomaga to analizie przepływu w TypeScript i dodaje trochę odporności.
        const userToUpdate = users[userIndex];

        if (!userToUpdate) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ message: `User with id '${userId}' not found for update (possibly deleted concurrently).` }));
          return;
        }

        try {
          const { username, age, hobbies } = JSON.parse(body);
          if (typeof username !== 'string' || typeof age !== 'number' || !Array.isArray(hobbies) || !hobbies.every(h => typeof h === 'string')) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: 'Request body does not contain required fields or fields are of incorrect type for update' }));
            return;
          }

        //   const updatedUser: User = { ...users[userIndex], username, age, hobbies };
          // Teraz bezpiecznie jest użyć userToUpdate.id
          const updatedUser: User = { id: userToUpdate.id, username, age, hobbies };
          users[userIndex] = updatedUser;

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(updatedUser));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ message: 'Invalid JSON in request body' }));
        }
      });
      return;
    }

    // DELETE /api/users/{userId}
    if (method === 'DELETE' && userId) {
      if (!uuidValidate(userId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }));
        return;
      }

      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `User with id ${userId} not found` }));
        return;
      }

      users.splice(userIndex, 1);
      res.writeHead(204, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end();
      return;
    }

  } else {
    // Obsługa nieistniejących endpointów (zostanie dopracowana w Etapie 2)
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Resource not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});