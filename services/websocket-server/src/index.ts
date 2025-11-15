import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3002;

const server = http.createServer();

server.listen(PORT, () => {
  console.log(`WebSocket Server running on port ${PORT}`);
});
