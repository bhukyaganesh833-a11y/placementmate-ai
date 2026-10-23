import pino from 'pino';
import { config } from './config/env.js';
import { createApp } from './app.js';
import { createOpportunityRepository } from './repositories/index.js';
import { seedSampleOpportunities } from './data/sampleOpportunities.js';

const logger = pino({ level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] });

const opportunityRepo = await createOpportunityRepository();
// Local convenience: the in-memory store starts empty, so load labelled sample data.
if (config.DATA_STORE === 'memory' && config.NODE_ENV === 'development') {
  await seedSampleOpportunities(opportunityRepo);
  logger.warn('Loaded SAMPLE data into the in-memory store (not real listings)');
}

const app = createApp({ opportunityRepo, logger });

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, store: config.DATA_STORE, env: config.NODE_ENV }, 'PlacementMate API listening');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
  });
}
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
