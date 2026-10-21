const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
const {randomUUID,randomBytes}=require('node:crypto');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/pushNotifications.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(options={}){
 const secure=options.secure??new Map(),local=options.local??new Map(),requests=[],calls={native:0,prompts:0,channels:0,imports:0,secureOptions:[],tokenOptions:[],permissionOptions:[]};
 let token='ExpoPushToken[abcdefghijklmnop]';
 const permission=()=>({granted:options.granted??true,canAskAgain:options.canAsk??true,ios:options.iosStatus!==undefined?{status:options.iosStatus}:undefined});
 const native={getPermissionsAsync:async()=>permission(),requestPermissionsAsync:async value=>{calls.prompts++;calls.permissionOptions.push(value);Object.assign(options,options.permissionResult);return permission();},IosAuthorizationStatus:{NOT_DETERMINED:0,DENIED:1,AUTHORIZED:2,PROVISIONAL:3,EPHEMERAL:4},AndroidImportance:{DEFAULT:3},setNotificationChannelAsync:async()=>{calls.channels++;},getExpoPushTokenAsync:async value=>{calls.native++;calls.tokenOptions.push(value);if(options.tokenWait)await options.tokenWait;if(options.tokenError)throw Error('APNs registration unavailable');return{data:token};}};
 const imports={
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>local.get(key)??null,setItem:async(key,value)=>local.set(key,value)}},
  'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'this-device-only',getItemAsync:async key=>secure.get(key)??null,setItemAsync:async(key,value,config)=>{if(options.storageError)throw Error('SecureStore unavailable');calls.secureOptions.push(config);secure.set(key,value);}},
  'expo-crypto':{getRandomBytes:n=>randomBytes(n),randomUUID},
  'expo-constants':{__esModule:true,default:{expoConfig:{extra:{eas:{projectId:'test-project'}}}}},
  expo:{isRunningInExpoGo:()=>options.go??false},'react-native':{Platform:{OS:options.platform??'android'}},
  '@/services/authClient':{accountConfig:{url:'https://test.supabase.co',key:'sb_publishable_test',error:null}},
  'expo-notifications':native,
 };
 const exports={};
 new vm.Script(code,{filename:'pushNotifications.ts'}).runInNewContext({exports,process:{env:{EXPO_PUBLIC_PUSH_ENVIRONMENT:options.environment??'preview'}},console,AbortController,setTimeout:(fn,ms)=>setTimeout(fn,ms===12000?10:ms),clearTimeout,
  fetch:async(url,init)=>{requests.push({url,headers:init.headers,body:JSON.parse(init.body)});if(options.fetcher)return options.fetcher(url,init);return new Response(JSON.stringify({saved:true,deliveryEnabled:true}));},
  require(name){assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name);if(name==='expo-notifications')calls.imports++;return imports[name];}
 });
 return{api:exports,secure,local,requests,calls,options,rotate(value){token=value;}};
}
const snapshot={enabled:true,preferences:{enabled:true,scope:'favorites',leadMinutes:5},favorites:['restart'],oneTime:[]};
test('device credentials stay in SecureStore; public snapshots use monotonic sequences and optional account bearer',async()=>{
 const h=harness();await h.api.acquirePushToken();await Promise.all([h.api.syncPushDevice(snapshot,undefined),h.api.syncPushDevice(snapshot,'user-bearer')]);
 assert.equal(h.secure.size,1);assert.equal(h.local.size,0);assert.equal(h.requests[0].body.sequence,1);assert.equal(h.requests[1].body.sequence,2);
 assert.equal(h.requests[0].headers.Authorization,undefined);assert.equal(h.requests[1].headers.Authorization,'Bearer user-bearer');assert.match(h.requests[0].headers['x-installation-secret'],/^[a-f0-9]{64}$/);
 assert.equal(h.requests[0].body.id,h.requests[1].body.id);
});
test('Expo token caching avoids repeated registration requests and token rotation invalidates the cache',async()=>{
 const h=harness();await h.api.acquirePushToken();await h.api.acquirePushToken();assert.equal(h.calls.native,1);
 h.rotate('ExpoPushToken[newtoken_abcdefghijkl]');h.api.invalidatePushToken();await h.api.acquirePushToken();assert.equal(h.calls.native,2);
 await h.api.syncPushDevice(snapshot,undefined);assert.equal(h.requests[0].body.token,'ExpoPushToken[newtoken_abcdefghijkl]');
});
test('token refresh and concurrent registration cannot overwrite the latest stored sequence',async()=>{
 const h=harness();await h.api.acquirePushToken();h.api.invalidatePushToken();
 await Promise.all([h.api.syncPushDevice(snapshot,undefined),h.api.acquirePushToken(),h.api.syncPushDevice(snapshot,undefined)]);
 assert.equal(JSON.parse([...h.secure.values()][0]).sequence,2);
});
test('preview to production upgrades retain installation ownership but isolate device consent',async()=>{
 const preview=harness();await preview.api.acquirePushToken();await preview.api.syncPushDevice(snapshot,undefined);await preview.api.saveDevicePreferences('guest',{consent:true,oneTime:[]});
 const production=harness({secure:preview.secure,local:preview.local,environment:'production'});await production.api.acquirePushToken();await production.api.syncPushDevice(snapshot,undefined);
 assert.equal(preview.requests[0].body.id,production.requests[0].body.id);assert.equal(production.requests[0].body.sequence,2);assert.equal(production.requests[0].body.environment,'production');
 assert.equal((await production.api.readDevicePreferences('guest')).consent,false);
});
test('denied permissions and unsupported Expo Go/web cannot create a token or device identity',async()=>{
 const denied=harness({granted:false,canAsk:false});await assert.rejects(denied.api.acquirePushToken(),/blocked/);assert.equal(denied.secure.size,0);assert.equal(denied.calls.native,0);
 for(const options of [{go:true},{platform:'web'}]){const h=harness(options);assert.equal(h.api.notificationApi(),null);await assert.rejects(h.api.acquirePushToken());assert.equal(h.calls.imports,0);assert.equal(h.secure.size,0);}
});
test('corrupt, expired and oversized one-time preferences cannot restore unsafe reminders',async()=>{
 const h=harness();await h.api.saveDevicePreferences('guest',{consent:true,oneTime:[{showId:'../bad',startsAt:'bad',leadMinutes:5},{showId:'restart',startsAt:'2020-01-01T00:00:00Z',leadMinutes:5}]});
 const result=await h.api.readDevicePreferences('guest');assert.equal(result.oneTime.length,0);assert.equal(result.consent,true);
});
test('bounded request timeouts leave credentials reusable and return an actionable error',async()=>{
 const h=harness({fetcher:(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted'))))});await h.api.acquirePushToken();
 await assert.rejects(h.api.syncPushDevice(snapshot,undefined),/reconnect to finish/);assert.equal(JSON.parse([...h.secure.values()][0]).sequence,1);
 h.options.fetcher=null;await h.api.syncPushDevice(snapshot,undefined);assert.equal(h.requests.at(-1).body.sequence,2);
});
test('passive token refresh never prompts and iOS provisional permission is accepted without another prompt',async()=>{
 const denied=harness({granted:false,canAsk:true});await assert.rejects(denied.api.acquirePushToken({requestPermission:false}),/blocked/);assert.equal(denied.calls.prompts,0);
 const provisional=harness({platform:'ios',granted:false,canAsk:true,iosStatus:3});await provisional.api.acquirePushToken({requestPermission:false});assert.equal(provisional.calls.prompts,0);assert.equal(provisional.calls.native,1);
});
test('obsolete snapshots waiting behind a registration are skipped before allocating a newer sequence',async()=>{
 let release;const wait=new Promise(resolve=>{release=resolve;});
 const h=harness({fetcher:async()=>{await wait;return new Response(JSON.stringify({saved:true,deliveryEnabled:true}));}});await h.api.acquirePushToken();
 const first=h.api.syncPushDevice(snapshot,undefined);let current=true;
 const stale=h.api.syncPushDevice(snapshot,'previous-owner',()=>current);
 current=false;release();await first;assert.equal((await stale).saved,false);assert.equal(h.requests.length,1);
 assert.equal(JSON.parse([...h.secure.values()][0]).sequence,1);
});
test('a failed SecureStore token write cannot poison the successful token cache',async()=>{
 const h=harness();await h.api.acquirePushToken();h.api.invalidatePushToken();h.rotate('ExpoPushToken[replacement_abcdefg]');
 h.options.storageError=true;await assert.rejects(h.api.acquirePushToken(),/SecureStore/);h.options.storageError=false;
 await h.api.acquirePushToken();assert.equal(h.calls.native,3,'A failed write must be retried instead of returning an unpersisted cached token');
 assert.equal(JSON.parse([...h.secure.values()][0]).token,'ExpoPushToken[replacement_abcdefg]');
});
test('restoring an older device counter catches up to the server before retrying current choices',async()=>{
 const h=harness({fetcher:async()=>new Response(JSON.stringify({saved:false,sequence:50,deliveryEnabled:true}))});await h.api.acquirePushToken();
 await assert.rejects(h.api.syncPushDevice(snapshot,undefined),/sync again shortly/);
 assert.equal(JSON.parse([...h.secure.values()][0]).sequence,50);
 h.options.fetcher=null;await h.api.syncPushDevice(snapshot,undefined);assert.equal(h.requests.at(-1).body.sequence,51);
});
test('iOS uses Apple authorisation states for both permission checks and token acquisition',async()=>{
 for(const status of [2,3,4]){
  const h=harness({platform:'ios',granted:false,iosStatus:status});
  assert.equal(await h.api.permissionGranted(),true);await h.api.acquirePushToken({requestPermission:false});
  assert.equal(h.calls.prompts,0);assert.equal(h.calls.channels,0);assert.equal(h.calls.native,1);
 }
 for(const status of [0,1]){
  const h=harness({platform:'ios',granted:true,iosStatus:status,canAsk:false});
  assert.equal(await h.api.permissionGranted(),false);await assert.rejects(h.api.acquirePushToken(),/blocked/);
  assert.equal(h.calls.native,0);assert.equal(h.secure.size,0);
 }
});
test('iOS explicit opt-in asks for alerts and sound once; passive registration never prompts',async()=>{
 const h=harness({platform:'ios',granted:false,iosStatus:0,permissionResult:{granted:true,iosStatus:2}});
 await assert.rejects(h.api.acquirePushToken({requestPermission:false}),/blocked/);assert.equal(h.calls.prompts,0);
 await h.api.acquirePushToken();await h.api.acquirePushToken();assert.equal(h.calls.prompts,1);
 const request=h.calls.permissionOptions[0].ios;
 assert.equal(request.allowAlert,true);assert.equal(request.allowSound,true);assert.equal(request.allowBadge,false);
 assert.equal(h.calls.native,1);assert.equal(h.calls.channels,0);
});
test('iOS re-registers on each launch while preserving installation ownership and in-session caching',async()=>{
 const first=harness({platform:'ios',iosStatus:2});await first.api.acquirePushToken();await first.api.syncPushDevice(snapshot,undefined);
 const next=harness({platform:'ios',iosStatus:2,secure:first.secure});next.rotate('ExpoPushToken[apns_changed_abcdefg]');
 await next.api.acquirePushToken({requestPermission:false});await next.api.acquirePushToken();
 assert.equal(next.calls.native,1,'A recent persisted token must still register with APNs on a new launch');
 assert.equal(next.calls.tokenOptions[0].projectId,'test-project');assert.equal(next.calls.tokenOptions[0].development,undefined,'Expo must infer the signed APNs environment');
 await next.api.syncPushDevice(snapshot,undefined);
 assert.equal(next.requests[0].body.id,first.requests[0].body.id);assert.equal(next.requests[0].body.sequence,2);
 assert.equal(next.requests[0].body.platform,'ios');assert.equal(next.requests[0].body.token,'ExpoPushToken[apns_changed_abcdefg]');
 assert.equal(next.requests[0].headers.Authorization,undefined,'Guest iPhones do not require an account');
 assert.ok(next.calls.secureOptions.every(value=>value?.keychainAccessible==='this-device-only'));
});
test('iOS launch registration failures cannot fall back to an old token; revocation blocks even a cached token',async()=>{
 const first=harness({platform:'ios',iosStatus:2});await first.api.acquirePushToken();
 const next=harness({platform:'ios',iosStatus:2,secure:first.secure,tokenError:true});
 await assert.rejects(next.api.acquirePushToken({requestPermission:false}),/APNs/);assert.equal(next.calls.native,1);
 next.options.tokenError=false;await next.api.acquirePushToken({requestPermission:false});assert.equal(next.calls.native,2);
 next.options.iosStatus=1;next.options.canAsk=false;
 assert.equal(await next.api.permissionGranted(),false);await assert.rejects(next.api.acquirePushToken(),/blocked/);assert.equal(next.calls.native,2);
});
test('concurrent iOS opt-in and passive refresh share one APNs registration and persist one installation',async()=>{
 let release;const tokenWait=new Promise(resolve=>{release=resolve;});
 const h=harness({platform:'ios',iosStatus:2,tokenWait});
 const first=h.api.acquirePushToken(),second=h.api.acquirePushToken({requestPermission:false});
 for(let i=0;i<20;i++)await Promise.resolve();assert.equal(h.calls.native,1);
 release();const tokens=await Promise.all([first,second]);assert.equal(tokens[0],tokens[1]);assert.equal(h.secure.size,1);
 await h.api.syncPushDevice(snapshot,undefined);assert.equal(h.requests[0].body.sequence,1);
});
