/** Review experiment only. Imports production physics; does not change runtime balance.
 * Run: node --import tsx docs/experiments/phase-2-probe.ts > /tmp/phase-2-report.json
 */
import {readFileSync} from 'node:fs';
import {openingBalance as b} from '../../src/config/opening';
import {deriveVehicle, starterLevels, type RocketLevels} from '../../src/game/vehicle';
import {simulateVertical} from '../../src/simulation/vertical';
const c=JSON.parse(readFileSync(new URL('./phase-2-candidate.json',import.meta.url),'utf8'));
const kinds=['engine','fuel','airframe','ignition'] as const;
type Kind=typeof kinds[number];
const options={...b.simulation,collectTrace:false};
function rng(seed:number){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function condition(seed:number){const r=rng(seed);return 1+c.variance.amplitude*(r()+r()-1);}
function flight(levels:RocketLevels,k=1,dt=options.dtS){const v=deriveVehicle(levels);v.ignitionDelayS=c.ignition.delaysS[levels.ignition];v.thrustN*=k;v.exhaustVelocityMps*=k;return simulateVertical(v,b.environment,{...options,dtS:dt});}
const memo=new Map<string,ReturnType<typeof flight>>();
function nominal(l:RocketLevels){const key=JSON.stringify(l);if(!memo.has(key))memo.set(key,flight(l));return memo.get(key)!;}
function price(kind:Kind,level:number){const base=kind==='ignition'?c.ignition.baseCost:b.upgrades[kind].baseCost;return Math.ceil(base*(100+Math.round(b.costCurve.linear*100)*level+Math.round(b.costCurve.quadratic*100)*level**2)/100);}
function income(h:number){return b.income.baseCredits+Math.floor(b.income.sqrtAltitudeCoefficient*Math.sqrt(h));}
const round=(x:number)=>Number(x.toFixed(6));
const pct=(xs:number[],p:number)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)];
let minDelta=0,maxDelta=0,worstDt=0,minTwr=Infinity,negativeEdges=0,minEdgePct=Infinity;
let worstBuild:RocketLevels=starterLevels;
for(let e=0;e<=8;e++)for(let f=0;f<=8;f++)for(let a=0;a<=8;a++){
 const l={engine:e,fuel:f,airframe:a,ignition:0}, n=nominal(l).maximumAltitudeM;
 for(const k of [1-c.variance.amplitude,1,1+c.variance.amplitude]){
  const r=flight(l,k),fine=flight(l,k,options.dtS/2),v=deriveVehicle(l);
  if(r.outcome!=='apogee'||fine.outcome!=='apogee')throw Error('Non-apogee');
  const delta=100*(r.maximumAltitudeM/n-1);if(delta>maxDelta){maxDelta=delta;worstBuild=l;}minDelta=Math.min(minDelta,delta);
  worstDt=Math.max(worstDt,Math.abs(r.maximumAltitudeM-fine.maximumAltitudeM));
  minTwr=Math.min(minTwr,v.thrustN*k/((v.dryMassKg+v.fuelMassKg)*b.environment.gravityMps2));
  for(const kind of kinds.slice(0,3))if(l[kind]<b.upgrades[kind].cap){const d=flight({...l,[kind]:l[kind]+1},k).maximumAltitudeM/r.maximumAltitudeM-1;minEdgePct=Math.min(minEdgePct,100*d);if(d<0)negativeEdges++;}
 }
}
if(minDelta < -3 || maxDelta > 3 || minTwr <= 1 || negativeEdges !== 0 || worstDt > .1) throw Error('Candidate envelope regression');
const starterSamples=Array.from({length:4096},(_,seed)=>flight(starterLevels,condition(seed)).maximumAltitudeM);
const nominalStarter=nominal(starterLevels).maximumAltitudeM;
const campaign=(policy:string,seed:number)=>{
 let l={...starterLevels},credits=0,seconds=0,launches=0,wait=0,maxWait=0;
 const launchRng=rng(seed),choiceRng=rng(seed^0x85ebca6b);
 const milestones:Record<string,unknown>={}, atTime:Record<string,unknown>={};let after5=0;
 while(launches<c.campaign.maxLaunches){
  const launchSeed=Math.floor(launchRng()*4294967296);const r=flight(l,condition(launchSeed));launches++;seconds+=c.ignition.delaysS[l.ignition]+r.terminalTimeS+c.campaign.decisionTimeS;credits+=income(r.maximumAltitudeM);
  if(launches===5)after5=r.maximumAltitudeM;
  for(const h of [500,1000])if(!milestones[h]&&r.maximumAltitudeM>=h)milestones[h]={launches,minutes:round(seconds/60)};
  for(const m of [10,15,20,30])if(!atTime[m]&&seconds>=60*m)atTime[m]={altitudeM:round(r.maximumAltitudeM),levels:{...l}};
  let purchased=false;
  // Score against the CURRENT build again after each purchase, unlike the old report.
  while(true){
   let cand=kinds.filter(k=>l[k]<b.upgrades[k].cap&&price(k,l[k])<=credits);
   if(policy==='physical_gain')cand=cand.filter(k=>k!=='ignition');
   if(policy==='ignition_first'&&l.ignition<4)cand=cand.filter(k=>k==='ignition');
   if(policy==='engine_first'&&l.engine<8)cand=cand.filter(k=>k==='engine');
   if(!cand.length)break;
   const n=nominal(l);const currentRate=income(n.maximumAltitudeM)/(n.terminalTimeS+c.ignition.delaysS[l.ignition]+4);
   const scores=cand.map(kind=>{const next={...l,[kind]:l[kind]+1},r=nominal(next),cost=price(kind,l[kind]);let score=-cost;
    if(policy==='physical_gain')score=(r.maximumAltitudeM-n.maximumAltitudeM)/cost;
    if(policy==='throughput')score=(income(r.maximumAltitudeM)/(r.terminalTimeS+c.ignition.delaysS[next.ignition]+4)-currentRate)/cost;
    if(policy==='random')score=choiceRng();
    return {kind,cost,score};}).sort((a,b)=>b.score-a.score||kinds.indexOf(a.kind)-kinds.indexOf(b.kind));
   const best=scores[0];credits-=best.cost;l={...l,[best.kind]:l[best.kind]+1};purchased=true;
  }
  wait=purchased?0:wait+1;maxWait=Math.max(maxWait,wait);
  const complete=kinds.every(k=>k==='ignition'&&policy==='physical_gain'||l[k]===b.upgrades[k].cap);
  if(complete)return {launches,minutes:round(seconds/60),after5:round(after5),milestones,atTime,maxWait,levels:l};
 }
 return {unreached:true,levels:l};
};
const policies=['cheapest','physical_gain','throughput','ignition_first','engine_first','random'];
const campaigns=Object.fromEntries(policies.map(p=>{const runs=Array.from({length:c.campaign.replicates},(_,s)=>campaign(p,s+1));return[p,{representativeSeed1:runs[0],completionMinutes:{min:Math.min(...runs.map(x=>x.minutes??Infinity)),median:pct(runs.map(x=>x.minutes??Infinity),.5),max:Math.max(...runs.map(x=>x.minutes??Infinity))}}];}));
const defects=[70,90].map(thrust=>{const r=simulateVertical({...deriveVehicle(starterLevels),thrustN:thrust},b.environment,{...options,maxTimeS:.1,collectTrace:true});return {thrustN:thrust,maxTimeS:.1,outcome:r.outcome,actualTimeS:r.terminalTimeS,initialPhase:r.trace[0].phase};});
console.log(JSON.stringify({reviewedCommit:'87cbc30',candidate:c,conditions:{testVectors:[0,1,42,4294967295].map(seed=>({seed,k:condition(seed)})),starter:{nominalM:nominalStarter,boundsM:[flight(starterLevels,.994).maximumAltitudeM,flight(starterLevels,1.006).maximumAltitudeM],meanM:starterSamples.reduce((a,b)=>a+b,0)/starterSamples.length,p05M:pct(starterSamples,.05),p95M:pct(starterSamples,.95),sampleMinM:Math.min(...starterSamples),sampleMaxM:Math.max(...starterSamples)},envelope:{builds:729,minDeltaPct:minDelta,maxDeltaPct:maxDelta,worstBuild,worstDtM:worstDt,minTwr,negativeEdges,minEdgePct}},campaignAssumptions:'No milestone grants; 1x; 4 s review per launch including all purchases; 32 seeds per policy. Buy affordable options repeatedly with fresh marginal scores. physical_gain omits ignition. ignition_first and engine_first save until their preferred system is capped, then cheapest. throughput uses positive or negative marginal rounded reward per second; random has an independent choice stream. Completion is final purchase, not subsequent demonstration flight.',campaigns,padLimitReproductions:defects},null,2));
