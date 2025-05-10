import http from 'http';
import * as dotenv from 'dotenv';
import * as userController from './userController';

dotenv.config();

const PORT = process.env.PORT || 4000;

const handleServerError = (error: unknown, res: http.ServerResponse) => {
  console.error('Unexpected server error:', error);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  // Upewnij się, że res.end jest zawsze wywoływane, nawet jeśli res już zostało zakończone
  if (!res.writableEnded) {
    res.end(JSON.stringify({ message: 'Internal Server Error. Please try again later.' }));
  }
};

const server = http.createServer((req, res) => {
  try {
    const { method, url } = req;

    // Routing dla /api/users
    if (url && url.startsWith('/api/users')) {
      const urlParts = url.split('/'); // np. ['', 'api', 'users', 'userId', 'extra']
      const userIdSegment = urlParts[3];
      const hasExtraSegments = urlParts.length > 4;

      if (method === 'GET' && !userIdSegment && !hasExtraSegments) { // GET /api/users
        userController.getUsers(req, res);
      } else if (method === 'GET' && userIdSegment && !hasExtraSegments) { // GET /api/users/{userId}
        userController.getUserById(req, res, userIdSegment);
      } else if (method === 'POST' && !userIdSegment && !hasExtraSegments) { // POST /api/users
        userController.createUser(req, res);
      } else if (method === 'PUT' && userIdSegment && !hasExtraSegments) { // PUT /api/users/{userId}
        userController.updateUser(req, res, userIdSegment);
      } else if (method === 'DELETE' && userIdSegment && !hasExtraSegments) { // DELETE /api/users/{userId}
        userController.deleteUser(req, res, userIdSegment);
      } else {
        // Nieznany endpoint w ramach /api/users lub nieobsługiwana metoda
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `Resource not found at ${url}` }));
      }
    } else {
      // Endpoint nie zaczyna się od /api/users
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Resource not found' }));
    }
  } catch (error) {
    // Globalna obsługa błędów serwera
    handleServerError(error, res);
  }
});

// Uruchom serwer tylko, jeśli plik jest wykonywany bezpośrednio
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });
}

export default server; // Wyeksportuj serwer dla testów