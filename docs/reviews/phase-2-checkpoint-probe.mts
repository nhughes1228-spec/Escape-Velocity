// Read-only audit probe for checkpoint 1c9156c. Uses isolated in-memory saves only.
// Run from repository root: node --import tsx docs/reviews/phase-2-checkpoint-probe.mts
// Reports observed behavior, including defects; it is not a passing acceptance test.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {createGameStore} from '../../src/game/store.ts';
import {parseSave,SAVE_KEY,SAVE_BACKUP_KEY} from '../../src/persistence/save.ts';
import {openingBalance as b} from '../../src/config/opening.ts';
import {deriveVehicle,starterLevels} from '../../src/game/vehicle.ts';
import {simulateVertical} from '../../src/simulation/vertical.ts';
class Storage {values=new Map<string,string>();writes:any[]=[];getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v);this.writes.push(k)}}
if (process.argv[2] === 'trace-case') {
 const mode = process.argv[3];
 const v = deriveVehicle(starterLevels);
 if (mode === 'pad') v.thrustN = 70;
 const r = simulateVertical(v,b.environment,{...b.simulation,maxTimeS:.1,maxIntegrationSteps:2,maxTraceSamples:2,traceIntervalS:mode==='normal'?.1:1e-300,collectTrace:true});
 console.log(JSON.stringify({outcome:r.outcome, samples:r.trace.length}));
 process.exit(0);
}
const out:any={reviewedCommit:'1c9156c'};
const settle=(s:any)=>{const a=s.getState().activeLaunch;return s.dispatch({type:'settleNewLaunch',runId:a.runId,playbackId:a.playbackId})};
{
 const m=new Storage();const raw='{"gameId":"escape-velocity","schemaVersion":999,"progress":"irreplaceable future data"}';m.values.set(SAVE_KEY,raw);const s=createGameStore({storage:m,seedSource:()=>42});
 out.corruptBefore={...s.getPersistence()};s.dispatch({type:'setMotion',motion:'reduced'});out.corruptAfter={persistence:s.getPersistence(),rawPreserved:m.getItem(SAVE_KEY)===raw,backup:m.getItem(SAVE_BACKUP_KEY),exportPreserved:s.exportSave()===raw};s.dispose();
}
{
 const m=new Storage();let calls=0;const s=createGameStore({storage:m,seedSource:()=>++calls});s.dispatch({type:'reserveNewLaunch'});const rejected=s.dispatch({type:'reserveNewLaunch'});out.rejectedSeed={calls,rejected,started:s.getState().launchesStarted};s.dispose();
}
{
 const m=new Storage();const s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});const old=s.getState().activeLaunch!;s.dispatch({type:'markInterrupted'});s.reset(true);s.dispatch({type:'reserveNewLaunch'});const current=s.getState().activeLaunch!;
 const accepted=s.dispatch({type:'settleNewLaunch',runId:old.runId,playbackId:old.playbackId});out.resetCallback={old:[old.runId,old.playbackId],current:[current.runId,current.playbackId],accepted,credits:s.getState().credits};s.dispose();
}
{
 const m=new Storage();const s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});settle(s);s.dispatch({type:'reserveNewLaunch'});const save=JSON.parse(s.exportSave());save.progress.launchesCompleted=2;try{parseSave(JSON.stringify(save));out.invalidCountsAccepted=true}catch{out.invalidCountsAccepted=false}s.dispose();
}
{
 const m=new Storage();const a=createGameStore({storage:m,seedSource:()=>42});a.dispatch({type:'reserveNewLaunch'});const old=a.getState().activeLaunch!;
 const other=createGameStore({storage:m,seedSource:()=>1});other.dispatch({type:'reserveNewLaunch'});settle(other);other.dispatch({type:'buyUpgrade',kind:'engine'});const before=m.getItem(SAVE_KEY);
 const accepted=a.dispatch({type:'settleNewLaunch',runId:old.runId,playbackId:old.playbackId});out.stale={accepted,kind:a.getPersistence().kind,rawPreserved:before===m.getItem(SAVE_KEY),engine:other.getState().levels.engine};a.dispose();other.dispose();
}
{
 const m=new Storage();const s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});settle(s);const valid=s.exportSave();s.importSave('{bad-import',true);out.badImport={credits:s.getState().credits,exportIsBad:s.exportSave()==='{bad-import',primaryStillValid:m.getItem(SAVE_KEY)===valid};s.dispose();
}
{
 const m=new Storage();const seedStore=createGameStore({storage:m,seedSource:()=>42});seedStore.dispatch({type:'reserveNewLaunch'});settle(seedStore);seedStore.dispose();const oldRaw=m.getItem(SAVE_KEY);
 const wrapper={getItem(k:string):string|null{throw new Error('read denied')},setItem(k:string,v:string){m.setItem(k,v)}};
 const s=createGameStore({storage:wrapper,seedSource:()=>0});s.dispatch({type:'setMotion',motion:'reduced'});out.readFailure={erased:oldRaw!==m.getItem(SAVE_KEY),storedCredits:JSON.parse(m.getItem(SAVE_KEY)!).progress.credits,kind:s.getPersistence().kind};s.dispose();
}
{
 const s=createGameStore({storage:new Storage(),seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});const a=s.getState().activeLaunch!;a.result.maximumAltitudeM=100000;settle(s);out.mutableResult={credits:s.getState().credits,record:s.getState().recordM,persistence:s.getPersistence().kind};s.dispose();
}
{
 try{simulateVertical(null as any,b.environment,b.simulation);out.nullHandled=true}catch(e){out.nullHandled=String(e)}
 const r=simulateVertical(deriveVehicle(starterLevels),b.environment,{...b.simulation,traceIntervalS:100,maxTraceSamples:1});out.terminalEvents={outcome:r.outcome,events:r.events};
 out.padCaps=[70,90].map(thrustN=>{const r=simulateVertical({...deriveVehicle(starterLevels),thrustN},b.environment,{...b.simulation,maxTimeS:.1});return{thrustN,outcome:r.outcome,t:r.terminalTimeS,fuel:r.terminalFuelKg}});
}
{
 const m=new Storage(); const original=createGameStore({storage:m});
 const save=JSON.parse(original.exportSave()); original.dispose();
 save.revision=Number.MAX_SAFE_INTEGER; m.values.set(SAVE_KEY,JSON.stringify(save));
 const s=createGameStore({storage:m});
 const accepted=s.dispatch({type:'setMotion',motion:'reduced'});
 out.revisionOverflow={accepted,motion:s.getState().settings.motion,persistence:s.getPersistence().kind};s.dispose();
}
out.traceWork = ['normal','flight','pad'].map(mode=>{
 const child=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'trace-case',mode],{timeout:2000,encoding:'utf8',killSignal:'SIGKILL'});
 return {mode,timedOut:(child.error as NodeJS.ErrnoException|undefined)?.code==='ETIMEDOUT',status:child.status,output:child.stdout.trim()};
});
let worstAltitude=0,worstTime=0,endpointFlights=0,nonApogee=0;
for(let engine=0;engine<=8;engine++)for(let fuel=0;fuel<=8;fuel++)for(let airframe=0;airframe<=8;airframe++)for(const k of [.994,1,1.006]){
 const nominal=deriveVehicle({engine,fuel,airframe,ignition:0});
 const vehicle={...nominal,thrustN:nominal.thrustN*k,exhaustVelocityMps:nominal.exhaustVelocityMps*k};
 const full=simulateVertical(vehicle,b.environment,{...b.simulation,collectTrace:false});
 const half=simulateVertical(vehicle,b.environment,{...b.simulation,dtS:b.simulation.dtS/2,collectTrace:false});
 worstAltitude=Math.max(worstAltitude,Math.abs(full.maximumAltitudeM-half.maximumAltitudeM));
 worstTime=Math.max(worstTime,Math.abs(full.terminalTimeS-half.terminalTimeS));
 if(full.outcome!=='apogee'||half.outcome!=='apogee')nonApogee++;
 endpointFlights++;
}
out.endpointConvergence={configurations:729,conditions:3,comparisons:endpointFlights,nonApogee,worstAltitudeM:worstAltitude,worstTimeS:worstTime};
console.log(JSON.stringify(out,null,2));
