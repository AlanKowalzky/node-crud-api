import { IncomingMessage, ServerResponse } from 'http';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { User } from './user.types';
import cluster from 'cluster';
import { users as localUsersDatabase } from './database';

interface PrimaryIPCResponse {
  requestId: string;
  from: 'primary';
  payload?: unknown;
  error?: { message: string } | null;
}

const sendIpcRequest = (type: string, payload?: unknown): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    if (!cluster.isWorker || !process.send) {
      return reject(
        new Error(
          'IPC channel not available. Not a forked worker or process.send is undefined.',
        ),
      );
    }

    const requestId = Math.random().toString(36).substring(2, 15) + Date.now();
    const message = { type, payload, requestId, from: 'worker' };

    const onMessageHandler = (response: PrimaryIPCResponse) => {
      if (response.requestId === requestId && response.from === 'primary') {
        process.removeListener('message', onMessageHandler);
        if (response.error) {
          reject(
            new Error(
              response.error.message || 'IPC request failed in primary process',
            ),
          );
        } else {
          resolve(response.payload);
        }
      }
    };
    process.on('message', onMessageHandler);
    process.send(message);
  });
};

export const getUsers = async (_req: IncomingMessage, res: ServerResponse) => {
  try {
    let usersList: User[];
    if (cluster.isWorker) {
      usersList = (await sendIpcRequest('getUsers')) as User[];
    } else {
      usersList = [...localUsersDatabase];
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(usersList));
  } catch (error: unknown) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to get users',
      }),
    );
  }
};

export const getUserById = async (
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
) => {
  if (!uuidValidate(userId)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }),
    );
  }
  try {
    let user: User | undefined;
    if (cluster.isWorker) {
      user = (await sendIpcRequest('getUserById', { userId })) as
        | User
        | undefined;
    } else {
      user = localUsersDatabase.find((u) => u.id === userId);
      if (!user) throw new Error(`User with id ${userId} not found`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(user));
  } catch (error: unknown) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    const message =
      error instanceof Error
        ? error.message
        : `User with id ${userId} not found`;
    res.end(JSON.stringify({ message }));
  }
};

export const createUser = async (req: IncomingMessage, res: ServerResponse) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    try {
      const { username, age, hobbies } = JSON.parse(body);
      if (
        typeof username !== 'string' ||
        typeof age !== 'number' ||
        !Array.isArray(hobbies) ||
        !hobbies.every((h) => typeof h === 'string')
      ) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        return res.end(
          JSON.stringify({
            message:
              'Request body does not contain required fields or fields are of incorrect type',
          }),
        );
      }

      let createdUser: User;
      if (cluster.isWorker) {
        const newUserPayload = { username, age, hobbies };
        createdUser = (await sendIpcRequest(
          'createUser',
          newUserPayload,
        )) as User;
      } else {
        createdUser = { id: uuidv4(), username, age, hobbies };
        localUsersDatabase.push(createdUser);
      }

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(createdUser));
    } catch (error: unknown) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      const message =
        error instanceof Error
          ? error.message
          : 'Invalid JSON in request body or error creating user';
      res.end(JSON.stringify({ message }));
    }
  });
};

export const updateUser = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
) => {
  if (!uuidValidate(userId)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }),
    );
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    try {
      const { username, age, hobbies } = JSON.parse(body);
      if (
        typeof username !== 'string' ||
        typeof age !== 'number' ||
        !Array.isArray(hobbies) ||
        !hobbies.every((h) => typeof h === 'string')
      ) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        return res.end(
          JSON.stringify({
            message:
              'Request body does not contain required fields or fields are of incorrect type for update',
          }),
        );
      }

      let updatedUserResponse: User | undefined;
      if (cluster.isWorker) {
        const updateUserPayload = {
          userId,
          userData: { username, age, hobbies },
        };
        updatedUserResponse = (await sendIpcRequest(
          'updateUser',
          updateUserPayload,
        )) as User | undefined;
      } else {
        const userIndex = localUsersDatabase.findIndex((u) => u.id === userId);
        if (userIndex === -1) {
          throw new Error(`User with id ${userId} not found for update`);
        }
        localUsersDatabase[userIndex] = {
          ...localUsersDatabase[userIndex],
          username,
          age,
          hobbies,
          id: userId,
        };
        updatedUserResponse = localUsersDatabase[userIndex];
      }
      if (!updatedUserResponse)
        throw new Error('Update failed or user not found');

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(updatedUserResponse));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Invalid JSON in request body or error updating user';
      const statusCode = errorMessage.toLowerCase().includes('not found')
        ? 404
        : 400;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify({ message: errorMessage }));
    }
  });
};

export const deleteUser = async (
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
) => {
  if (!uuidValidate(userId)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({ message: 'Invalid userId format (not a valid UUID)' }),
    );
  }
  try {
    if (cluster.isWorker) {
      await sendIpcRequest('deleteUser', { userId });
    } else {
      const userIndex = localUsersDatabase.findIndex((u) => u.id === userId);
      if (userIndex === -1) {
        throw new Error(`User with id ${userId} not found for deletion`);
      }
      localUsersDatabase.splice(userIndex, 1);
    }
    res.writeHead(204, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end();
  } catch (error: unknown) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    const message =
      error instanceof Error
        ? error.message
        : `User with id ${userId} not found`;
    res.end(JSON.stringify({ message }));
  }
};
