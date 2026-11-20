// JSON stdin -> JSON stdout. No database connections or write adapters.
import {analyze} from './engine.mjs';
import {catalog} from './catalog.mjs';
if(process.argv.includes('--stats')){
 console.log(JSON.stringify({mode:'shadow',rules:catalog.length,panelMappings:catalog.reduce((n,r)=>n+r.panelCandidates.length,0),requiredRules:1600,coverageComplete:catalog.length>=1600}));
}else{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>1048576)throw Error('Input exceeds 1 MiB');}
 const payload=JSON.parse(input);if(!Array.isArray(payload.events)||payload.events.length>100)throw Error('Expected at most 100 events');
 console.log(JSON.stringify({mode:'shadow',results:payload.events.map(event=>analyze(event,payload.approvals||{})),databaseWrites:0,messagesSent:0}));
}
