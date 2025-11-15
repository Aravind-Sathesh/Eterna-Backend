import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

const app = express();

app.get('/', (_req, res) => {
  res.json({ message: 'API Gateway', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
