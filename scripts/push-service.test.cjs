const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
const {randomUUID,randomBytes}=require('node:crypto');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/pushNotifications.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(options={}){
 const secure=options.secure??new Map(),local=options.local??new Map(),requests=[],calls={native:0,prompts:0,channels:0,imports:0};
 let token='ExpoPushToken[abcdefghijklmnop]';
 const permission=()=>({granted:options.granted??true,canAskAgain:options.canAsk??true});
 const native={getPermissionsAsync:async()=>permission(),requestPermissionsAsync:async()=>{calls.prompts++;return permission();},IosAuthorizationStatus:{PROVISIONAL:3},AndroidImportance:{DEFAULT:3},setNotificationChannelAsync:async()=>{calls.channels++;},getExpoPushTokenAsync:async()=>{calls.native++;if(options.tokenWait)await options.tokenWait;return{data:token};}};
 const imports={
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>local.get(key)??null,setItem:async(key,value)=>local.set(key,value)}},
  'expo-secure-store':{getItemAsync:async key=>secure.get(key)??null,setItemAsync:async(key,value)=>secure.set(key,value)},
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
