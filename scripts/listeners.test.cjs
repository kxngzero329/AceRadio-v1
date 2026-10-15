const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
function load(relative, imports = {}, globals = {}) {
  const exports = {}, filename = path.join(root,relative);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX} }).outputText;
  new vm.Script(code,{filename}).runInNewContext({exports,fetch,Request,Response,URL,TextDecoder,AbortController,DOMException,setTimeout,clearTimeout, ...globals,
    require(name) { if (Object.hasOwn(imports,name)) return imports[name]; throw Error('Unexpected import: '+name); },
  });
  return exports;
}
const backend = load('supabase/functions/listener-stats/handler.ts');
const station = load('src/config/station.ts');
const config = { contentConfig:{url:'https://test.supabase.co'} };
const clientImports = {zod:require('zod'),'@/config/content':config,'@/config/station':station};
const client = load('src/services/listenerStats.ts',clientImports);
const source = (listeners,listenurl='http://studio.arc.radio:8000/stream')=>({listenurl,listeners});
const stats = listeners=>({icestats:{source:source(listeners)}});
const json = (body, options)=>Response.json(body,options);
const request = (method='GET')=>new Request('https://test.supabase.co/functions/v1/listener-stats',{method});
const payload = (listeners=17,age=0)=>({version:1,stream_url:station.STATION.streamUrl,listeners,sampled_at:'2026-10-15T12:00:00Z',sample_age_ms:age});
const deferred = ()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('statistics select the verified /stream mount, preserve zero, and never sum mounts',()=>{
  assert.equal(backend.STREAM_URL,station.STATION.streamUrl);
  assert.equal(backend.parseMountListeners(stats(0)),0);
  assert.equal(backend.parseMountListeners(stats('19')),19);
  assert.equal(backend.parseMountListeners({icestats:{listeners:9999,listener_connections:99999,source:[source(999,'https://studio.ace.radio/other'),source(17)]}}),17);
  assert.equal(backend.parseMountListeners({icestats:{source:source(3,station.STATION.streamUrl)}}),3);
});

test('missing, ambiguous, unrelated or malformed stream statistics cannot become a count',()=>{
  for (const value of [null,{}, {icestats:{listeners:17}}, {icestats:{source:[]}},
    {icestats:{source:[source(17),source(18)]}}, {icestats:{source:source(17,'https://other.example/stream')}},
    {icestats:{source:source(17,'https://studio.ace.radio/stream-backup')}}]) {
    assert.throws(()=>backend.parseMountListeners(value));
  }
  for (const count of [null,undefined,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'','1.5','-1','1e3','17 people']) assert.throws(()=>backend.parseMountListeners(stats(count)));
});

test('the endpoint supports browser preflight and only read requests, without upstream traffic',async()=>{
  let calls=0;
  const handle=backend.createListenerStatsHandler({fetch:async()=>{calls++;return json(stats(17));}});
  const preflight=await handle(request('OPTIONS'));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal((await handle(request('POST'))).status,405);
  assert.equal(calls,0);
});

test('parallel requests share one upstream fetch and the ten-second warm cache expires',async()=>{
  let now=1000,calls=0,count=0;
  const gate=deferred();
  const handle=backend.createListenerStatsHandler({now:()=>now,fetch:async(url,options)=>{
    calls++;assert.equal(url,backend.STATS_URL);assert.equal(options.redirect,'error');
    assert.equal(options.headers['Cache-Control'],'no-cache');
    await gate.promise;return json(stats(count));
  }});
  const requests=Array.from({length:8},()=>handle(request()));
  assert.equal(calls,1);gate.resolve();
  for (const response of await Promise.all(requests)) {
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal((await response.json()).listeners,0);
  }
  now+=9999;assert.equal((await (await handle(request())).json()).listeners,0);assert.equal(calls,1);
  now++;count=23;assert.equal((await (await handle(request())).json()).listeners,23);assert.equal(calls,2);
});

test('outages return unavailable rather than stale/zero; a short cooldown allows recovery',async()=>{
  let now=1000,fail=false,calls=0;
  const handle=backend.createListenerStatsHandler({now:()=>now,fetch:async()=>{calls++;if(fail)throw Error('Offline');return json(stats(12));}});
  assert.equal((await (await handle(request())).json()).listeners,12);
  now+=backend.CACHE_MS;fail=true;
  const failed=await handle(request());assert.equal(failed.status,503);
  assert.ok(!('listeners' in await failed.json()));
  assert.equal((await handle(request())).status,503);assert.equal(calls,2);
  now+=5000;fail=false;assert.equal((await (await handle(request())).json()).listeners,12);assert.equal(calls,3);
});

test('invalid JSON, stale proxy data, missing stream and excessive bodies fail safely',async()=>{
  const responses=[()=>new Response('bad',{headers:{'Content-Type':'application/json'}}),
    ()=>new Response('Down',{status:502}),()=>new Response('<html>Not statistics</html>'),
    ()=>json(stats(17),{headers:{Age:'15'}}),()=>json({icestats:{source:[]}}),
    ()=>json({padding:'x'.repeat(70_000),...stats(17)})];
  for (const response of responses) {
    const handle=backend.createListenerStatsHandler({fetch:async()=>response()});
    assert.equal((await handle(request())).status,503);
  }
});

test('an upstream deadline aborts a hung statistics request',async()=>{
  const short=load('supabase/functions/listener-stats/handler.ts',{}, {setTimeout:(fn)=>setTimeout(fn,5)});
  let aborted=false;
  const handle=short.createListenerStatsHandler({fetch:(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});
  })});
  assert.equal((await handle(request())).status,503);assert.ok(aborted);
});

test('only aggregate fields are returned and caller input never changes the upstream target',async()=>{
  const handle=backend.createListenerStatsHandler({fetch:async(url)=>{
    assert.equal(url,backend.STATS_URL);
    return json({icestats:{admin:'private@example.test',source:{...source(17),source_ip:'private',user_agent:'private'}}});
  }});
  const response=await handle(new Request('https://test.supabase.co/functions/v1/listener-stats?url=https://other.example/stream'));
  const body=await response.json();
  assert.deepEqual(Object.keys(body).sort(),['listeners','sample_age_ms','sampled_at','stream_url','version']);
  assert.equal(body.listeners,17);assert.ok(!JSON.stringify(body).includes('private'));
});

test('client validates stream identity/count and accounts for server sample age plus network time',()=>{
  const sample=client.decodeListenerSample(payload(0,10_000),1000,2000);
  assert.equal(sample.listeners,0);assert.equal(sample.expiresAt,21_000);
  assert.equal(client.freshListenerCount(sample,20_999),0);
  assert.equal(client.freshListenerCount(sample,21_000),null);
  assert.equal(client.freshListenerCount(sample,999),null);
  assert.equal(client.freshListenerCount(undefined,2000),null);
  for (const body of [{...payload(),version:2},{...payload(),stream_url:'https://other.example/stream'},payload(null),payload(-1),payload(1.5),payload(Number.MAX_SAFE_INTEGER+1),payload(17,30_000)]) {
    assert.throws(()=>client.decodeListenerSample(body,1000,2000));
  }
  assert.throws(()=>client.decodeListenerSample(payload(17,10_000),1000,21_000));
  assert.throws(()=>client.decodeListenerSample(payload(),2000,1000));
  // Phone/server calendar clocks need not be synchronized.
  assert.equal(client.decodeListenerSample({...payload(),sampled_at:'2099-01-01T00:00:00Z'},1000,2000).listeners,17);
});

test('production client reads only the deployed aggregate endpoint and propagates aborts',async()=>{
  const transport=load('src/services/listenerStats.ts',clientImports,{fetch:async(url,options)=>{
    assert.equal(url,'https://test.supabase.co/functions/v1/listener-stats');
    assert.equal(options.cache,'no-store');assert.ok(!options.headers.Authorization && !options.headers.apikey);
    return json(payload(0));
  }});
  assert.equal((await transport.fetchListenerSample(new AbortController().signal)).listeners,0);
  let aborted=false;
  const hung=load('src/services/listenerStats.ts',clientImports,{fetch:(_url,{signal})=>new Promise((_resolve,reject)=>{
    const abort=()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));};
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  })});
  const controller=new AbortController();
  const pending=hung.fetchListenerSample(controller.signal);controller.abort();
  await assert.rejects(pending,/Aborted/);assert.ok(aborted);
});

test('a hung client request also times out and HTTP errors never become zero listeners',async()=>{
  const failed=load('src/services/listenerStats.ts',clientImports,{fetch:async()=>new Response('Unavailable',{status:503})});
  await assert.rejects(failed.fetchListenerSample(new AbortController().signal),/unavailable/);
  const hung=load('src/services/listenerStats.ts',clientImports,{setTimeout:fn=>setTimeout(fn,5),fetch:(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })});
  await assert.rejects(hung.fetchListenerSample(new AbortController().signal),/Aborted/);
});

test('concurrent UI reads deduplicate and listener data is excluded from the actual persisted catalogue',async()=>{
  const React=require('react');
  const queries=require('@tanstack/react-query');
  const storage={getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};
  const provider=load('src/context/ContentContext.tsx',{
    react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{AppState:{},Platform:{OS:'android'}},
    '@react-native-async-storage/async-storage':{default:storage},'@tanstack/react-query':queries,
    '@tanstack/react-query-persist-client':require('@tanstack/react-query-persist-client'),
    '@tanstack/query-async-storage-persister':require('@tanstack/query-async-storage-persister'),
    '@/config/content':{contentConfig:{source:'supabase',url:config.contentConfig.url}},'@/data/bundledContent':{bundledContent:{}},'@/services/contentRepository':{},
  });
  const element=provider.ContentProvider({children:null});
  const cache=element.props.client;let calls=0;
  const options={queryKey:client.listenerQueryKey,queryFn:async()=>{calls++;return client.decodeListenerSample(payload(),Date.now(),Date.now());}};
  await Promise.all([cache.fetchQuery(options),cache.fetchQuery(options)]);assert.equal(calls,1);
  cache.setQueryData(['app-content',1,'supabase'],{version:3,shows:[]});
  const dehydrated=queries.dehydrate(cache,element.props.persistOptions.dehydrateOptions);
  assert.equal(dehydrated.queries.length,1);assert.equal(dehydrated.queries[0].queryKey[0],'app-content');
  cache.clear();
});

function hookHarness(){
  let now=1000,focused=true,query={data:client.decodeListenerSample(payload(),1000,1000),isError:false},options,result,cursor=0,nextId=0;
  const slots=[],timers=new Map(),effects=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
  const react={
    useSyncExternalStore:(_subscribe,snapshot)=>snapshot(),
    useState(initial){const index=cursor++;slots[index]??={value:initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},
    useEffect(effect,deps){const index=cursor++;if(!same(slots[index]?.deps,deps)){const previous=slots[index];const slot=slots[index]={deps};effects.push(()=>{previous?.cleanup?.();slot.cleanup=effect();});}},
  };
  const hook=load('src/hooks/useListenerCount.ts',{
    react,'@tanstack/react-query':{focusManager:{subscribe:()=>()=>{},isFocused:()=>focused},useQuery:value=>{options=value;return query;}},
    '@/services/listenerStats':{...client,freshListenerCount:sample=>client.freshListenerCount(sample,now)},
  },{Date:{now:()=>now},setTimeout:(callback,delay)=>{const id=++nextId;timers.set(id,{callback,due:now+delay});return id;},clearTimeout:id=>timers.delete(id)}).useListenerCount;
  const render=()=>{cursor=0;result=hook();while(effects.length)effects.shift()();return result;};
  render();
  return {render,get options(){return options;},get timers(){return timers;},
    setQuery(value){query=value;return render();},focus(value){focused=value;return render();},
    advance(time){now=time;for(const [id,timer]of timers){if(timer.due<=now){timers.delete(id);timer.callback();}}return render();},
    dispose(){for(const slot of slots)slot?.cleanup?.();},
  };
}

test('the UI expires a count on time during a stalled refresh and cancels its deadline on cleanup',()=>{
  const h=hookHarness();
  assert.equal(h.render(),17);assert.equal(h.options.refetchInterval,15_000);assert.equal(h.options.refetchIntervalInBackground,false);
  assert.equal(h.advance(30_999),17);assert.equal(h.advance(31_000),null);
  assert.equal(h.setQuery({data:client.decodeListenerSample(payload(0),31_000,31_000),isError:false}),0);
  assert.equal(h.timers.size,1);h.dispose();assert.equal(h.timers.size,0);
});

test('background polling stops, expired background samples stay hidden on return, and errors hide counts',()=>{
  const h=hookHarness();
  assert.equal(h.focus(false),null);assert.equal(h.options.enabled,false);assert.equal(h.timers.size,0);
  h.advance(120_000);assert.equal(h.focus(true),null);assert.equal(h.options.enabled,true);
  const fresh=client.decodeListenerSample(payload(21),120_000,120_000);
  assert.equal(h.setQuery({data:fresh,isError:false}),21);
  assert.equal(h.setQuery({data:fresh,isError:true}),null);
  assert.equal(h.setQuery({data:fresh,isError:false}),21);h.dispose();
});

test('the shared radio display uses only real counts in either content mode and counting never starts audio',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  let count=0,contentMode='bundled',starts=0;
  const context=load('src/context/RadioContext.tsx',{
    react:React,'react/jsx-runtime':require('react/jsx-runtime'),
    '@/services/radioMetadata':{getRadioMetadata:()=>({}),resolveRadioArtwork:async()=>{}},
    '@/context/ContentContext':{useContent:()=>({shows:[],source:contentMode})},
    '@/data/stationShow':{STATION_STREAM_SHOW_ID:'station',createStationStreamShow:()=>({id:'station',listeners:1999})},
    '@/utils/radio':{selectAdjacentLiveShow:()=>null,selectLiveShow:()=>null,selectShow:()=>null},
    '@/utils/showSchedule':{getLiveShows:()=>[]},
    '@/hooks/useRadioPlayback':{useRadioPlayback:()=>({playback:{start(){starts++;}},status:{phase:'playing',error:null}})},
    '@/hooks/useListenerCount':{useListenerCount:()=>count},
  },{console});
  function Display(){const radio=context.useRadio();return React.createElement('span',null,radio.listenerCount===null?'Live radio':String(radio.listenerCount));}
  const render=()=>renderToStaticMarkup(React.createElement(context.RadioProvider,null,React.createElement(Display)));
  for(const mode of ['bundled','supabase']){
    contentMode=mode;
    count=0;assert.equal(render(),'<span>0</span>');
    count=17;assert.equal(render(),'<span>17</span>');
    count=null;assert.equal(render(),'<span>Live radio</span>');
  }
  assert.equal(starts,0);
});
