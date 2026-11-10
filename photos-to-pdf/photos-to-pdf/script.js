(function(){
  var imgs=[], docs=[], uid=0;
  var $=function(id){return document.getElementById(id)};
  var drop=$('drop'), file=$('file'), grid=$('grid'), panel=$('panel'), actions=$('actions'), status=$('status');
  document.body.dataset.step='1';
  function say(msg,err){status.textContent=msg;status.className=err?'err':''}
  function perPage(){return Number($('per').value)}

  /* ================= choosing files ================= */
  drop.addEventListener('click',function(){file.click()});
  drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click()}});
  $('add').addEventListener('click',function(){file.click()});
  ['dragenter','dragover'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.add('over')})});
  ['dragleave','drop'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.remove('over')})});
  drop.addEventListener('drop',function(e){addFiles(e.dataTransfer.files)});
  file.addEventListener('change',function(){addFiles(file.files);file.value=''});
  $('per').addEventListener('change',render);

  /* ================= auto detection ================= */
  var TARGET={pdf:{label:'PDF (.pdf)',ext:'pdf'},docx:{label:'Word (.docx)',ext:'docx'},doc:{label:'Word 97-2003 (.doc)',ext:'doc'},pptx:{label:'PowerPoint (.pptx)',ext:'pptx'},txt:{label:'Text (.txt)',ext:'txt'},csv:{label:'CSV (.csv)',ext:'csv'}};
  async function detect(f){
    var head=new Uint8Array(await f.slice(0,16).arrayBuffer());
    var ext=(f.name.split('.').pop()||'').toLowerCase();
    function is(a){return a.every(function(v,i){return head[i]===v})}
    var tag=String.fromCharCode.apply(null,Array.prototype.slice.call(head,4,12));
    if(is([0xFF,0xD8,0xFF])||is([0x89,0x50,0x4E,0x47])||is([0x47,0x49,0x46,0x38])||is([0x42,0x4D])||
       (is([0x52,0x49,0x46,0x46])&&String.fromCharCode(head[8],head[9],head[10],head[11])==='WEBP')) return {key:'img'};
    if(/^ftyp(heic|heix|mif1|avif)/.test(tag)) return {key:'bad',label:'HEIC/AVIF photo',why:'This photo format is not supported. Please use a JPG or PNG photo.'};
    if(is([0x25,0x50,0x44,0x46])) return {key:'pdf',label:'PDF document (.pdf)',targets:['docx','pptx','txt']};
    if(is([0x50,0x4B,0x03,0x04])){
      var zip; try{zip=await JSZip.loadAsync(f)}catch(e){return {key:'bad',label:'Zip file',why:'This file could not be opened.'}}
      if(zip.file('word/document.xml')) return {key:'docx',label:'Word document (.docx)',targets:['pdf','docx','pptx','txt'],zip:zip};
      if(zip.file('ppt/presentation.xml')) return {key:'pptx',label:'PowerPoint (.pptx)',targets:['pdf','docx','txt'],zip:zip};
      if(zip.file('xl/workbook.xml')) return {key:'xlsx',label:'Excel sheet (.xlsx)',targets:['pdf','csv','docx','pptx','txt'],zip:zip};
      return {key:'bad',label:'Zip file',why:'This kind of zip file is not supported.'};
    }
    if(is([0xD0,0xCF,0x11,0xE0])) return {key:'bad',label:'Old Office file (.'+ext+')',why:'Old .doc, .ppt and .xls files are not supported. Please save it as .docx, .pptx or .xlsx first.'};
    var buf=new Uint8Array(await f.slice(0,4096).arrayBuffer());
    if(buf.indexOf(0)===-1){
      var start=new TextDecoder().decode(buf.slice(0,200)).trim().toLowerCase();
      if(ext==='html'||ext==='htm'||start.indexOf('<!doctype html')===0||start.indexOf('<html')===0) return {key:'html',label:'Web page (.'+ext+')',targets:['pdf','docx','pptx','txt']};
      return {key:'text',label:'Text file (.'+(ext||'txt')+')',targets:['pdf','docx','pptx'],mono:/^(csv|json|log|xml|js|css|py|java|c|cpp|sql|yml|yaml)$/.test(ext)};
    }
    return {key:'bad',label:'Unknown file',why:'This file type is not supported.'};
  }

  async function addFiles(list){
    var arr=Array.prototype.slice.call(list);
    if(!arr.length)return;
    arr.sort(function(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true})});
    say('Checking '+arr.length+' file'+(arr.length>1?'s':'')+'…');
    var results=[];
    for(var i=0;i<arr.length;i++){
      var f=arr[i], d;
      try{d=await detect(f)}catch(e){d={key:'bad',label:'Unknown file',why:'This file could not be read.'}}
      if(d.key==='img'){
        try{ results.push({kind:'img',item:await loadImage(f)}) }
        catch(e){ results.push({kind:'doc',item:{id:++uid,file:f,det:{key:'bad',label:'Photo',why:'This photo could not be opened.'},msg:''}}) }
      }else results.push({kind:'doc',item:{id:++uid,file:f,det:d,msg:'',target:(d.targets||[])[0]}});
    }
    results.forEach(function(r){ if(r.kind==='img') imgs.push(r.item); else docs.push(r.item) });
    render();
    var bad=docs.filter(function(d){return d.det.key==='bad'}).length;
    say(arr.length+' file'+(arr.length>1?'s':'')+' checked'+(bad?' ('+bad+' not supported)':'')+'.');
  }

  function loadImage(f){
    return new Promise(function(res,rej){
      var url=URL.createObjectURL(f), img=new Image();
      img.onload=function(){
        var it={id:++uid,name:f.name,img:img,rot:0,thumb:'',cap:''};
        it.thumb=draw(it,320).toDataURL('image/jpeg',.8); res(it);
      };
      img.onerror=function(){rej(new Error('bad image'))};
      img.src=url;
    });
  }

  /* draw one photo (with rotation) on a canvas, max side = maxSide px */
  function draw(it,maxSide){
    var w=it.img.naturalWidth,h=it.img.naturalHeight,sw=w,sh=h;
    if(it.rot%180!==0){sw=h;sh=w}
    var s=Math.min(1,maxSide/Math.max(sw,sh));
    var c=document.createElement('canvas'); c.width=Math.round(sw*s); c.height=Math.round(sh*s);
    var g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height);
    g.translate(c.width/2,c.height/2); g.rotate(it.rot*Math.PI/180);
    var dw=Math.round(w*s),dh=Math.round(h*s); g.drawImage(it.img,-dw/2,-dh/2,dw,dh);
    return c;
  }

  /* ================= screen ================= */
  var IC={
    l:'<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    r:'<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    rot:'<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>',
    del:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'};

  function kb(n){return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}

  function render(){
    var per=perPage();
    grid.innerHTML='';
    imgs.forEach(function(it,i){
      var li=document.createElement('li'); li.className='card';
      var label=per===1?'Page '+(i+1):'Photo '+(i+1)+' · Page '+(Math.floor(i/per)+1);
      li.innerHTML='<div class="thumb"><img alt=""></div>'+
        '<div class="meta"><b></b><span class="nm"></span></div>'+
        '<div class="capwrap"><input class="cap" type="text" maxlength="120" placeholder="Caption (optional)" aria-label="Caption"></div>'+
        '<div class="tools"><button data-a="l" aria-label="Move earlier">'+IC.l+'</button><button data-a="r" aria-label="Move later">'+IC.r+'</button>'+
        '<button data-a="rot" aria-label="Rotate">'+IC.rot+'</button><button data-a="del" class="del" aria-label="Remove">'+IC.del+'</button></div>';
      li.querySelector('img').src=it.thumb;
      li.querySelector('.meta b').textContent=label;
      li.querySelector('.nm').textContent=it.name; li.querySelector('.nm').title=it.name;
      var cap=li.querySelector('.cap'); cap.value=it.cap;
      cap.addEventListener('input',function(){it.cap=cap.value});
      li.querySelector('[data-a=l]').disabled=i===0;
      li.querySelector('[data-a=r]').disabled=i===imgs.length-1;
      li.addEventListener('click',function(e){
        var bt=e.target.closest&&e.target.closest('button[data-a]'); if(!bt||bt.disabled)return;
        var a=bt.getAttribute('data-a'), k=imgs.indexOf(it);
        if(a==='l'&&k>0){imgs.splice(k-1,0,imgs.splice(k,1)[0])}
        if(a==='r'&&k<imgs.length-1){imgs.splice(k+1,0,imgs.splice(k,1)[0])}
        if(a==='rot'){it.rot=(it.rot+90)%360;it.thumb=draw(it,320).toDataURL('image/jpeg',.8)}
        if(a==='del'){imgs.splice(k,1)}
        render();
      });
      grid.appendChild(li);
    });

    var dl=$('docs'); dl.innerHTML='';
    docs.forEach(function(d){
      var li=document.createElement('li'); li.className='drow'+(d.det.key==='bad'?' bad':'');
      var ok=d.det.key!=='bad';
      li.innerHTML='<div class="dtop"><span class="badge"></span><span class="dn"></span><button class="x" aria-label="Remove">'+IC.del+'</button></div>'+
        (ok?'<div class="dact"><label>Convert to</label><select class="dt"></select><button class="btn go">Convert</button></div>':'')+
        '<div class="dmsg"></div>';
      li.querySelector('.badge').textContent=d.det.label;
      li.querySelector('.dn').textContent=d.file.name+'  ·  '+kb(d.file.size);
      li.querySelector('.dn').title=d.file.name;
      var msg=li.querySelector('.dmsg'); msg.textContent=ok?d.msg:d.det.why; if(d.err)msg.classList.add('err');
      li.querySelector('.x').addEventListener('click',function(){docs.splice(docs.indexOf(d),1);render()});
      if(ok){
        var sel=li.querySelector('.dt');
        d.det.targets.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=TARGET[t].label;if(t===d.target)o.selected=true;sel.appendChild(o)});
        sel.addEventListener('change',function(){d.target=sel.value});
        li.querySelector('.go').addEventListener('click',function(){convertDoc(d,li)});
      }
      dl.appendChild(li);
    });

    var hasImg=imgs.length>0, hasDoc=docs.length>0, any=hasImg||hasDoc;
    panel.classList.toggle('on',hasImg);
    $('docsec').hidden=!hasDoc;
    actions.hidden=!any;
    $('make').style.display=hasImg?'':'none';
    $('makeppt').style.display=hasImg?'':'none';
    $('ocr').style.display=hasImg?'':'none';
    if(!hasImg)$('ocrsec').hidden=true;
    $('make').textContent=hasDoc?'Make PDF from photos':'Make PDF';
    $('count').style.display=hasImg?'':'none';
    var okDocs=docs.filter(function(d){return d.det.key!=='bad'}).length;
    $('all').style.display=okDocs>1?'':'none';
    drop.style.display=any?'none':'';
    document.body.dataset.step=any?(document.body.dataset.step==='3'?'3':'2'):'1';
    var pages=Math.ceil(imgs.length/per);
    $('count').textContent=imgs.length+' photo'+(imgs.length===1?'':'s')+' → '+pages+' page'+(pages===1?'':'s');
  }

  $('clear').addEventListener('click',function(){imgs=[];docs=[];document.body.dataset.step='1';render();say('')});

  /* ================= download helper ================= */
  function save(blob,name){
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    document.body.dataset.step='3';
  }
  function baseName(n){var i=n.lastIndexOf('.');return (i>0?n.slice(0,i):n).replace(/[\\\/:*?"<>|]+/g,'')||'file'}

  /* ================= readers (file -> simple content) ================= */
  function xml(s){return new DOMParser().parseFromString(s,'application/xml')}
  function tx(node,tags){ // text inside a node, in order
    var out='', all=node.getElementsByTagName('*');
    for(var i=0;i<all.length;i++){
      var n=all[i].nodeName;
      if(n===tags.t) out+=all[i].textContent;
      else if(n===tags.tab) out+='\t';
      else if(n===tags.br) out+='\n';
    }
    return out;
  }
  var WT={t:'w:t',tab:'w:tab',br:'w:br'};

  async function readDocx(zip){
    var doc=xml(await zip.file('word/document.xml').async('string')), body=doc.getElementsByTagName('w:body')[0], blocks=[];
    function para(p){
      var st=p.getElementsByTagName('w:pStyle')[0], style=st?st.getAttribute('w:val'):'', text=tx(p,WT);
      var m=/^heading\s*(\d)/i.exec(style), type='p';
      if(m)type='h'+Math.min(3,Number(m[1])); else if(/^title$/i.test(style))type='h1';
      else if(p.getElementsByTagName('w:numPr').length||/list/i.test(style))type='li';
      blocks.push({t:type,text:text});
    }
    for(var n=body.firstChild;n;n=n.nextSibling){
      if(n.nodeName==='w:p') para(n);
      else if(n.nodeName==='w:tbl'){
        var rows=n.getElementsByTagName('w:tr');
        for(var r=0;r<rows.length;r++){
          var cells=[]; for(var c=rows[r].firstChild;c;c=c.nextSibling) if(c.nodeName==='w:tc') cells.push(tx(c,WT).replace(/\s+/g,' ').trim());
          blocks.push({t:'tr',cells:cells});
        }
        blocks.push({t:'p',text:''});
      }
    }
    return {kind:'blocks',blocks:blocks};
  }

  async function readPptx(zip){
    var names=Object.keys(zip.files).filter(function(n){return /^ppt\/slides\/slide\d+\.xml$/.test(n)})
      .sort(function(a,b){return parseInt(a.match(/(\d+)\.xml/)[1])-parseInt(b.match(/(\d+)\.xml/)[1])});
    var AT={t:'a:t',br:'a:br'}, slides=[];
    for(var i=0;i<names.length;i++){
      var doc=xml(await zip.file(names[i]).async('string')), title='', lines=[];
      var shapes=doc.getElementsByTagName('p:sp');
      for(var s=0;s<shapes.length;s++){
        var ph=shapes[s].getElementsByTagName('p:ph')[0], type=ph?(ph.getAttribute('type')||''):'';
        var ps=shapes[s].getElementsByTagName('a:p');
        for(var k=0;k<ps.length;k++){
          var text=tx(ps[k],AT).replace(/\s+/g,' ').trim(); if(!text)continue;
          if(type==='title'||type==='ctrTitle'){title+=(title?' ':'')+text}
          else{var pp=ps[k].getElementsByTagName('a:pPr')[0]; lines.push({text:text,lvl:pp?Number(pp.getAttribute('lvl')||0):0})}
        }
      }
      var trs=doc.getElementsByTagName('a:tr');
      for(var r=0;r<trs.length;r++){
        var cs=trs[r].getElementsByTagName('a:tc'), row=[];
        for(var c=0;c<cs.length;c++) row.push(tx(cs[c],AT).replace(/\s+/g,' ').trim());
        lines.push({text:row.join(' | '),lvl:0,tr:true});
      }
      slides.push({title:title,lines:lines});
    }
    return {kind:'slides',slides:slides};
  }

  async function readXlsx(zip){
    var shared=[];
    if(zip.file('xl/sharedStrings.xml')){
      var ss=xml(await zip.file('xl/sharedStrings.xml').async('string')).getElementsByTagName('si');
      for(var i=0;i<ss.length;i++){var ts=ss[i].getElementsByTagName('t'),s='';for(var j=0;j<ts.length;j++)s+=ts[j].textContent;shared.push(s)}
    }
    var wb=xml(await zip.file('xl/workbook.xml').async('string')).getElementsByTagName('sheet'), sn=[];
    for(i=0;i<wb.length;i++)sn.push(wb[i].getAttribute('name'));
    var files=Object.keys(zip.files).filter(function(n){return /^xl\/worksheets\/sheet\d+\.xml$/.test(n)})
      .sort(function(a,b){return parseInt(a.match(/(\d+)\.xml/)[1])-parseInt(b.match(/(\d+)\.xml/)[1])});
    function col(ref){var m=/^([A-Z]+)/.exec(ref)[1],n=0;for(var q=0;q<m.length;q++)n=n*26+m.charCodeAt(q)-64;return n-1}
    var sheets=[];
    for(i=0;i<files.length;i++){
      var rows=xml(await zip.file(files[i]).async('string')).getElementsByTagName('row'), data=[];
      for(var r=0;r<rows.length;r++){
        var cells=rows[r].getElementsByTagName('c'), row=[];
        for(var c=0;c<cells.length;c++){
          var t=cells[c].getAttribute('t'), v=cells[c].getElementsByTagName('v')[0], val='';
          if(t==='s'&&v) val=shared[Number(v.textContent)]||'';
          else if(t==='inlineStr'){var it=cells[c].getElementsByTagName('t')[0];val=it?it.textContent:''}
          else if(v) val=v.textContent;
          row[col(cells[c].getAttribute('r'))]=val;
        }
        for(var z=0;z<row.length;z++) if(row[z]===undefined) row[z]='';
        data.push(row);
      }
      sheets.push({name:sn[i]||('Sheet '+(i+1)),rows:data});
    }
    return {kind:'sheets',sheets:sheets};
  }

  async function readText(f,isHtml){
    var s=await f.text(), blocks=[];
    if(!isHtml){
      s.replace(/\r\n?/g,'\n').split('\n').forEach(function(l){blocks.push({t:'p',text:l})});
      return {kind:'blocks',blocks:blocks};
    }
    var d=new DOMParser().parseFromString(s,'text/html');
    ['script','style','noscript'].forEach(function(t){Array.prototype.slice.call(d.getElementsByTagName(t)).forEach(function(n){n.remove()})});
    (function walk(n){
      for(var c=n.firstChild;c;c=c.nextSibling){
        if(c.nodeType!==1)continue;
        var tg=c.tagName.toLowerCase(), text=c.textContent.replace(/\s+/g,' ').trim();
        if(/^h[1-6]$/.test(tg)){if(text)blocks.push({t:'h'+Math.min(3,Number(tg[1])),text:text})}
        else if(tg==='li'){if(text)blocks.push({t:'li',text:text})}
        else if(tg==='tr'){var cs=Array.prototype.slice.call(c.children).map(function(x){return x.textContent.replace(/\s+/g,' ').trim()});blocks.push({t:'tr',cells:cs})}
        else if(tg==='p'||tg==='pre'||tg==='blockquote'){if(text)blocks.push({t:'p',text:tg==='pre'?c.textContent:text})}
        else walk(c);
      }
    })(d.body);
    return {kind:'blocks',blocks:blocks};
  }

  async function readPdf(f){
    var lib;
    try{lib=await import('./pdf.min.mjs')}
    catch(e){throw new Error('Reading PDF files only works when the website is opened from its web link (for example GitHub Pages), not from a downloaded file.')}
    lib.GlobalWorkerOptions.workerSrc='./pdf.worker.min.mjs';
    var pdf=await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise, blocks=[];
    for(var p=1;p<=pdf.numPages;p++){
      var tc=await (await pdf.getPage(p)).getTextContent(), lines=[], lastY=null, cur='';
      tc.items.forEach(function(it){
        if(typeof it.str!=='string')return;
        var y=Math.round(it.transform[5]);
        if(lastY!==null&&Math.abs(y-lastY)>3){lines.push(cur);cur=''}
        cur+=(cur&&it.str&&!/\s$/.test(cur)&&!/^\s/.test(it.str)?' ':'')+it.str; lastY=y;
      });
      if(cur)lines.push(cur);
      lines.forEach(function(l){if(l.trim())blocks.push({t:'p',text:l.trim()})});
      if(p<pdf.numPages)blocks.push({t:'pb'});
    }
    return {kind:'blocks',blocks:blocks};
  }

  async function readDoc(d){
    switch(d.det.key){
      case 'docx': return readDocx(d.det.zip);
      case 'pptx': return readPptx(d.det.zip);
      case 'xlsx': return readXlsx(d.det.zip);
      case 'pdf': return readPdf(d.file);
      case 'html': return readText(d.file,true);
      default: return readText(d.file,false);
    }
  }

  /* ================= make the new file ================= */
  function toBlocks(doc){
    if(doc.kind==='blocks') return doc.blocks;
    var b=[];
    if(doc.kind==='slides') doc.slides.forEach(function(s,i){
      if(i)b.push({t:'pb'});
      b.push({t:'h1',text:'Slide '+(i+1)+(s.title?': '+s.title:'')});
      s.lines.forEach(function(l){b.push(l.tr?{t:'tr',cells:l.text.split(' | ')}:{t:'li',text:l.text,lvl:l.lvl})});
    });
    if(doc.kind==='sheets') doc.sheets.forEach(function(sh){
      b.push({t:'h2',text:sh.name}); sh.rows.forEach(function(r){b.push({t:'tr',cells:r})}); b.push({t:'p',text:''});
    });
    return b;
  }

  function toTxt(doc){
    if(doc.kind==='sheets') return doc.sheets.map(function(sh){return sh.name+'\n'+sh.rows.map(function(r){return r.join('\t')}).join('\n')}).join('\n\n');
    return toBlocks(doc).map(function(b){
      if(b.t==='tr')return b.cells.join('\t');
      if(b.t==='li')return '- '+b.text;
      if(b.t==='pb')return '';
      return b.text;
    }).join('\n');
  }
  function toCsv(doc){
    function q(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
    return doc.sheets.map(function(sh){
      return (doc.sheets.length>1?q(sh.name)+'\n':'')+sh.rows.map(function(r){return r.map(q).join(',')}).join('\n');
    }).join('\n\n');
  }

  /* ---- PDF (real text, using pdf-lib) ---- */
  async function pdfFromBlocks(blocks,o){
    var L=PDFLib, pdf=await L.PDFDocument.create();
    var F=await pdf.embedFont(o.mono?L.StandardFonts.Courier:L.StandardFonts.Helvetica);
    var FB=await pdf.embedFont(o.mono?L.StandardFonts.CourierBold:L.StandardFonts.HelveticaBold);
    var cs=new Set(F.getCharacterSet()), W=o.w, H=o.h, M=o.m, page, y;
    function np(){page=pdf.addPage([W,H]);y=H-M}
    function clean(s){
      s=String(s).replace(/\t/g,'    ').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/\u00A0/g,' ');
      return Array.from(s).map(function(ch){return cs.has(ch.codePointAt(0))?ch:'?'}).join('');
    }
    function wrap(text,font,size,maxW){
      var out=[];
      String(text).split('\n').forEach(function(par){
        var words=par.split(' '), cur='';
        words.forEach(function(w){
          var t=cur?cur+' '+w:w;
          if(font.widthOfTextAtSize(t,size)<=maxW){cur=t;return}
          if(cur)out.push(cur);
          while(font.widthOfTextAtSize(w,size)>maxW&&w.length>1){var i=w.length;while(i>1&&font.widthOfTextAtSize(w.slice(0,i),size)>maxW)i--;out.push(w.slice(0,i));w=w.slice(i)}
          cur=w;
        });
        out.push(cur);
      });
      return out;
    }
    function put(text,font,size,indent,before,after,bullet){
      var lh=size*1.35, lines=wrap(clean(text),font,size,W-2*M-indent);
      if(before&&y<H-M-1)y-=before;
      lines.forEach(function(ln,i){
        if(y-lh<M)np();
        y-=lh;
        if(bullet&&i===0)page.drawText('\u2022'.replace('\u2022','-'),{x:M+indent-14,y:y+size*.25,size:size,font:F});
        if(ln)page.drawText(ln,{x:M+indent,y:y+size*.25,size:size,font:font});
      });
      y-=after;
    }
    np();
    blocks.forEach(function(b){
      if(b.t==='h1')put(b.text,FB,22,0,10,6);
      else if(b.t==='h2')put(b.text,FB,17,0,8,5);
      else if(b.t==='h3')put(b.text,FB,14,0,6,4);
      else if(b.t==='li')put(b.text,F,12,18+(b.lvl||0)*18,0,3,true);
      else if(b.t==='tr')put(b.cells.join(' | '),F,11,0,0,3);
      else if(b.t==='pb'){np()}
      else if(!b.text||!b.text.trim()){y-=8}
      else put(b.text,F,12,0,0,5);
    });
    return new Blob([await pdf.save()],{type:'application/pdf'});
  }

  async function pdfFromSlides(slides,o){
    var L=PDFLib, pdf=await L.PDFDocument.create();
    var F=await pdf.embedFont(L.StandardFonts.Helvetica), FB=await pdf.embedFont(L.StandardFonts.HelveticaBold);
    var cs=new Set(F.getCharacterSet()), W=o.h, H=o.w, M=48, pages=[], page, y;
    function clean(s){
      s=String(s).replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/\u00A0/g,' ');
      return Array.from(s).map(function(ch){return cs.has(ch.codePointAt(0))?ch:'?'}).join('');
    }
    function wrap(text,font,size,maxW){
      var words=text.split(' '),out=[],cur='';
      words.forEach(function(w){
        var t=cur?cur+' '+w:w;
        if(font.widthOfTextAtSize(t,size)<=maxW){cur=t;return}
        if(cur)out.push(cur);
        while(font.widthOfTextAtSize(w,size)>maxW&&w.length>1){var i=w.length;while(i>1&&font.widthOfTextAtSize(w.slice(0,i),size)>maxW)i--;out.push(w.slice(0,i));w=w.slice(i)}
        cur=w;
      });
      out.push(cur);return out;
    }
    function np(n){page=pdf.addPage([W,H]);y=H-M;pages.push({page:page,n:n})}
    slides.forEach(function(s,i){
      np(i+1);
      function put(text,font,size,indent,after){
        var lh=size*1.3, lines=wrap(clean(text),font,size,W-2*M-indent);
        lines.forEach(function(ln,k){
          if(y-lh<M+16){np(i+1)}
          y-=lh; if(ln)page.drawText(ln,{x:M+indent,y:y+size*.25,size:size,font:font});
        });
        y-=after;
      }
      if(s.title)put(s.title,FB,26,0,14);
      if(!s.title&&!s.lines.length)put('(no text on this slide)',F,16,0,0);
      s.lines.forEach(function(l){
        var ind=(l.lvl||0)*22+(l.tr?0:16);
        if(!l.tr){ if(y-18*1.3<M+16)np(i+1); page.drawText('-',{x:M+ind-14,y:y-18*1.3+18*.25,size:18,font:F}) }
        put(l.text,F,l.tr?14:18,ind,5);
      });
    });
    pages.forEach(function(p){p.page.drawText('Slide '+p.n,{x:W/2-20,y:22,size:10,font:F})});
    return new Blob([await pdf.save()],{type:'application/pdf'});
  }

  /* ---- Word (.docx), made by hand with JSZip ---- */
  function esc(s){return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function runs(text,rpr){
    return String(text).split('\n').map(function(line,i){
      return '<w:r>'+(rpr?'<w:rPr>'+rpr+'</w:rPr>':'')+(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+esc(line).replace(/\t/g,'</w:t><w:tab/><w:t xml:space="preserve">')+'</w:t></w:r>';
    }).join('');
  }
  async function docxFromBlocks(blocks){
    var body='', i=0;
    var size={h1:40,h2:32,h3:28};
    while(i<blocks.length){
      var b=blocks[i];
      if(b.t==='tr'){
        var rows=[];while(i<blocks.length&&blocks[i].t==='tr'){rows.push(blocks[i].cells);i++}
        var n=Math.max.apply(null,rows.map(function(r){return r.length}))||1, w=Math.floor(9000/n);
        var bd='<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
        body+='<w:tbl><w:tblPr><w:tblW w:w="'+(w*n)+'" w:type="dxa"/><w:tblBorders>'+bd+'</w:tblBorders></w:tblPr><w:tblGrid>'+new Array(n+1).join('<w:gridCol w:w="'+w+'"/>')+'</w:tblGrid>'+
          rows.map(function(r){var cells='';for(var c=0;c<n;c++)cells+='<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/></w:tcPr><w:p>'+runs(r[c]||'','')+'</w:p></w:tc>';return '<w:tr>'+cells+'</w:tr>'}).join('')+'</w:tbl><w:p/>';
        continue;
      }
      if(b.t==='pb') body+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else if(size[b.t]) body+='<w:p><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>'+runs(b.text,'<w:b/><w:sz w:val="'+size[b.t]+'"/>')+'</w:p>';
      else if(b.t==='li') body+='<w:p><w:pPr><w:ind w:left="'+(720+(b.lvl||0)*360)+'" w:hanging="360"/></w:pPr>'+runs('\u2022\t'+b.text,'')+'</w:p>';
      else body+='<w:p>'+(b.text?runs(b.text,''):'')+'</w:p>';
      i++;
    }
    var z=new JSZip();
    z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>');
    return z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
  }

  /* ---- Word 97-2003 (.doc), written as RTF which Word opens ---- */
  function rtfEsc(s){
    return String(s).replace(/[\\{}]/g,'\\$&').replace(/[\u0080-\uFFFF]/g,function(c){var n=c.charCodeAt(0);return '\\u'+(n>32767?n-65536:n)+'?'})
      .replace(/\n/g,'\\line ').replace(/\t/g,'\\tab ');
  }
  function rtfFromBlocks(blocks){
    var out='{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24\n', i=0, size={h1:40,h2:32,h3:28};
    while(i<blocks.length){
      var b=blocks[i];
      if(b.t==='tr'){
        var rows=[];while(i<blocks.length&&blocks[i].t==='tr'){rows.push(blocks[i].cells);i++}
        var n=Math.max.apply(null,rows.map(function(r){return r.length}))||1, w=Math.floor(9000/n);
        rows.forEach(function(r){
          var o='\\trowd\\trgaph108';
          for(var c=0;c<n;c++) o+='\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx'+(w*(c+1));
          for(c=0;c<n;c++) o+='\\pard\\intbl '+rtfEsc(r[c]||'')+'\\cell';
          out+=o+'\\row\n';
        });
        out+='\\pard\\par\n';
        continue;
      }
      if(b.t==='pb') out+='\\page\n';
      else if(size[b.t]) out+='\\pard\\sb200\\sa100\\b\\fs'+size[b.t]+' '+rtfEsc(b.text)+'\\b0\\fs24\\par\n';
      else if(b.t==='li') out+='\\pard\\li'+(720+(b.lvl||0)*360)+'\\fi-360 \\bullet\\tab '+rtfEsc(b.text)+'\\par\n';
      else out+='\\pard\\sa100 '+rtfEsc(b.text||'')+'\\par\n';
      i++;
    }
    return new Blob([out+'}'],{type:'application/msword'});
  }

  /* ---- PowerPoint (.pptx), made with PptxGenJS ---- */
  function slidesFromBlocks(blocks,fallback){
    var slides=[], cur=null;
    function start(t){cur={title:t,lines:[]};slides.push(cur)}
    blocks.forEach(function(b){
      if(/^h[123]$/.test(b.t)){start(b.text||'')}
      else if(b.t==='pb'){cur=null}
      else{
        var line=b.t==='tr'?b.cells.join(' | '):b.text;
        if(!line||!String(line).trim())return;
        if(!cur)start(fallback);
        cur.lines.push({text:String(line).trim(),lvl:b.lvl||0,tr:b.t==='tr'});
      }
    });
    if(!slides.length)slides.push({title:fallback,lines:[]});
    var out=[];
    slides.forEach(function(s){
      var chunk=[],chars=0,n=0;
      function flush(){out.push({title:s.title+(n?' (continued)':''),lines:chunk});chunk=[];chars=0;n++}
      s.lines.forEach(function(l){
        if(chunk.length&&(chunk.length>=7||chars+l.text.length>650))flush();
        chunk.push(l);chars+=l.text.length;
      });
      if(chunk.length||!n)flush();
    });
    return out;
  }
  async function pptxFromSlides(slides){
    var p=new PptxGenJS(); p.layout='LAYOUT_16x9';
    slides.forEach(function(s){
      var sl=p.addSlide();
      sl.addText(s.title||'',{x:0.5,y:0.3,w:9,h:0.9,fontSize:28,bold:true,fontFace:'Arial',color:'1B2A5C',valign:'middle',fit:'shrink'});
      if(s.lines.length){
        var chars=s.lines.reduce(function(a,l){return a+l.text.length},0), fs=chars>500?14:chars>300?16:20;
        sl.addText(s.lines.map(function(l){return {text:l.text,options:{bullet:!l.tr,indentLevel:l.lvl||0,breakLine:true}}}),
          {x:0.6,y:1.3,w:8.8,h:4,fontSize:fs,fontFace:'Arial',color:'222222',valign:'top',fit:'shrink'});
      }
    });
    return await p.write({outputType:'blob'});
  }
  $('makeppt').addEventListener('click',async function(){
    if(!imgs.length)return;
    var btn=$('makeppt'); btn.disabled=true; say('Making your PowerPoint…');
    try{
      var p=new PptxGenJS(); p.layout='LAYOUT_16x9';
      imgs.forEach(function(it){
        var c=draw(it,1600), sl=p.addSlide(), cap=it.cap&&it.cap.trim()?it.cap.trim():'';
        var aw=9, ah=cap?4.5:5.05, r=c.width/c.height, w=Math.min(aw,ah*r), h=w/r;
        sl.addImage({data:c.toDataURL('image/jpeg',.85),x:0.5+(aw-w)/2,y:0.25+(ah-h)/2,w:w,h:h});
        if(cap)sl.addText(cap,{x:0.5,y:4.85,w:9,h:0.6,fontSize:16,fontFace:'Arial',align:'center',color:'222222',fit:'shrink'});
      });
      var blob=await p.write({outputType:'blob'});
      var nm=($('name').value||'my-notes').replace(/[\\\/:*?"<>|]+/g,'').trim()||'my-notes';
      save(blob,nm+'.pptx');
      say('Done! '+imgs.length+' slide'+(imgs.length>1?'s':'')+', '+(blob.size/1048576).toFixed(2)+' MB. Check your Downloads.');
    }catch(e){say('Something went wrong. Try fewer photos.',true)}
    btn.disabled=false;
  });

  async function convertDoc(d,li){
    var msg=li.querySelector('.dmsg'), btn=li.querySelector('.go');
    msg.classList.remove('err'); msg.textContent='Converting…'; btn.disabled=true;
    try{
      var need=[['JSZip','jszip.min.js'],['PDFLib','pdf-lib.min.js'],['PptxGenJS','pptxgen.bundle.js']];
      for(var q=0;q<need.length;q++) if(typeof window[need[q][0]]==='undefined') throw new Error('A needed file is missing: '+need[q][1]+'. Put it in the same folder as index.html, or use the single-file version of the website.');
      var doc=await readDoc(d), t=d.target, name=baseName(d.file.name)+'.'+TARGET[t].ext, blob;
      var sz=$('dsize').value.split(',').map(Number);
      if(t==='txt') blob=new Blob([toTxt(doc)],{type:'text/plain;charset=utf-8'});
      else if(t==='csv') blob=new Blob(['\uFEFF'+toCsv(doc)],{type:'text/csv;charset=utf-8'});
      else if(t==='docx') blob=await docxFromBlocks(toBlocks(doc));
      else if(t==='doc') blob=rtfFromBlocks(toBlocks(doc));
      else if(t==='pptx') blob=await pptxFromSlides(doc.kind==='slides'?doc.slides:slidesFromBlocks(toBlocks(doc),baseName(d.file.name)));
      else if(doc.kind==='slides') blob=await pdfFromSlides(doc.slides,{w:sz[0],h:sz[1]});
      else blob=await pdfFromBlocks(toBlocks(doc),{w:sz[0],h:sz[1],m:72,mono:!!d.det.mono});
      save(blob,name);
      var same=(d.det.key===t)||(d.det.key==='text'&&t==='txt');
      d.msg='Done: '+name+' ('+kb(blob.size)+')'+(same?'. This is a new copy that keeps the text, headings, lists and tables only.':''); msg.textContent=d.msg;
    }catch(e){
      d.err=true; d.msg=(e&&e.message)||'Something went wrong.'; msg.textContent=d.msg; msg.classList.add('err');
    }
    btn.disabled=false;
  }

  $('all').addEventListener('click',async function(){
    var rows=$('docs').children;
    for(var i=0;i<docs.length;i++) if(docs[i].det.key!=='bad') await convertDoc(docs[i],rows[i]);
  });

  /* ================= read the words in photos (OCR) ================= */
  function loadScript(src){
    return new Promise(function(res,rej){
      var el=document.createElement('script'); el.src=src; el.onload=res;
      el.onerror=function(){rej(new Error('Could not load the word-reading tool. Please check your internet connection and try again.'))};
      document.head.appendChild(el);
    });
  }
  function ocrSay(m,err){var e=$('ocrmsg');e.textContent=m;e.className='dmsg'+(err?' err':'')}
  $('ocr').addEventListener('click',async function(){
    if(!imgs.length)return;
    var btn=$('ocr'); btn.disabled=true; $('ocrsec').hidden=false;
    $('ocrsec').scrollIntoView({behavior:'smooth',block:'start'});
    try{
      ocrSay('Loading the word-reading tool…');
      if(typeof window.Tesseract==='undefined') await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
      var lang=$('ocrlang').value, cur=0;
      var worker=await Tesseract.createWorker(lang,1,{logger:function(m){
        if(m.status==='recognizing text') ocrSay('Reading photo '+(cur+1)+' of '+imgs.length+'… '+Math.round(m.progress*100)+'%');
        else if(m.status) ocrSay('Preparing… ('+m.status+')');
      }});
      var out=[];
      for(cur=0;cur<imgs.length;cur++){
        var r=await worker.recognize(draw(imgs[cur],2000));
        out.push((r.data.text||'').replace(/\r/g,'').trim());
      }
      await worker.terminate();
      var all=out.join('\n\n').trim();
      $('ocrtext').value=all;
      ocrSay(all?'Done. Check the text below, fix any mistakes, then choose what to convert to.':'No words were found. Try a clearer, straighter photo with good light.',!all);
    }catch(e){ ocrSay((e&&e.message)||'Something went wrong.',true) }
    btn.disabled=false;
  });
  $('ocrgo').addEventListener('click',async function(){
    var text=$('ocrtext').value, msg=$('ocrmsg'), btn=$('ocrgo');
    if(!text.trim()){ocrSay('There is no text to convert yet. Click Read words from photos first.',true);return}
    btn.disabled=true; ocrSay('Converting…');
    try{
      var need=[['JSZip','jszip.min.js'],['PDFLib','pdf-lib.min.js'],['PptxGenJS','pptxgen.bundle.js']];
      for(var q=0;q<need.length;q++) if(typeof window[need[q][0]]==='undefined') throw new Error('A needed file is missing: '+need[q][1]+'.');
      var t=$('ocrt').value, base=(($('name').value||'my-notes').replace(/[\\\/:*?"<>|]+/g,'').trim()||'my-notes')+'-text';
      var blocks=text.replace(/\r\n?/g,'\n').split('\n').map(function(l){return {t:'p',text:l}}), doc={kind:'blocks',blocks:blocks}, blob;
      var sz=$('size').value.split(',').map(Number);
      if(t==='txt') blob=new Blob([text],{type:'text/plain;charset=utf-8'});
      else if(t==='docx') blob=await docxFromBlocks(blocks);
      else if(t==='doc') blob=rtfFromBlocks(blocks);
      else if(t==='pptx') blob=await pptxFromSlides(slidesFromBlocks(blocks,base));
      else blob=await pdfFromBlocks(blocks,{w:sz[0],h:sz[1],m:72,mono:false});
      save(blob,base+'.'+TARGET[t].ext);
      ocrSay('Done: '+base+'.'+TARGET[t].ext+' ('+kb(blob.size)+')');
    }catch(e){ocrSay((e&&e.message)||'Something went wrong.',true)}
    btn.disabled=false;
  });

  /* ================= photos to one PDF (with captions) ================= */
  function dataToBytes(url){
    var b=atob(url.split(',')[1]),u=new Uint8Array(b.length);
    for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u;
  }
  function wrapCap(g,text,maxW,maxL){
    var words=text.split(/\s+/),lines=[],cur='';
    words.forEach(function(w){
      var test=cur?cur+' '+w:w;
      if(g.measureText(test).width<=maxW){cur=test;return}
      if(cur)lines.push(cur);
      while(g.measureText(w).width>maxW&&w.length>1){
        var i=w.length; while(i>1&&g.measureText(w.slice(0,i)).width>maxW)i--;
        lines.push(w.slice(0,i)); w=w.slice(i);
      }
      cur=w;
    });
    if(cur)lines.push(cur);
    if(lines.length>maxL){lines=lines.slice(0,maxL);lines[maxL-1]=lines[maxL-1].slice(0,-1)+'…'}
    return lines;
  }
  function composePage(group,pw,ph,m,cols,rows,per){
    var S=2.5, W=Math.round(pw*S), H=Math.round(ph*S);
    var c=document.createElement('canvas'); c.width=W; c.height=H;
    var g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,W,H);
    var mp=m*S, cw=(W-2*mp)/cols, ch=(H-2*mp)/rows, pad=per>1?8*S:0;
    var fs=(per<=2?12:per===4?10:9)*S, lh=fs*1.3;
    g.font=fs+'px Helvetica, Arial, sans-serif'; g.textAlign='center'; g.textBaseline='top'; g.fillStyle='#111';
    group.forEach(function(it,k){
      var cx=mp+(k%cols)*cw+pad, cy=mp+Math.floor(k/cols)*ch+pad, aw=cw-2*pad, ah=ch-2*pad;
      var lines=it.cap&&it.cap.trim()?wrapCap(g,it.cap.trim(),aw,3):[];
      var capH=lines.length?lines.length*lh+fs*.6:0;
      var im=draw(it,2000), room=Math.max(ah-capH,ah*.3);
      var s=Math.min(aw/im.width,room/im.height), dw=im.width*s, dh=im.height*s;
      var top=cy+(ah-(dh+capH))/2;
      g.drawImage(im,cx+(aw-dw)/2,top,dw,dh);
      lines.forEach(function(t,i){g.fillText(t,cx+aw/2,top+dh+fs*.6+i*lh)});
    });
    return c;
  }
  function buildPDF(pages){
    var enc=new TextEncoder(), chunks=[], len=0, offs=[];
    function put(x){var u=typeof x==='string'?enc.encode(x):x;chunks.push(u);len+=u.length}
    function num(n){return (Math.round(n*100)/100).toString()}
    put('%PDF-1.4\n');
    var total=2+pages.length*3;
    offs[1]=len; put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    var kids=pages.map(function(p,i){return (3+i*3)+' 0 R'}).join(' ');
    offs[2]=len; put('2 0 obj\n<< /Type /Pages /Kids ['+kids+'] /Count '+pages.length+' >>\nendobj\n');
    pages.forEach(function(p,i){
      var pg=3+i*3, ct=pg+1, im=pg+2;
      offs[pg]=len;
      put(pg+' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+num(p.pw)+' '+num(p.ph)+'] /Resources << /XObject << /Im0 '+im+' 0 R >> >> /Contents '+ct+' 0 R >>\nendobj\n');
      var cs='q '+num(p.pw)+' 0 0 '+num(p.ph)+' 0 0 cm /Im0 Do Q';
      offs[ct]=len; put(ct+' 0 obj\n<< /Length '+cs.length+' >>\nstream\n'+cs+'\nendstream\nendobj\n');
      offs[im]=len;
      put(im+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+p.w+' /Height '+p.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpg.length+' >>\nstream\n');
      put(p.jpg); put('\nendstream\nendobj\n');
    });
    var xr=len, x='xref\n0 '+(total+1)+'\n0000000000 65535 f \n';
    for(var i=1;i<=total;i++)x+=('0000000000'+offs[i]).slice(-10)+' 00000 n \n';
    put(x+'trailer\n<< /Size '+(total+1)+' /Root 1 0 R >>\nstartxref\n'+xr+'\n%%EOF');
    return new Blob(chunks,{type:'application/pdf'});
  }

  $('make').addEventListener('click',function(){
    if(!imgs.length)return;
    var btn=$('make'); btn.disabled=true; say('Making your PDF…');
    setTimeout(function(){
      try{
        var sz=$('size').value.split(',').map(Number), mode=$('orient').value,
            m=Number($('margin').value), q=Number($('qual').value), per=perPage(), pages=[];
        for(var i=0;i<imgs.length;i+=per){
          var group=imgs.slice(i,i+per), land;
          if(per===1&&mode==='auto'){
            var it=group[0], sideways=it.rot%180!==0;
            land=sideways?it.img.naturalHeight>it.img.naturalWidth:it.img.naturalWidth>it.img.naturalHeight;
          }else{land=mode==='l'}
          var pw=land?sz[1]:sz[0], ph=land?sz[0]:sz[1];
          var cols=1, rows=1;
          if(per===2){cols=land?2:1;rows=land?1:2}
          if(per===4){cols=2;rows=2}
          if(per===6){cols=land?3:2;rows=land?2:3}
          var c=composePage(group,pw,ph,m,cols,rows,per);
          pages.push({jpg:dataToBytes(c.toDataURL('image/jpeg',q)),w:c.width,h:c.height,pw:pw,ph:ph});
        }
        var blob=buildPDF(pages);
        var nm=($('name').value||'my-notes').replace(/[\\\/:*?"<>|]+/g,'').trim()||'my-notes';
        save(blob,nm+'.pdf');
        say('Done! '+pages.length+' page'+(pages.length>1?'s':'')+', '+(blob.size/1048576).toFixed(2)+' MB. Check your Downloads.');
      }catch(e){say('Something went wrong. Try fewer photos or a smaller quality.',true)}
      btn.disabled=false;
    },50);
  });
})();
