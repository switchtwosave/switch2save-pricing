/* Local QR validation. This file never reads from or sends to a network service. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ReviewCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_BYTES=8*1024*1024;
  function normalizeURL(value){
    let text=String(value||'').trim();
    if(!text) throw new Error('Enter this tile’s hosted Smart Review or direct review URL first.');
    if(!/^[a-z][a-z0-9+.-]*:/i.test(text)) text='https://'+text;
    let url;
    try{url=new URL(text);}catch(_){throw new Error('Enter a complete http or https review URL.');}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)
      throw new Error('Use an http or https URL without embedded credentials.');
    return url.href;
  }
  function imageType(bytes){
    const a=Array.from(bytes.slice(0,12));
    if([137,80,78,71,13,10,26,10].every((n,i)=>a[i]===n)) return 'image/png';
    if(a[0]===255&&a[1]===216&&a[2]===255) return 'image/jpeg';
    if(String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP') return 'image/webp';
    throw new Error('Choose a PNG, JPG or WebP image. SVG, GIF and renamed non-image files are not supported.');
  }
  function validateFile(file,bytes){
    if(!file||!file.size) throw new Error('This image is empty.');
    if(file.size>MAX_BYTES) throw new Error('Choose an image under 8 MB.');
    const type=imageType(bytes);
    if(file.type && file.type!==type) throw new Error('The image contents do not match its file type.');
    return type;
  }
  function validateDimensions(width,height,min=100){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<min||height<min)
      throw new Error(min===100?'Use a clear QR image at least 100 × 100 pixels.':'The image has invalid dimensions.');
    if(width>8192||height>8192||width*height>24000000)
      throw new Error('Choose an image below 8,192 pixels per side and 24 megapixels.');
  }
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  return {MAX_BYTES,normalizeURL,imageType,validateFile,validateDimensions,escapeHTML};
});
