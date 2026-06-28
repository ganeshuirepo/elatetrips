import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../common/logger';

/**
 * Owns the MongoDB connection lifecycle. Kept separate from the Express app so
 * the transport layer and the data layer can evolve independently.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.mongoUri);
  logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
