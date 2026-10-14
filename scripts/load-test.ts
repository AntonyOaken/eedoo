export {};
// Run only against a local/staging URL. Results describe this workload, not user capacity.
const target=process.argv[2];if(!target)throw new Error('Usage: pnpm test:load http://staging:8080');
const users=Number(process.env.LOAD_USERS||100),seconds=Number(process.env.LOAD_SECONDS||30);if(![100,300,1000].includes(users)||seconds<1||seconds>600)throw new Error('Use LOAD_USERS=100|300|1000 and 1..600 seconds');
const until=Date.now()+seconds*1000,latencies:number[]=[];let errors=0,limited=0,count=0;
const endpoint=new URL('/api/catalog/viewport?city=spb&mode=direct&bounds=59.93,30.30,59.94,30.33',target);
await Promise.all(Array.from({length:users},async()=>{while(Date.now()<until){const begin=performance.now();try{const r=await fetch(endpoint,{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();if(r.status===429)limited++;else if(!r.ok)errors++;}catch{errors++;}latencies.push(performance.now()-begin);count++;await new Promise(resolve=>setTimeout(resolve,1000));}}));
latencies.sort((a,b)=>a-b);console.log(JSON.stringify({concurrentClients:users,seconds,requests:count,errors,limited,p50Ms:latencies[Math.floor(latencies.length*.5)],p95Ms:latencies[Math.floor(latencies.length*.95)],p99Ms:latencies[Math.floor(latencies.length*.99)]},null,2));if(errors)process.exitCode=1;
