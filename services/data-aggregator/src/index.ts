import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;

const server = http.createServer();

server.listen(PORT, () => {
  console.log(`Data Aggregator Service running on port ${PORT}`);
});
