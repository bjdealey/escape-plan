import 'dotenv/config';
import { createApp } from './app.js';
import { providerStatus } from './providers/index.js';

const PORT = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(PORT, () => {
  console.log(`Escape Plan API listening on http://localhost:${PORT}`);
  const live = Object.entries(providerStatus())
    .filter(([, v]) => v === 'live')
    .map(([k]) => k);
  console.log(
    live.length ? `Live providers: ${live.join(', ')}` : 'All providers using seeded mocks',
  );
});
