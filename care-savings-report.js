'use strict';
(()=>{
const $=id=>document.getElementById(id),files={statement:null,transactions:null};
let worker=null,busy=false,urls=[],epoch=0,previewGeneration=0,previewTask=null,previewLoad=null;
function status(message,kind=''){ $('status').textContent=message;$('status').className='notice '+kind; }
function update(){ $('generate').disabled=busy||!files.statement||!files.transactions;$('demo').disabled=busy;for(const id of ['statement','transactions','benchmark'])$(id).disabled=busy; }
function clearResult(){ previewGeneration++;previewTask?.cancel();previewTask=null;previewLoad?.destroy();previewLoad=null;for(const url of urls)URL.revokeObjectURL(url);urls=[];$('preview').width=0;$('preview').height=0;$('preview').hidden=true;$('previewNote').hidden=true;$('result').hidden=true;$('auditAction').hidden=true;for(const id of ['pdfLink','auditLink'])$(id).removeAttribute('href'); }
function url(bytes,type){const u=URL.createObjectURL(new Blob([bytes],{type}));urls.push(u);return u;}
async function renderPreview(bytes){
 const current=++previewGeneration;$('previewNote').hidden=false;$('previewNote').textContent='Preparing report preview…';
 try{
  const pdfjs=await import('./care-pdf.min.mjs');
  if(current!==previewGeneration)return;
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('care-pdf.worker.min.mjs',document.baseURI).href;
  const loading=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});previewLoad=loading;
  const doc=await loading.promise;
  if(current!==previewGeneration){await loading.destroy();return;}
  const page=await doc.getPage(1),viewport=page.getViewport({scale:2}),canvas=$('preview');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.hidden=false;
  previewTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await previewTask.promise;
  if(current===previewGeneration){$('previewNote').textContent='Report preview · the download preserves the original PDF';previewTask=null;}
  await loading.destroy();if(previewLoad===loading)previewLoad=null;
 }catch(e){if(current===previewGeneration){$('preview').hidden=true;$('previewNote').textContent='This browser could not display the preview. The generated PDF remains available above.';}}
}
function select(id,file){
 if(busy)return;
 clearResult();files[id]=null;
 const valid=id==='statement'?/\.pdf$/i:/\.(csv|xlsx)$/i;
 if(!file||!valid.test(file.name)||file.size<=0||file.size>20000000){
  $(id).value='';$(id+'Name').textContent=id==='statement'?'Original EPX statement with readable text':'CSV or one populated Excel sheet';
  status('Choose a '+(id==='statement'?'PDF statement':'CSV or XLSX export')+' between 1 byte and 20 MB.','error');update();return;
 }
 files[id]=file;$(id+'Name').textContent=file.name+' · '+(file.size/1024).toFixed(0)+' KB';
 status(files.statement&&files.transactions?'Both files are ready. Create the report to check them locally.':'Add the other file to continue.');update();
}
for(const id of ['statement','transactions']){
 $(id).addEventListener('change',()=>select(id,$(id).files[0]));
 const drop=$(id+'Drop');
 for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();if(!busy)drop.classList.add('over');});
 for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('over');});
 drop.addEventListener('drop',e=>{if(busy)return;if(e.dataTransfer.files.length!==1){status('Drop one file in each area.','error');return;}$(id).value='';select(id,e.dataTransfer.files[0]);});
}
function ensureWorker(){
 if(worker)return worker;
 worker=new Worker('care-report-worker.js');
 worker.onmessage=({data})=>{
  if(data.type==='progress'){status(data.message,'loading');return;}
  busy=false;update();
  if(data.type==='error'){status(data.message,'error');worker.terminate();worker=null;return;}
  if(data.audit){$('auditLink').href=url(data.audit,'application/json');$('auditLink').download=(data.name||'Care-Report-Needs-Review')+'.audit.json';$('auditAction').hidden=false;}
  if(!data.ok){status('Review needed. No final report was created.\n'+data.message,'error');return;}
  const s=data.summary,u=url(data.pdf,'application/pdf');
  $('pdfLink').href=u;$('pdfLink').download=data.name+'.pdf';renderPreview(data.pdf);
  $('resultTitle').textContent=s.merchant;$('resultInfo').textContent=s.period+' · '+s.daily_groups+' daily deposit groups reconciled · '+s.refunds+' settled refunds';
  const money=v=>Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
  $('net').textContent=money(s.net_processing);$('rate').textContent=s.effective_rate+'%';$('annual').textContent=money(s.annual_savings);
  $('result').hidden=false;status('Report ready. Source identity, daily deposits, fees, refunds and released funds passed the reconciliation checks. Keep the audit with the PDF.','success');
 };
 worker.onerror=()=>{busy=false;update();status('The browser could not start the local engine. Reload the page or try a current Chrome, Safari or Firefox browser.','error');worker?.terminate();worker=null;};
 return worker;
}
async function run(demo=false){
 if(busy||(!demo&&(!files.statement||!files.transactions)))return;
 const benchmark=$('benchmark').value.trim();
 if(!/^\d{1,2}(\.\d{1,4})?$/.test(benchmark)){status('Enter a comparison benchmark from 0 to less than 100%, with up to four decimal places.','error');return;}
 const [whole,fraction='']=benchmark.split('.'),comparison='0.'+whole.padStart(2,'0')+fraction;
 const current=++epoch;
 clearResult();busy=true;update();status('Preparing the local reporting engine…','loading');
 try{
  const message={type:'run',demo,comparison};
  if(demo){ensureWorker().postMessage(message);return;}
  const [statement,transactions]=await Promise.all([files.statement.arrayBuffer(),files.transactions.arrayBuffer()]);
  if(current!==epoch)return;
  ensureWorker().postMessage({...message,statement,transactions,statementName:files.statement.name,transactionsName:files.transactions.name},[statement,transactions]);
 }catch(e){busy=false;update();status('The selected files could not be read. Choose them again.','error');}
}
$('generate').addEventListener('click',()=>run());$('demo').addEventListener('click',()=>run(true));
$('benchmark').addEventListener('input',()=>{if(!busy)clearResult();});
$('reset').addEventListener('click',()=>{
 epoch++;worker?.terminate();worker=null;busy=false;clearResult();
 for(const id of ['statement','transactions']){files[id]=null;$(id).value='';$(id+'Name').textContent=id==='statement'?'Original EPX statement with readable text':'CSV or one populated Excel sheet';}
 update();status('Files and working session cleared. Choose two files to begin.');
});
window.addEventListener('pagehide',()=>{worker?.terminate();for(const u of urls)URL.revokeObjectURL(u);});
})();
