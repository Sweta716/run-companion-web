'use strict';
(function(root){
  const MILE=1609.344;
  function metersBetween(a,b){const rad=x=>x*Math.PI/180;const lat=rad(b.lat-a.lat),lon=rad(b.lon-a.lon);const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
  class RunGPS {
    constructor(meters=0){this.meters=meters;this.reset();}
    reset(){this.last=null;this.lastSeen=null;this.samples=[];this.pace=null;this.status='Waiting for GPS';this.accuracy=null;this.gaps=false;}
    reject(status){this.last=null;this.lastSeen=null;this.samples=[];this.pace=null;this.status=status;return {accepted:false,crossings:[]};}
    add(position,elapsed,now=Date.now()){
      const c=position.coords,t=position.timestamp;
      if(!c||![c.latitude,c.longitude,c.accuracy,t,elapsed].every(Number.isFinite)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||c.accuracy<0)return this.reject('Invalid GPS reading');
      this.accuracy=c.accuracy;
      if(now-t>8000||t>now+1000){this.gaps=true;return this.reject('GPS update is stale');}
      if(c.accuracy>25){this.gaps=true;return this.reject('Weak GPS — move into open sky');}
      const point={lat:c.latitude,lon:c.longitude,t,elapsed};
      if(!this.last){this.last=point;this.lastSeen=t;this.samples=[{t,m:this.meters}];this.status='GPS connected — building pace';return {accepted:true,crossings:[]};}
      const dt=(t-this.last.t)/1000;
      if(dt<=0)return {accepted:false,crossings:[]};
      if(t-this.lastSeen>15000){this.gaps=true;this.reject('GPS reconnected — distance gap');this.last=point;this.lastSeen=t;this.samples=[{t,m:this.meters}];return {accepted:true,crossings:[]};}
      this.lastSeen=t;
      const d=metersBetween(this.last,point);
      if(d/dt>8){this.gaps=true;return this.reject('GPS jump ignored');}
      // Hold the last anchor until movement exceeds a small noise floor.
      if(d<Math.max(3,c.accuracy*.3)){this.last.t=t;this.last.elapsed=elapsed;this.samples=[{t,m:this.meters}];this.pace=null;this.status='GPS connected — waiting for movement';return {accepted:true,crossings:[]};}
      const before=this.meters,previous=this.last;this.meters+=d;this.last=point;
      const crossings=[];
      for(let mile=Math.floor(before/MILE)+1;mile<=Math.floor(this.meters/MILE);mile++)crossings.push(previous.elapsed+(elapsed-previous.elapsed)*(mile*MILE-before)/d);
      this.samples.push({t,m:this.meters});while(this.samples.length>2&&this.samples[1].t<t-30000)this.samples.shift();
      const first=this.samples[0],duration=(t-first.t)/1000,distance=this.meters-first.m;
      this.pace=duration>=20&&distance>=30?duration/distance*MILE:null;
      this.status=this.pace?'GPS tracking':'GPS connected — building pace';
      return {accepted:true,crossings};
    }
    stale(now=Date.now()){if(this.lastSeen!==null&&now-this.lastSeen>15000){this.gaps=true;this.reject('GPS signal lost — coaching on hold');}}
  }
  const api={RunGPS,MILE,metersBetween};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RunGPSKit=api;
})(typeof window!=='undefined'?window:globalThis);
