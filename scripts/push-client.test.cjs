const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
const start='2026-10-19T16:00:00Z',end='2026-10-19T19:00:00Z';
class Clock extends Date{static now(){return Date.parse(start)+1000;}}
function load(file,imports={},globals={}){
 const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new vm.Script(code,{filename:file}).runInNewContext({exports,Date:Clock,console,...globals,require(name){assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name);return imports[name];}});return exports;
}
const schedule=load('src/utils/showSchedule.ts');
const types=load('src/types/notifications.ts');
const open=load('src/utils/notificationOpen.ts',{'@/utils/showSchedule':schedule});
const data={version:1,kind:'show-reminder',showId:'restart',startsAt:start,endsAt:end};
const response=(id='tap-1',payload=data)=>({actionIdentifier:'default',notification:{request:{identifier:id,content:{data:payload}}}});
const show={id:'restart',title:'The Restart',schedules:[{day:1,start:'18:00',end:'21:00',validFrom:null,validUntil:null}]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function harness(options={}){
 const slots=[],timers=new Map(),frames=new Map(),store=new Map(),saved=new Map(Object.entries(options.saved??{}));
 const calls={acquire:0,sync:[],navigate:[],play:[],notifications:[],refresh:0,cleared:0};
 let cursor=0,effects=[],dirty=false,result,timerId=0,frameId=0,alive=true;
 let owner=null,authLoading=false,startup=options.startup??true,navReady=options.navReady??true,pathname='/',granted=options.granted??true;
 let onResponse,tokenListener,appListener,networkListener;
 let content={shows:[show],loading:options.loading??false,refresh:()=>{calls.refresh++;return options.refreshPromise??Promise.resolve();}};
 const account={favorites:['restart'],notificationsEnabled:options.previewEnabled??false,reminderScope:'favorites',reminderLeadMinutes:5,ready:true,canEdit:true,
  async setNotifications(value){calls.notifications.push(value);account.notificationsEnabled=value;dirty=true;}};
 const radio={playing:false,currentShow:null,listenNow(id){calls.play.push(id);}};
 const same=(a,b)=>a?.length===b.length&&b.every((v,i)=>Object.is(v,a[i]));
 const react={
  createContext:()=>({Provider:'Provider'}),useContext:()=>{},
  useRef(value){return slots[cursor++]??={current:value};},
  useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
  useMemo(factory,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:factory()};return slots[i].value;},
  useCallback(callback,deps){return react.useMemo(()=>callback,deps);},
  useEffect(effect,deps){const i=cursor++,previous=slots[i];if(previous&&same(previous.deps,deps))return;const slot=slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slot.cleanup=effect();});},
 };
 const api={DEFAULT_ACTION_IDENTIFIER:'default',setNotificationHandler(handler){calls.handler=handler;},
  addNotificationResponseReceivedListener(listener){onResponse=listener;return{remove(){onResponse=null;}};},
  addPushTokenListener(listener){tokenListener=listener;return{remove(){tokenListener=null;}};},
  getLastNotificationResponseAsync:()=>options.initialPromise??Promise.resolve(options.initial??null),
  async clearLastNotificationResponseAsync(){calls.cleared++;},
 };
 const service={
  pushUnsupportedReason:()=>options.unsupported??null,notificationApi:()=>options.unsupported?null:Promise.resolve(api),
  permissionGranted:async()=>granted,
  invalidatePushToken:()=>{},
  async acquirePushToken(){calls.acquire++;if(options.tokenPromise)await options.tokenPromise;if(!granted)throw Error('Notifications are blocked');return 'token';},
  readDevicePreferences:async key=>saved.get(key)??{consent:false,oneTime:[]},
  async saveDevicePreferences(key,value){saved.set(key,value);},
  async syncPushDevice(snapshot,bearer){calls.sync.push({snapshot,bearer});if(options.syncError)throw Error('Network unavailable');return{deliveryEnabled:true,saved:true};},
 };
 const {PushNotificationProvider}=load('src/context/PushNotificationContext.tsx',{
  react,'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
  'react-native':{AppState:{currentState:'active',addEventListener(name,listener){appListener=listener;return{remove(){appListener=null;}};}},Linking:{openSettings:async()=>{}}},
  '@react-native-community/netinfo':{__esModule:true,default:{addEventListener(listener){networkListener=listener;return()=>{networkListener=null;};}}},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>store.get(key)??null,setItem:async(key,value)=>{store.set(key,value);}}},
  'expo-router':{usePathname:()=>pathname,useRootNavigationState:()=>navReady?{key:'ready'}:null},
  '@/context/AccountDataContext':{useAccountData:()=>account},'@/context/AuthContext':{useAuth:()=>({session:owner?{user:{id:owner},access_token:'owner-token'}:null,loading:authLoading})},
  '@/context/ContentContext':{useContent:()=>content},'@/context/RadioContext':{useRadio:()=>radio},
  '@/utils/navigation':{router:{navigate(destination){calls.navigate.push(destination);}}},
  '@/utils/notificationOpen':open,'@/types/notifications':types,'@/services/pushNotifications':service,
 },{setTimeout:(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval:()=>{},requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
 function render(){if(!alive)return;let passes=0;do{assert.ok(++passes<20,'Render loop');cursor=0;effects=[];dirty=false;result=PushNotificationProvider({children:null,startupReady:startup});effects.forEach(effect=>effect());}while(dirty);return result.props.value;}
 async function flush(){for(let i=0;i<20;i++){await Promise.resolve();render();}return result.props.value;}
 render();
 return{calls,saved,store,frames,account,options,flush,render,get value(){return result.props.value;},
  async timer(ms=900){for(const[id,item]of[...timers])if(item.ms<=ms){timers.delete(id);item.callback();}return flush();},
  async tap(value=response()){assert.ok(onResponse);onResponse(value);return flush();},
  async frame(){const current=[...frames.values()];frames.clear();current.forEach(fn=>fn());return flush();},
  async startup(value){startup=value;return flush();},async nav(value){navReady=value;return flush();},async path(value){pathname=value;return flush();},
  async content(next){content={...content,...next};return flush();},async owner(value){owner=value;return flush();},
  async permission(value){granted=value;return flush();},async foreground(){appListener?.('active');return flush();},
  async network(){networkListener?.({isConnected:true,isInternetReachable:true});return flush();},
  async token(){tokenListener?.({});return flush();},
  unmount(){alive=false;slots.forEach(slot=>slot.cleanup?.());},
 };
}

test('guests enable reminders without an account and retain their phone favourites',async()=>{
 const h=harness();await h.flush();assert.equal(h.value.ready,true);
 await h.value.setEnabled(true);await h.flush();await h.timer();
 assert.equal(h.value.enabled,true);assert.equal(h.saved.get('guest').consent,true);
 const registered=h.calls.sync.at(-1);assert.equal(registered.bearer,undefined);assert.equal(registered.snapshot.enabled,true);assert.deepEqual(registered.snapshot.favorites,['restart']);
 await h.value.setEnabled(false);await h.flush();await h.timer();assert.equal(h.value.enabled,false);assert.equal(h.calls.sync.at(-1).snapshot.enabled,false);
 h.unmount();
});
test('old preview preference cannot prompt, activate or register an opted-in device',async()=>{
 const h=harness({previewEnabled:true});await h.flush();await h.timer();assert.equal(h.calls.acquire,0);assert.equal(h.value.enabled,false);assert.equal(h.calls.sync.at(-1).snapshot.enabled,false);h.unmount();
});
test('cold-start tap waits for startup, content and navigation, then plays only after the target route commits',async()=>{
 const h=harness({startup:false,navReady:false,loading:true,initial:response()});await h.flush();assert.equal(h.calls.navigate.length,0);assert.equal(h.calls.play.length,0);
 await h.startup(true);await h.nav(true);assert.equal(h.calls.navigate.length,0);
 await h.content({loading:false});assert.equal(h.calls.navigate.length,1);assert.equal(h.calls.play.length,0);
 assert.equal(h.calls.navigate[0].params.id,'restart');await h.path('/show/restart');assert.equal(h.calls.play.length,0);await h.frame();assert.deepEqual(h.calls.play,['restart']);
 await h.tap(response());await h.frame();assert.equal(h.calls.play.length,1);h.unmount();
});
test('a newer tap wins while an older initial notification response is being restored',async()=>{
 const initial=deferred();const h=harness({startup:false,initialPromise:initial.promise});await h.flush();await h.tap(response('newer'));
 initial.resolve(response('older',{...data,showId:'missing'}));await h.flush();await h.startup(true);assert.equal(h.calls.navigate.at(-1).params.id,'restart');h.unmount();
});
test('replayed notification responses are ignored across a provider remount',async()=>{
 const h=harness();await h.flush();await h.tap();await h.path('/show/restart');await h.frame();assert.match(h.store.get('aceradio:push-opened:v1'),/tap-1/);h.unmount();
 const next=harness({initial:response()});next.store.set('aceradio:push-opened:v1',h.store.get('aceradio:push-opened:v1'));await next.flush();assert.equal(next.calls.navigate.length,0);assert.equal(next.calls.play.length,0);next.unmount();
});
test('account changes during the permission prompt cannot opt in the wrong owner',async()=>{
 const token=deferred();const h=harness({tokenPromise:token.promise});await h.flush();
 const enabling=h.value.setEnabled(true);await h.flush();await h.owner('20000000-0000-4000-8000-000000000001');token.resolve();await assert.rejects(enabling,/account changed/);await h.flush();assert.equal(h.value.enabled,false);assert.ok(!h.saved.has('guest'));h.unmount();
});
test('denied permissions do not activate a phone; revoked permissions deactivate its backend registration',async()=>{
 const h=harness({granted:false});await h.flush();await assert.rejects(h.value.setEnabled(true),/blocked/);await h.flush();assert.equal(h.value.enabled,false);h.unmount();
 const enabled=harness({granted:false,previewEnabled:true,saved:{guest:{consent:true,oneTime:[]}}});await enabled.flush();await enabled.timer();assert.equal(enabled.value.blocked,true);assert.equal(enabled.calls.sync.at(-1).snapshot.enabled,false);enabled.unmount();
});
test('failed registration retains local choices, reports pending state and retries after reconnect',async()=>{
 const h=harness({syncError:true,previewEnabled:true,saved:{guest:{consent:true,oneTime:[]}}});await h.flush();await h.timer();assert.match(h.value.status,/Reconnect|Network/i);assert.equal(h.saved.get('guest').consent,true);
 h.options.syncError=false;await h.network();await h.timer();assert.match(h.value.status,/enabled on this phone/);h.unmount();
});
test('rapid favourites edits coalesce and foreground token rotation resends the latest snapshot',async()=>{
 const h=harness({previewEnabled:true,saved:{guest:{consent:true,oneTime:[]}}});await h.flush();h.account.favorites=['restart','mornings'];h.render();h.account.favorites=['mornings'];h.render();await h.timer();assert.equal(h.calls.sync.length,1);assert.deepEqual(h.calls.sync[0].snapshot.favorites,['mornings']);
 await h.token();await h.timer();assert.equal(h.calls.sync.length,2);h.unmount();
});
test('unsupported Expo Go/web never loads native push APIs or makes remote registrations',async()=>{
 const h=harness({unsupported:'Use an installed build',previewEnabled:true});await h.flush();await h.timer();assert.equal(h.calls.sync.length,0);assert.equal(h.calls.acquire,0);assert.equal(h.value.unsupported,true);h.unmount();
});
test('unmount while a notification refresh is pending cannot navigate or start audio later',async()=>{
 const refresh=deferred();const h=harness({refreshPromise:refresh.promise});await h.flush();await h.tap();h.unmount();refresh.resolve();await h.flush();assert.equal(h.calls.navigate.length,0);assert.equal(h.calls.play.length,0);
});
