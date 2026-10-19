/* Self-hosted runtime; input buffers stay in this worker's memory. */
'use strict';
let runtime,ready;
const ROOT='/home/pyodide',INPUT=ROOT+'/input';
function progress(message){postMessage({type:'progress',message});}
async function initialize(){
 progress('Loading the local reporting engine…');
 importScripts('pyodide.js');
 runtime=await loadPyodide({indexURL:new URL('./',self.location.href).href});
 await runtime.loadPackage(new URL('pillow-11.3.0-cp313-cp313-pyodide_2025_0_wasm32.whl',self.location.href).href);
 const response=await fetch('care-report-engine.zip');
 if(!response.ok)throw new Error('The report engine could not be downloaded. Check your connection and try again.');
 runtime.unpackArchive(await response.arrayBuffer(),'zip',{extractDir:ROOT});
 runtime.runPython('import sys\nsys.path.insert(0,"/home/pyodide")\nimport browser_import');
 progress('Reporting engine ready. Checking your files locally…');
}
function clearInputs(){
 runtime.runPython('import shutil\nshutil.rmtree("/home/pyodide/input",ignore_errors=True)');
 runtime.FS.mkdir(INPUT);
}
onmessage=async({data})=>{
 if(data.type!=='run')return;
 try{
  ready ||= initialize();await ready;clearInputs();
  let statement,transactions,statementName,transactionsName;
  if(data.demo){
   statement=runtime.FS.readFile(ROOT+'/samples/fictional-epx-statement.pdf');
   transactions=runtime.FS.readFile(ROOT+'/samples/fictional-valor.csv');
   statementName='fictional-epx-statement.pdf';transactionsName='fictional-valor.csv';
  }else{
   statement=new Uint8Array(data.statement);transactions=new Uint8Array(data.transactions);
   // Basenames only, and separate directories so equal input names cannot collide.
   statementName=data.statementName.replace(/[^A-Za-z0-9._-]/g,'_');
   transactionsName=data.transactionsName.replace(/[^A-Za-z0-9._-]/g,'_');
  }
  runtime.FS.mkdir(INPUT+'/statement');runtime.FS.mkdir(INPUT+'/transactions');
  const sp=INPUT+'/statement/'+statementName,tp=INPUT+'/transactions/'+transactionsName;
  runtime.FS.writeFile(sp,statement);runtime.FS.writeFile(tp,transactions);
  runtime.globals.set('statement_path',sp);runtime.globals.set('transactions_path',tp);runtime.globals.set('comparison',data.comparison);
  progress('Reconciling deposits, fees, refunds and source details…');
  const result=JSON.parse(runtime.runPython('import json\njson.dumps(browser_import.run(statement_path,transactions_path,comparison))'));
  if(result.ok){
   const bytes=runtime.FS.readFile(result.pdf_path);result.pdf=bytes.buffer;delete result.pdf_path;
   postMessage({type:'result',...result},[result.pdf]);
  }else postMessage({type:'result',...result});
  runtime.runPython('del statement_path, transactions_path, comparison\nimport gc\ngc.collect()');
  clearInputs();
 }catch(error){
  postMessage({type:'error',message:'The local engine could not complete this run. '+String(error.message||error)});
  if(runtime){try{clearInputs();}catch(_){}}
 }
};
