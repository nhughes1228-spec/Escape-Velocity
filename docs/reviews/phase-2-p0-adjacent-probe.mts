// Focused audit of 059aee9: isolated memory storage only; no browser saves.
// Run: node --import tsx docs/reviews/phase-2-p0-adjacent-probe.mts
import {createGameStore} from '../../src/game/store.ts';
import {SAVE_KEY,SAVE_BACKUP_KEY,parseSave} from '../../src/persistence/save.ts';
class Memory{m=new Map<string,string>();writes=0;denyRead=false;denyWrite=false;getItem(k:string){if(this.denyRead)throw Error('read denied');return this.m.get(k)??null}setItem(k:string,v:string){if(this.denyWrite)throw Error('quota');this.writes++;this.m.set(k,v)}}
const out:any={};
{
 const m=new Memory();m.denyRead=true;const s=createGameStore({storage:m,seedSource:()=>42});out.unavailable={reserve:s.dispatch({type:'reserveNewLaunch'}),started:s.getState().launchesStarted,writes:m.writes,status:s.getPersistence().kind};s.dispose();
}
{
 const m=new Memory();const s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});const a=s.getState().activeLaunch!;s.dispatch({type:'presentationPhase',runId:a.runId,playbackId:a.playbackId,phase:'playing'});m.denyRead=true;out.readFailureAtApogee={settled:s.dispatch({type:'settleNewLaunch',runId:a.runId,playbackId:a.playbackId}),active:!!s.getState().activeLaunch,credits:s.getState().credits,mode:s.getState().status};s.dispose();
}
{
 const m=new Memory();let s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});s.dispatch({type:'markInterrupted'});s.dispose();const before={writes:m.writes,revision:parseSave(m.getItem(SAVE_KEY)!).revision};s=createGameStore({storage:m});const after={writes:m.writes,revision:parseSave(m.getItem(SAVE_KEY)!).revision};s.dispose();s=createGameStore({storage:m});out.interruptedReload={before,after,second:{writes:m.writes,revision:parseSave(m.getItem(SAVE_KEY)!).revision}};s.dispose();
}
{
 const s=createGameStore({storage:new Memory()});out.snapshotIdentity={state:Object.is(s.getState(),s.getState()),persistence:Object.is(s.getPersistence(),s.getPersistence())};s.dispose();
}
{
 const m=new Memory();const s=createGameStore({storage:m,seedSource:()=>42});s.dispatch({type:'reserveNewLaunch'});const a=s.getState().activeLaunch!;s.dispatch({type:'settleNewLaunch',runId:a.runId,playbackId:a.playbackId});m.denyWrite=true;out.failedReset={returned:s.reset(true),memory:s.getState().credits,stored:parseSave(m.getItem(SAVE_KEY)!).progress.credits,status:s.getPersistence().kind};s.dispose();
}
{
 const m=new Memory();let calls=0;let s=createGameStore({storage:m});const save=JSON.parse(s.exportSave());s.dispose();save.revision=Number.MAX_SAFE_INTEGER;m.m.set(SAVE_KEY,JSON.stringify(save));s=createGameStore({storage:m,seedSource:()=>{calls++;return 42}});out.overflowSeed={accepted:s.dispatch({type:'reserveNewLaunch'}),calls,launches:s.getState().launchesStarted};s.dispose();
}
console.log(JSON.stringify(out,null,2));
