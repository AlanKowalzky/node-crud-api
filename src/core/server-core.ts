import http from 'http';
import * as userController from '../userController';
import { handleServerError } from '../utils/handleServerError';
import cluster from 'cluster';

export class ServerCore {
  static createServer() {
    return http.createServer((req, res) => {
      try {
        const { method, url } = req;

        if (url?.startsWith('/api/users')) {
          const urlParts = url.split('/');
          const userIdSegment = urlParts[3];
          const hasExtraSegments = urlParts.length > 4;

          if (method === 'GET' && !userIdSegment && !hasExtraSegments) {
            userController.getUsers(req, res);
          } else if (method === 'GET' && userIdSegment && !hasExtraSegments) {
            userController.getUserById(req, res, userIdSegment);
          } else if (method === 'POST' && !userIdSegment && !hasExtraSegments) {
            userController.createUser(req, res);
          } else if (method === 'PUT' && userIdSegment && !hasExtraSegments) {
            userController.updateUser(req, res, userIdSegment);
          } else if (
            method === 'DELETE' &&
            userIdSegment &&
            !hasExtraSegments
          ) {
            userController.deleteUser(req, res, userIdSegment);
          } else {
            res.writeHead(404, {
              'Content-Type': 'application/json; charset=utf-8',
            });
            res.end(
              JSON.stringify({
                message: `Resource not found at ${url} ${cluster.isWorker ? `on worker ${process.pid}` : ''}`,
              }),
            );
          }
        } else if (url === '/api/test-500-error' && method === 'GET') {
          throw new Error('Intentional test error for 500 status');
        } else {
          res.writeHead(404, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(
            JSON.stringify({
              message: `Resource not found ${cluster.isWorker ? `on worker ${process.pid}` : ''}`,
            }),
          );
        }
      } catch (error) {
        handleServerError(error, res);
      }
    });
  }
}
