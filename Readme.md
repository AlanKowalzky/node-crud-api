# Simple CRUD API

This is a simple CRUD API implementation created as part of an assignment. The application uses an in-memory database.

## Requirements

- Node.js v22.14.0 or higher.
- Allowed external tools: nodemon, dotenv, cross-env, typescript, ts-node, ts-node-dev, eslint and its plugins, webpack-cli, webpack and its plugins and loaders, prettier, uuid, @types/*, and libraries used for testing.

## Installation

1. Clone the repository (or download the project files).
2. Navigate to the project's root directory:
   ```bash
   cd node-crud-api
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## API Endpoints

The API provides the following endpoints for managing users:

- **`GET /api/users`**: Get all users.
  - Responds with status code 200 and an array of all user records.
- **`GET /api/users/{userId}`**: Get a specific user by their ID.
  - Responds with status code 200 and the user record if it exists.
  - Responds with status code 400 and a corresponding message if `userId` is invalid (not a UUID).
  - Responds with status code 404 and a corresponding message if a user with `id === userId` doesn't exist.
- **`POST /api/users`**: Create a new user.
  - Responds with status code 201 and the newly created user record.
  - Responds with status code 400 and a corresponding message if the request body does not contain required fields (`username`, `age`, `hobbies`) or if fields have incorrect types.
- **`PUT /api/users/{userId}`**: Update an existing user.
  - Responds with status code 200 and the updated user record.
  - Responds with status code 400 and a corresponding message if `userId` is invalid (not a UUID) or if the request body is invalid.
  - Responds with status code 404 and a corresponding message if a user with `id === userId` doesn't exist.
- **`DELETE /api/users/{userId}`**: Delete an existing user.
  - Responds with status code 204 if the record is found and deleted.
  - Responds with status code 400 and a corresponding message if `userId` is invalid (not a UUID).
  - Responds with status code 404 and a corresponding message if a user with `id === userId` doesn't exist.

## User Data Structure

Users are stored as objects with the following properties:

- `id`: `string` (UUID), unique identifier generated on the server side.
- `username`: `string`, required.
- `age`: `number`, required.
- `hobbies`: `string[]` (array of strings or an empty array), required.

## Error Handling

- Requests to non-existing endpoints (e.g., `/api/non-existent-resource`) will respond with status code 404 and a human-friendly message.
- Server-side errors that occur during request processing will be handled and respond with status code 500 and a human-friendly message.

## Configuration

The port on which the application runs is stored in a `.env` file. Create a `.env` file in the root of the project with the following content:
```
PORT=4000
```
You can change `4000` to any desired port.

## Running the Application

### Development Mode

To run the application in development mode (with automatic reloading on code changes using `ts-node-dev`):
```bash
npm run start:dev
```
The application will listen on the port specified in the `.env` file (defaulting to 4000 if not set).

### Production Mode (Standalone)

To build the application and run it in production mode as a single process:
```bash
npm run start:prod
```
This command first builds the TypeScript code into JavaScript (in the `dist` directory) and then runs the compiled application.

### Production Mode (Clustered with Load Balancer)

To build the application and run it in production mode using the Node.js Cluster API for horizontal scaling:
```bash
npm run start:prod:multi
```
This will start multiple instances of the application (equal to the number of available CPU cores - 1). A load balancer (the primary process) will listen on the `PORT` specified in `.env` and distribute requests to worker processes using a Round-robin algorithm. Worker processes will listen on subsequent ports (e.g., `PORT + 1`, `PORT + 2`, etc.).

## Testing

The project includes API integration tests covering basic CRUD operations, error handling, and data consistency in cluster mode. Tests are implemented using Jest and Supertest.

To run all tests (this includes building the project for cluster tests):
```bash
npm test
```
Alternatively, to run tests with more detailed output:
```bash
npm run test:verbose
```
To run only the cluster-specific tests (after building the project):
```bash
npm run test:multi
```

### Test Scenarios Covered:

- **Basic CRUD Operations:** Full lifecycle of a user (GET all, POST, GET by ID, PUT, DELETE, GET deleted by ID) in both standalone and cluster modes.
- **Error Handling:** Testing invalid UUID formats (400), non-existent users (404), missing required fields in request body (400), and requests to non-existent endpoints (404).
- **Data Consistency in Cluster Mode:** Verifying that users created, updated, and deleted via the load balancer are accessible and consistent across different worker processes.