import dotenv from 'dotenv';

// async function main(): Promise<void> {
//   try {
//     const summary = await generateSummary();
//     console.log('Summary Output:\n', summary);
//   } catch (error) {
//     console.error('Error in main:', error);
//   }
// }
// main();
import app from './app.ts';

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
