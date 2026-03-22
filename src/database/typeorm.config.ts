import 'reflect-metadata';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/entities/*.ts', 'dist/src/entities/*.js'],
  migrations: ['migrations/*.ts', 'dist/migrations/*.js'],
});
