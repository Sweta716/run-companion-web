'use strict';
function parseActivityFile(text,filename){
  if(text.length>5*1024*1024)throw new Error('File is too large (maximum 5 MB).');
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported XML declarations.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('The file contains invalid XML.');
  const all=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
  const value=(root,name)=>all(root,name)[0]?.textContent?.trim();
  const number=(root,name)=>{const v=value(root,name);return v?Number(v):NaN;};
  let meters=0,seconds=0,date=null,heart=[];
  const type=doc.documentElement.localName.toLowerCase();
  if(type==='trainingcenterdatabase'){
    const activities=all(doc,'Activity');if(activities.length!==1)throw new Error('Choose a TCX file containing one activity.');
    if(activities[0].getAttribute('Sport')&&activities[0].getAttribute('Sport')!=='Running')throw new Error('This importer currently accepts running activities.');
    const laps=all(activities[0],'Lap');
    laps.forEach(lap=>{const d=number(lap,'DistanceMeters'),t=number(lap,'TotalTimeSeconds');if(Number.isFinite(d)&&d>=0)meters+=d;if(Number.isFinite(t)&&t>=0)seconds+=t;});
    date=value(activities[0],'Id');
    all(activities[0],'Trackpoint').forEach(p=>{const hr=all(p,'HeartRateBpm')[0];const h=hr?number(hr,'Value'):NaN;if(Number.isFinite(h)&&h>=30&&h<=240)heart.push(h);});
  }else if(type==='gpx'){
    const tracks=all(doc,'trk');if(tracks.length!==1)throw new Error('Choose a GPX file containing one recorded track.');
    let first=null,last=null;
    all(tracks[0],'trkseg').forEach(segment=>{
      let previous=null;
      all(segment,'trkpt').forEach(p=>{
        const lat=p.hasAttribute('lat')?Number(p.getAttribute('lat')):NaN,lon=p.hasAttribute('lon')?Number(p.getAttribute('lon')):NaN,time=Date.parse(value(p,'time'));
        const h=number(p,'hr');if(Number.isFinite(h)&&h>=30&&h<=240)heart.push(h);
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){previous=null;return;}
        if(Number.isFinite(time)){first=first===null?time:Math.min(first,time);last=last===null?time:Math.max(last,time);}
        const current={lat,lon};if(previous)meters+=RunGPSKit.metersBetween(previous,current);previous=current;
      });
    });
    if(first!==null&&last!==null){seconds=(last-first)/1000;date=new Date(first).toISOString();}
  }else throw new Error('Choose a Garmin or Strava GPX/TCX activity file.');
  if(!Number.isFinite(meters)||meters<=0||!Number.isFinite(seconds)||seconds<=0)throw new Error('This file needs recorded distance and duration. A route without timestamps is not enough.');
  if(meters>300000||seconds>172800)throw new Error('Activity exceeds the supported distance or duration.');
  const name=filename.replace(/\.(gpx|tcx)$/i,'').slice(0,100);
  return {id:crypto.randomUUID(),name,date:Number.isFinite(Date.parse(date))?date:null,meters,seconds,source:type==='gpx'?'GPX':'TCX',averageHeartRate:heart.length?Math.round(heart.reduce((a,b)=>a+b,0)/heart.length):null,heartSamples:heart.length};
}
