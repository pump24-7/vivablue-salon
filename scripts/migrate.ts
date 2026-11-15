// Keep the documented root entry point; dependencies belong to the API package.
import {runMigrations} from '../apps/api/src/migrations.js';
const connectionString=process.env.MIGRATION_DATABASE_URL;
if(!connectionString)throw Error('MIGRATION_DATABASE_URL required. Never run against Nestease production.');
runMigrations(connectionString).catch(error=>{console.error(error);process.exitCode=1});
