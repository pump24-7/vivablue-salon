import {z} from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 HOST:z.string().default('0.0.0.0'),PORT:z.coerce.number().int().min(1).max(65535).default(4000),
 DATABASE_URL:z.string().min(10),CORS_ORIGINS:z.string().min(1),
 AUTH_ISSUER:z.string().url(),AUTH_AUDIENCE:z.string().min(1),AUTH_JWKS_URL:z.string().url(),
 S3_BUCKET:z.string().optional(),MEDIA_UPLOADS_ENABLED:z.enum(['true','false']).default('false').transform(x=>x==='true'),AWS_REGION:z.string().default('us-east-1')
});
export type Config=z.infer<typeof schema>;
export function loadConfig():Config{return schema.parse(process.env)}
