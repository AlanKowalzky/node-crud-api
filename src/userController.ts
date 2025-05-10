import { IncomingMessage, ServerResponse } from 'http';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { User } from './user.types';
import { users } from './database';

export const getUsers = (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(users));
};

export const getUserById = (_req: IncomingMessage, res: ServerResponse, userId: string) => {
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
};

export const createUser = (req: IncomingMessage, res: ServerResponse) => {
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
};

export const updateUser = (req: IncomingMessage, res: ServerResponse, userId: string) => {
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
            const updatedUser: User = { id: userToUpdate.id, username, age, hobbies };
            users[userIndex] = updatedUser;

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(updatedUser));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: 'Invalid JSON in request body' }));
        }
    });
};

export const deleteUser = (_req: IncomingMessage, res: ServerResponse, userId: string) => {
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
};