// Start one existing application or the local Keycloak provider in the foreground.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const state=resolve(root,'work/dev');
const command=process.argv[2];
if(!['api','admin','mobile','auth'].includes(command))throw Error('Usage: node scripts/dev/run.mjs api|admin|mobile|auth');
const ca=resolve(state,'tls/ca.crt');
if(!existsSync(ca))throw Error('Run node scripts/dev/setup.mjs first.');
const env={...process.env,NODE_ENV:'development',NODE_EXTRA_CA_CERTS:ca};
let executable='npm';
let args=['--prefix',resolve(root,'apps',command),'run',command==='mobile'?'start':'dev'];
if(command==='mobile'){
 // Expo 54 supports an explicit state directory; keep it in the writable local
 // development area without changing HOME or the user's global Expo account.
 const expoState=resolve(state,'expo');mkdirSync(expoState,{recursive:true,mode:0o700});
 Object.assign(env,{EXPO_NO_TELEMETRY:'1',EXPO_NO_CACHE:'1',__UNSAFE_EXPO_HOME_DIRECTORY:expoState});
 args.push('--','--localhost');
}
if(command==='admin'){
 env.NEXT_TELEMETRY_DISABLED='1';
 args.push('--','--hostname','127.0.0.1');
}
if(command==='auth'){
 executable=process.env.VIVABLUE_KEYCLOAK_BIN??'';
 if(!executable||!existsSync(executable))throw Error('Set VIVABLUE_KEYCLOAK_BIN to the installed Keycloak 26.8.2 bin/kc.sh (kc.bat on Windows).');
 const secrets=JSON.parse(readFileSync(resolve(state,'credentials.json'),'utf8'));
 Object.assign(env,{
  KC_BOOTSTRAP_ADMIN_USERNAME:'local-dev-admin',KC_BOOTSTRAP_ADMIN_PASSWORD:secrets.keycloakAdminPassword,
  JAVA_OPTS_APPEND:'-Xms64m -Xmx512m'
 });
 // Import by explicit filename, retaining existing realms and their users.
 // kc.data.dir is relative to the Keycloak installation, even on POSIX.
 const dataDir='-Dkc.data.dir='+relative(dirname(dirname(resolve(executable))),resolve(state,'keycloak'));
 const imported=spawnSync(executable,[dataDir,'import','--db=dev-file',
  '--file='+resolve(state,'keycloak/import/vivablue-dev-realm.json'),'--override=false'],{cwd:root,env,stdio:'inherit',shell:process.platform==='win32'});
 if(imported.error||imported.status!==0)throw Error('Local realm import failed. '+(imported.error?.message??''));
 args=[dataDir,
  'start','--db=dev-file','--cache=local','--http-enabled=false','--http-host=127.0.0.1','--https-port=8443',
  '--hostname=https://localhost:8443','--https-certificate-file='+resolve(state,'tls/server.crt'),
  '--https-certificate-key-file='+resolve(state,'tls/server.key')];
}
const child=spawn(executable,args,{cwd:root,env,stdio:'inherit',detached:process.platform!=='win32',shell:process.platform==='win32'});
child.on('error',error=>{console.error(error.message);process.exitCode=1});
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 stopping=true;
 try{if(process.platform==='win32')child.kill(signal);else if(child.pid)process.kill(-child.pid,signal)}
 catch(error){if(error.code!=='ESRCH')throw error}
});
child.on('exit',code=>{process.exitCode=stopping?0:(code??1)});
