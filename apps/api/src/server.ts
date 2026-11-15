import {loadConfig} from './config.js';
import {buildApp} from './app.js';
const config=loadConfig();
const app=await buildApp(config);
try{await app.listen({port:config.PORT,host:config.HOST})}
catch(e){app.log.error(e);process.exit(1)}
