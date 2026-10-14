type GoogleWindow=Window & {google?:{maps?:{importLibrary:(name:string)=>Promise<unknown>}};poputiGoogleReady?:()=>void;gm_authFailure?:()=>void};
let pending:Promise<void>|undefined;
export function loadGooglePlaces(apiKey:string):Promise<void>{
 const win=window as GoogleWindow;
 if(win.google?.maps?.importLibrary)return win.google.maps.importLibrary('places').then(()=>{});
 if(pending)return pending;
 pending=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.id='poputi-google-places-script';
  let finished=false;
  const timer=window.setTimeout(()=>finish(new Error('Google Maps timeout')),15000);
  const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);delete win.poputiGoogleReady;if(error){script.remove();reject(error);}else resolve();};
  win.poputiGoogleReady=()=>finish();
  script.onerror=()=>finish(new Error('Google Maps unavailable'));
  const params=new URLSearchParams({key:apiKey,v:'weekly',libraries:'places',loading:'async',callback:'poputiGoogleReady',language:'ru',region:'TH',auth_referrer_policy:'origin'});
  script.src='https://maps.googleapis.com/maps/api/js?'+params;
  script.async=true;document.head.appendChild(script);
 }).catch(error=>{pending=undefined;throw error;});
 return pending;
}
