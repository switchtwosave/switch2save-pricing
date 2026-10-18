
/* ---------- palettes for swatch rows ---------- */
const SW = {
  cardbg:   ['#ffffff','#f0f7fb','#faf6ef','#0f1b2a','#101010','#000000','#1a2b3a','#123a2e','#2a1a3a','#fff4e6','#d6f5e8'],
  accent:   ['#e0a52e','#f5c242','#1e6fd6','#7ec8f0','#2f8f4e','#d33b3b','#8e44ad','#e07b2e','#0f9e9e','#c0392b','#3eb489'],
  star:     ['#e0a52e','#f5c242','#f5b301','#ffd700','#1e6fd6','#7ec8f0','#2f8f4e','#d33b3b','#8e44ad','#111111','#3eb489'],
  headline: ['#1a2b3a','#000000','#111111','#1e6fd6','#7ec8f0','#2f8f4e','#c0392b','#8e44ad','#e0a52e','#ffffff','#2e8b6b'],
  body:     ['#4a5967','#5a6470','#6b7280','#7ec8f0','#333333','#111111','#1a2b3a','#2f6b3a','#7a5c3a','#ffffff','#3d8f74'],
};
const VARS = {cardbg:'--cardbg',accent:'--accent',star:'--star',headline:'--headline',body:'--body'};
const STATE = {cardbg:'#ffffff',accent:'#e0a52e',star:'#e0a52e',headline:'#1a2b3a',body:'#4a5967',logo:null,template:1,logoScale:1,bizScale:1,addrScale:1,hScale:1};

/* build swatch dots */
document.querySelectorAll('.sw').forEach(row=>{
  const key=row.dataset.var;
  SW[key].forEach((c,i)=>{
    const d=document.createElement('div');
    d.className='dot'+(i===0?' on':'');
    d.style.background=c;
    d.dataset.c=c;
    d.onclick=()=>{setColor(key,c);row.querySelectorAll('.dot').forEach(x=>x.classList.remove('on'));d.classList.add('on');};
    row.appendChild(d);
  });
  // custom picker dot
  const cust=document.createElement('label');
  cust.className='dot custom';
  const inp=document.createElement('input');inp.type='color';inp.value=STATE[key];
  inp.oninput=e=>{setColor(key,e.target.value);row.querySelectorAll('.dot').forEach(x=>x.classList.remove('on'));cust.classList.add('on');};
  cust.appendChild(inp);row.appendChild(cust);
});
function setColor(key,c){STATE[key]=c;document.getElementById('card').style.setProperty(VARS[key],c);saveCurrent();renderTiles();}

/* Each tile owns its complete draft. Nothing is sent or persisted externally. */
const $=id=>document.getElementById(id);
const FIELDS=['h1','h2','body','bizName','city','addr','url'];
const copyFields=['h1','h2','body'];
const DRAFTS={};
const TITLES={1:'White & Text',2:'Sidebar Logo',3:'Logo Card',4:'Logo + Info'};
const MODES={smart:'Smart Review',google:'Google QR',zelle:'Zelle QR'};
let activeTile=1, uploadRequest=null;
let qrState={mode:null,enabled:false,sources:{},notice:''};
let copies={review:Object.fromEntries(copyFields.map(id=>[id,$(id).value])),zelle:{h1:'Pay with',h2:'Zelle',body:'Scan using your banking app and confirm the recipient before paying.'}};
function clone(value){return JSON.parse(JSON.stringify(value));}
function snapshot(){return {fields:Object.fromEntries(FIELDS.map(id=>[id,$(id).value])),style:{...STATE},qr:clone(qrState),copies:clone(copies)};}
const originalDraft=snapshot();
for(let i=1;i<=4;i++){DRAFTS[i]=clone(originalDraft);DRAFTS[i].style.template=i;}
function copyKey(mode){return mode==='zelle'?'zelle':'review';}
function saveCurrent(){
  copies[copyKey(qrState.mode)]=Object.fromEntries(copyFields.map(id=>[id,$(id).value]));
  DRAFTS[activeTile]=snapshot();
}
function restoreTile(id){
  const draft=DRAFTS[id];activeTile=id;
  FIELDS.forEach(key=>{$(key).value=draft.fields[key];});
  Object.assign(STATE,draft.style,{template:id});qrState=clone(draft.qr);copies=clone(draft.copies);
  for(const key of Object.keys(VARS)) $('card').style.setProperty(VARS[key],STATE[key]);
  document.querySelectorAll('.sw').forEach(row=>{
    row.querySelectorAll('.dot').forEach(dot=>dot.classList.toggle('on',dot.dataset.c===STATE[row.dataset.var]));
    const picker=row.querySelector('input');if(picker) picker.value=STATE[row.dataset.var];
  });
  [['logoSz','logoScale'],['bizSz','bizScale'],['addrSz','addrScale'],['hSz','hScale']].forEach(([id,key])=>{$(id).value=STATE[key]*100;$(id+'Val').textContent=Math.round(STATE[key]*100)+'%';});
  showLogo();applyScales();syncText();renderQR();renderTiles();
}
function selectTile(id){if(id!==activeTile){saveCurrent();restoreTile(id);}else renderTiles();}
function renderTiles(){
  for(let id=1;id<=4;id++){
    const d=id===activeTile?snapshot():DRAFTS[id];
    $('tile'+id).classList.toggle('selected',id===activeTile);
    $('tileBiz'+id).textContent=d.fields.bizName||'Business name';
    const src=d.qr.enabled&&d.qr.sources[d.qr.mode];
    const img=$('tileQR'+id);img.hidden=!src;if(src)img.src=src.data;else img.removeAttribute('src');
    $('tileMode'+id).textContent=src?MODES[d.qr.mode]:(d.qr.mode?MODES[d.qr.mode]+' · needs QR':'No QR selected');
    $('tile'+id).style.setProperty('--mini-accent',d.style.accent);
  }
  document.querySelectorAll('.tpl').forEach(b=>{const on=+b.dataset.t===activeTile;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('[data-qr-mode]').forEach(b=>{
    const d=+b.dataset.tile===activeTile?snapshot():DRAFTS[+b.dataset.tile];
    b.setAttribute('aria-pressed',String(d.qr.enabled&&d.qr.mode===b.dataset.qrMode));
  });
  $('editingTile').textContent=`Editing design ${activeTile}: ${TITLES[activeTile]}`;
}
function updateClasses(){
  $('card').className='t'+activeTile+(STATE.logo?' has-logo':'')+(qrState.mode==='zelle'?' is-zelle':'')+(qrState.enabled?' with-qr':'');
}
function renderQR(){
  const src=qrState.enabled&&qrState.sources[qrState.mode];
  if(src){$('qrImg').src=src.data;$('qrImg').alt=MODES[qrState.mode]+' for '+($('bizName').value||'this business');}
  else $('qrImg').removeAttribute('src');
  $('scanCaption').textContent=qrState.mode==='zelle'?'Scan to Pay with Zelle':'Scan to Review Us!';
  $('replaceQR').hidden=!['google','zelle'].includes(qrState.mode);
  $('noQR').hidden=activeTile!==4||!qrState.enabled;
  $('dlhtml').disabled=qrState.mode!=='smart';
  $('qrStatus').textContent=qrState.notice||(src?`${MODES[qrState.mode]} active. ${src.name||src.url}. ${src.decoded?'QR decoded locally; scan the final export before use.':'QR scan validation unavailable in this browser; scan the source and final export before use.'}`:'Choose a QR option on this design tile.');
  $('urlBar').textContent=qrState.mode==='smart'?(src?src.url:'Enter this design’s existing hosted or direct review URL, then choose Generate Smart Review.'):'This URL is used only for Smart Review. It will not replace an uploaded QR.';
  updateClasses();
}
function setMode(mode){
  // A newer choice on this tile wins over an older upload still decoding.
  tileUploadSerial[activeTile]=++uploadSerial;
  copies[copyKey(qrState.mode)]=Object.fromEntries(copyFields.map(id=>[id,$(id).value]));
  const text=copies[copyKey(mode)];copyFields.forEach(id=>{$(id).value=text[id];});
  qrState.mode=mode;qrState.enabled=true;qrState.notice='';syncText();renderQR();saveCurrent();renderTiles();
}
document.querySelectorAll('.tpl').forEach(b=>{b.onclick=()=>selectTile(+b.dataset.t);});
document.querySelectorAll('[data-qr-mode]').forEach(b=>{b.onclick=()=>{
  const id=+b.dataset.tile, mode=b.dataset.qrMode;selectTile(id);
  if(mode==='smart') generateSmart();
  else if(qrState.sources[mode]) setMode(mode);
  else beginUpload(id,mode);
};});
// Keep the existing drag-and-drop upload workflow, with an explicit destination.
document.querySelectorAll('[data-qr-mode]').forEach(b=>{
  if(b.dataset.qrMode==='smart')return;
  b.title='Choose an image, or drop a QR image here';
  b.ondragover=e=>e.preventDefault();
  b.ondrop=e=>{
    e.preventDefault();const id=+b.dataset.tile,mode=b.dataset.qrMode;
    selectTile(id);const request={id,mode,serial:++uploadSerial};
    tileUploadSerial[id]=request.serial;acceptUpload(e.dataTransfer.files[0],request);
  };
});
function formatAddress(raw){
  const parts=(raw||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(parts.length>=2&&/^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/.test(parts[parts.length-1])){
    const last=parts.pop();parts[parts.length-1]+=', '+last;
  }
  return parts.map(s=>ReviewCore.escapeHTML(s.replace(/\s+/g,' '))).join('<br>');
}
function syncText(){
  $('cH').textContent=($('h1').value+' '+$('h2').value).trim();$('cB').textContent=$('body').value;
  ['cBiz','cBiz4'].forEach(id=>{$(id).textContent=$('bizName').value.trim();});
  ['cAddr','cAddr4'].forEach(id=>{$(id).innerHTML=formatAddress($('addr').value);});
}
['h1','h2','body','bizName','addr'].forEach(id=>$(id).addEventListener('input',()=>{syncText();saveCurrent();renderTiles();}));
function applyScales(){
  ['cardLogo','cardLogoBottom'].forEach(id=>{$(id).style.transform=`scale(${STATE.logoScale})`;$(id).style.transformOrigin='center';});
  $('card').style.setProperty('--biz-mult',STATE.bizScale);$('card').style.setProperty('--addr-mult',STATE.addrScale);$('card').style.setProperty('--h-mult',STATE.hScale);
}
[['logoSz','logoScale'],['bizSz','bizScale'],['addrSz','addrScale'],['hSz','hScale']].forEach(([id,key])=>{
  $(id).addEventListener('input',e=>{STATE[key]=+e.target.value/100;$(id+'Val').textContent=e.target.value+'%';applyScales();saveCurrent();});
});
$('city').addEventListener('input',()=>{
  if(qrState.mode!=='zelle') $('body').value=`We truly value your feedback. Your review helps other families in ${$('city').value.trim()||'your area'} find the care they deserve.`;
  syncText();saveCurrent();renderTiles();
});
function showLogo(){
  for(const id of ['logoPrev','cardLogo','cardLogoBottom']){if(STATE.logo)$(id).src=STATE.logo;else $(id).removeAttribute('src');}
  $('logoPrev').style.display=STATE.logo?'inline-block':'none';
  $('dropTitle').textContent=STATE.logo?'Logo added — click to replace':'🖼️ Drop logo or click — optional';updateClasses();
}
function readDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});}
function decodeImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This image could not be decoded. Choose a valid PNG, JPG or WebP.'));img.src=data;});}
async function imageData(file,isQR=true){
  if(!file||file.size>ReviewCore.MAX_BYTES||!file.size) ReviewCore.validateFile(file,new Uint8Array());
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());ReviewCore.validateFile(file,bytes);
  const data=await readDataURL(file), image=await decodeImage(data);ReviewCore.validateDimensions(image.naturalWidth,image.naturalHeight,isQR?100:1);
  return {data,image};
}
async function detectQR(image){
  if(typeof BarcodeDetector==='undefined') return null;
  try{
    const formats=await BarcodeDetector.getSupportedFormats();if(!formats.includes('qr_code')) return null;
    return await new BarcodeDetector({formats:['qr_code']}).detect(image);
  }catch(_){return null;}
}
let uploadSerial=0;const tileUploadSerial={};
function beginUpload(id,mode){
  uploadRequest={id,mode,serial:++uploadSerial};tileUploadSerial[id]=uploadRequest.serial;
  $('qrUpload').value='';$('qrUpload').click();
}
async function acceptUpload(file,request){
  if(!file||!request)return;
  try{
    const {data,image}=await imageData(file), codes=await detectQR(image);
    if(codes&&codes.length!==1) throw new Error(codes.length?'Use an image containing exactly one QR code.':'No readable QR was found. Use a clear, tightly cropped QR image.');
    if(tileUploadSerial[request.id]!==request.serial)return;
    const source={data,name:file.name,decoded:!!codes,payload:codes?codes[0].rawValue:null};
    if(activeTile===request.id){qrState.sources[request.mode]=source;setMode(request.mode);}
    else{
      const d=DRAFTS[request.id];d.qr.sources[request.mode]=source;
      const next=copyKey(request.mode);Object.assign(d.fields,d.copies[next]);
      d.qr.mode=request.mode;d.qr.enabled=true;d.qr.notice='';renderTiles();
    }
  }catch(error){
    if(tileUploadSerial[request.id]!==request.serial)return;
    const message=`Design ${request.id}: ${error.message}`;
    if(activeTile===request.id){qrState.notice=message;renderQR();saveCurrent();}else DRAFTS[request.id].qr.notice=message;
    $('exportStatus').textContent=message;
  }
}
$('qrUpload').onchange=e=>{const request=uploadRequest;uploadRequest=null;acceptUpload(e.target.files[0],request);};
$('replaceQR').onclick=()=>beginUpload(activeTile,qrState.mode);
$('noQR').onclick=()=>{tileUploadSerial[activeTile]=++uploadSerial;qrState.enabled=false;qrState.notice='Design 4 has no QR. Saved QR sources remain available in this tile.';renderQR();saveCurrent();renderTiles();};
let logoSerial=0;const tileLogoSerial={};
async function addLogo(file,id){
  if(!file)return;const serial=++logoSerial;tileLogoSerial[id]=serial;
  try{const {data}=await imageData(file,false);if(tileLogoSerial[id]!==serial)return;
    if(activeTile===id){STATE.logo=data;showLogo();saveCurrent();}else DRAFTS[id].style.logo=data;
  }catch(error){$('exportStatus').textContent=`Design ${id} logo: ${error.message}`;}
}
let logoTarget=1;
$('drop').onclick=()=>{logoTarget=activeTile;$('logoFile').value='';$('logoFile').click();};
$('logoFile').accept='image/png,image/jpeg,image/webp';
$('logoFile').onchange=e=>addLogo(e.target.files[0],logoTarget);
$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();addLogo(e.dataTransfer.files[0],activeTile);};
function generateSmart(){
  setMode('smart');
  try{
    const url=ReviewCore.normalizeURL($('url').value);
    if(typeof qrcode!=='function')throw new Error('QR generator library is unavailable. Reopen with an internet connection so the existing qrcode-generator library can load. No QR was created.');
    const qr=qrcode(0,'M');qr.addData(url);qr.make();
    qrState.sources.smart={data:qr.createDataURL(8,4),url,payload:url,decoded:false};
    qrState.notice='Smart Review QR created for your supplied URL. The destination has not been hosted or verified by this tool. Scan the final export before use.';
  }catch(error){delete qrState.sources.smart;qrState.notice=error.message;$('url').focus();}
  renderQR();saveCurrent();renderTiles();
}
$('url').addEventListener('input',()=>{
  // Editing the URL invalidates only the generated source; uploads remain untouched.
  delete qrState.sources.smart;
  if(qrState.mode==='smart')qrState.notice='URL changed. Choose Generate Smart Review on this design tile to rebuild the QR.';
  saveCurrent();renderQR();renderTiles();
});
$('newqr').onclick=()=>{
  if(!confirm(`Clear the business name, address and all QR sources for design ${activeTile}? Other designs and this design’s style stay unchanged.`))return;
  tileUploadSerial[activeTile]=++uploadSerial;
  ['bizName','addr','url'].forEach(id=>{$(id).value='';});
  qrState={mode:null,enabled:false,sources:{},notice:'Business and QR cleared for this design.'};
  copyFields.forEach(id=>{$(id).value=copies.review[id];});
  syncText();renderQR();saveCurrent();renderTiles();$('bizName').focus();
};
function slugify(s){return (s||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}

/* ---------- build rotating redirect HTML for download ---------- */
function buildQueries(){
  const biz = ($('h1').value+' '+$('h2').value).trim();
  const city=$('city').value.trim();
  const name = ($('bizName').value||'').trim();
  return [
    `${name} ${city}`.trim(),
    `${name} reviews`.trim(),
    `${name} google reviews`.trim(),
    `${name} ${city} reviews`.trim(),
    `dentist ${city} ${name}`.trim(),
    `${name} family dentist ${city}`.trim(),
    `${name} cosmetic dentist ${city}`.trim(),
    `best dentist ${city} ${name}`.trim(),
    `${name} near me`.trim(),
    `${name} appointment ${city}`.trim(),
  ].filter(Boolean);
}
function redirectHTML(){
  const q=JSON.stringify(buildQueries()).replace(/</g,'\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redirecting…</title><style>body{font-family:system-ui,sans-serif;background:#f0f7fb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#1a3a4a}</style></head><body><div>Redirecting…</div><script>
var Q=${q};
var idx=Math.floor(Date.now()/400)%Q.length;
var last=sessionStorage.getItem('lastq');
if(last!=null){idx=(parseInt(last)+1+Math.floor(Math.random()*(Q.length-1)))%Q.length;}
sessionStorage.setItem('lastq',idx);
location.replace('https://www.google.com/search?q='+encodeURIComponent(Q[idx]));
<\/script></body></html>`;
}

/* ---------- downloads ---------- */
function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function dataURLtoBlob(dataurl){
  const arr=dataurl.split(',');const mime=arr[0].match(/:(.*?);/)[1];
  const bstr=atob(arr[1]);let n=bstr.length;const u8=new Uint8Array(n);
  while(n--)u8[n]=bstr.charCodeAt(n);
  return new Blob([u8],{type:mime});
}
$('dlhtml').onclick=()=>{if(qrState.mode!=='smart')return;download('index.html',new Blob([redirectHTML()],{type:'text/html'}));};
// Landscape export at 800 × 480 CSS pixels, rendered at 2×.
const STAR_SVG='<svg viewBox="0 0 20 20"><polygon points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7"/></svg>';
// Snapshot the selected design before any asynchronous rendering begins.
function buildExportCard(){
  const old=$('exportCard'); if(old) old.remove();
  const ec=document.createElement('div'); ec.id='exportCard';
  const tpl=STATE.template||1;
  ec.className='et'+tpl+(qrState.mode==='zelle'?' is-zelle':'')+(qrState.enabled?' with-qr':'');
  // Apply the user's live color choices onto the export card so the download
  // matches the on-screen preview (variables are set on #card, not on body).
  if(STATE.cardbg) ec.style.setProperty('--cardbg',STATE.cardbg);
  if(STATE.accent) ec.style.setProperty('--accent',STATE.accent);
  if(STATE.star) ec.style.setProperty('--star',STATE.star);
  if(STATE.headline) ec.style.setProperty('--headline',STATE.headline);
  if(STATE.body) ec.style.setProperty('--body',STATE.body);
  // carry the logo + font size scaling into the export
  ec.style.setProperty('--logo-mult', STATE.logoScale||1);
  ec.style.setProperty('--biz-mult', STATE.bizScale||1);
  ec.style.setProperty('--addr-mult', STATE.addrScale||1);
  ec.style.setProperty('--h-mult', STATE.hScale||1);
  const logoSrc=STATE.logo;
  const logoHTML=logoSrc?`<img class="ec-logo" src="${logoSrc}">`:'';
  const qrSrc=$('qrImg').getAttribute('src')||'';
  const sp=(h)=>`<div class="ec-sp" style="height:${h}px"></div>`;
  const rightHTML=`<div class="ec-right"><div class="ec-rinner">
      <div class="ec-qrwrap"><img src="${qrSrc}"></div>
      <p class="ec-scan">${ReviewCore.escapeHTML($('scanCaption').textContent)}</p>
      <p class="ec-biz">${$('cBiz').innerHTML}</p>
      <p class="ec-addr">${$('cAddr').innerHTML}</p>
    </div></div>`;
  if(tpl===4&&qrState.enabled){
    ec.innerHTML=`<div class="ec-left">${logoHTML?logoHTML+sp(20):''}<h1>${$('cH').innerHTML}</h1></div>${rightHTML}`;
  } else if(tpl===4){
    // Template 4 — centered logo + name + address, NO QR / NO stars.
    // Uses explicit spacer divs (html-to-image collapses flex gap / margins).
    ec.innerHTML=`<div class="ec-center">
      ${logoHTML?logoHTML+sp(22):''}
      <h1>${$('cH').innerHTML}</h1>
      ${sp(20)}
      <div class="ec-biz">${$('cBiz').innerHTML}</div>
      ${sp(18)}
      <div class="ec-addr">${$('cAddr').innerHTML}</div>
    </div>`;
  } else if(tpl===3){
    // Template 3 — centered single column: logo, headline, stars, body, QR block
    ec.innerHTML=`<div class="ec-center">
      ${logoHTML?logoHTML+sp(14):''}
      <h1>${$('cH').innerHTML}</h1>
      ${sp(16)}
      <div class="ec-stars">${STAR_SVG.repeat(5)}</div>
      ${sp(16)}
      <p class="ec-body">${$('cB').innerHTML}</p>
      ${sp(20)}
      <div class="ec-qrrow">
        <div class="ec-qrwrap"><img src="${qrSrc}"></div>
        <div class="ec-qrtext">
          <p class="ec-scan">${ReviewCore.escapeHTML($('scanCaption').textContent)}</p>
          <p class="ec-biz">${$('cBiz').innerHTML}</p>
          <p class="ec-addr">${$('cAddr').innerHTML}</p>
        </div>
      </div>
    </div>`;
  } else if(tpl===2){
    // Template 2 — gold sidebar: logo at TOP of the colored left rail
    ec.innerHTML=`
      <div class="ec-left">
        ${logoHTML?logoHTML+sp(16):''}
        <h1>${$('cH').innerHTML}</h1>
        ${sp(20)}
        <div class="ec-stars">${STAR_SVG.repeat(5)}</div>
        ${sp(20)}
        <p class="ec-body">${$('cB').innerHTML}</p>
      </div>
      ${rightHTML}`;
  } else {
    // Template 1 — white: optional logo BELOW the body text
    ec.innerHTML=`
      <div class="ec-left">
        <h1>${$('cH').innerHTML}</h1>
        ${sp(20)}
        <div class="ec-stars">${STAR_SVG.repeat(5)}</div>
        ${sp(20)}
        <p class="ec-body">${$('cB').innerHTML}</p>
        ${logoHTML?sp(24)+logoHTML:''}
      </div>
      ${rightHTML}`;
  }
  document.body.appendChild(ec);
  return ec;
}
let exportInProgress=false;
async function exportCard(format){
  if(exportInProgress)return;
  exportInProgress=true;
  const buttons=[$('dlpng'),$('dljpg')];buttons.forEach(b=>b.disabled=true);
  let node=null;
  try{
    const source=qrState.enabled&&qrState.sources[qrState.mode];
    if((activeTile!==4||qrState.enabled)&&!source)throw new Error('Choose a QR option and supply a valid URL or QR image for this design first.');
    if(typeof htmlToImage==='undefined')throw new Error('The existing html-to-image export library did not load. Reopen with an internet connection and try again.');
    const tile=activeTile, mode=qrState.mode;
    const base=slugify($('cBiz').textContent)||'review-card';
    const background=STATE.cardbg;
    node=buildExportCard(); // all identity, colors, copy and source captured now
    $('exportStatus').textContent=`Rendering design ${tile}…`;
    if(document.fonts&&document.fonts.ready)await document.fonts.ready;
    await Promise.all([...node.querySelectorAll('img')].filter(img=>img.getAttribute('src')).map(async img=>{
      if(img.complete&&img.naturalWidth>0)return;
      if(img.decode)await img.decode();
      else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('An export image failed to load.'));});
    }));
    const opts={quality:.98,pixelRatio:2,backgroundColor:background,filter:el=>el.tagName!=='IMG'||!!el.getAttribute('src')};
    const data=await (format==='png'?htmlToImage.toPng(node,opts):htmlToImage.toJpeg(node,opts));
    if(!data||data.length<2000)throw new Error('The image renderer returned an empty card.');
    let verified=false;
    if(source){
      const image=await decodeImage(data), codes=await detectQR(image);
      if(codes){
        if(codes.length!==1)throw new Error('The exported QR did not scan clearly. Use a tighter, higher-resolution QR image and try PNG.');
        // If the original could not be decoded before, decode it now for comparison.
        let payload=source.payload;
        if(payload==null){const originals=await detectQR(await decodeImage(source.data));if(originals&&originals.length===1)payload=originals[0].rawValue;}
        if(payload!=null&&codes[0].rawValue!==payload)throw new Error('Export QR payload does not match the source. No image was downloaded.');
        verified=payload!=null;
      }
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    download(`${base}-design-${tile}-${mode||'info'}-1600x960-${stamp}.${format==='png'?'png':'jpg'}`,dataURLtoBlob(data));
    $('exportStatus').textContent=`Design ${tile} ${format.toUpperCase()} downloaded. ${!source?'No QR on this design.':verified?'QR payload matches the source. Scan the final image with the intended app before use.':'Automatic QR scan validation is unavailable. Scan the downloaded image with the intended app before use.'}`;
  }catch(error){$('exportStatus').textContent='Download not completed: '+error.message;}
  finally{if(node)node.remove();buttons.forEach(b=>b.disabled=false);exportInProgress=false;}
}
$('dlpng').onclick=()=>exportCard('png');$('dljpg').onclick=()=>exportCard('jpg');
restoreTile(1);
