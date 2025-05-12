import { ServerCore } from '../core/server-core';
import * as dotenv from 'dotenv';

dotenv.config();

export function startStandaloneServer(port: number) {
  
  const server = ServerCore.createServer();

  server.listen(port, () => {
    console.log(`Server (single instance) is listening on port ${port}`);
  });

  return server;
}
