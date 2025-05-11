import http from 'http';

export const handleServerError = (error: unknown, res: http.ServerResponse) => {
  console.error('Unexpected server error:', error);
  // Upewnij się, że res.end jest zawsze wywoływane, nawet jeśli res już zostało zakończone
  if (!res.writableEnded) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Internal Server Error. Please try again later.' }));
  }
};