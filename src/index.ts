import dotenv from 'dotenv';

import app from './app.ts';
import { runPineCone } from './pinecone/pineconeClient.ts';

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

runPineCone().catch(console.error);
