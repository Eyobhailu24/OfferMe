import { configuration } from './config.js';
import { createApplication } from './application.js';

const config = configuration();
const runtime = await createApplication(config, { migrate: !config.production });
await runtime.app.listen(config.port, config.host);
console.log('OFFERME API: http://' + config.host + ':' + config.port);
console.log('API documentation: http://' + config.host + ':' + config.port + '/docs');
if (!config.production && !process.env.AFROMESSAGE_TOKEN) console.log('Development mode: phone verification codes appear in this terminal; no SMS is sent.');
let closing = false;
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, async () => {
  if (closing) return; closing = true;
  await runtime.close(); process.exit(0);
});
