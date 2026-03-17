/* ========== THREE.JS MULTI-SHAPE GALAXY BACKGROUND ========== */
(function initGalaxy(){
  const canvas=document.getElementById('galaxy-bg');
  if(!canvas||typeof THREE==='undefined')return;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,1000);
  camera.position.z=5;
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  const starCount=800;const starGeo=new THREE.BufferGeometry();const starPos=new Float32Array(starCount*3);
  for(let i=0;i<starCount;i++){starPos[i*3]=(Math.random()-.5)*30;starPos[i*3+1]=(Math.random()-.5)*30;starPos[i*3+2]=(Math.random()-.5)*30}
  starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  const starMat=new THREE.PointsMaterial({color:0xffffff,size:0.015,transparent:true,opacity:0.35,sizeAttenuation:true});
  const stars=new THREE.Points(starGeo,starMat);scene.add(stars);
  const shapeMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.06});
  const shapeMat2=new THREE.LineBasicMaterial({color:0xaaaaaa,transparent:true,opacity:0.04});
  const shapes=[];
  function addShape(geo,x,y,z,s,mat){const edges=new THREE.EdgesGeometry(geo);const line=new THREE.LineSegments(edges,mat||shapeMat);line.position.set(x,y,z);line.scale.setScalar(s);line.userData={rx:(Math.random()-.5)*.003,ry:(Math.random()-.5)*.003,rz:(Math.random()-.5)*.002,fy:y,amp:Math.random()*.3+.1,spd:Math.random()*.0005+.0003,ph:Math.random()*Math.PI*2};scene.add(line);shapes.push(line)}
  for(let i=0;i<10;i++)addShape(new THREE.TorusGeometry(.5,0.01,8,32),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-3,Math.random()*.7+.2,i%2?shapeMat:shapeMat2);
  for(let i=0;i<12;i++)addShape(new THREE.OctahedronGeometry(.5),(Math.random()-.5)*20,(Math.random()-.5)*14,(Math.random()-.5)*10-4,Math.random()*.5+.15,i%3?shapeMat:shapeMat2);
  for(let i=0;i<10;i++)addShape(new THREE.TetrahedronGeometry(.5),(Math.random()-.5)*20,(Math.random()-.5)*14,(Math.random()-.5)*10-3,Math.random()*.5+.15,i%2?shapeMat2:shapeMat);
  for(let i=0;i<8;i++)addShape(new THREE.BoxGeometry(.6,.6,.6),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-4,Math.random()*.4+.15,shapeMat2);
  for(let i=0;i<7;i++)addShape(new THREE.IcosahedronGeometry(.5),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-5,Math.random()*.5+.2,shapeMat);
  for(let i=0;i<6;i++)addShape(new THREE.DodecahedronGeometry(.5),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-4,Math.random()*.5+.2,shapeMat2);
  for(let i=0;i<7;i++)addShape(new THREE.ConeGeometry(.4,.7,4),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-3,Math.random()*.4+.15,i%2?shapeMat:shapeMat2);
  for(let i=0;i<5;i++)addShape(new THREE.CylinderGeometry(.2,.2,.6,6),(Math.random()-.5)*18,(Math.random()-.5)*14,(Math.random()-.5)*10-4,Math.random()*.4+.2,i%2?shapeMat:shapeMat2);
  const texts=[];
  [{x:0,y:0,z:-3,s:1,a:0.03},{x:-4,y:2,z:-5,s:.7,a:0.018},{x:3,y:-1.5,z:-6,s:.6,a:0.015},{x:-2,y:-3,z:-4,s:.5,a:0.012},{x:5,y:3,z:-7,s:.45,a:0.01}].forEach((tp,i)=>{
    const tc=document.createElement('canvas');tc.width=1024;tc.height=256;const cx=tc.getContext('2d');
    cx.fillStyle=`rgba(255,255,255,${tp.a})`;cx.font=`bold ${Math.round(80*tp.s)}px Inter, sans-serif`;cx.textAlign='center';cx.textBaseline='middle';cx.fillText('Grok Studio',512,128);
    const tex=new THREE.CanvasTexture(tc);const geo=new THREE.PlaneGeometry(8*tp.s,2*tp.s);const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});
    const m=new THREE.Mesh(geo,mat);m.position.set(tp.x,tp.y,tp.z);m.rotation.z=(Math.random()-.5)*.08;
    m.userData={fy:tp.y,amp:.2+Math.random()*.15,spd:.0004+Math.random()*.0003,ph:Math.random()*Math.PI*2,baseAlpha:tp.a};scene.add(m);texts.push(m);
  });

  /* ── Shooting Stars (3 meteors) ── */
  const meteors=[];
  for(let i=0;i<3;i++){
    const tailLen=40;const pts=new Float32Array(tailLen*3);const alphas=new Float32Array(tailLen);
    for(let j=0;j<tailLen;j++){alphas[j]=1-j/tailLen}
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pts,3));
    geo.setAttribute('alpha',new THREE.BufferAttribute(alphas,1));
    const mat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uOpacity:{value:0}},
      vertexShader:`attribute float alpha;varying float vAlpha;void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=2.0;}`,
      fragmentShader:`uniform float uOpacity;varying float vAlpha;void main(){float a=vAlpha*uOpacity;gl_FragColor=vec4(1.0,1.0,1.0,a);}`
    });
    const line=new THREE.Line(geo,mat);
    line.frustumCulled=false;
    const angle=-0.5-Math.random()*0.4;
    const speed=0.12+Math.random()*0.08;
    line.userData={
      active:false,
      progress:0,
      angle:angle,
      speed:speed,
      sx:0,sy:0,sz:-2,
      dx:Math.cos(angle)*speed,
      dy:Math.sin(angle)*speed,
      tailLen:tailLen,
      nextTime:3+Math.random()*8+i*4,
      fadeIn:0
    };
    scene.add(line);meteors.push(line);
  }
  function resetMeteor(m){
    const d=m.userData;
    d.sx=(Math.random()-.5)*20;
    d.sy=5+Math.random()*6;
    d.sz=-2-Math.random()*3;
    d.angle=-0.4-Math.random()*0.5;
    d.speed=0.1+Math.random()*0.1;
    d.dx=Math.cos(d.angle)*d.speed;
    d.dy=Math.sin(d.angle)*d.speed;
    d.progress=0;d.active=true;d.fadeIn=0;
  }

  const clock=new THREE.Clock();
  function animate(){requestAnimationFrame(animate);const t=clock.getElapsedTime();stars.rotation.y+=0.00015;stars.rotation.x+=0.00008;
    shapes.forEach(s=>{s.rotation.x+=s.userData.rx;s.rotation.y+=s.userData.ry;s.rotation.z+=s.userData.rz;s.position.y=s.userData.fy+Math.sin(t*s.userData.spd*1000+s.userData.ph)*s.userData.amp});
    texts.forEach((m,i)=>{const d=m.userData;m.material.opacity=d.baseAlpha+Math.sin(t*0.4+i*1.5)*d.baseAlpha*0.4;m.position.y=d.fy+Math.sin(t*d.spd*1000+d.ph)*d.amp;m.position.x+=Math.sin(t*0.1+i)*0.0003});
    /* Animate meteors */
    meteors.forEach(m=>{
      const d=m.userData;
      if(!d.active){
        d.nextTime-=1/60;
        m.material.uniforms.uOpacity.value=0;
        if(d.nextTime<=0)resetMeteor(m);
        return;
      }
      d.progress++;d.fadeIn=Math.min(d.fadeIn+0.08,1);
      const headX=d.sx+d.dx*d.progress;
      const headY=d.sy+d.dy*d.progress;
      const pos=m.geometry.attributes.position.array;
      for(let j=0;j<d.tailLen;j++){
        const frac=j/d.tailLen;
        pos[j*3]=headX-d.dx*j*0.6;
        pos[j*3+1]=headY-d.dy*j*0.6;
        pos[j*3+2]=d.sz;
      }
      m.geometry.attributes.position.needsUpdate=true;
      m.material.uniforms.uOpacity.value=d.fadeIn*0.7;
      if(headY<-12||headX>18||headX<-18){
        d.active=false;d.nextTime=5+Math.random()*10;
        m.material.uniforms.uOpacity.value=0;
      }
    });
    renderer.render(scene,camera)}
  animate();
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
})();

/* ========== API CLIENT ========== */
const API={
  base:'/api',token:localStorage.getItem('gs_token'),
  async req(path,opts={}){const h={'Content-Type':'application/json',...opts.headers};if(this.token)h['Authorization']='Bearer '+this.token;const r=await fetch(this.base+path,{...opts,headers:h});let d;try{const txt=await r.text();try{d=JSON.parse(txt)}catch{d={error:txt.substring(0,200)||('HTTP '+r.status)}}}catch(e){d={error:'Network error: '+e.message}}if(r.status===401){if(d&&d.session_kicked){this.clear();alert('⚠️ Tài khoản đã đăng nhập ở thiết bị khác.\nBạn sẽ được chuyển về trang đăng nhập.');location.reload();throw new Error('Session kicked')}this.clear();location.reload();throw new Error('Session expired')}if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d},
  set(t){this.token=t;localStorage.setItem('gs_token',t);localStorage.setItem('gs_time',''+Date.now())},
  clear(){this.token=null;['gs_token','gs_time','gs_user'].forEach(k=>localStorage.removeItem(k))},
  valid(){const t=localStorage.getItem('gs_time');return!!(t&&this.token&&(Date.now()-+t)<864e5)},
  saveU(u){localStorage.setItem('gs_user',JSON.stringify(u))},
  getU(){try{return JSON.parse(localStorage.getItem('gs_user'))}catch{return null}},
  login:(e,p,ref)=>API.req('/auth/login',{method:'POST',body:JSON.stringify({email:e,password:p,ref:ref||undefined})}),
  register:(e,p,n,ref)=>API.req('/auth/register',{method:'POST',body:JSON.stringify({email:e,password:p,name:n,ref:ref||undefined})}),
  me:()=>API.req('/auth/me',{method:'POST'}),
  updateProfile:d=>API.req('/auth/profile',{method:'POST',body:JSON.stringify(d)}),
  getAccounts:()=>API.req('/accounts'),
  addAccount:(t,l)=>API.req('/accounts',{method:'POST',body:JSON.stringify({sso_token:t,label:l})}),
  updAccount:(id,t,l)=>API.req('/accounts/'+id,{method:'PUT',body:JSON.stringify({sso_token:t,label:l})}),
  delAccount:id=>API.req('/accounts/'+id,{method:'DELETE'}),
  bulkDelAccounts:ids=>API.req('/accounts/bulk',{method:'DELETE',body:JSON.stringify({ids})}),
  generate:p=>API.req('/generate',{method:'POST',body:JSON.stringify(p)}),
  diagnose:()=>API.req('/generate',{method:'POST',body:JSON.stringify({type:'diagnose'})}),
  getHistory:(type,lim=50,fav,status,from,to)=>{const q=new URLSearchParams();if(type)q.set('type',type);if(fav)q.set('favorite','1');if(status)q.set('status',status);if(from)q.set('from',from);if(to)q.set('to',to);q.set('limit',lim);return API.req('/history?'+q.toString())},
  delHistory:id=>API.req('/history/'+id,{method:'DELETE'}),
  favHistory:id=>API.req('/history/'+id+'/favorite',{method:'PUT'}),
  bulkHistory:(action,ids)=>API.req('/history/bulk',{method:'POST',body:JSON.stringify({action,ids})}),
  bulkStatus:(action,status)=>API.req('/history/bulk-status',{method:'POST',body:JSON.stringify({action,status})}),
  getPlans:()=>API.req('/plans'),
  adm:{stats:()=>API.req('/admin/stats'),users:(q='')=>API.req('/admin/users?'+q),updUser:(id,d)=>API.req('/admin/users/'+id,{method:'PUT',body:JSON.stringify(d)}),delUser:id=>API.req('/admin/users/'+id,{method:'DELETE'}),createUser:d=>API.req('/admin/users',{method:'POST',body:JSON.stringify(d)}),bulkCreate:d=>API.req('/admin/users/bulk',{method:'POST',body:JSON.stringify(d)}),userUsage:id=>API.req('/admin/users/'+id+'/usage'),accounts:(q='')=>API.req('/admin/accounts?'+q),updAcc:(id,d)=>API.req('/admin/accounts/'+id,{method:'PUT',body:JSON.stringify(d)}),delAcc:id=>API.req('/admin/accounts/'+id,{method:'DELETE'}),history:(q='')=>API.req('/admin/history?'+q),updPlan:(id,d)=>API.req('/admin/plans/'+id,{method:'PUT',body:JSON.stringify(d)}),payments:(q='')=>API.req('/admin/payments?'+q),updPay:(id,d)=>API.req('/admin/payments/'+id,{method:'PUT',body:JSON.stringify(d)}),delPay:id=>API.req('/admin/payments/'+id,{method:'DELETE'}),svcPlans:()=>API.req('/admin/service-plans'),updSvcPlan:(id,d)=>API.req('/admin/service-plans/'+id,{method:'PUT',body:JSON.stringify(d)}),addSvcPlan:d=>API.req('/admin/service-plans',{method:'POST',body:JSON.stringify(d)}),delSvcPlan:id=>API.req('/admin/service-plans/'+id,{method:'DELETE'})},
  pay:{create:plan_id=>API.req('/payment/create',{method:'POST',body:JSON.stringify({plan_id})}),check:memo_code=>API.req('/payment/check',{method:'POST',body:JSON.stringify({memo_code})}),confirm:(memo_code,transaction_id,amount)=>API.req('/payment/confirm',{method:'POST',body:JSON.stringify({memo_code,transaction_id,amount})}),history:()=>API.req('/payment/history')},
  aff:{list:()=>API.req('/admin/affiliates'),add:d=>API.req('/admin/affiliates',{method:'POST',body:JSON.stringify(d)}),upd:(id,d)=>API.req('/admin/affiliates/'+id,{method:'PUT',body:JSON.stringify(d)}),del:id=>API.req('/admin/affiliates/'+id,{method:'DELETE'}),comms:(q='')=>API.req('/admin/commissions?'+q),updComm:(id,d)=>API.req('/admin/commissions/'+id,{method:'PUT',body:JSON.stringify(d)}),payAll:id=>API.req('/admin/commissions/pay-all',{method:'POST',body:JSON.stringify({affiliate_id:id})}),redemptions:(q='')=>API.req('/admin/redemptions?'+q),updRedemption:(id,d)=>API.req('/admin/redemptions/'+id,{method:'PUT',body:JSON.stringify(d)})},
  myAff:{dashboard:()=>API.req('/affiliate/dashboard'),redeem:d=>API.req('/affiliate/redeem',{method:'POST',body:JSON.stringify(d)})},
  bank:{transactions:()=>API.req('/admin/bank-transactions')}
};

/* ========== APP STATE ========== */
let CU=null,CP='text2video',uploadedFile=null;
let hF=null,hSel=new Set(),hSelectMode=false,hStatus=null,hDateFrom='',hDateTo='';
// Batch state — per page, stored globally so workers survive navigation
let BQ=[],BR=[],BD=[],batchRunning=false,batchStopped=false,batchStartTime=0,batchTimer=null,_bqId=0;
const _batchStore={};
// Each page's batch lives in _batchStore[page]. BQ/BR/BD are just pointers to current page's data.
function _ensureStore(page){if(!_batchStore[page])_batchStore[page]={BQ:[],BR:[],BD:[],running:false,stopped:false,startTime:0,id:0,opts:null,type:null,uploadedFile:null}}
function saveBatchState(page){
  _ensureStore(page);
  const s=_batchStore[page];
  s.BQ=BQ;s.BR=BR;s.BD=BD;s.running=batchRunning;s.stopped=batchStopped;s.startTime=batchStartTime;s.id=_bqId;s.uploadedFile=uploadedFile;
}
function loadBatchState(page){
  _ensureStore(page);
  const s=_batchStore[page];
  BQ=s.BQ;BR=s.BR;BD=s.BD;batchRunning=s.running;batchStopped=s.stopped;batchStartTime=s.startTime;_bqId=s.id;
  if(s.uploadedFile)uploadedFile=s.uploadedFile;
}
let hViewMode=localStorage.getItem('gs_hview')||'grid'; // 'grid' or 'list'
let bViewMode=localStorage.getItem('gs_bview')||'grid'; // 'grid' or 'table' for batch completed tab
let accViewMode=localStorage.getItem('gs_accview')||'table'; // 'grid' (cards) or 'table'

function toast(m,t='info'){const e=document.getElementById('toast');e.textContent=m;e.className='toast '+t+' show';setTimeout(()=>e.classList.remove('show'),3e3)}
function toggleAuth(reg){document.getElementById('login-form').classList.toggle('hidden',reg);document.getElementById('register-form').classList.toggle('hidden',!reg);document.getElementById('auth-error').textContent=''}
async function doLogin(){try{const ref=new URLSearchParams(window.location.search).get('ref')||'';const d=await API.login(document.getElementById('login-email').value,document.getElementById('login-password').value,ref);API.set(d.token);API.saveU(d.user);CU=d.user;enter()}catch(e){document.getElementById('auth-error').textContent=e.message}}
async function doRegister(){try{const ref=new URLSearchParams(window.location.search).get('ref')||'';const d=await API.register(document.getElementById('reg-email').value,document.getElementById('reg-password').value,document.getElementById('reg-name').value,ref);API.set(d.token);API.saveU(d.user);CU=d.user;enter()}catch(e){document.getElementById('auth-error').textContent=e.message}}
function doLogout(){API.clear();CU=null;document.getElementById('main-screen').classList.remove('active');document.getElementById('auth-screen').classList.add('active')}
function enter(){
  document.getElementById('auth-screen').classList.remove('active');document.getElementById('main-screen').classList.add('active');
  if(CU){document.getElementById('uname').textContent=CU.name||CU.email;document.getElementById('uplan').textContent=CU.role==='superadmin'?'⚡ SUPER ADMIN':CU.role==='admin'?'★ ADMIN':planName(CU.plan);document.getElementById('avatar').textContent=(CU.name||CU.email)[0].toUpperCase();const am=document.getElementById('avatar-m');if(am)am.textContent=(CU.name||CU.email)[0].toUpperCase();const as=document.getElementById('admin-section');if(as)as.classList.toggle('hidden',CU.role!=='admin'&&CU.role!=='superadmin');const ss=document.getElementById('superadmin-section');if(ss)ss.classList.toggle('hidden',CU.role!=='superadmin');const afs=document.getElementById('affiliate-section');if(afs)afs.classList.toggle('hidden',!CU.is_affiliate)}
  go(CP);
}
function go(p){
  saveBatchState(CP);
  CP=p;uploadedFile=null;
  // Only clear UI timer, not the batch itself
  if(batchTimer)clearInterval(batchTimer);batchTimer=null;
  loadBatchState(p);
  document.querySelectorAll('.nav-btn').forEach(n=>n.classList.toggle('active',n.dataset.p===p));
  document.getElementById('content').innerHTML=renderPage(p);
  afterRender(p);
  // Close mobile menu on navigation
  closeMobileMenu();
  // Reset batch tab to queue (tab 0) on page navigation — DOM is fresh
  _batchTabIdx=0;
  // If this page has batch items, render the batch UI
  if(BQ.length||batchRunning)renderBatchUI();
  // If batch is still running on this page, restart the UI timer
  if(batchRunning){
    const tEl=document.getElementById('btime');
    batchTimer=setInterval(()=>{if(tEl){const s=Math.floor((Date.now()-batchStartTime)/1000);tEl.textContent=`⏱ ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}},1000);
  }
  // Show running indicator on nav if any page has a running batch
  _updateNavBatchIndicators();
}

/* ========== SIDEBAR TOGGLE ========== */
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  if(!sb)return;
  sb.classList.toggle('collapsed');
  localStorage.setItem('gs_sidebar',sb.classList.contains('collapsed')?'collapsed':'expanded');
}
function initSidebar(){
  const sb=document.getElementById('sidebar');
  if(sb&&localStorage.getItem('gs_sidebar')==='collapsed')sb.classList.add('collapsed');
}
initSidebar();

/* ========== MOBILE MENU ========== */
function openMobileMenu(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('mobile-overlay');
  if(sb)sb.classList.add('mobile-open');
  if(ov)ov.classList.add('show');
}
function closeMobileMenu(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('mobile-overlay');
  if(sb)sb.classList.remove('mobile-open');
  if(ov)ov.classList.remove('show');
}

/* ========== NAV BATCH INDICATORS ========== */
function _updateNavBatchIndicators(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    const page=btn.dataset.p;
    const dot=btn.querySelector('.batch-dot');
    const store=_batchStore[page];
    const isRunning=store&&store.running;
    if(isRunning&&page!==CP){
      if(!dot){const d=document.createElement('span');d.className='batch-dot';d.textContent='●';btn.appendChild(d)}
    }else{
      if(dot)dot.remove();
    }
  });
  // Show warning on accounts nav when tokens are limited
  _updateTokenNavWarning();
}
function _updateTokenNavWarning(){
  const accBtn=document.querySelector('.nav-btn[data-p="accounts"]');
  if(!accBtn)return;
  const existing=accBtn.querySelector('.token-warn-dot');
  if(_tokenStatusCache){
    const limited=_tokenStatusCache.filter(a=>a.status==='limited');
    if(limited.length>0){
      if(!existing){const d=document.createElement('span');d.className='token-warn-dot';d.textContent='⚠';d.style.cssText='color:var(--err);font-size:10px;margin-left:auto;flex-shrink:0';accBtn.appendChild(d)}
    }else{if(existing)existing.remove()}
  }
}

/* ========== PAGE RENDERER ========== */
const VOPTS='<option value="16:9">16:9</option><option value="3:2">3:2</option><option value="9:16">9:16</option><option value="2:3">2:3</option><option value="1:1">1:1</option>';
const ROPTS='<option value="480p">480p</option><option value="720p">720p</option>';
const LOPTS='<option value="6">6s</option><option value="10">10s</option>';
const SOPTS='<option value="1280x720">3:2 (Ngang)</option><option value="720x1280">2:3 (Dọc)</option><option value="1024x1024">1:1 (Vuông)</option><option value="1024x1792">9:16 (Story)</option><option value="1792x1024">16:9 (Wide)</option>';
const NOPTS='<option value="1">1</option><option value="2">2</option><option value="4">4</option>';
function v(id,def){return document.getElementById(id)?.value||def}

function vidOpts(){return `<div class="fg-row"><div class="fg"><label>Tỷ lệ</label><select id="g-ar">${VOPTS}</select></div><div class="fg"><label>Phân giải</label><select id="g-res">${ROPTS}</select></div></div><div class="fg-row"><div class="fg"><label>Thời lượng</label><select id="g-len">${LOPTS}</select></div><div class="fg"></div></div>`}
function imgOpts(){return `<div class="fg-row"><div class="fg"><label>Kích thước</label><select id="g-size">${SOPTS}</select></div><div class="fg"><label>Số lượng</label><select id="g-n">${NOPTS}</select></div></div>`}
function uploadHTML(){return `<div class="fg"><label>Ảnh</label><div class="upload-zone" id="uz"><input type="file" accept="image/*" onchange="onFile(this)"><p>Click hoặc kéo ảnh vào</p><div id="fname" style="color:var(--ok);font-size:11px;margin-top:4px"></div></div></div>`}

function batchPanel(){
  const isImgType=CP==='image2video'||CP==='image2image';
  const importBtns=isImgType?`
      <input type="file" id="btxt-inp" accept=".txt" style="display:none">
      <input type="file" id="bimg-inp" webkitdirectory style="display:none">
      <button class="btn-s" onclick="importPairMode()">📄+📁 TXT + Folder ảnh</button>
      <input type="file" id="bfolder-inp" webkitdirectory style="display:none">
      <button class="btn-s" onclick="document.getElementById('bfolder-inp').click()">📂 Folder tổng</button>
      <button class="btn-s danger" onclick="clearBatch()" id="bclear" style="display:none">🗑 Xóa hết</button>
  `:`
      <input type="file" id="btxt-inp" accept=".txt" multiple style="display:none">
      <button class="btn-s" onclick="document.getElementById('btxt-inp').click()">📄 TXT</button>
      <input type="file" id="bfolder-inp" webkitdirectory style="display:none">
      <button class="btn-s" onclick="document.getElementById('bfolder-inp').click()">📁 Folder</button>
      <button class="btn-s" onclick="addFromPrompt()">+ Thêm</button>
      <button class="btn-s danger" onclick="clearBatch()" id="bclear" style="display:none">🗑 Xóa hết</button>
  `;
  return `<div class="batch-panel glass-card">
  <div class="bp-header"><span style="font-weight:600;font-size:13px">📋 Batch Mode</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${importBtns}</div>
  </div>
  ${isImgType?'<div style="font-size:11px;color:var(--text3);margin-bottom:8px;line-height:1.5">💡 TXT+Folder: dòng 1 → ảnh 1, dòng 2 → ảnh 2...<br>Folder tổng: mỗi subfolder chứa ảnh + file .txt cùng tên</div>':''}
  <div id="bconcurrency" style="display:none;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text2)">⚡ Luồng/acc:</span>
      <select id="bthreads" style="width:60px;padding:4px 6px;font-size:12px"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select>
      <span style="font-size:12px;color:var(--text2)">🔄 Retry:</span>
      <select id="bretries" style="width:60px;padding:4px 6px;font-size:12px"><option value="0">0</option><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select>
      <span id="bworker-info" style="font-size:11px;color:var(--text3)"></span>
    </div>
  </div>
  <div id="bstats" class="bp-stats" style="display:none"></div>
  <div id="bprogress" style="display:none"><div class="progress-bar"><div class="progress-fill" id="bpfill"></div></div><div class="bp-time" id="btime"></div></div>
  <div id="bactions" style="display:none;gap:8px;margin:8px 0">
    <button class="btn-primary" id="bstart" onclick="startBatch()">▶ Bắt đầu</button>
    <button class="btn-s danger" id="bstop" onclick="stopBatch()" style="display:none">⏹ Dừng</button>
    <button class="btn-s" id="bretry" onclick="retryFailed()" style="display:none">🔄 Tạo lại lỗi</button>
  </div>
  <div class="bp-tabs">
    <button class="bp-tab active" onclick="switchBTab(0,this)">Hàng đợi <span id="bqc">0</span></button>
    <button class="bp-tab" onclick="switchBTab(1,this)">Đang chạy <span id="brc">0</span></button>
    <button class="bp-tab" onclick="switchBTab(2,this)">Hoàn thành <span id="bdc">0</span></button>
    <button class="bp-vbtn" id="bview-btn" onclick="toggleBView()" title="Đổi kiểu xem">${bViewMode==='grid'?'☰':'▦'}</button>
  </div>
  <div id="btab0" class="bp-list"></div>
  <div id="btab1" class="bp-list" style="display:none"></div>
  <div id="btab2" class="bp-list" style="display:none"></div>
</div>`}

/* previewHTML removed — results shown via lightbox */

function renderPage(p){
  switch(p){
    case 'text2video':return `<div class="page-title">Text → Video</div><div class="page-sub">Tạo video từ prompt văn bản</div><div class="gen-layout"><div class="gen-left glass-card gen-form"><div class="fg"><label>Prompt</label><textarea id="g-prompt" placeholder="Mô tả video... (mỗi dòng = 1 video khi batch)" rows="4"></textarea></div>${vidOpts()}<button class="btn-primary" id="gbtn" onclick="gen('text2video')">Tạo Video</button></div><div class="gen-right">${batchPanel()}</div></div><div id="lightbox"></div>`;
    case 'image2video':return `<div class="page-title">Image → Video</div><div class="page-sub">Tạo video từ ảnh</div><div class="gen-layout"><div class="gen-left glass-card gen-form">${uploadHTML()}<div class="fg"><label>Prompt</label><textarea id="g-prompt" placeholder="Mô tả chuyển động..."></textarea></div>${vidOpts()}<button class="btn-primary" id="gbtn" onclick="gen('image2video')">Tạo Video</button></div><div class="gen-right">${batchPanel()}</div></div><div id="lightbox"></div>`;
    case 'text2image':return `<div class="page-title">Text → Image</div><div class="page-sub">Tạo ảnh từ prompt</div><div class="gen-layout"><div class="gen-left glass-card gen-form"><div class="fg"><label>Prompt</label><textarea id="g-prompt" placeholder="Mô tả ảnh... (mỗi dòng = 1 ảnh khi batch)" rows="4"></textarea></div>${imgOpts()}<button class="btn-primary" id="gbtn" onclick="gen('text2image')">Tạo Ảnh</button></div><div class="gen-right">${batchPanel()}</div></div><div id="lightbox"></div>`;
    case 'image2image':return `<div class="page-title">Image → Image</div><div class="page-sub">Chỉnh sửa ảnh bằng AI</div><div class="gen-layout"><div class="gen-left glass-card gen-form">${uploadHTML()}<div class="fg"><label>Prompt</label><textarea id="g-prompt" placeholder="Mô tả chỉnh sửa..."></textarea></div>${imgOpts()}<button class="btn-primary" id="gbtn" onclick="gen('image2image')">Chuyển đổi</button></div><div class="gen-right">${batchPanel()}</div></div><div id="lightbox"></div>`;
    case 'extend':return renderExtend();
    case 'history':return renderHistory();
    case 'accounts':return renderAccounts();
    case 'pricing':return renderPricing();
    case 'guide':return renderGuide();
    case 'profile':return renderProfile();
    case 'admin-dash':return renderAdmDash();case 'admin-users':return renderAdmUsers();case 'admin-tokens':return renderAdmTokens();case 'admin-hist':return renderAdmHist();case 'admin-plans':return renderAdmPlans();case 'admin-pay':return renderAdmPay();
    case 'admin-ctv':return renderAdmCTV();case 'admin-comms':return renderAdmComms();case 'admin-bank':return renderAdmBank();
    case 'my-affiliate':return renderMyAffiliate();
    case 'admin-redemptions':return renderAdmRedemptions();
    default:return '<div class="page-title">Not found</div>';
  }
}
function renderExtend(){return `<div class="page-title">Extend Video</div><div class="page-sub">Nối dài video</div><div class="gen-layout"><div class="gen-left glass-card gen-form"><div class="fg"><label>Reference ID</label><input id="g-ref" placeholder="Video reference ID"></div><div class="fg"><label>Prompt</label><textarea id="g-prompt" placeholder="Mô tả tiếp theo..."></textarea></div><div class="fg-row"><div class="fg"><label>Start (s)</label><input type="number" id="g-st" value="0" min="0" step="0.1"></div><div class="fg"><label>Thời lượng</label><select id="g-len">${LOPTS}</select></div></div><div class="fg-row"><div class="fg"><label>Tỷ lệ</label><select id="g-ar">${VOPTS}</select></div><div class="fg"><label>Phân giải</label><select id="g-res">${ROPTS}</select></div></div><button class="btn-primary" id="gbtn" onclick="gen('extend_video')">Extend</button></div><div class="gen-right">${batchPanel()}</div></div><div id="lightbox"></div>`}
function renderHistory(){return `<div class="page-title">Lịch sử</div><div class="page-sub">Các lần tạo của bạn</div><div class="glass-card" style="padding:12px 16px;margin-bottom:16px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15)"><div style="font-size:13px;font-weight:600;color:var(--warn)">⚠️ Quan trọng: File chỉ lưu trữ trong 24 giờ</div><div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5">Video và ảnh sẽ tự động bị xóa sau 24h. Hãy tải về máy ngay sau khi tạo xong để không bị mất.</div></div><div id="hstats" style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap"></div><div class="filters" id="hfilters"><button class="fbtn on" onclick="hFilter(null,this)">Tất cả</button><button class="fbtn" onclick="hFilter('text2video',this)">T→V</button><button class="fbtn" onclick="hFilter('image2video',this)">I→V</button><button class="fbtn" onclick="hFilter('text2image',this)">T→I</button><button class="fbtn" onclick="hFilter('image2image',this)">I→I</button><button class="fbtn" onclick="hFilter('extend_video',this)">Ext</button><button class="fbtn" onclick="hFilter('__fav',this)">★ Yêu thích</button><span style="flex:1"></span><button class="btn-s" id="hview-btn" onclick="toggleHView()" title="Đổi kiểu xem">${hViewMode==='grid'?'☰ List':'▦ Grid'}</button><button class="btn-s" id="hsel-btn" onclick="toggleSelectMode()">☐ Chọn</button></div><div class="hfilter-row" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center"><select id="hstatus" onchange="hStatusFilter(this.value)" style="width:auto;padding:6px 10px;font-size:11px"><option value="">Tất cả status</option><option value="completed">✓ Completed</option><option value="failed">✕ Failed</option><option value="processing">⏳ Processing</option></select><input type="date" id="hdate-from" onchange="hDateFilter()" style="width:auto;padding:6px 10px;font-size:11px" title="Từ ngày"><input type="date" id="hdate-to" onchange="hDateFilter()" style="width:auto;padding:6px 10px;font-size:11px" title="Đến ngày"><button class="btn-s" onclick="clearDateFilter()" style="font-size:11px;padding:6px 10px" title="Xóa bộ lọc ngày">✕ Xóa lọc</button></div><div id="hbulk" style="display:none;margin-bottom:12px;gap:8px;flex-wrap:wrap;align-items:center"></div><div class="${hViewMode==='grid'?'hist-grid':'hist-list'}" id="hgrid"></div><div id="lightbox"></div>`}
function renderAccounts(){return `<div class="page-title">Cài đặt Token</div><div class="page-sub">Quản lý cookie/token Grok. Dán cookie JSON hoặc SSO token. Video cần cf_clearance.</div><div class="glass-card" id="cf-diag" style="padding:14px 18px;margin-bottom:16px;font-size:12px;color:var(--text2);line-height:1.6"><span class="spin"></span> Đang kiểm tra...</div><div id="acc-limit-info"></div><div class="acc-add"><textarea id="ntok" placeholder='Dán cookie JSON (hỗ trợ nhiều token, mỗi JSON array 1 dòng)&#10;Ví dụ:&#10;[{"name":"sso","value":"xxx",...}]&#10;[{"name":"sso","value":"yyy",...}]' style="min-height:100px;font-size:11px;font-family:monospace"></textarea><div style="display:flex;gap:8px"><input id="nlbl" placeholder="Nhãn (tùy chọn)" style="max-width:160px"><button class="btn-primary" onclick="addAcc()" style="width:auto;padding:11px 20px">Thêm</button></div><div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.5">💡 Hỗ trợ thêm nhiều token cùng lúc: mỗi cookie JSON array trên 1 dòng, hoặc mỗi SSO token trên 1 dòng.</div></div><div id="acc-bulk-bar" style="display:none;margin-bottom:12px;padding:10px 14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:10px;gap:8px;flex-wrap:wrap;align-items:center"></div><div id="alist"></div><div id="acc-modal"></div>`}

function afterRender(p){
  if(p==='history')loadHist();
  if(p==='accounts'){loadAcc();runDiag()}
  if(p==='pricing')afterPricing();
  if(p==='profile')loadProfile();
  if(p==='admin-dash')loadAdmStats();if(p==='admin-users')loadAdmUsers();if(p==='admin-tokens')loadAdmTokens();if(p==='admin-hist')loadAdmHist();if(p==='admin-plans')loadAdmPlans();if(p==='admin-pay')loadAdmPay();if(p==='admin-ctv')loadAdmCTV();if(p==='admin-comms')loadAdmComms();if(p==='admin-bank')loadAdmBank();if(p==='my-affiliate')loadMyAffiliate();if(p==='admin-redemptions')loadAdmRedemptions();
  // Check token status on gen pages
  const genPages=['text2video','image2video','text2image','image2image','extend'];
  if(genPages.includes(p))_checkAndShowTokenStatus();
  // Bind batch file inputs
  const isImgType=p==='image2video'||p==='image2image';
  const txtInp=document.getElementById('btxt-inp');
  if(txtInp){
    if(isImgType){
      txtInp.addEventListener('change',function(){onPairTxtSelected(this.files);this.value=''});
    }else{
      txtInp.addEventListener('change',function(){loadTxtFiles(this.files);this.value=''});
    }
  }
  const imgInp=document.getElementById('bimg-inp');
  if(imgInp)imgInp.addEventListener('change',function(){onPairImgSelected(this.files);this.value=''});
  const folderInp=document.getElementById('bfolder-inp');
  if(folderInp)folderInp.addEventListener('change',function(){loadFolderTxt(this.files);this.value=''});
}

/* ========== FILE UPLOAD ========== */
function onFile(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{uploadedFile=e.target.result;const uz=document.getElementById('uz');if(uz)uz.classList.add('has-file');const fn=document.getElementById('fname');if(fn)fn.textContent=f.name};r.readAsDataURL(f)}

/* ========== SINGLE GENERATE → Queue + Auto-start ========== */
async function gen(type){
  const prompt=document.getElementById('g-prompt')?.value?.trim();
  if(!prompt){toast('Nhập prompt','err');return}
  // For image types, need uploaded file
  if((type==='image2video'||type==='image2image')&&!uploadedFile){toast('Upload ảnh','err');return}
  if(type==='extend_video'&&!v('g-ref','')){toast('Nhập Reference ID','err');return}
  // Add to queue
  const item={id:++_bqId,prompt,status:'pending',url:null,error:null,retries:0,source:'manual'};
  if((type==='image2video'||type==='image2image')&&uploadedFile){item._imgDataUrl=uploadedFile}
  BQ.push(item);
  document.getElementById('g-prompt').value='';
  renderBatchUI();
  toast('Đã thêm vào hàng đợi','ok');
  // Auto-start if not running
  if(!batchRunning)startBatch();
}

/* ========== PREVIEW + DOWNLOAD ========== */
/* showPreview removed — use openLightbox instead */
async function dlProxy(url,name){
  try{toast('Đang tải...','info');
    // Try proxy through worker to avoid CORS
    const r=await fetch('/api/proxy-dl',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.token},body:JSON.stringify({url,filename:name})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href)}
  catch(e){
    // Fallback: direct fetch
    try{const r=await fetch(url);if(!r.ok)throw new Error();const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href)}
    catch{window.open(url,'_blank')}
  }
}

/* ========== BATCH SYSTEM ========== */
// BQ = queue items [{id,prompt,status:'pending'|'running'|'done'|'failed',url:null,error:null,retries:0}]
// BR = currently running, BD = completed/failed
let _batchTabIdx=0;

function resetBatch(){BQ=[];BR=[];BD=[];batchRunning=false;batchStopped=false;_bqId=0;if(batchTimer)clearInterval(batchTimer);batchTimer=null}

function loadTxtFiles(fileList){
  if(!fileList||!fileList.length)return;
  let loaded=0;const total=fileList.length;
  Array.from(fileList).forEach(f=>{
    if(!f.name.endsWith('.txt')){loaded++;return}
    const r=new FileReader();
    r.onload=e=>{
      const lines=e.target.result.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
      lines.forEach(p=>BQ.push({id:++_bqId,prompt:p,status:'pending',url:null,error:null,retries:0,source:f.name}));
      loaded++;
      if(loaded>=total){renderBatchUI();toast(BQ.filter(x=>x.status==='pending').length+' prompts đã tải','ok')}
    };
    r.readAsText(f);
  });
}
function loadFolderTxt(fileList){
  const isImgType=CP==='image2video'||CP==='image2image';
  if(isImgType){loadFolderPairs(fileList);return}
  // Filter only .txt files from folder
  const txtFiles=Array.from(fileList).filter(f=>f.name.endsWith('.txt'));
  if(!txtFiles.length){toast('Folder không có file .txt','err');return}
  loadTxtFiles(txtFiles);
}

/* ── Natural sort helper ── */
function natSort(a,b){return a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})}

/* ── Image pair mode: step 1 pick TXT, step 2 pick image folder ── */
let _pairTxtLines=null;
function importPairMode(){
  _pairTxtLines=null;
  document.getElementById('btxt-inp').click();
}
function onPairTxtSelected(files){
  if(!files||!files.length)return;
  const f=files[0];if(!f.name.endsWith('.txt')){toast('Chọn file .txt','err');return}
  const r=new FileReader();
  r.onload=e=>{
    _pairTxtLines=e.target.result.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
    if(!_pairTxtLines.length){toast('File TXT trống','err');_pairTxtLines=null;return}
    toast(`Đã đọc ${_pairTxtLines.length} dòng. Chọn folder ảnh...`,'info');
    document.getElementById('bimg-inp').click();
  };
  r.readAsText(f);
}
function onPairImgSelected(files){
  if(!files||!files.length||!_pairTxtLines){toast('Chọn TXT trước','err');return}
  const imgs=Array.from(files).filter(f=>f.type.startsWith('image/')).sort((a,b)=>natSort(a.name,b.name));
  if(!imgs.length){toast('Folder không có ảnh','err');return}
  const count=Math.min(_pairTxtLines.length,imgs.length);
  for(let i=0;i<count;i++){
    BQ.push({id:++_bqId,prompt:_pairTxtLines[i],status:'pending',url:null,error:null,retries:0,source:imgs[i].name,_imgFile:imgs[i]});
  }
  if(_pairTxtLines.length!==imgs.length){
    toast(`Ghép ${count} cặp (TXT: ${_pairTxtLines.length} dòng, Ảnh: ${imgs.length})`,'warn');
  }else{
    toast(`${count} cặp prompt+ảnh đã thêm`,'ok');
  }
  _pairTxtLines=null;
  renderBatchUI();
}

/* ── Folder tổng: each subfolder has images + .txt with same name ── */
function loadFolderPairs(fileList){
  const allFiles=Array.from(fileList);
  // Group by subfolder
  const folders={};
  allFiles.forEach(f=>{
    const parts=f.webkitRelativePath.split('/');
    if(parts.length<2)return;
    const sub=parts.length>=3?parts[1]:'__root__';
    if(!folders[sub])folders[sub]=[];
    folders[sub].push(f);
  });

  let totalPairs=0;
  const subNames=Object.keys(folders).sort(natSort);

  subNames.forEach(sub=>{
    const files=folders[sub];
    const txts=files.filter(f=>f.name.endsWith('.txt'));
    const imgs=files.filter(f=>f.type.startsWith('image/')).sort((a,b)=>natSort(a.name,b.name));
    if(!txts.length||!imgs.length)return;

    // Read first TXT
    const txtFile=txts[0];
    const reader=new FileReader();
    reader.onload=e=>{
      const lines=e.target.result.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
      const count=Math.min(lines.length,imgs.length);
      for(let i=0;i<count;i++){
        BQ.push({id:++_bqId,prompt:lines[i],status:'pending',url:null,error:null,retries:0,source:`${sub}/${imgs[i].name}`,_imgFile:imgs[i]});
      }
      totalPairs+=count;
      renderBatchUI();
    };
    reader.readAsText(txtFile);
  });

  setTimeout(()=>{
    if(totalPairs)toast(`${totalPairs} cặp từ ${subNames.length} subfolder`,'ok');
    else toast('Không tìm thấy cặp TXT+ảnh trong folder','err');
  },500);
}
function addFromPrompt(){
  const ta=document.getElementById('g-prompt');if(!ta)return;
  const text=ta.value.trim();if(!text){toast('Nhập prompt trước','err');return}
  const lines=text.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
  if(!lines.length){toast('Không có prompt hợp lệ','err');return}
  lines.forEach(p=>BQ.push({id:++_bqId,prompt:p,status:'pending',url:null,error:null,retries:0,source:'manual'}));
  ta.value='';
  renderBatchUI();toast(lines.length+' prompt đã thêm','ok');
}
function clearBatch(){
  if(batchRunning){toast('Đang chạy, dừng trước','err');return}
  resetBatch();delete _batchStore[CP];_ensureStore(CP);renderBatchUI();
}
function rmQItem(id){
  if(batchRunning)return;
  BQ=BQ.filter(x=>x.id!==id);renderBatchUI();
}

function renderBatchUI(){
  const qc=document.getElementById('bqc'),rc=document.getElementById('brc'),dc=document.getElementById('bdc');
  const pending=BQ.filter(x=>x.status==='pending');
  const running=BQ.filter(x=>x.status==='running');
  const done=BQ.filter(x=>x.status==='done');
  const failed=BQ.filter(x=>x.status==='failed');
  if(qc)qc.textContent=pending.length;
  if(rc)rc.textContent=running.length;
  if(dc)dc.textContent=done.length+failed.length;

  // Stats
  const stats=document.getElementById('bstats');
  const total=BQ.length;
  if(stats){
    if(!total){stats.style.display='none'}
    else{
      stats.style.display='flex';
      const limitedCount=_exhaustedAccs.size;
      const totalAccs=_batchAccounts.length;
      const limitInfo=batchRunning&&limitedCount>0&&totalAccs>0
        ?`<span style="color:var(--err)" title="Token bị giới hạn bởi Grok.com">🔒 ${limitedCount}/${totalAccs} token limited</span>`
        :'';
      stats.innerHTML=`<span>Tổng: <b>${total}</b></span><span style="color:var(--warn)">Đợi: ${pending.length}</span><span style="color:var(--accent)">Chạy: ${running.length}</span><span style="color:var(--ok)">Xong: ${done.length}</span><span style="color:var(--err)">Lỗi: ${failed.length}</span>${limitInfo}`;
    }
  }
  // Progress
  const prog=document.getElementById('bprogress'),fill=document.getElementById('bpfill');
  if(prog&&fill){
    if(!total||!batchRunning&&!done.length&&!failed.length){prog.style.display='none'}
    else{prog.style.display='block';const pct=total?Math.round((done.length+failed.length)/total*100):0;fill.style.width=pct+'%'}
  }
  // Actions
  const acts=document.getElementById('bactions'),clr=document.getElementById('bclear');
  if(acts){acts.style.display=total?'flex':'none'}
  if(clr){clr.style.display=total&&!batchRunning?'inline-flex':'none'}
  const startBtn=document.getElementById('bstart'),stopBtn=document.getElementById('bstop'),retryBtn=document.getElementById('bretry');
  if(startBtn)startBtn.style.display=pending.length&&!batchRunning?'inline-flex':'none';
  if(stopBtn)stopBtn.style.display=batchRunning?'inline-flex':'none';
  if(retryBtn)retryBtn.style.display=failed.length&&!batchRunning?'inline-flex':'none';
  // Show concurrency settings when there are items
  const conc=document.getElementById('bconcurrency');
  if(conc)conc.style.display=total?'block':'none';

  // Tab content — ONLY render the active tab to avoid DOM thrashing
  if(_batchTabIdx===0)renderBTab0(pending);
  else if(_batchTabIdx===1)renderBTab1(running);
  else _smartRenderBTab2(done,failed);
}
// Throttled version: max 1 render per 500ms during batch runs
let _renderQueued=false,_renderTimer=null;
function _throttledRender(){
  if(_renderQueued)return;
  _renderQueued=true;
  if(_renderTimer)clearTimeout(_renderTimer);
  _renderTimer=setTimeout(()=>{_renderQueued=false;renderBatchUI()},500);
}

function switchBTab(idx,btn){
  _batchTabIdx=idx;
  _bPage={0:0,1:0,2:0};// reset pages on tab switch
  _tab2RenderedCount=0;// force full re-render on tab switch
  document.querySelectorAll('.bp-tab').forEach((b,i)=>{b.classList.toggle('active',i===idx)});
  for(let i=0;i<3;i++){const el=document.getElementById('btab'+i);if(el)el.style.display=i===idx?'block':'none'}
  // Re-render active tab
  const pending=BQ.filter(x=>x.status==='pending'),running=BQ.filter(x=>x.status==='running'),done=BQ.filter(x=>x.status==='done'),failed=BQ.filter(x=>x.status==='failed');
  if(idx===0)renderBTab0(pending);
  else if(idx===1)renderBTab1(running);
  else renderBTab2(done,failed);
}
const _BP=50;// items per page
let _bPage={0:0,1:0,2:0};// current page per tab (0-indexed)
// Admin pagination state
let _auAll=[],_auPage=0;// admin users
let _aaAll=[],_aaPage=0;// admin tokens
let _ahAll=[],_ahPage=0;// admin history
let _apAll=[],_apPage=0;// admin payments
let _acAll=[],_acPage=0;// admin CTV
let _amAll=[],_amPage=0;// admin commissions
let _arAll=[],_arPage=0;// admin redemptions
let _myAffComms=[],_myAffCommsPage=0;// my affiliate commissions
let _myAffRefs=[],_myAffRefsPage=0;// my affiliate referrals

function _pgHtml(curPage,totalItems,onClickFn){
  const totalPages=Math.ceil(totalItems/_BP);
  if(totalPages<=1)return '';
  let h='<div class="pg-bar">';
  h+=`<button class="pg-btn${curPage===0?' disabled':''}" onclick="${onClickFn}(${curPage-1})"${curPage===0?' disabled':''}>‹</button>`;
  const range=[];
  if(totalPages<=7){for(let i=0;i<totalPages;i++)range.push(i)}
  else{
    range.push(0);
    if(curPage>2)range.push('...');
    for(let i=Math.max(1,curPage-1);i<=Math.min(totalPages-2,curPage+1);i++)range.push(i);
    if(curPage<totalPages-3)range.push('...');
    range.push(totalPages-1);
  }
  range.forEach(p=>{
    if(p==='...')h+='<span class="pg-dots">…</span>';
    else h+=`<button class="pg-btn${p===curPage?' active':''}" onclick="${onClickFn}(${p})">${p+1}</button>`;
  });
  h+=`<button class="pg-btn${curPage>=totalPages-1?' disabled':''}" onclick="${onClickFn}(${curPage+1})"${curPage>=totalPages-1?' disabled':''}>›</button>`;
  h+=`<span class="pg-info">${curPage+1}/${totalPages}</span></div>`;
  return h;
}
function _bqGoPage(page){_bPage[0]=page;renderBatchUI()}
function _bdGoPage(page){_bPage[2]=page;renderBatchUI()}
function _histGoPage(page){_histPage=page;_renderHistPage()}
function _btab2GoPage(page){_btab2Page=page;_renderBTab2Hist()}
function _auGoPage(p){_auPage=p;_renderAdmUsersPage()}
function _aaGoPage(p){_aaPage=p;_renderAdmTokensPage()}
function _ahGoPage(p){_ahPage=p;_renderAdmHistPage()}
function _apGoPage(p){_apPage=p;_renderAdmPayPage()}
function _acGoPage(p){_acPage=p;_renderAdmCTVPage()}
function _amGoPage(p){_amPage=p;_renderAdmCommsPage()}
function _arGoPage(p){_arPage=p;_renderAdmRedemptionsPage()}
function _myAffCommsGoPage(p){_myAffCommsPage=p;_renderMyAffComms()}
function _myAffRefsGoPage(p){_myAffRefsPage=p;_renderMyAffRefs()}
function _accGoPage(p){_accPage=p;_renderAccPage()}

function renderBTab0(items){
  const el=document.getElementById('btab0');if(!el)return;
  if(!items.length){el.innerHTML='<div class="bp-empty">Chưa có prompt. Nhập TXT hoặc thêm thủ công.</div>';return}
  const start=_bPage[0]*_BP;
  const visible=items.slice(start,start+_BP);
  el.innerHTML=visible.map((q,i)=>{
    const hasImg=!!q._imgFile;
    return `<div class="bp-item"><span class="bp-num">${start+i+1}</span><span class="bp-text" title="${esc(q.prompt)}">${esc(q.prompt)}</span>${hasImg?`<span class="bp-src" title="${q.source}">🖼 ${q.source}</span>`:q.source!=='manual'?`<span class="bp-src">${q.source}</span>`:''}<button class="btn-icon" onclick="rmQItem(${q.id})" ${batchRunning?'disabled':''}>✕</button></div>`;
  }).join('')+_pgHtml(_bPage[0],items.length,'_bqGoPage');
}
function renderBTab1(items){
  const el=document.getElementById('btab1');if(!el)return;
  if(!items.length){el.innerHTML='<div class="bp-empty">Không có gì đang chạy</div>';return}
  // Running items are usually few, show all
  el.innerHTML=items.map(q=>`<div class="bp-item running"><span class="spin" style="flex-shrink:0"></span><span class="bp-text">${esc(q.prompt)}</span>${q._accLabel?`<span class="bp-acc" title="Account: ${esc(q._accLabel)}">${esc(q._accLabel)}</span>`:''}<span class="bp-rstatus">Đang tạo...</span></div>`).join('');
}
// Smart render: during batch runs, only append NEW items to tab2 grid instead of full re-render
let _tab2RenderedCount=0;
function _smartRenderBTab2(done,failed){
  const all=[...done,...failed];
  // If not on tab2, or no items, or first render, or page changed, or batch stopped — do full render
  if(_batchTabIdx!==2||!all.length||_tab2RenderedCount===0||!batchRunning){
    _tab2RenderedCount=all.length;
    renderBTab2(done,failed);
    return;
  }
  // If count hasn't changed, skip render entirely
  if(all.length===_tab2RenderedCount)return;
  // Count changed — only update counts in header (already done above) and append new items
  // For simplicity on page 0 in grid mode, append new grid items
  const el=document.getElementById('btab2');if(!el)return;
  const isV=CP.includes('video');
  const grid=el.querySelector('.bp-grid');
  if(grid&&bViewMode==='grid'&&_bPage[2]===0){
    const newItems=all.slice(_tab2RenderedCount);
    newItems.forEach(q=>{
      const isOk=q.status==='done';
      const div=document.createElement('div');
      if(isOk){
        div.className='bp-gi';
        const su=(q.url||'').replace(/'/g,"\\'");
        const sp=esc(q.prompt).replace(/'/g,"\\'");
        div.setAttribute('onclick',`openLightbox('${su}',${isV},'${sp}')`);
        div.title=esc(q.prompt);
        div.innerHTML=(q.url?(isV?`<video src="${q.url}#t=0.1" muted preload="metadata"></video>`:`<img src="${q.url}" loading="lazy">`):'<div class="bp-gi-ph">?</div>')+`<div class="bp-gi-ov">👁</div><div class="bp-gi-bar"><span class="bp-gi-p">${esc(q.prompt)}</span>${q.url?`<button class="btn-icon" onclick="event.stopPropagation();dlProxy('${su}','${isV?'video.mp4':'image.jpg'}')">⬇</button>`:''}</div>`;
      }else{
        div.className='bp-gi fail';
        div.title=esc(q.error||'');
        div.innerHTML=`<div class="bp-gi-err">✕</div><div class="bp-gi-bar"><span class="bp-gi-p">${esc(q.prompt)}</span></div>`;
      }
      grid.appendChild(div);
    });
    _tab2RenderedCount=all.length;
    // Update pagination text if exists
    const pgBar=el.querySelector('.pg-bar');
    const totalPages=Math.ceil(all.length/_BP);
    if(totalPages>1&&!pgBar){
      // Need pagination now — do full re-render once
      renderBTab2(done,failed);
    }
  }else{
    // Table mode or not page 0 — full re-render
    _tab2RenderedCount=all.length;
    renderBTab2(done,failed);
  }
}
function renderBTab2(done,failed){
  const el=document.getElementById('btab2');if(!el)return;
  const all=[...done.map(x=>({...x,_ok:true})),...failed.map(x=>({...x,_ok:false}))];
  if(!all.length){
    el.innerHTML='<div class="bp-empty">Chưa có kết quả. Kết quả sẽ hiển thị khi batch chạy xong.</div>';
    return;
  }
  const start=_bPage[2]*_BP;
  const visible=all.slice(start,start+_BP);
  const isV=CP.includes('video');
  const pg=_pgHtml(_bPage[2],all.length,'_bdGoPage');
  if(bViewMode==='grid'){
    el.innerHTML='<div class="bp-grid">'+visible.map(q=>{
      if(q._ok){
        const su=(q.url||'').replace(/'/g,"\\'");
        const sp=esc(q.prompt).replace(/'/g,"\\'");
        return `<div class="bp-gi" onclick="openLightbox('${su}',${isV},'${sp}')" title="${esc(q.prompt)}">${q.url?(isV?`<video src="${q.url}#t=0.1" muted preload="metadata"></video>`:`<img src="${q.url}" loading="lazy">`):'<div class="bp-gi-ph">?</div>'}<div class="bp-gi-ov">👁</div><div class="bp-gi-bar"><span class="bp-gi-p">${esc(q.prompt)}</span>${q.url?`<button class="btn-icon" onclick="event.stopPropagation();dlProxy('${su}','${isV?'video.mp4':'image.jpg'}')">⬇</button>`:''}</div></div>`;
      }else{
        return `<div class="bp-gi fail" title="${esc(q.error||'')}"><div class="bp-gi-err">✕</div><div class="bp-gi-bar"><span class="bp-gi-p">${esc(q.prompt)}</span></div></div>`;
      }
    }).join('')+'</div>'+pg;
  }else{
    el.innerHTML=`<table class="bp-tbl"><thead><tr><th>#</th><th>Prompt</th><th>Status</th><th>Actions</th></tr></thead><tbody>${visible.map((q,i)=>{
      if(q._ok){
        const su=(q.url||'').replace(/'/g,"\\'");
        const sp=esc(q.prompt).replace(/'/g,"\\'");
        return `<tr class="bp-tr-ok"><td class="bp-tc">${start+i+1}</td><td class="bp-tp" title="${esc(q.prompt)}">${esc(q.prompt)}</td><td><span style="color:var(--ok)">✓ Xong</span></td><td class="bp-ta">${q.url?`<button class="btn-icon" onclick="openLightbox('${su}',${isV},'${sp}')" title="Xem">👁</button><button class="btn-icon" onclick="dlProxy('${su}','${isV?'video.mp4':'image.jpg'}')" title="Tải">⬇</button><button class="btn-icon" onclick="window.open('${su}','_blank')" title="Mở">↗</button>`:''}</td></tr>`;
      }else{
        return `<tr class="bp-tr-fail"><td class="bp-tc">${start+i+1}</td><td class="bp-tp" title="${esc(q.prompt)}">${esc(q.prompt)}</td><td><span style="color:var(--err)">✕ Lỗi</span></td><td class="bp-ta"><span class="bp-terr" title="${esc(q.error||'')}">${(q.error||'Lỗi').substring(0,25)}</span></td></tr>`;
      }
    }).join('')}</tbody></table>`+pg;
  }
}
function toggleBView(){
  bViewMode=bViewMode==='grid'?'table':'grid';
  localStorage.setItem('gs_bview',bViewMode);
  const btn=document.getElementById('bview-btn');if(btn)btn.textContent=bViewMode==='grid'?'☰':'▦';
  renderBatchUI();
}
async function loadRecentForBTab2(){
  const el=document.getElementById('btab2');if(!el)return;
  const typeMap={text2video:'text2video',image2video:'image2video',text2image:'text2image',image2image:'image2image',extend:'extend_video'};
  const type=typeMap[CP]||CP;
  try{
    el.innerHTML='<div class="bp-empty"><span class="spin"></span> Đang tải lịch sử...</div>';
    const [dComp,dProc]=await Promise.all([
      API.getHistory(type,50,false,'completed'),
      API.getHistory(type,20,false,'processing')
    ]);
    const completed=dComp.history||[];
    const processing=dProc.history||[];
    const items=[...processing,...completed];
    if(!items.length){el.innerHTML='<div class="bp-empty">Chưa có kết quả</div>';return}
    if(processing.length>0)_pollProcessingItems(processing.map(h=>h.id),type);
    _btab2Hist=items;_btab2Page=0;
    _renderBTab2Hist();
  }catch(e){el.innerHTML='<div class="bp-empty">Không tải được lịch sử</div>'}
}
let _btab2Hist=[],_btab2Page=0;
function _renderBTab2Hist(){
  const el=document.getElementById('btab2');if(!el)return;
  const items=_btab2Hist;
  const start=_btab2Page*_BP;
  const visible=items.slice(start,start+_BP);
  const isV=CP.includes('video');
  const procCount=items.filter(h=>h.status==='processing').length;
  const footer=`<div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text3)">📂 Từ lịch sử${procCount?' (⏳ '+procCount+' đang xử lý)':''}</div>`;
  const pg=_pgHtml(_btab2Page,items.length,'_btab2GoPage');
  if(bViewMode==='grid'){
    el.innerHTML='<div class="bp-grid">'+visible.map(h=>{
      const su=(h.output_url||'').replace(/'/g,"\\'");
      const sp=esc(h.prompt||'').replace(/'/g,"\\'");
      const isPending=h.status==='processing';
      const thumb=isPending?'<div class="bp-gi-ph"><span class="spin"></span></div>':(h.output_url?(isV?`<video src="${h.output_url}#t=0.1" muted preload="metadata"></video>`:`<img src="${h.output_url}" loading="lazy">`):'');
      if(isPending)return `<div class="bp-gi" title="${esc(h.prompt)}" style="border:1px solid rgba(251,191,36,.2)">${thumb}<div class="bp-gi-bar"><span class="bp-gi-p">${esc(h.prompt)}</span></div></div>`;
      return `<div class="bp-gi" onclick="openLightbox('${su}',${isV},'${sp}')" title="${esc(h.prompt)}">${thumb}<div class="bp-gi-ov">👁</div><div class="bp-gi-bar"><span class="bp-gi-p">${esc(h.prompt)}</span>${h.output_url?`<button class="btn-icon" onclick="event.stopPropagation();dlProxy('${su}','${isV?'video.mp4':'image.jpg'}')">⬇</button>`:''}</div></div>`;
    }).join('')+'</div>'+pg+footer;
  }else{
    el.innerHTML=`<table class="bp-tbl"><thead><tr><th>#</th><th>Prompt</th><th>Status</th><th>Actions</th></tr></thead><tbody>${visible.map((h,i)=>{
      const su=(h.output_url||'').replace(/'/g,"\\'");
      const sp=esc(h.prompt||'').replace(/'/g,"\\'");
      const isPending=h.status==='processing';
      const statusHtml=isPending?'<span style="color:var(--warn)"><span class="spin" style="width:10px;height:10px;border-width:1px;margin-right:4px"></span>Đang xử lý</span>':`<span style="color:var(--ok)">✓ Xong</span>`;
      return `<tr class="${isPending?'':'bp-tr-ok'}"><td class="bp-tc">${start+i+1}</td><td class="bp-tp" title="${esc(h.prompt)}">${esc(h.prompt)}</td><td>${statusHtml}</td><td class="bp-ta">${!isPending&&h.output_url?`<button class="btn-icon" onclick="openLightbox('${su}',${isV},'${sp}')" title="Xem">👁</button><button class="btn-icon" onclick="dlProxy('${su}','${isV?'video.mp4':'image.jpg'}')" title="Tải">⬇</button><button class="btn-icon" onclick="window.open('${su}','_blank')" title="Mở">↗</button>`:''}</td></tr>`;
    }).join('')}</tbody></table>`+pg+footer;
  }
}
// Poll processing items every 5s until they complete or fail (max 5 min)
let _pollTimer=null;
function _pollProcessingItems(ids,type){
  if(_pollTimer)clearInterval(_pollTimer);
  let elapsed=0;
  _pollTimer=setInterval(async()=>{
    elapsed+=5;
    if(elapsed>300){clearInterval(_pollTimer);_pollTimer=null;return}// max 5 min
    try{
      const d=await API.getHistory(type,10,false,'processing');
      const still=(d.history||[]).filter(h=>ids.includes(h.id));
      if(still.length===0){
        clearInterval(_pollTimer);_pollTimer=null;
        // All done, reload the tab — but only toast if not in active batch
        loadRecentForBTab2();
        if(!batchRunning)toast('✅ Các prompt đang xử lý đã hoàn thành','ok');
      }
    }catch{}
  },5000);
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(file)})}

/* ========== BATCH RUNNER (Multi-Account Parallel) ========== */
let _batchAccounts=[]; // active accounts for current batch
let _exhaustedAccs=new Set(); // account IDs that hit quota/error

// Persistent limit banner shown above batch panel
function _showLimitBanner(msg,type){
  // Remove existing banner
  const old=document.getElementById('blimit-banner');if(old)old.remove();
  const bp=document.querySelector('.batch-panel');if(!bp)return;
  const banner=document.createElement('div');
  banner.id='blimit-banner';
  const isErr=type==='err';
  banner.style.cssText=`padding:12px 16px;margin-bottom:12px;border-radius:12px;font-size:12px;line-height:1.6;animation:fadeIn .3s;${
    isErr
      ?'background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.18);color:#fca5a5'
      :'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.18);color:#fde68a'
  }`;
  banner.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
    <div>
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${isErr?'⛔ Token bị giới hạn':'⚠️ Cảnh báo Token'}</div>
      <div>${msg}</div>
      <div style="margin-top:6px;font-size:11px;opacity:.7">ℹ️ Đây là giới hạn từ Grok.com (mỗi tài khoản chỉ tạo được 80-200 video/ngày), không phải lỗi của hệ thống Grok Studio.</div>
    </div>
    <button onclick="this.closest('#blimit-banner').remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;flex-shrink:0;padding:0;line-height:1">✕</button>
  </div>`;
  bp.insertBefore(banner,bp.firstChild);
}

/* ========== GLOBAL TOKEN STATUS BANNER ========== */
// Shows a persistent banner on gen pages when tokens are limited
let _tokenStatusCache=null;
async function _checkAndShowTokenStatus(){
  try{
    const d=await API.getAccounts();
    _tokenStatusCache=d.accounts||[];
    _renderTokenStatusBanner();
  }catch{}
}
function _renderTokenStatusBanner(){
  // Remove old
  const old=document.getElementById('gtoken-status');if(old)old.remove();
  if(!_tokenStatusCache||!_tokenStatusCache.length)return;
  const limited=_tokenStatusCache.filter(a=>a.status==='limited');
  const active=_tokenStatusCache.filter(a=>a.status==='active');
  const total=_tokenStatusCache.length;
  if(!limited.length)return;// all good
  const content=document.getElementById('content');if(!content)return;
  const allLimited=active.length===0;
  const nextUnlock=limited.filter(a=>a.limit_info).sort((a,b)=>(a.limit_info?.remaining_minutes||999)-(b.limit_info?.remaining_minutes||999))[0];
  const banner=document.createElement('div');
  banner.id='gtoken-status';
  banner.className='gtoken-banner '+(allLimited?'gtoken-err':'gtoken-warn');
  const accList=limited.map(a=>`<span class="gtb-acc">${a.label||'Token #'+a.id} <span class="gtb-time">${a.limit_info?a.limit_info.remaining_text:'~2h'}</span></span>`).join('');
  banner.innerHTML=`
    <div class="gtb-inner">
      <div class="gtb-icon">${allLimited?'⛔':'⚠️'}</div>
      <div class="gtb-content">
        <div class="gtb-title">${allLimited?'Tất cả token đang bị giới hạn':''+limited.length+'/'+total+' token đang bị giới hạn'}</div>
        <div class="gtb-msg">${allLimited
          ?'Grok.com giới hạn mỗi tài khoản tối đa 80-200 video/ngày. Tất cả token của bạn đã đạt giới hạn này. <b>Đây không phải lỗi hệ thống Grok Studio.</b>'
          :'Một số token Grok đã đạt giới hạn tạo nội dung từ Grok.com. Hệ thống sẽ dùng token còn lại nhưng tốc độ có thể chậm hơn. <b>Không phải lỗi hệ thống.</b>'
        }</div>
        <div class="gtb-accs">${accList}</div>
        ${nextUnlock?`<div class="gtb-unlock">⏱ Token gần nhất mở khóa sau: <b>${nextUnlock.limit_info.remaining_text}</b></div>`:''}
        ${allLimited?'<div class="gtb-tip">💡 Thêm tài khoản Grok mới hoặc đợi token mở khóa (1h30-2h)</div>':''}
      </div>
      <button class="gtb-close" onclick="this.closest('#gtoken-status').remove()">✕</button>
    </div>
    <div class="gtb-bar"><div class="gtb-bar-fill" style="width:${Math.round(limited.length/total*100)}%"></div></div>`;
  content.insertBefore(banner,content.firstChild);
}

function _getNextPending(){
  return BQ.find(x=>x.status==='pending')||null;
}

function _buildPayload(item,type){
  const p={type,prompt:item.prompt};
  // Use cached opts from batch start (survives navigation)
  const store=_batchStore[item._batchPage||CP];
  const opts=store?.opts||{};
  if(type==='text2video'||type==='image2video'){p.aspect_ratio=opts.ar||'16:9';p.resolution=opts.res||'480p';p.video_length=+(opts.len||6)}
  if(type==='text2image'||type==='image2image'){p.size=opts.size||'1024x1024';p.n=+(opts.n||1)}
  if(type==='extend_video'){p.reference_id=opts.ref||'';p.start_time=+(opts.st||0);p.aspect_ratio=opts.ar||'16:9';p.resolution=opts.res||'480p';p.video_length=+(opts.len||6)}
  return p;
}

async function _worker(acc,type,maxRetries,batchPage){
  const store=_batchStore[batchPage];
  if(!store)return;
  const bq=store.BQ; // direct reference to the store's array
  while(!store.stopped){
    // Skip if this account is exhausted
    if(_exhaustedAccs.has(acc.id))return;
    const item=bq.find(x=>x.status==='pending')||null;
    if(!item)return; // no more work
    item.status='running';item._accLabel=acc.label||acc.token_preview||'Acc#'+acc.id;item._accId=acc.id;item._batchPage=batchPage;
    _safeRenderBatch(batchPage);
    const p=_buildPayload(item,type);
    p.account_id=acc.id;
    // Image-based: per-item image or fallback
    if(type==='image2video'||type==='image2image'){
      if(item._imgFile){
        try{p.image_url=await fileToDataURL(item._imgFile)}catch{p.image_url=store.uploadedFile}
      }else if(store.uploadedFile){p.image_url=store.uploadedFile}
    }
    try{
      const d=await API.generate(p);
      item.status='done';item.url=d.outputUrl;
      // Reset tunnel fail counter on success
      if(store._tunnelFails)store._tunnelFails=0;
    }catch(e){
      const emsg=e.message||'';
      // Parse JSON error body if present
      let errData={};
      try{const m=emsg.match(/\{.*\}/);if(m)errData=JSON.parse(m[0])}catch{}
      // Rate limit / token exhausted — highest priority detection
      const isRateLimit=emsg.includes('rate limit')||emsg.includes('token_rate_limited')||emsg.includes('đạt giới hạn')||emsg.includes('429')||emsg.includes('RATE_LIMITED')||emsg.includes('bị giới hạn')||emsg.includes('bị khóa');
      const isCooling=emsg.includes('cooling')||emsg.includes('No available token')||emsg.includes('token_cooling')||emsg.includes('đều đã bị');
      const isQuota=emsg.includes('quota')||emsg.includes('No credits')||emsg.includes('Too many');
      const isAllLimited=emsg.includes('Tất cả token')||emsg.includes('all_limited')||isCooling;
      if(isRateLimit||isCooling||isQuota){
        _exhaustedAccs.add(acc.id);
        item.status='pending';item._accLabel=null;item._accId=null;
        const label=acc.label||'Acc#'+acc.id;
        const activeLeft=_batchAccounts.filter(a=>!_exhaustedAccs.has(a.id)).length;
        // Refresh token status so UI updates everywhere
        _checkAndShowTokenStatus();
        if(activeLeft>0){
          // Some tokens still work — show warning but continue
          _showLimitBanner(`${label} bị Grok.com giới hạn (rate limit). Còn ${activeLeft} token khác đang hoạt động — tốc độ có thể chậm hơn.`,'warn');
          toast(`⚠️ ${label}: Grok rate limit. Chuyển sang ${activeLeft} token còn lại...`,'warn');
        }
        if(_exhaustedAccs.size>=_batchAccounts.length){
          // ALL tokens exhausted — stop batch
          _showLimitBanner('Tất cả token Grok đều đã đạt giới hạn tạo nội dung từ Grok.com. Token sẽ tự mở khóa sau 1h30-2h. Batch đã tự động dừng.','err');
          toast('⛔ Tất cả token bị giới hạn bởi Grok.com. Batch dừng.','err');
          store.stopped=true;
          _safeRenderBatch(batchPage);
          return;
        }
        _safeRenderBatch(batchPage);
        return;
      }
      // Tunnel / network error — DON'T stop batch immediately, retry first
      // IMPORTANT: this must NOT match rate limit messages (which may contain "502")
      const isTunnel=emsg.includes('tunnel')||emsg.includes('unreachable')||emsg.includes('Không kết nối')||emsg.includes('TUNNEL_ERROR')||emsg.includes('Grok2API offline')||emsg.includes('SERVER_ERROR')||emsg.includes('server_error')||emsg.includes('lỗi tạm thời');
      if(isTunnel){
        if(item.retries<maxRetries+2){
          // Give tunnel errors extra retries (maxRetries + 2 more)
          item.retries++;item.status='pending';item._accLabel=null;item._accId=null;
          _safeRenderBatch(batchPage);
          toast(`⚠️ Grok2API lỗi tạm thời, thử lại lần ${item.retries}...`,'warn');
          await new Promise(r=>setTimeout(r,5000));// wait 5s before retry
          continue;
        }
        // After all retries exhausted for this item, fail it but DON'T stop batch
        item.status='failed';item.error='Grok2API offline (sau '+item.retries+' lần thử)';
        // Track consecutive tunnel failures across all workers
        if(!store._tunnelFails)store._tunnelFails=0;
        store._tunnelFails++;
        _safeRenderBatch(batchPage);
        // Only stop batch if 5+ consecutive tunnel failures (real outage)
        if(store._tunnelFails>=5){
          store.stopped=true;
          toast('🔌 Grok2API liên tục lỗi ('+store._tunnelFails+' lần). Batch dừng.','err');
          return;
        }
        toast('⚠️ 1 prompt lỗi kết nối, tiếp tục batch...','warn');
        await new Promise(r=>setTimeout(r,2000));
        continue;
      }
      // Retry logic
      if(item.retries<maxRetries){
        item.retries++;item.status='pending';item._accLabel=null;item._accId=null;
        _safeRenderBatch(batchPage);
        await new Promise(r=>setTimeout(r,3000));
        continue;
      }
      item.status='failed';item.error=emsg;
    }
    _safeRenderBatch(batchPage);
    if(!store.stopped)await new Promise(r=>setTimeout(r,800));
  }
}

// Only render batch UI if we're currently viewing that page
function _safeRenderBatch(batchPage){
  if(CP===batchPage){
    // Sync globals from store
    const s=_batchStore[batchPage];
    if(s){BQ=s.BQ;batchRunning=s.running;batchStopped=s.stopped;batchStartTime=s.startTime}
    _throttledRender();
  }
  _updateNavBatchIndicators();
}

async function startBatch(){
  if(batchRunning)return;
  _tab2RenderedCount=0;// reset for fresh batch
  const pending=BQ.filter(x=>x.status==='pending');
  if(!pending.length){toast('Không có prompt chờ','err');return}

  // Fetch active accounts
  try{
    const d=await API.getAccounts();
    _batchAccounts=(d.accounts||[]).filter(a=>a.status==='active');
  }catch(e){toast('Lỗi tải accounts: '+e.message,'err');return}
  if(!_batchAccounts.length){toast('Không có tài khoản Grok active. Thêm tài khoản trước.','err');return}

  const threadsPerAcc=+(document.getElementById('bthreads')?.value||3);
  const maxRetries=+(document.getElementById('bretries')?.value||1);
  _exhaustedAccs=new Set();

  // Cache generation options NOW so they survive navigation
  const batchPage=CP;
  _ensureStore(batchPage);
  const store=_batchStore[batchPage];
  store.opts={ar:v('g-ar','16:9'),res:v('g-res','480p'),len:v('g-len','6'),size:v('g-size','1024x1024'),n:v('g-n','1'),ref:v('g-ref',''),st:v('g-st','0')};
  store.uploadedFile=uploadedFile;

  batchRunning=true;batchStopped=false;batchStartTime=Date.now();
  store.running=true;store.stopped=false;store.startTime=batchStartTime;

  // Show worker info
  const totalWorkers=_batchAccounts.length*threadsPerAcc;
  const wInfo=document.getElementById('bworker-info');
  if(wInfo)wInfo.textContent=`${_batchAccounts.length} acc × ${threadsPerAcc} luồng = ${totalWorkers} workers`;
  const conc=document.getElementById('bconcurrency');if(conc)conc.style.display='block';

  // Timer
  const tEl=document.getElementById('btime');
  batchTimer=setInterval(()=>{if(CP===batchPage&&tEl){const s=Math.floor((Date.now()-batchStartTime)/1000);tEl.textContent=`⏱ ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}},1000);
  renderBatchUI();
  _updateNavBatchIndicators();

  const typeMap={text2video:'text2video',image2video:'image2video',text2image:'text2image',image2image:'image2image',extend:'extend_video'};
  const type=typeMap[batchPage]||batchPage;
  store.type=type;

  // Launch workers: N threads per account, all run in parallel
  const workers=[];
  for(const acc of _batchAccounts){
    for(let t=0;t<threadsPerAcc;t++){
      workers.push(_worker(acc,type,maxRetries,batchPage));
    }
  }
  await Promise.all(workers);

  // === AUTO-REQUEUE: move failed items back to pending and re-run with live tokens ===
  // Up to 3 requeue rounds to handle transient failures
  for(let rq=1;rq<=3&&!store.stopped;rq++){
    const liveAccs=_batchAccounts.filter(a=>!_exhaustedAccs.has(a.id));
    if(!liveAccs.length)break;
    const failedItems=store.BQ.filter(x=>x.status==='failed');
    if(!failedItems.length)break;
    toast(`🔄 Lần ${rq}: ${failedItems.length} prompt lỗi → chạy lại bằng ${liveAccs.length} token live...`,'info');
    failedItems.forEach(x=>{x.status='pending';x.error=null;x.retries=0;x._accLabel=null;x._accId=null});
    _safeRenderBatch(batchPage);
    await new Promise(r=>setTimeout(r,2000));// brief pause between rounds
    const rqWorkers=[];
    for(const acc of liveAccs){
      for(let t=0;t<threadsPerAcc;t++){
        rqWorkers.push(_worker(acc,type,maxRetries,batchPage));
      }
    }
    await Promise.all(rqWorkers);
  }

  // Batch finished
  store.running=false;
  if(batchTimer)clearInterval(batchTimer);batchTimer=null;
  // Sync globals if still on this page
  if(CP===batchPage){
    batchRunning=false;
    renderBatchUI();
  }
  _updateNavBatchIndicators();
  const done=store.BQ.filter(x=>x.status==='done').length,fail=store.BQ.filter(x=>x.status==='failed').length;
  toast(`Batch xong: ${done} thành công, ${fail} lỗi`,fail?'warn':'ok');
  if(done>0)setTimeout(()=>toast('⚠️ File chỉ lưu 24h — hãy tải về máy ngay!','warn'),2000);
}
function stopBatch(){
  batchStopped=true;
  // Also mark in store so background workers see it
  const store=_batchStore[CP];
  if(store)store.stopped=true;
  toast('Đang dừng...','info');
}
function retryFailed(){
  BQ.filter(x=>x.status==='failed').forEach(x=>{x.status='pending';x.error=null;x.retries=0});
  renderBatchUI();
}

/* ========== HISTORY ========== */
function toggleHView(){
  hViewMode=hViewMode==='grid'?'list':'grid';
  localStorage.setItem('gs_hview',hViewMode);
  const btn=document.getElementById('hview-btn');if(btn)btn.textContent=hViewMode==='grid'?'☰ List':'▦ Grid';
  const g=document.getElementById('hgrid');if(g)g.className=hViewMode==='grid'?'hist-grid':'hist-list';
  _histPage=0;
  if(_histItems.length)_renderHistPage();else loadHist();
}
let _histItems=[];
let _histPage=0;
async function loadHist(keepSel){
  const g=document.getElementById('hgrid'),sb=document.getElementById('hstats');if(!g)return;
  g.innerHTML='<div class="spin-lg"></div>';
  if(!keepSel){hSel.clear()}
  _histPage=0;
  updateBulkBar();
  try{
    const isFav=hF==='__fav';const d=await API.getHistory(isFav?null:hF,500,isFav,hStatus||null,hDateFrom||null,hDateTo||null);
    if(sb&&d.stats){const s=d.stats;sb.innerHTML=`<div class="mini-stat"><span class="ms-v">${s.total||0}</span><span class="ms-l">Tổng</span></div><div class="mini-stat"><span class="ms-v" style="color:var(--ok)">${s.completed||0}</span><span class="ms-l">Xong</span></div><div class="mini-stat"><span class="ms-v" style="color:var(--err)">${s.failed||0}</span><span class="ms-l">Lỗi</span></div><div class="mini-stat"><span class="ms-v" style="color:var(--warn)">${s.favorites||0}</span><span class="ms-l">★ Favs</span></div><div class="mini-stat"><span class="ms-v">${s.videos||0}</span><span class="ms-l">Videos</span></div><div class="mini-stat"><span class="ms-v">${s.images||0}</span><span class="ms-l">Ảnh</span></div>`}
    _histItems=d.history||[];
    if(!_histItems.length){g.innerHTML='<p class="muted">Chưa có lịch sử</p>';return}
    _renderHistPage();
  }catch(e){g.innerHTML=`<p class="err">${e.message}</p>`}
}
function _renderHistPage(){
  const g=document.getElementById('hgrid');if(!g)return;
  const start=_histPage*_BP;
  const visible=_histItems.slice(start,start+_BP);
  const pg=_pgHtml(_histPage,_histItems.length,'_histGoPage');  if(hViewMode==='list'){renderHistList(g,visible,pg)}else{renderHistGrid(g,visible,pg)}
}
function renderHistGrid(g,items,loadMore){
  g.innerHTML=items.map(h=>{
    const isV=h.type.includes('video')||h.type==='extend_video';
    const thumb=h.output_url?(isV?`<video src="${h.output_url}#t=0.1" muted preload="metadata" onerror="this.outerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3)\\'>⚠ Hết hạn</div>'"></video>`:`<img src="${h.output_url}" loading="lazy" onerror="this.outerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3)\\'>⚠ Hết hạn</div>'">`):`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2)">${h.status==='failed'?'✕':'⏳'}</div>`;
    const tl={text2video:'T→V',image2video:'I→V',text2image:'T→I',image2image:'I→I',extend_video:'Ext'}[h.type]||h.type;
    const dt=new Date(h.created_at).toLocaleDateString();const fav=h.favorite?'★':'☆';
    const sel=hSelectMode?`<div class="hcheck" onclick="event.stopPropagation();toggleHSel(${h.id})"><input type="checkbox" ${hSel.has(h.id)?'checked':''} style="pointer-events:none"></div>`:'';
    return `<div class="glass-card hist-card ${hSel.has(h.id)?'selected':''}" data-hid="${h.id}" onclick="${hSelectMode?`toggleHSel(${h.id})`:`openLightbox('${(h.output_url||'').replace(/'/g,"\\'")}',${isV},'${(h.prompt||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')`}">${sel}<div class="thumb">${thumb}</div><div class="hmeta"><span class="badge">${tl}</span><span><span class="sdot ${h.status}"></span>${h.status}</span></div><div class="hprompt" title="${(h.prompt||'').replace(/"/g,'&quot;')}">${h.prompt||''}</div><div class="hactions"><span class="htime">${dt}</span><div class="ha-btns"><button class="btn-icon" onclick="event.stopPropagation();toggleFav(${h.id},this)" title="Yêu thích">${fav}</button><button class="btn-icon" onclick="event.stopPropagation();copyPrompt('${(h.prompt||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')" title="Copy">📋</button>${h.output_url?`<button class="btn-icon" onclick="event.stopPropagation();dlProxy('${h.output_url}','${isV?'video.mp4':'image.jpg'}')" title="Tải">⬇</button>`:''}<button class="btn-icon danger" onclick="event.stopPropagation();delHist(${h.id})" title="Xóa">✕</button></div></div></div>`;
  }).join('')+(loadMore||'');
}
function renderHistList(g,items,loadMore){
  g.innerHTML=`<div class="glass-card tbl-wrap" style="padding:0"><table class="adm-tbl"><thead><tr>${hSelectMode?'<th style="width:30px">☐</th>':''}<th>Type</th><th>Prompt</th><th>Status</th><th>Ngày</th><th>Actions</th></tr></thead><tbody>${items.map(h=>{
    const isV=h.type.includes('video')||h.type==='extend_video';
    const tl={text2video:'T→V',image2video:'I→V',text2image:'T→I',image2image:'I→I',extend_video:'Ext'}[h.type]||h.type;
    const dt=new Date(h.created_at).toLocaleDateString();const fav=h.favorite?'★':'☆';
    const ps=(h.prompt||'').substring(0,80)+((h.prompt||'').length>80?'...':'');
    return `<tr class="${hSel.has(h.id)?'selected':''}" data-hid="${h.id}">${hSelectMode?`<td><input type="checkbox" ${hSel.has(h.id)?'checked':''} onchange="toggleHSel(${h.id})"></td>`:''}
      <td><span class="badge">${tl}</span></td>
      <td class="sm" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="${(h.prompt||'').replace(/"/g,'&quot;')}" onclick="openLightbox('${(h.output_url||'').replace(/'/g,"\\'")}',${isV},'${(h.prompt||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')">${ps}</td>
      <td><span class="sdot ${h.status}"></span>${h.status}</td>
      <td class="sm">${dt}</td>
      <td class="acts"><button class="btn-icon" onclick="toggleFav(${h.id},this)">${fav}</button><button class="btn-icon" onclick="copyPrompt('${(h.prompt||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')">📋</button>${h.output_url?`<button class="btn-icon" onclick="dlProxy('${h.output_url}','${isV?'video.mp4':'image.jpg'}')">⬇</button><button class="btn-icon" onclick="window.open('${h.output_url}','_blank')">↗</button>`:''}<button class="btn-icon danger" onclick="delHist(${h.id})">✕</button></td></tr>`}).join('')}</tbody></table></div>`+(loadMore||'');
}
function hFilter(t,btn){hF=t;document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('on'));if(btn)btn.classList.add('on');loadHist()}
function hStatusFilter(val){hStatus=val||null;loadHist()}
function hDateFilter(){hDateFrom=document.getElementById('hdate-from')?.value||'';hDateTo=document.getElementById('hdate-to')?.value||'';loadHist()}
function clearDateFilter(){hDateFrom='';hDateTo='';hStatus=null;const f=document.getElementById('hdate-from');if(f)f.value='';const t=document.getElementById('hdate-to');if(t)t.value='';const s=document.getElementById('hstatus');if(s)s.value='';loadHist()}
function toggleSelectMode(){
  hSelectMode=!hSelectMode;hSel.clear();
  const btn=document.getElementById('hsel-btn');
  if(btn)btn.textContent=hSelectMode?'✕ Hủy':'☐ Chọn';
  // Re-render with pagination
  if(_histItems.length)_renderHistPage();
  updateBulkBar();
}
function toggleHSel(id){
  if(hSel.has(id))hSel.delete(id);else hSel.add(id);
  const card=document.querySelector(`[data-hid="${id}"]`);
  if(card){
    card.classList.toggle('selected',hSel.has(id));
    const cb=card.querySelector('input[type=checkbox]');
    if(cb)cb.checked=hSel.has(id);
  }
  updateBulkBar();
}
function updateBulkBar(){
  const bar=document.getElementById('hbulk');if(!bar)return;
  if(!hSelectMode){bar.style.display='none';return}
  bar.style.display='flex';
  const total=_histItems.length;
  const allSelected=total>0&&hSel.size===total;
  const completedCount=_histItems.filter(h=>h.status==='completed').length;
  const failedCount=_histItems.filter(h=>h.status==='failed').length;
  const hasUrl=_histItems.filter(h=>hSel.has(h.id)&&h.output_url&&h.status==='completed').length;
  bar.innerHTML=`
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none">
        <input type="checkbox" ${allSelected?'checked':''} onchange="toggleSelectAll(this.checked)" style="width:15px;height:15px;accent-color:#fff;cursor:pointer">
        <span style="font-size:11px;color:var(--text2)">Tất cả</span>
      </label>
      <span class="bulk-count" style="font-size:11px;color:var(--text);font-weight:600">${hSel.size}/${total}</span>
      <span style="font-size:10px;color:var(--text3)">|</span>
      <button class="btn-s" onclick="selectByStatus('completed')" style="font-size:10px;padding:4px 10px" title="Chọn tất cả completed">✓ Xong (${completedCount})</button>
      <button class="btn-s" onclick="selectByStatus('failed')" style="font-size:10px;padding:4px 10px" title="Chọn tất cả failed">✕ Lỗi (${failedCount})</button>
      <span style="flex:1"></span>
      <button class="btn-s" onclick="bulkDl()" ${!hasUrl?'disabled':''} style="font-size:11px"><span>⬇</span> Tải (${hasUrl})</button>
      <button class="btn-s" onclick="bulkFav()" ${!hSel.size?'disabled':''} style="font-size:11px"><span>★</span> Fav</button>
      <button class="btn-s bulk-del" onclick="bulkDel()" ${!hSel.size?'disabled':''} style="font-size:11px"><span>🗑</span> Xóa chọn</button>
    </div>
    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;width:100%">
      <button class="btn-s" onclick="deleteByStatus('failed')" style="font-size:10px;padding:4px 10px;color:var(--err);border-color:rgba(248,113,113,.2)" ${!failedCount?'disabled':''}>🗑 Xóa tất cả lỗi (${failedCount})</button>
      <button class="btn-s" onclick="deleteByStatus('completed')" style="font-size:10px;padding:4px 10px;color:var(--warn);border-color:rgba(251,191,36,.2)" ${!completedCount?'disabled':''}>🗑 Xóa tất cả xong (${completedCount})</button>
      <button class="btn-s" onclick="dlByStatus('completed')" style="font-size:10px;padding:4px 10px" ${!completedCount?'disabled':''}>⬇ Tải tất cả xong</button>
    </div>`;
}
function toggleSelectAll(checked){
  if(checked){
    _histItems.forEach(h=>hSel.add(h.id));
    document.querySelectorAll('.hist-card[data-hid],.adm-tbl tr[data-hid]').forEach(c=>{
      c.classList.add('selected');
      const cb=c.querySelector('input[type=checkbox]');if(cb)cb.checked=true;
    });
  }else{
    hSel.clear();
    document.querySelectorAll('.hist-card[data-hid],.adm-tbl tr[data-hid]').forEach(c=>{
      c.classList.remove('selected');
      const cb=c.querySelector('input[type=checkbox]');if(cb)cb.checked=false;
    });
  }
  updateBulkBar();
}
function selectAllH(){toggleSelectAll(true)}
function selectByStatus(status){
  hSel.clear();
  _histItems.filter(h=>h.status===status).forEach(h=>hSel.add(h.id));
  // Update DOM
  document.querySelectorAll('.hist-card[data-hid],.adm-tbl tr[data-hid]').forEach(c=>{
    const id=+c.dataset.hid;
    c.classList.toggle('selected',hSel.has(id));
    const cb=c.querySelector('input[type=checkbox]');if(cb)cb.checked=hSel.has(id);
  });
  updateBulkBar();
  toast(`Đã chọn ${hSel.size} mục ${status}`,'info');
}
async function deleteByStatus(status){
  const label=status==='failed'?'lỗi':'hoàn thành';
  const count=_histItems.filter(h=>h.status===status).length;
  if(!count){toast(`Không có mục ${label}`,'err');return}
  if(!confirm(`Xóa tất cả ${count} mục ${label}?`))return;
  try{await API.bulkStatus('delete',status);toast(`Đã xóa ${count} mục ${label}`,'ok');hSel.clear();loadHist()}catch(e){toast(e.message,'err')}
}
async function dlByStatus(status){
  // Select all completed items and trigger bulk download
  hSel.clear();
  _histItems.filter(h=>h.status===status&&h.output_url).forEach(h=>hSel.add(h.id));
  updateBulkBar();
  if(!hSel.size){toast('Không có file để tải','err');return}
  await bulkDl();
}
async function bulkDel(){if(!hSel.size)return;if(!confirm(`Xóa ${hSel.size} mục?`))return;try{await API.bulkHistory('delete',[...hSel]);toast('Đã xóa','ok');hSel.clear();hSelectMode=false;const btn=document.getElementById('hsel-btn');if(btn)btn.textContent='☐ Chọn';loadHist()}catch(e){toast(e.message,'err')}}
async function bulkFav(){if(!hSel.size)return;try{await API.bulkHistory('favorite',[...hSel]);toast('Đã yêu thích','ok');loadHist(true)}catch(e){toast(e.message,'err')}}
async function toggleFav(id,btn){try{const d=await API.favHistory(id);if(btn)btn.textContent=d.favorite?'★':'☆'}catch(e){toast(e.message,'err')}}
async function delHist(id){if(!confirm('Xóa?'))return;try{await API.delHistory(id);toast('Đã xóa','ok');loadHist()}catch(e){toast(e.message,'err')}}
function copyPrompt(p){navigator.clipboard.writeText(p).then(()=>toast('Đã copy prompt','ok')).catch(()=>toast('Copy thất bại','err'))}

/* ========== BULK DOWNLOAD (ZIP) ========== */
async function bulkDl(){
  if(!hSel.size){toast('Không có file để tải','err');return}
  const items=_histItems.filter(h=>hSel.has(h.id)&&h.output_url&&h.status==='completed');
  if(!items.length){toast('Không có file hoàn thành để tải','err');return}

  if(items.length===1){
    const h=items[0];const isV=h.type.includes('video')||h.type==='extend_video';
    dlProxy(h.output_url,isV?'video.mp4':'image.jpg');return;
  }

  toast(`Đang nén ${items.length} files...`,'info');
  try{
    const zip=new JSZip();
    let added=0;
    for(let i=0;i<items.length;i++){
      const h=items[i];const isV=h.type.includes('video')||h.type==='extend_video';
      const ext=isV?'mp4':'jpg';
      const fname=`grok-${String(i+1).padStart(3,'0')}.${ext}`;
      try{
        // Use proxy to avoid CORS
        const r=await fetch('/api/proxy-dl',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.token},body:JSON.stringify({url:h.output_url,filename:fname})});
        if(!r.ok)throw new Error('HTTP '+r.status);
        const blob=await r.blob();
        if(blob.size>0){zip.file(fname,blob);added++}
      }catch{
        // Fallback: direct fetch
        try{
          const r2=await fetch(h.output_url);
          if(r2.ok){const blob=await r2.blob();if(blob.size>0){zip.file(fname,blob);added++}}
        }catch{}
      }
    }
    if(!added){toast('Không tải được file nào (CORS). Dùng nút ⬇ từng file.','err');return}
    const content=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');a.href=URL.createObjectURL(content);
    a.download=`grok-studio-${added}files.zip`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast(`Đã tải ZIP (${added}/${items.length} files)`,'ok');
  }catch(e){toast('Lỗi nén ZIP: '+e.message,'err')}
}

/* ========== LIGHTBOX ========== */
function openLightbox(url,isV,prompt){
  if(!url)return;const lb=document.getElementById('lightbox');if(!lb)return;
  const media=isV?`<video src="${url}" controls autoplay loop playsinline style="max-width:90vw;max-height:80vh;border-radius:12px"></video>`:`<img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:12px;object-fit:contain">`;
  lb.innerHTML=`<div class="lb-overlay" onclick="if(event.target===this)closeLightbox()"><div class="lb-content"><div class="lb-close" onclick="closeLightbox()">✕</div>${media}<div class="lb-info"><div class="lb-prompt">${prompt||''}</div><div style="font-size:11px;color:var(--warn);margin:6px 0">⚠️ File chỉ lưu 24h — hãy tải về máy ngay</div><div class="lb-acts"><button class="btn-s" onclick="dlProxy('${url}','${isV?'video.mp4':'image.jpg'}')">⬇ Tải về</button><button class="btn-s" onclick="window.open('${url}','_blank')">↗ Mở</button>${prompt?`<button class="btn-s" onclick="copyPrompt('${prompt.replace(/'/g,"\\'")}')">📋 Copy Prompt</button>`:''}</div></div></div></div>`;
}
function closeLightbox(){const lb=document.getElementById('lightbox');if(lb)lb.innerHTML=''}

/* ========== BACKEND DIAGNOSTICS ========== */
async function runDiag(){
  const el=document.getElementById('cf-diag');if(!el)return;
  try{
    const d=await API.diagnose();let html='<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">';
    if(!d.hasAccount){html+=`<span style="color:var(--warn)">⚠ Chưa thêm tài khoản Grok</span></div>`;el.innerHTML=html;return}
    html+=d.hasSso?`<span style="color:var(--ok)">✓ SSO</span>`:`<span style="color:var(--err)">✕ Không có SSO</span>`;
    html+=d.apiReachable?`<span style="color:var(--ok)">✓ Grok2API</span>`:`<span style="color:var(--err)">✕ Grok2API offline</span>`;
    html+=d.hasCfClearance?`<span style="color:var(--ok)">✓ cf_clearance</span>`:`<span style="color:var(--warn)">⚠ Không có cf_clearance</span>`;
    html+='</div>';html+=`<div style="margin-top:6px;font-size:11px;color:var(--text3)">${d.hint||''}</div>`;
    if(!d.hasCfClearance)html+=`<div style="margin-top:6px;font-size:11px;color:var(--warn)">💡 Video cần cf_clearance. Mở grok.com → giải CF → export cookies → cập nhật.</div>`;
    if(!d.apiReachable)html+=`<div style="margin-top:6px;font-size:11px;color:var(--err)">⚠ Grok2API không kết nối được tại ${d.apiBase||'?'}.</div>`;
    el.innerHTML=html;
  }catch(e){el.innerHTML=`<span style="color:var(--err)">✕</span> Lỗi: ${e.message}`}
}

/* ========== ACCOUNTS ========== */
let _accSel=new Set(),_accSelectMode=false,_accList=[],_accPage=0;
function _updateAccBulkBar(){
  const bar=document.getElementById('acc-bulk-bar');if(!bar)return;
  if(!_accSelectMode||!_accSel.size){bar.style.display='none';return}
  bar.style.display='flex';
  bar.innerHTML=`<span style="font-size:12px;font-weight:600;color:var(--accent)">Đã chọn ${_accSel.size} token</span><span style="flex:1"></span><button class="btn-s" onclick="accSelectAll()">Chọn tất cả</button><button class="btn-s" onclick="accSelectByStatus('active')">Chọn Active</button><button class="btn-s" onclick="accSelectByStatus('limited')">Chọn Limited</button><button class="btn-s danger" onclick="accBulkDel()">🗑 Xóa ${_accSel.size}</button><button class="btn-s" onclick="accCancelSel()">✕ Hủy</button>`;
}
function accToggleSel(id){if(_accSel.has(id))_accSel.delete(id);else _accSel.add(id);_updateAccBulkBar();const cb=document.getElementById('acb-'+id);if(cb)cb.checked=_accSel.has(id)}
function accSelectAll(){_accList.forEach(a=>_accSel.add(a.id));_updateAccBulkBar();document.querySelectorAll('.acc-cb').forEach(cb=>cb.checked=true)}
function accSelectByStatus(s){_accList.filter(a=>a.status===s).forEach(a=>_accSel.add(a.id));_updateAccBulkBar();_accList.forEach(a=>{const cb=document.getElementById('acb-'+a.id);if(cb)cb.checked=_accSel.has(a.id)})}
function accCancelSel(){_accSel.clear();_accSelectMode=false;_updateAccBulkBar();document.querySelectorAll('.acc-cb').forEach(cb=>{cb.checked=false;cb.style.display='none'})}
async function accBulkDel(){if(!_accSel.size)return;if(!confirm(`Xóa ${_accSel.size} token?`))return;try{await API.bulkDelAccounts([..._accSel]);toast(`Đã xóa ${_accSel.size} token`,'ok');_accSel.clear();_accSelectMode=false;loadAcc()}catch(e){toast(e.message,'err')}}
function accToggleSelectMode(){_accSelectMode=!_accSelectMode;if(!_accSelectMode){_accSel.clear();_updateAccBulkBar()}document.querySelectorAll('.acc-cb,.acc-cb-all').forEach(cb=>cb.style.display=_accSelectMode?'inline':'none')}
async function loadAcc(){
  const el=document.getElementById('alist');if(!el)return;el.innerHTML='<div class="spin-lg"></div>';
  try{
    const d=await API.getAccounts();
    // Show limit summary banner
    const limitInfo=document.getElementById('acc-limit-info');
    if(limitInfo){
      const limited=(d.accounts||[]).filter(a=>a.status==='limited');
      const active=(d.accounts||[]).filter(a=>a.status==='active');
      if(limited.length>0){
        const nextUnlock=limited.filter(a=>a.limit_info).sort((a,b)=>(a.limit_info?.remaining_minutes||999)-(b.limit_info?.remaining_minutes||999))[0];
        limitInfo.innerHTML=`<div class="glass-card" style="padding:14px 18px;margin-bottom:16px;background:rgba(248,113,113,.05);border:1px solid rgba(248,113,113,.15)">
          <div style="font-size:13px;font-weight:600;color:var(--err)">🔒 ${limited.length} token đang bị khóa (Rate Limit từ Grok.com)</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5">
            Grok giới hạn mỗi tài khoản tối đa 80-200 video/ngày. Khi đạt giới hạn, token tự động bị khóa và sẽ mở lại sau 1h30 - 2h.
            ${active.length>0?`<br>✓ Còn <b>${active.length}</b> token đang hoạt động bình thường.`:'<br>⚠ Không còn token nào hoạt động. Thêm tài khoản Grok mới hoặc đợi mở khóa.'}
            ${nextUnlock?`<br>⏱ Token gần nhất mở khóa sau: <b>${nextUnlock.limit_info.remaining_text}</b>`:''}
          </div>
        </div>`;
      }else{limitInfo.innerHTML=''}
    }
    if(!d.accounts?.length){el.innerHTML='<p class="muted">Chưa thêm tài khoản</p>';return}
    _accList=d.accounts;_accPage=0;
    _renderAccPage();
  }catch(e){el.innerHTML=`<p class="err">${e.message}</p>`}
}
function _renderAccPage(){
  const el=document.getElementById('alist');if(!el)return;
  if(!_accList.length){el.innerHTML='<p class="muted">Chưa thêm tài khoản</p>';return}
  const start=_accPage*_BP;const visible=_accList.slice(start,start+_BP);
  const toolbar=`<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center"><span style="font-size:12px;color:var(--text2)">${_accList.length} token</span><span style="flex:1"></span><button class="btn-s" id="acc-view-btn" onclick="toggleAccView()" title="Đổi kiểu xem">${accViewMode==='grid'?'☰ Bảng':'▦ Card'}</button><button class="btn-s" onclick="accToggleSelectMode()">☐ Chọn</button></div>`;
  const pg=_pgHtml(_accPage,_accList.length,'_accGoPage');
  if(accViewMode==='grid'){
    el.innerHTML=toolbar+`<div class="acc-list">`+visible.map(a=>_renderAccCard(a)).join('')+`</div>`+pg;
  }else{
    el.innerHTML=toolbar+`<div class="glass-card tbl-wrap" style="padding:0"><table class="adm-tbl"><thead><tr><th style="width:30px"><input type="checkbox" class="acc-cb-all" onchange="accToggleAll(this.checked)" style="display:${_accSelectMode?'inline':'none'};width:14px;height:14px;cursor:pointer"></th><th>Nhãn</th><th>Token</th><th>CF</th><th>Status</th><th>Lần cuối</th><th>Thao tác</th></tr></thead><tbody>`+visible.map(a=>_renderAccRow(a)).join('')+`</tbody></table></div>`+pg;
  }
}
function _renderAccCard(a){
  const ci=a.cookie_info||{};let cfStatus='',cfClass='';
  if(ci.hasCfClearance){cfStatus='cf_clearance: ✓';cfClass='ok'}
  else if(ci.hasSso){cfStatus='Không có cf_clearance';cfClass='warn'}
  else{cfStatus='Không có SSO';cfClass='err'}
  if(ci.ssoExpired){cfStatus='SSO hết hạn!';cfClass='err'}
  let limitHtml='';
  if(a.status==='limited'&&a.limit_info){
    limitHtml=`<div style="margin-top:6px;padding:6px 10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.15);border-radius:6px;font-size:10px;line-height:1.4">
      <span style="color:var(--err);font-weight:600">🔒 Rate Limit</span>
      <span style="color:var(--warn);margin-left:4px">⏱ ${a.limit_info.remaining_text}</span>
    </div>`;
  }else if(a.status==='limited'){
    limitHtml=`<div style="margin-top:6px;padding:6px 10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.15);border-radius:6px;font-size:10px;color:var(--err)">🔒 Rate Limit</div>`;
  }
  return `<div class="glass-card acc-card"><div class="acc-top"><input type="checkbox" class="acc-cb" id="acb-${a.id}" style="display:${_accSelectMode?'inline':'none'};cursor:pointer;width:16px;height:16px" onchange="accToggleSel(${a.id})" ${_accSel.has(a.id)?'checked':''}><span class="acc-status ${a.status}">${a.status==='limited'?'🔒 limited':a.status}</span></div><div class="acc-body"><div style="font-size:14px;font-weight:500;margin-bottom:4px">${a.label||'Chưa đặt tên'}</div><div class="tok-prev">${a.token_preview}</div><div style="font-size:11px;color:var(--${cfClass});margin-top:4px">${cfStatus}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${a.last_used?'Lần cuối: '+new Date(a.last_used).toLocaleString():'Chưa dùng'}</div>${limitHtml}</div><div class="acc-bottom"><button class="btn-s" onclick="showUpdateModal(${a.id},'${(a.label||'').replace(/'/g,"\\'")}')">🔄 Cập nhật</button><button class="btn-icon danger" onclick="delAcc(${a.id})" title="Xóa">✕</button></div></div>`;
}
function _renderAccRow(a){
  const ci=a.cookie_info||{};let cfTxt='',cfCls='text3';
  if(ci.hasCfClearance){cfTxt='✓ CF';cfCls='ok'}
  else if(ci.hasSso){cfTxt='⚠ No CF';cfCls='warn'}
  else{cfTxt='✕ No SSO';cfCls='err'}
  if(ci.ssoExpired){cfTxt='✕ Expired';cfCls='err'}
  const limitTxt=a.status==='limited'&&a.limit_info?` (${a.limit_info.remaining_text})`:'';
  return `<tr><td><input type="checkbox" class="acc-cb" id="acb-${a.id}" style="display:${_accSelectMode?'inline':'none'};width:14px;height:14px;cursor:pointer" onchange="accToggleSel(${a.id})" ${_accSel.has(a.id)?'checked':''}></td><td style="font-weight:500">${a.label||'—'}</td><td class="tok-prev" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.token_preview}</td><td style="color:var(--${cfCls});font-size:11px">${cfTxt}</td><td><span class="acc-status ${a.status}">${a.status==='limited'?'🔒 limited'+limitTxt:a.status}</span></td><td style="font-size:11px;color:var(--text2);white-space:nowrap">${a.last_used?new Date(a.last_used).toLocaleString():'—'}</td><td><div style="display:flex;gap:4px"><button class="btn-s" onclick="showUpdateModal(${a.id},'${(a.label||'').replace(/'/g,"\\'")}')">🔄</button><button class="btn-icon danger" onclick="delAcc(${a.id})" title="Xóa">✕</button></div></td></tr>`;
}
function toggleAccView(){
  accViewMode=accViewMode==='grid'?'table':'grid';
  localStorage.setItem('gs_accview',accViewMode);
  loadAcc();
}
function accToggleAll(checked){
  if(!_accList)return;
  if(checked){_accList.forEach(a=>_accSel.add(a.id))}else{_accSel.clear()}
  document.querySelectorAll('.acc-cb').forEach(cb=>cb.checked=checked);
  _updateAccBulkBar();
}
async function addAcc(){
  const t=document.getElementById('ntok')?.value?.trim(),l=document.getElementById('nlbl')?.value?.trim();
  if(!t){toast('Dán cookie JSON','err');return}
  // Split by detecting multiple JSON arrays or SSO tokens separated by blank lines
  const chunks=splitTokenInput(t);
  if(chunks.length>1){
    // Bulk add
    try{
      const d=await API.req('/accounts',{method:'POST',body:JSON.stringify({tokens:chunks})});
      toast(d.message,'ok');
      if(d.errors?.length)d.errors.forEach(e=>console.warn('Token error:',e));
      document.getElementById('ntok').value='';document.getElementById('nlbl').value='';loadAcc();
    }catch(e){toast(e.message,'err')}
  }else{
    try{await API.addAccount(chunks[0],l);toast('Đã thêm','ok');document.getElementById('ntok').value='';document.getElementById('nlbl').value='';loadAcc()}catch(e){toast(e.message,'err')}
  }
}
function splitTokenInput(raw){
  // Try to detect multiple cookie JSON arrays separated by newlines
  // Strategy: find all top-level [...] JSON arrays, or split by blank lines for SSO tokens
  const results=[];
  const trimmed=raw.trim();
  // Check if it's multiple JSON arrays: [...]\n[...]
  if(trimmed.startsWith('[')){
    let depth=0,start=0;
    for(let i=0;i<trimmed.length;i++){
      if(trimmed[i]==='[')depth++;
      else if(trimmed[i]===']'){depth--;if(depth===0){results.push(trimmed.substring(start,i+1).trim());start=i+1;while(start<trimmed.length&&/[\s,]/.test(trimmed[start]))start++}}
    }
    if(results.length>0)return results;
  }
  // Fallback: split by blank lines or newlines for SSO tokens
  const lines=trimmed.split(/\n/).map(l=>l.trim()).filter(l=>l);
  if(lines.length>1&&!trimmed.startsWith('['))return lines;
  return [trimmed];
}
async function delAcc(id){if(!confirm('Xóa tài khoản này?'))return;try{await API.delAccount(id);toast('Đã xóa','ok');loadAcc()}catch(e){toast(e.message,'err')}}
function showUpdateModal(id,label){const m=document.getElementById('acc-modal');if(!m)return;m.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('acc-modal')"><div class="glass-card modal"><div class="modal-title">Cập nhật Cookies</div><div style="font-size:12px;color:var(--text2);margin-bottom:12px">Dán cookie JSON hoặc SSO token mới.</div><div class="fg"><label>Nhãn</label><input id="upd-label" value="${label}"></div><div class="fg"><label>Cookie / Token</label><textarea id="upd-tok" placeholder='Dán cookie JSON, SSO token, hoặc sso=VALUE' style="min-height:100px;font-size:11px;font-family:monospace"></textarea></div><div class="modal-acts"><button class="btn-s" onclick="closeModal('acc-modal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="doUpdateAcc(${id})">Cập nhật</button></div></div></div>`}
async function doUpdateAcc(id){const tok=document.getElementById('upd-tok')?.value?.trim();const label=document.getElementById('upd-label')?.value?.trim();if(!tok&&!label){toast('Không có gì để cập nhật','err');return}try{await API.updAccount(id,tok||undefined,label||undefined);toast('Đã cập nhật','ok');closeModal('acc-modal');loadAcc()}catch(e){toast(e.message,'err')}}

/* ========== PROFILE / ACCOUNT PAGE ========== */
function renderProfile(){
  return `<div class="page-title">Tài khoản của tôi</div><div class="page-sub">Quản lý thông tin cá nhân và gói dịch vụ</div>
<div class="prof-layout">
  <div class="prof-left">
    <div class="glass-card prof-card" id="prof-info"><div class="spin-lg"></div></div>
    <div class="glass-card prof-card" id="prof-plan"><div class="spin-lg"></div></div>
  </div>
  <div class="prof-right">
    <div class="glass-card prof-card">
      <div class="prof-section-title">Đổi tên</div>
      <div class="fg"><input id="pf-name" placeholder="Tên hiển thị"></div>
      <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="saveProfile()">Lưu tên</button>
    </div>
    <div class="glass-card prof-card">
      <div class="prof-section-title">Đổi mật khẩu</div>
      <div class="fg"><input type="password" id="pf-curpw" placeholder="Mật khẩu hiện tại"></div>
      <div class="fg"><input type="password" id="pf-newpw" placeholder="Mật khẩu mới"></div>
      <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="changePassword()">Đổi mật khẩu</button>
    </div>
    <div class="glass-card prof-card">
      <div class="prof-section-title">Lịch sử thanh toán</div>
      <div id="prof-payments"><div class="spin-lg"></div></div>
    </div>
  </div>
</div>`;
}
async function loadProfile(){
  try{
    const d=await API.me();const u=d.user;CU=u;API.saveU(CU);
    // Update sidebar
    document.getElementById('uname').textContent=u.name||u.email;
    document.getElementById('uplan').textContent=u.role==='admin'?'★ ADMIN':planName(u.plan);
    document.getElementById('avatar').textContent=(u.name||u.email)[0].toUpperCase();
    // Info card
    const info=document.getElementById('prof-info');
    if(info)info.innerHTML=`
      <div class="prof-avatar">${(u.name||u.email)[0].toUpperCase()}</div>
      <div class="prof-name-big">${u.name||'Chưa đặt tên'}</div>
      <div class="prof-email">${u.email}</div>
      <div class="prof-meta">
        <div class="prof-meta-item"><span class="prof-meta-label">ID</span><span>#${u.id}</span></div>
        <div class="prof-meta-item"><span class="prof-meta-label">Role</span><span class="badge${u.role==='admin'?' admin':''}">${u.role}</span></div>
        <div class="prof-meta-item"><span class="prof-meta-label">Tài khoản Grok</span><span>${u.account_count||0}</span></div>
        <div class="prof-meta-item"><span class="prof-meta-label">Ngày tạo</span><span>${u.created_at?new Date(u.created_at).toLocaleDateString():'-'}</span></div>
      </div>`;
    // Plan card
    const plan=document.getElementById('prof-plan');
    const curPlan=u.plan||'free';
    const exp=u.plan_expires?u.plan_expires.slice(0,10):'';
    const isActive=curPlan!=='free'&&(!exp||exp>=new Date().toISOString().slice(0,10));
    const daysLeft=exp?Math.max(0,Math.ceil((new Date(exp)-new Date())/(86400000))):0;
    const dl=u.daily_limit==null||u.daily_limit===-1?'Unlimited':u.daily_limit;
    const vl=u.video_limit==null||u.video_limit===-1?'Unlimited':u.video_limit;
    if(plan)plan.innerHTML=`
      <div class="prof-section-title">Gói dịch vụ</div>
      <div class="prof-plan-box ${isActive?'active':'inactive'}">
        <div class="prof-plan-name">${planName(curPlan)}</div>
        <div class="prof-plan-status">${isActive?'✓ Đang hoạt động':curPlan==='free'?'Gói miễn phí':'⚠ Hết hạn'}</div>
      </div>
      ${exp?`<div class="prof-plan-detail"><span>Hết hạn</span><span style="${daysLeft<=3?'color:var(--err);font-weight:600':''}">${exp} (còn ${daysLeft} ngày)</span></div>`:''}
      <div class="prof-plan-detail"><span>Giới hạn/ngày</span><span>${dl}</span></div>
      <div class="prof-plan-detail"><span>Video/ngày</span><span>${vl}</span></div>
      <div class="prof-plan-detail"><span>Credits</span><span>${u.credits===-1?'Unlimited':u.credits}</span></div>
      <button class="pr-btn hot" style="margin-top:16px" onclick="go('pricing')">${isActive?'Gia hạn / Nâng cấp':'Mua gói ngay'} →</button>`;
    // Set name input
    const ni=document.getElementById('pf-name');if(ni)ni.value=u.name||'';
    // Load payment history
    loadProfilePayments();
  }catch(e){toast(e.message,'err')}
}
let _profPayAll=[],_profPayPage=0;
function _profPayGoPage(p){_profPayPage=p;_renderProfPay()}
async function loadProfilePayments(){
  const el=document.getElementById('prof-payments');if(!el)return;
  try{
    const d=await API.pay.history();
    _profPayAll=d.orders||[];_profPayPage=0;_renderProfPay();
  }catch{el.innerHTML='<div class="muted" style="padding:10px">Không tải được</div>'}
}
function _renderProfPay(){
  const el=document.getElementById('prof-payments');if(!el)return;
  if(!_profPayAll.length){el.innerHTML='<div class="muted" style="padding:10px">Chưa có giao dịch</div>';return}
  const start=_profPayPage*_BP;const visible=_profPayAll.slice(start,start+_BP);
  el.innerHTML=`<table class="adm-tbl"><thead><tr><th>Gói</th><th>Số tiền</th><th>Status</th><th>Ngày</th></tr></thead><tbody>${visible.map(o=>{
    const stCls=o.status==='completed'?'color:var(--ok)':o.status==='pending'?'color:var(--warn)':'color:var(--err)';
    return `<tr><td><span class="badge">${planName(o.plan_id)}</span></td><td style="font-weight:600">${fmtVND(o.amount)}</td><td style="${stCls}">${o.status}</td><td class="sm">${o.created_at?new Date(o.created_at).toLocaleDateString():'-'}</td></tr>`;
  }).join('')}</tbody></table>`+_pgHtml(_profPayPage,_profPayAll.length,'_profPayGoPage');
}
async function saveProfile(){
  const name=document.getElementById('pf-name')?.value?.trim();
  if(!name){toast('Nhập tên','err');return}
  try{const d=await API.updateProfile({name});CU=d.user;API.saveU(CU);document.getElementById('uname').textContent=CU.name||CU.email;document.getElementById('avatar').textContent=(CU.name||CU.email)[0].toUpperCase();toast('Đã cập nhật tên','ok')}catch(e){toast(e.message,'err')}
}
async function changePassword(){
  const cur=document.getElementById('pf-curpw')?.value;
  const nw=document.getElementById('pf-newpw')?.value;
  if(!cur||!nw){toast('Nhập đủ mật khẩu','err');return}
  if(nw.length<6){toast('Mật khẩu mới tối thiểu 6 ký tự','err');return}
  try{await API.updateProfile({current_password:cur,password:nw});document.getElementById('pf-curpw').value='';document.getElementById('pf-newpw').value='';toast('Đã đổi mật khẩu','ok')}catch(e){toast(e.message,'err')}
}

/* ========== GUIDE PAGE ========== */
function renderGuide(){
  const plan=CU?.plan||'free';
  const isFree=plan==='free';
  return `<div class="page-title">📖 Hướng dẫn sử dụng</div><div class="page-sub">Bắt đầu tạo video/ảnh AI chỉ trong vài bước</div>
<div class="guide-wrap">

<div class="guide-step glass-card">
  <div class="gs-num">1</div>
  <div class="gs-body">
    <div class="gs-title">Mua gói dịch vụ</div>
    <div class="gs-desc">Chọn gói phù hợp tại trang <a href="#" onclick="go('pricing');return false" style="color:var(--ok);text-decoration:underline">Mua gói</a>. Thanh toán qua chuyển khoản ngân hàng, hệ thống tự động kích hoạt trong 1-2 phút.</div>
    ${isFree?'<div class="gs-tip warn">⚠️ Bạn đang dùng gói Free — hãy nâng cấp để sử dụng đầy đủ tính năng.</div>':'<div class="gs-tip ok">✅ Bạn đang dùng gói <b>'+planName(plan)+'</b></div>'}
  </div>
</div>

<div class="guide-step glass-card">
  <div class="gs-num">2</div>
  <div class="gs-body">
    <div class="gs-title">Thêm Token Grok</div>
    <div class="gs-desc">Vào trang <a href="#" onclick="go('accounts');return false" style="color:var(--ok);text-decoration:underline">Cài đặt Token</a>, dán cookie hoặc SSO token từ tài khoản <b>grok.com</b> của bạn.</div>
    <div class="gs-sub">
      <div class="gs-sub-title">🤖 Cách 1: Dùng Tool tự động (khuyên dùng)</div>
      <div class="gs-desc" style="margin-bottom:8px">Tool <b>Grok Studio Grabber</b> tự động đăng nhập và lấy cookie hàng loạt, upload thẳng lên hệ thống.</div>
      <ol class="gs-ol">
        <li><b>Tải tool:</b> <a href="https://drive.google.com/file/d/15FTxfRZ5mEM-Kz17t-trVSROzazUncnx/view?usp=sharing" target="_blank" style="color:var(--accent);font-weight:600">⬇ Tải Grok Studio Grabber (Windows)</a></li>
        <li>Giải nén file ZIP, mở <b>GrokStudioGrabber.exe</b></li>
        <li>Đăng nhập bằng tài khoản Grok Studio (cùng tài khoản web này)</li>
        <li>Nhập danh sách tài khoản Grok: mỗi dòng <code>email|password</code></li>
        <li>Nhấn <b>🚀 Bắt đầu Grab</b> — tool mở Chrome tự động đăng nhập, lấy cookie</li>
        <li>Sau khi xong, nhấn <b>📤 Upload</b> — token tự động xuất hiện trên web</li>
      </ol>
      <div class="gs-tip ok">✅ Tool hỗ trợ grab hàng loạt (3 account/lần), tự fill email + password, chỉ cần giải captcha nếu có.</div>
    </div>
    <div class="gs-sub" style="margin-top:10px">
      <div class="gs-sub-title">🔧 Cách 2: Lấy thủ công bằng Cookie Editor</div>
      <ol class="gs-ol">
        <li>Cài extension <a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" style="color:var(--accent)">Cookie Editor</a> trên Chrome/Edge</li>
        <li>Đăng nhập <a href="https://grok.com" target="_blank" style="color:var(--accent)">grok.com</a></li>
        <li>Click icon Cookie Editor → nhấn <b>Export</b> → chọn <b>Export as JSON</b></li>
        <li>Dán JSON vào ô token tại <a href="#" onclick="go('accounts');return false" style="color:var(--ok)">Cài đặt Token</a> và nhấn <b>Thêm</b></li>
      </ol>
    </div>
    <div class="gs-tip info" style="margin-top:8px">💡 Thêm nhiều tài khoản Grok (nhiều token) để chạy batch song song và tránh bị giới hạn.</div>
  </div>
</div>

<div class="guide-step glass-card">
  <div class="gs-num">3</div>
  <div class="gs-body">
    <div class="gs-title">Tạo video / ảnh đơn lẻ</div>
    <div class="gs-desc">Chọn loại tạo ở menu bên trái (Text→Video, Image→Video, Text→Image, Image→Image), nhập prompt và nhấn nút tạo.</div>
    <div class="gs-sub">
      <div class="gs-sub-title">Mẹo viết prompt hay:</div>
      <ul class="gs-ol">
        <li>Mô tả chi tiết: chủ thể, hành động, bối cảnh, ánh sáng, phong cách</li>
        <li>Ví dụ: <i>"A golden retriever running on a beach at sunset, cinematic slow motion, warm lighting"</i></li>
        <li>Dùng tiếng Anh cho kết quả tốt nhất</li>
      </ul>
    </div>
  </div>
</div>

<div class="guide-step glass-card">
  <div class="gs-num">4</div>
  <div class="gs-body">
    <div class="gs-title">Batch Mode — Tạo hàng loạt</div>
    <div class="gs-desc">Tính năng mạnh nhất của Grok Studio. Tạo hàng trăm video/ảnh cùng lúc.</div>
    <div class="gs-sub">
      <div class="gs-sub-title">Cách sử dụng:</div>
      <ol class="gs-ol">
        <li><b>Import TXT:</b> Mỗi dòng trong file .txt = 1 prompt</li>
        <li><b>Import Folder:</b> Mỗi file .txt trong folder = 1 prompt</li>
        <li><b>Image+TXT:</b> (cho Image→Video) File TXT chứa prompt, folder chứa ảnh tương ứng theo thứ tự dòng</li>
        <li>Chọn số <b>luồng/acc</b> (1-5) và số lần <b>retry</b> khi lỗi</li>
        <li>Nhấn <b>▶ Bắt đầu</b> — hệ thống tự phân phối prompt cho các token</li>
      </ol>
      <div class="gs-tip info">💡 Thêm nhiều token + tăng luồng = tốc độ batch nhanh hơn nhiều lần.</div>
    </div>
  </div>
</div>

<div class="guide-step glass-card">
  <div class="gs-num">5</div>
  <div class="gs-body">
    <div class="gs-title">Xem kết quả & Tải về</div>
    <div class="gs-desc">Kết quả hiển thị ở tab <b>Hoàn thành</b> trong batch panel, hoặc trang <a href="#" onclick="go('history');return false" style="color:var(--ok);text-decoration:underline">Lịch sử</a>. Click vào để xem, nhấn ⬇ để tải.</div>
    <div class="gs-tip warn">⚠️ <b>Quan trọng:</b> Video và ảnh chỉ được lưu trữ trong <b>24 giờ</b>. Hãy tải về máy ngay sau khi tạo xong để không bị mất file!</div>
  </div>
</div>

<div class="guide-step glass-card">
  <div class="gs-num">⚠️</div>
  <div class="gs-body">
    <div class="gs-title">Lưu ý quan trọng</div>
    <div class="gs-desc">
      <ul class="gs-ol" style="margin-top:4px">
        <li><b style="color:var(--warn)">File lưu trữ 24h:</b> Video/ảnh tự động bị xóa sau 24 giờ. Tải về máy ngay sau khi tạo!</li>
        <li><b>Giới hạn Grok.com:</b> Mỗi tài khoản Grok chỉ tạo được khoảng 80-200 video/ngày. Đây là giới hạn từ Grok.com, không phải từ Grok Studio.</li>
        <li><b>Token bị khóa tạm:</b> Khi token bị rate limit, hệ thống tự mở khóa sau 2 giờ. Bạn sẽ thấy biểu tượng 🔒 trên token.</li>
        <li><b>Nhiều token = ổn định hơn:</b> Thêm nhiều tài khoản Grok để batch chạy liên tục không bị gián đoạn.</li>
        <li><b>Video cần cf_clearance:</b> Nếu tạo video lỗi, kiểm tra token có cookie <code>cf_clearance</code> không.</li>
      </ul>
    </div>
  </div>
</div>

</div>`;
}

/* ========== PRICING PAGE ========== */
function renderPricing(){
  const exp=CU?.plan_expires?CU.plan_expires.slice(0,10):'';
  const curPlan=CU?.plan||'free';
  const isActive=curPlan!=='free'&&(!exp||exp>=new Date().toISOString().slice(0,10));
  const planLabel={'month1':'Tháng Starter','month5':'Tháng Pro','month10':'Tháng Business','3month1':'3T Starter','3month5':'3T Pro','3month10':'3T Business','week3':'Tuần Starter','week5':'Tuần Pro','week10':'Tuần Business','month3':'Tháng Starter','unlimited':'Unlimited'}[curPlan]||curPlan;
  const curInfo=isActive?`<div class="pr-current glass-card"><div class="pr-cur-badge">✓ Đang sử dụng</div><div class="pr-cur-plan">${planLabel}</div>${exp?`<div class="pr-cur-exp">Hết hạn: <b>${exp}</b></div>`:'<div class="pr-cur-exp">Vĩnh viễn</div>'}</div>`:`<div class="pr-current glass-card" style="border-color:rgba(251,191,36,.2)"><div class="pr-cur-badge" style="background:rgba(251,191,36,.15);color:var(--warn)">⚠ ${curPlan==='free'?'Gói miễn phí':'Hết hạn'}</div><div class="pr-cur-plan">${curPlan==='free'?'Nâng cấp để mở khóa tất cả tính năng':'Gia hạn để tiếp tục sử dụng'}</div></div>`;
  // Duration tabs + tier cards
  return `<div class="pr-page">
  <div class="pr-hero"><div class="pr-title">Chọn gói phù hợp</div><div class="pr-sub">Tất cả gói đều Unlimited tạo video & ảnh AI</div></div>
  ${curInfo}
  <div class="pr-tabs">
    <div class="pr-tabs-inner">
      <button class="pr-tab active" onclick="switchPrTab('month',this)">📆 1 Tháng</button>
      <button class="pr-tab" onclick="switchPrTab('3month',this)">🗓 3 Tháng</button>
    </div>
  </div>
  <div id="pr-cards"></div>
  <div id="pay-modal"></div>
  <div class="pr-footer"><div class="pr-trust">🔒 Thanh toán an toàn qua chuyển khoản ngân hàng ACB</div></div>
</div>`;
}
const _prPlans={month:[],_3month:[]};
let _prDur='month';
let _prLoaded=false;
async function _loadPrPlans(){
  if(_prLoaded)return;
  try{const d=await API.getPlans();const sp=d.service_plans||[];
    _prPlans.month=sp.filter(p=>p.duration==='month'&&p.active).map(p=>({id:p.id,tier:p.tier,price:p.price,accs:p.accs,period:p.days+' ngày',pop:!!p.popular,save:p.save_text||''}));
    _prPlans._3month=sp.filter(p=>p.duration==='3month'&&p.active).map(p=>({id:p.id,tier:p.tier,price:p.price,accs:p.accs,period:p.days+' ngày',pop:!!p.popular,save:p.save_text||''}));
    _prLoaded=true;
  }catch(e){console.error('Load plans error',e)}
}
function switchPrTab(dur,btn){
  _prDur=dur;
  document.querySelectorAll('.pr-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderPrCards();
}
function renderPrCards(){
  const el=document.getElementById('pr-cards');if(!el)return;
  const plans=_prDur==='month'?_prPlans.month:_prPlans._3month;
  if(!plans.length){el.innerHTML='<div style="text-align:center;color:var(--text2);padding:40px">Đang tải gói...</div>';return}
  const curPlan=CU?.plan||'free';
  const exp=CU?.plan_expires?CU.plan_expires.slice(0,10):'';
  const isActive=curPlan!=='free'&&(!exp||exp>=new Date().toISOString().slice(0,10));
  el.innerHTML='<div class="pr-grid">'+plans.map(p=>{
    const priceK=Math.floor(p.price/1000);
    const priceR=String(p.price%1000).padStart(3,'0');
    const isCurrent=isActive&&curPlan===p.id;
    return `<div class="pr-card${p.pop?' popular':''}${isCurrent?' current-plan':''}">
      ${p.pop?'<div class="pr-badge-hot">🔥 Phổ biến nhất</div>':'<div class="pr-badge-pop">'+p.tier+'</div>'}
      <div class="pr-name">${p.tier}</div>
      <div class="pr-price">${priceK}<span class="pr-unit">.${priceR}₫</span></div>
      <div class="pr-period">/ ${p.period}</div>
      ${p.save?`<div class="pr-save">🎉 ${p.save}</div>`:''}
      <ul class="pr-features">
        <li>✓ Unlimited tạo video AI</li>
        <li>✓ Unlimited tạo ảnh AI</li>
        <li>✓ Image → Video & Extend</li>
        <li>✓ Batch mode đa luồng</li>
        <li>✓ <b>${p.accs} tài khoản</b> Grok đồng thời</li>
        <li>✓ Hỗ trợ 24/7</li>
      </ul>
      ${isCurrent
        ?`<button class="pr-btn current" disabled>✓ Đang sử dụng</button>`
        :`<button class="pr-btn${p.pop?' hot':''}" onclick="buyPlan('${p.id}')">${isActive&&curPlan===p.id?'Gia hạn →':'Mua ngay →'}</button>`}
    </div>`;
  }).join('')+'</div>';
}
async function afterPricing(){await _loadPrPlans();renderPrCards()}

let _payPollTimer=null;
async function buyPlan(planId){
  const modal=document.getElementById('pay-modal');if(!modal)return;
  modal.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closePayModal()"><div class="glass-card modal pay-modal"><div class="spin-lg"></div><div style="text-align:center;margin-top:12px;color:var(--text2)">Đang tạo đơn hàng...</div></div></div>`;
  try{
    const d=await API.pay.create(planId);
    const o=d.order,b=d.bank;
    modal.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closePayModal()"><div class="glass-card modal pay-modal" onclick="event.stopPropagation()">
      <div class="pay-header"><div class="pay-title">Thanh toán ${o.plan_name}</div><div class="pay-close" onclick="closePayModal()">✕</div></div>
      <div class="pay-amount">${o.amount.toLocaleString('vi-VN')}₫</div>
      <div class="pay-qr"><img src="${o.qr_url}" alt="QR Code" onerror="this.style.display='none'"></div>
      <div class="pay-info">
        <div class="pay-row"><span>Ngân hàng</span><b>${b.name}</b></div>
        <div class="pay-row"><span>Số tài khoản</span><b class="pay-copy" onclick="copyText('${b.account}')">${b.account} 📋</b></div>
        <div class="pay-row"><span>Chủ tài khoản</span><b>${b.holder}</b></div>
        <div class="pay-row"><span>Số tiền</span><b class="pay-copy" onclick="copyText('${o.amount}')">${o.amount.toLocaleString('vi-VN')}₫ 📋</b></div>
        <div class="pay-row"><span>Nội dung CK</span><b class="pay-copy pay-memo" onclick="copyText('${o.memo_code}')">${o.memo_code} 📋</b></div>
      </div>
      <div class="pay-warn">⚠ Vui lòng chuyển đúng số tiền và nội dung</div>
      <div class="pay-status" id="pay-status"><span class="spin"></span> Đang chờ thanh toán... (tự động xác nhận)</div>
    </div></div>`;
    // Start polling DB status every 2s
    startPayPoll(o.memo_code);
  }catch(e){
    modal.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closePayModal()"><div class="glass-card modal pay-modal"><div style="color:var(--err);text-align:center;padding:20px">Lỗi: ${e.message}</div><button class="btn-s" onclick="closePayModal()" style="margin:0 auto;display:block">Đóng</button></div></div>`;
  }
}
function startPayPoll(memo){
  if(_payPollTimer)clearInterval(_payPollTimer);
  _payPollTimer=setInterval(()=>checkPay(memo),2000);
}
async function checkPay(memo){
  try{
    const d=await API.pay.check(memo);
    if(d.status==='completed'){
      clearInterval(_payPollTimer);_payPollTimer=null;
      const modal=document.getElementById('pay-modal');
      if(modal)modal.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closePayModal()"><div class="glass-card modal pay-modal pay-success-modal">
        <div class="pay-success-icon"><svg width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="none" stroke="var(--ok)" stroke-width="3" class="pay-success-circle"/><path d="M24 42l10 10 22-24" fill="none" stroke="var(--ok)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="pay-success-check"/></svg></div>
        <div class="pay-success-title">Thanh toán thành công!</div>
        <div class="pay-success-sub">Gói của bạn đã được kích hoạt</div>
        ${d.plan_expires?`<div class="pay-success-exp">Hết hạn: <b>${d.plan_expires}</b></div>`:''}
        <button class="pr-btn hot" style="width:100%;margin-top:20px" onclick="closePayModal();go('pricing')">Tuyệt vời ✨</button>
      </div></div>`;
      toast('Thanh toán thành công!','ok');
      try{const me=await API.me();CU=me.user;API.saveU(CU);enter()}catch{}
    }
  }catch{}
}
function closePayModal(){
  if(_payPollTimer){clearInterval(_payPollTimer);_payPollTimer=null}
  const m=document.getElementById('pay-modal');if(m)m.innerHTML='';
}
function copyText(t){navigator.clipboard.writeText(t).then(()=>toast('Đã copy','ok')).catch(()=>{})}

/* ========== ADMIN PAGES ========== */
function renderAdmDash(){return `<div class="page-title">Admin Dashboard</div><div class="page-sub">Tổng quan hệ thống</div><div class="stats-grid" id="sgrid"><div class="spin-lg"></div></div><div class="page-sub" style="margin-top:16px">Phân bố Plan</div><div id="pdist" style="display:flex;gap:12px;flex-wrap:wrap"></div>`}
function renderAdmUsers(){return `<div class="page-title">Quản lý Users</div><div class="page-sub">Tất cả người dùng</div><div class="adm-toolbar"><input id="aus" placeholder="Tìm email/tên..." oninput="debouncedAU()"><select id="aup" onchange="loadAdmUsers()"><option value="">Tất cả Plan</option><option value="free">Free</option><option value="week3">Tuần Starter</option><option value="week5">Tuần Pro</option><option value="week10">Tuần Business</option><option value="month3">Tháng Starter</option><option value="month5">Tháng Pro</option><option value="month10">Tháng Business</option><option value="3month3">3T Starter</option><option value="3month5">3T Pro</option><option value="3month10">3T Business</option><option value="unlimited">Unlimited</option></select><select id="aur" onchange="loadAdmUsers()"><option value="">Tất cả Role</option><option value="user">User</option><option value="admin">Admin</option></select><span style="flex:1"></span><button class="btn-s" onclick="createUserModal()">+ Tạo User</button><button class="btn-s" onclick="bulkCreateModal()">👥 Tạo hàng loạt</button></div><div class="glass-card tbl-wrap"><table class="adm-tbl"><thead><tr><th>ID</th><th>Email</th><th>Tên</th><th>Plan</th><th>Role</th><th>Credits</th><th>Lượt/ngày</th><th>Video/ngày</th><th>Hết hạn</th><th>Actions</th></tr></thead><tbody id="aubody"><tr><td colspan="10"><div class="spin-lg"></div></td></tr></tbody></table></div><div id="umodal"></div>`}
function renderAdmTokens(){return `<div class="page-title">Tất cả SSO Tokens</div><div class="page-sub">Quản lý tài khoản Grok</div><div class="adm-toolbar"><select id="aas" onchange="loadAdmTokens()"><option value="">Tất cả</option><option value="active">Active</option><option value="limited">Limited</option><option value="invalid">Invalid</option></select></div><div class="glass-card tbl-wrap"><table class="adm-tbl"><thead><tr><th>ID</th><th>User</th><th>Nhãn</th><th>Token</th><th>Status</th><th>Lần cuối</th><th>Actions</th></tr></thead><tbody id="aabody"><tr><td colspan="7"><div class="spin-lg"></div></td></tr></tbody></table></div><div id="amodal"></div>`}
function renderAdmHist(){return `<div class="page-title">Tất cả History</div><div class="page-sub">Lịch sử tạo của mọi user</div><div class="adm-toolbar"><select id="aht" onchange="loadAdmHist()"><option value="">Tất cả</option><option value="text2video">T→V</option><option value="image2video">I→V</option><option value="text2image">T→I</option><option value="image2image">I→I</option><option value="extend_video">Ext</option></select><select id="ahs" onchange="loadAdmHist()"><option value="">Tất cả</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="processing">Processing</option></select></div><div class="glass-card tbl-wrap"><table class="adm-tbl"><thead><tr><th>ID</th><th>User</th><th>Type</th><th>Prompt</th><th>Status</th><th>Ngày</th><th>Output</th></tr></thead><tbody id="ahbody"><tr><td colspan="7"><div class="spin-lg"></div></td></tr></tbody></table></div>`}
function renderAdmPlans(){return `<div class="page-title">Quản lý Plans</div><div class="page-sub">Cấu hình gói dịch vụ (giá, số acc, thời hạn)</div><div style="margin-bottom:12px"><button class="btn-s" onclick="addSvcPlanModal()">+ Thêm gói mới</button></div><div class="glass-card tbl-wrap"><table class="adm-tbl"><thead><tr><th>ID</th><th>Tên</th><th>Tier</th><th>Thời hạn</th><th>Giá (₫)</th><th>Ngày</th><th>Acc</th><th>Phổ biến</th><th>Active</th><th>Actions</th></tr></thead><tbody id="apbody"><tr><td colspan="10"><div class="spin-lg"></div></td></tr></tbody></table></div><div id="pmodal"></div>`}

/* ========== ADMIN LOADERS ========== */
async function loadAdmStats(){
  try{const{stats}=await API.adm.stats();
    document.getElementById('sgrid').innerHTML=`<div class="glass-card stat-card"><div class="sv">${stats.totalUsers}</div><div class="sl">Users</div></div><div class="glass-card stat-card"><div class="sv">${stats.totalAccounts}</div><div class="sl">SSO Tokens</div><div class="ss">${stats.activeAccounts} active</div></div><div class="glass-card stat-card"><div class="sv">${stats.totalGenerations}</div><div class="sl">Generations</div><div class="ss">${stats.todayGenerations} hôm nay</div></div><div class="glass-card stat-card"><div class="sv">${stats.completedGenerations}</div><div class="sl">Completed</div></div><div class="glass-card stat-card"><div class="sv">${stats.failedGenerations}</div><div class="sl">Failed</div></div>`;
    const pd=document.getElementById('pdist');if(pd&&stats.planDistribution)pd.innerHTML=stats.planDistribution.map(p=>`<div class="glass-card" style="padding:16px 24px;text-align:center"><div style="font-size:24px;font-weight:700">${p.cnt}</div><div style="font-size:12px;color:var(--text2);text-transform:uppercase">${p.plan}</div></div>`).join('');
  }catch(e){toast(e.message,'err')}
}
let _auTimer;function debouncedAU(){clearTimeout(_auTimer);_auTimer=setTimeout(loadAdmUsers,300)}
async function loadAdmUsers(){
  const s=document.getElementById('aus')?.value||'',p=document.getElementById('aup')?.value||'',r=document.getElementById('aur')?.value||'';
  const q=new URLSearchParams();if(s)q.set('search',s);if(p)q.set('plan',p);if(r)q.set('role',r);
  const body=document.getElementById('aubody');if(!body)return;
  try{const{users}=await API.adm.users(q.toString());
    _auAll=users||[];_auPage=0;_renderAdmUsersPage();
  }catch(e){body.innerHTML=`<tr><td colspan="10" class="err">${e.message}</td></tr>`}
}
function _renderAdmUsersPage(){
  const body=document.getElementById('aubody');if(!body)return;
  if(!_auAll.length){body.innerHTML='<tr><td colspan="10" class="muted">Không có user</td></tr>';return}
  const start=_auPage*_BP;const visible=_auAll.slice(start,start+_BP);
  body.innerHTML=visible.map(u=>{
    const dl=u.daily_limit==null||u.daily_limit===-1?'—':(u.daily_limit===0?'🚫':u.daily_limit);
    const vl=u.video_limit==null||u.video_limit===-1?'—':(u.video_limit===0?'🚫':u.video_limit);
    const exp=u.plan_expires?u.plan_expires.slice(0,10):'∞';
    const expCls=u.plan_expires&&u.plan_expires.slice(0,10)<new Date().toISOString().slice(0,10)?'color:var(--err)':'';
    return `<tr><td>${u.id}</td><td>${u.email}</td><td>${u.name||'-'}</td><td><span class="badge">${planName(u.plan)}</span></td><td><span class="badge${u.role==='admin'?' admin':''}">${u.role||'user'}</span></td><td>${u.credits===-1?'∞':u.credits}</td><td class="sm">${dl}</td><td class="sm">${vl}</td><td class="sm" style="${expCls}">${exp}</td><td class="acts"><button class="btn-s" onclick='editUserModal(${JSON.stringify(u).replace(/'/g,"&#39;")})'> Sửa</button>${u.id!==CU?.id?`<button class="btn-s danger" onclick="adminDelUser(${u.id})">Xóa</button>`:''}</td></tr>`}).join('');
  const pg=body.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('au-pg')){pgDiv=document.createElement('div');pgDiv.className='au-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_auPage,_auAll.length,'_auGoPage')}
}
function editUserModal(u){
  const id=u.id,email=u.email,name=u.name||'',plan=u.plan,role=u.role||'user',credits=u.credits,dl=u.daily_limit??-1,vl=u.video_limit??-1,exp=u.plan_expires||'';
  const planOpts=Object.entries(PLAN_NAMES).map(([k,v])=>`<option value="${k}"${plan===k?' selected':''}>${v}</option>`).join('');
  document.getElementById('umodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('umodal')"><div class="glass-card modal"><div class="modal-title">Sửa User</div><div style="font-size:13px;color:var(--text2);margin-bottom:16px">${email}</div><div class="fg"><label>Tên</label><input id="eu-name" value="${name}"></div><div class="fg-row"><div class="fg"><label>Plan</label><select id="eu-plan">${planOpts}</select></div><div class="fg"><label>Role</label><select id="eu-role"><option value="user"${role==='user'?' selected':''}>User</option><option value="admin"${role==='admin'?' selected':''}>Admin</option></select></div></div><div class="fg"><label>Credits (-1=∞)</label><input type="number" id="eu-credits" value="${credits}"></div><div class="fg-row"><div class="fg"><label>Lượt/ngày (-1=theo plan)</label><input type="number" id="eu-daily" value="${dl}"></div><div class="fg"><label>Video/ngày (-1=theo plan)</label><input type="number" id="eu-video" value="${vl}"></div></div><div class="fg"><label>Hết hạn gói (để trống = vĩnh viễn)</label><input type="date" id="eu-expires" value="${exp?exp.slice(0,10):''}"></div><div class="fg"><label>Mật khẩu mới</label><input type="password" id="eu-pw" placeholder="Để trống nếu không đổi"></div><div class="modal-acts"><button class="btn-s" onclick="closeModal('umodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="saveUser(${id})">Lưu</button></div></div></div>`;
}
async function saveUser(id){const d={name:document.getElementById('eu-name').value,plan:document.getElementById('eu-plan').value,role:document.getElementById('eu-role').value,credits:+document.getElementById('eu-credits').value,daily_limit:+document.getElementById('eu-daily').value,video_limit:+document.getElementById('eu-video').value,plan_expires:document.getElementById('eu-expires').value||null};const pw=document.getElementById('eu-pw').value;if(pw)d.password=pw;try{await API.adm.updUser(id,d);toast('Đã cập nhật','ok');closeModal('umodal');loadAdmUsers()}catch(e){toast(e.message,'err')}}
async function adminDelUser(id){if(!confirm('Xóa user này và tất cả dữ liệu?'))return;try{await API.adm.delUser(id);toast('Đã xóa','ok');loadAdmUsers()}catch(e){toast(e.message,'err')}}

/* ========== CREATE USER MODAL ========== */
function createUserModal(){
  const planOpts=Object.entries(PLAN_NAMES).map(([k,v])=>`<option value="${k}"${k==='free'?' selected':''}>${v}</option>`).join('');
  document.getElementById('umodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('umodal')"><div class="glass-card modal"><div class="modal-title">Tạo User Mới</div><div class="fg"><label>Email</label><input id="cu-email" placeholder="user@example.com"></div><div class="fg"><label>Mật khẩu</label><input type="password" id="cu-pw" placeholder="Mật khẩu"></div><div class="fg"><label>Tên</label><input id="cu-name" placeholder="Tên (tùy chọn)"></div><div class="fg-row"><div class="fg"><label>Plan</label><select id="cu-plan">${planOpts}</select></div><div class="fg"><label>Role</label><select id="cu-role"><option value="user">User</option><option value="admin">Admin</option></select></div></div><div class="fg"><label>Credits (-1=∞)</label><input type="number" id="cu-credits" value="10"></div><div class="fg-row"><div class="fg"><label>Lượt/ngày (-1=theo plan)</label><input type="number" id="cu-daily" value="-1"></div><div class="fg"><label>Video/ngày (-1=theo plan)</label><input type="number" id="cu-video" value="-1"></div></div><div class="fg"><label>Hết hạn gói (để trống = vĩnh viễn)</label><input type="date" id="cu-expires"></div><div class="modal-acts"><button class="btn-s" onclick="closeModal('umodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="doCreateUser()">Tạo</button></div></div></div>`;
}
async function doCreateUser(){
  const email=document.getElementById('cu-email')?.value?.trim();
  const pw=document.getElementById('cu-pw')?.value;
  if(!email||!pw){toast('Email và mật khẩu bắt buộc','err');return}
  try{
    await API.adm.createUser({email,password:pw,name:document.getElementById('cu-name')?.value||'',plan:document.getElementById('cu-plan')?.value||'free',role:document.getElementById('cu-role')?.value||'user',credits:+document.getElementById('cu-credits')?.value||10,daily_limit:+(document.getElementById('cu-daily')?.value??-1),video_limit:+(document.getElementById('cu-video')?.value??-1),plan_expires:document.getElementById('cu-expires')?.value||null});
    toast('Đã tạo user','ok');closeModal('umodal');loadAdmUsers();
  }catch(e){toast(e.message,'err')}
}

/* ========== BULK CREATE MODAL ========== */
function bulkCreateModal(){
  const planOpts=Object.entries(PLAN_NAMES).map(([k,v])=>`<option value="${k}"${k==='free'?' selected':''}>${v}</option>`).join('');
  document.getElementById('umodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('umodal')"><div class="glass-card modal"><div class="modal-title">Tạo User Hàng Loạt</div><div style="font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5">Tạo nhiều user cùng lúc. Email sẽ có dạng: <b>prefix001@grok.studio</b>, <b>prefix002@grok.studio</b>...</div><div class="fg-row"><div class="fg"><label>Prefix</label><input id="bc-prefix" value="user" placeholder="user"></div><div class="fg"><label>Số lượng (1-100)</label><input type="number" id="bc-count" value="10" min="1" max="100"></div></div><div class="fg"><label>Mật khẩu chung</label><input type="password" id="bc-pw" placeholder="Mật khẩu cho tất cả"></div><div class="fg-row"><div class="fg"><label>Plan</label><select id="bc-plan">${planOpts}</select></div><div class="fg"><label>Credits (-1=∞)</label><input type="number" id="bc-credits" value="10"></div></div><div class="fg-row"><div class="fg"><label>Lượt/ngày (-1=theo plan)</label><input type="number" id="bc-daily" value="-1"></div><div class="fg"><label>Video/ngày (-1=theo plan)</label><input type="number" id="bc-video" value="-1"></div></div><div class="fg"><label>Hết hạn gói (để trống = vĩnh viễn)</label><input type="date" id="bc-expires"></div><div class="modal-acts"><button class="btn-s" onclick="closeModal('umodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="doBulkCreate()">Tạo hàng loạt</button></div></div></div>`;
}
async function doBulkCreate(){
  const pw=document.getElementById('bc-pw')?.value;
  if(!pw){toast('Mật khẩu bắt buộc','err');return}
  const count=+document.getElementById('bc-count')?.value||10;
  if(count<1||count>100){toast('Số lượng 1-100','err');return}
  try{
    const d=await API.adm.bulkCreate({count,prefix:document.getElementById('bc-prefix')?.value||'user',password:pw,plan:document.getElementById('bc-plan')?.value||'free',credits:+document.getElementById('bc-credits')?.value||10,daily_limit:+(document.getElementById('bc-daily')?.value??-1),video_limit:+(document.getElementById('bc-video')?.value??-1),plan_expires:document.getElementById('bc-expires')?.value||null});
    toast(`Đã tạo ${d.total} user${d.failed?.length?`, ${d.failed.length} lỗi`:''}`,'ok');
    closeModal('umodal');loadAdmUsers();
  }catch(e){toast(e.message,'err')}
}

/* ========== ADMIN TOKENS ========== */
async function loadAdmTokens(){
  const st=document.getElementById('aas')?.value||'';const q=st?`status=${st}`:'';const body=document.getElementById('aabody');if(!body)return;
  try{const{accounts}=await API.adm.accounts(q);
    _aaAll=accounts||[];_aaPage=0;_renderAdmTokensPage();
  }catch(e){body.innerHTML=`<tr><td colspan="7" class="err">${e.message}</td></tr>`}
}
function _renderAdmTokensPage(){
  const body=document.getElementById('aabody');if(!body)return;
  if(!_aaAll.length){body.innerHTML='<tr><td colspan="7" class="muted">Không có</td></tr>';return}
  const start=_aaPage*_BP;const visible=_aaAll.slice(start,start+_BP);
  body.innerHTML=visible.map(a=>`<tr><td>${a.id}</td><td class="sm">${a.user_email}</td><td>${a.label||'-'}</td><td class="mono sm">${a.token_preview}</td><td><span class="acc-status ${a.status}">${a.status}</span></td><td class="sm">${a.last_used?new Date(a.last_used).toLocaleString():'Never'}</td><td class="acts"><button class="btn-s" onclick="editAccModal(${a.id},'${(a.label||'').replace(/'/g,"\\'")}','${a.status}')">Sửa</button><button class="btn-s danger" onclick="adminDelAcc(${a.id})">Xóa</button></td></tr>`).join('');
  const pg=body.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('aa-pg')){pgDiv=document.createElement('div');pgDiv.className='aa-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_aaPage,_aaAll.length,'_aaGoPage')}
}
function editAccModal(id,label,status){document.getElementById('amodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('amodal')"><div class="glass-card modal"><div class="modal-title">Sửa Account</div><div class="fg"><label>Nhãn</label><input id="ea-label" value="${label}"></div><div class="fg"><label>Status</label><select id="ea-status"><option value="active"${status==='active'?' selected':''}>Active</option><option value="limited"${status==='limited'?' selected':''}>Limited</option><option value="invalid"${status==='invalid'?' selected':''}>Invalid</option></select></div><div class="modal-acts"><button class="btn-s" onclick="closeModal('amodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="saveAcc(${id})">Lưu</button></div></div></div>`}
async function saveAcc(id){try{await API.adm.updAcc(id,{label:document.getElementById('ea-label').value,status:document.getElementById('ea-status').value});toast('Đã cập nhật','ok');closeModal('amodal');loadAdmTokens()}catch(e){toast(e.message,'err')}}
async function adminDelAcc(id){if(!confirm('Xóa SSO token này?'))return;try{await API.adm.delAcc(id);toast('Đã xóa','ok');loadAdmTokens()}catch(e){toast(e.message,'err')}}

/* ========== ADMIN HISTORY ========== */
async function loadAdmHist(){
  const t=document.getElementById('aht')?.value||'',s=document.getElementById('ahs')?.value||'';
  const q=new URLSearchParams();if(t)q.set('type',t);if(s)q.set('status',s);q.set('limit','500');
  const body=document.getElementById('ahbody');if(!body)return;
  try{const{history}=await API.adm.history(q.toString());
    _ahAll=history||[];_ahPage=0;_renderAdmHistPage();
  }catch(e){body.innerHTML=`<tr><td colspan="7" class="err">${e.message}</td></tr>`}
}
function _renderAdmHistPage(){
  const body=document.getElementById('ahbody');if(!body)return;
  if(!_ahAll.length){body.innerHTML='<tr><td colspan="7" class="muted">Không có</td></tr>';return}
  const start=_ahPage*_BP;const visible=_ahAll.slice(start,start+_BP);
  body.innerHTML=visible.map(h=>{const tl={text2video:'T→V',image2video:'I→V',text2image:'T→I',image2image:'I→I',extend_video:'Ext'}[h.type]||h.type;const ps=(h.prompt||'').substring(0,60)+((h.prompt||'').length>60?'...':'');const has=h.output_url&&h.output_url.startsWith('http');
    return `<tr><td>${h.id}</td><td class="sm">${h.user_email}</td><td><span class="badge">${tl}</span></td><td class="sm prompt-cell" title="${(h.prompt||'').replace(/"/g,'&quot;')}">${ps}</td><td><span class="sdot ${h.status}"></span>${h.status}</td><td class="sm">${new Date(h.created_at).toLocaleString()}</td><td>${has?`<a href="${h.output_url}" target="_blank" class="sm">Xem</a>`:'-'}</td></tr>`}).join('');
  const pg=body.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('ah-pg')){pgDiv=document.createElement('div');pgDiv.className='ah-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_ahPage,_ahAll.length,'_ahGoPage')}
}

/* ========== ADMIN PLANS ========== */
async function loadAdmPlans(){
  const c=document.getElementById('apbody');if(!c)return;
  try{const{plans}=await API.adm.svcPlans();
    c.innerHTML=plans.map(p=>`<tr>
      <td><code>${p.id}</code></td><td>${p.name}</td><td>${p.tier}</td><td>${p.duration}</td>
      <td style="font-weight:600">${(p.price||0).toLocaleString('vi-VN')}₫</td><td>${p.days}</td><td>${p.accs}</td>
      <td>${p.popular?'🔥':''}</td><td>${p.active?'✅':'❌'}</td>
      <td><button class="btn-s" onclick='editSvcPlanModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>Sửa</button> <button class="btn-s" style="color:var(--err)" onclick="delSvcPlan('${p.id}')">Xóa</button></td>
    </tr>`).join('')||'<tr><td colspan="10">Chưa có gói nào</td></tr>';
  }catch(e){c.innerHTML=`<tr><td colspan="10" class="err">${e.message}</td></tr>`}
}
function editSvcPlanModal(p){
  document.getElementById('pmodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('pmodal')"><div class="glass-card modal"><div class="modal-title">Sửa gói: ${p.name}</div>
    <div class="fg"><label>Tên</label><input id="sp-name" value="${p.name}"></div>
    <div class="fg-row"><div class="fg"><label>Tier</label><select id="sp-tier"><option ${p.tier==='Starter'?'selected':''}>Starter</option><option ${p.tier==='Pro'?'selected':''}>Pro</option><option ${p.tier==='Business'?'selected':''}>Business</option></select></div><div class="fg"><label>Duration</label><select id="sp-dur"><option value="month" ${p.duration==='month'?'selected':''}>month</option><option value="3month" ${p.duration==='3month'?'selected':''}>3month</option></select></div></div>
    <div class="fg-row"><div class="fg"><label>Giá (₫)</label><input type="number" id="sp-price" value="${p.price}"></div><div class="fg"><label>Số ngày</label><input type="number" id="sp-days" value="${p.days}"></div><div class="fg"><label>Số acc</label><input type="number" id="sp-accs" value="${p.accs}"></div></div>
    <div class="fg-row"><div class="fg"><label>Save text</label><input id="sp-save" value="${p.save_text||''}"></div><div class="fg"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="sp-pop" ${p.popular?'checked':''}> Phổ biến</label></div><div class="fg"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="sp-active" ${p.active?'checked':''}> Active</label></div></div>
    <div class="modal-acts"><button class="btn-s" onclick="closeModal('pmodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="saveSvcPlan('${p.id}')">Lưu</button></div></div></div>`;
}
async function saveSvcPlan(id){try{await API.adm.updSvcPlan(id,{name:document.getElementById('sp-name').value,tier:document.getElementById('sp-tier').value,duration:document.getElementById('sp-dur').value,price:+document.getElementById('sp-price').value,days:+document.getElementById('sp-days').value,accs:+document.getElementById('sp-accs').value,save_text:document.getElementById('sp-save').value,popular:document.getElementById('sp-pop').checked,active:document.getElementById('sp-active').checked});toast('Đã cập nhật gói','ok');closeModal('pmodal');loadAdmPlans()}catch(e){toast(e.message,'err')}}
function addSvcPlanModal(){
  document.getElementById('pmodal').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('pmodal')"><div class="glass-card modal"><div class="modal-title">Thêm gói mới</div>
    <div class="fg"><label>ID (vd: month1, 3month5)</label><input id="sp-id" placeholder="plan_id"></div>
    <div class="fg"><label>Tên</label><input id="sp-name" placeholder="Tháng - Starter"></div>
    <div class="fg-row"><div class="fg"><label>Tier</label><select id="sp-tier"><option>Starter</option><option>Pro</option><option>Business</option></select></div><div class="fg"><label>Duration</label><select id="sp-dur"><option value="month">month</option><option value="3month">3month</option></select></div></div>
    <div class="fg-row"><div class="fg"><label>Giá (₫)</label><input type="number" id="sp-price" value="0"></div><div class="fg"><label>Số ngày</label><input type="number" id="sp-days" value="30"></div><div class="fg"><label>Số acc</label><input type="number" id="sp-accs" value="1"></div></div>
    <div class="fg-row"><div class="fg"><label>Save text</label><input id="sp-save" placeholder="Tiết kiệm 10%"></div><div class="fg"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="sp-pop"> Phổ biến</label></div></div>
    <div class="modal-acts"><button class="btn-s" onclick="closeModal('pmodal')">Hủy</button><button class="btn-primary" style="padding:10px 20px" onclick="createSvcPlan()">Tạo</button></div></div></div>`;
}
async function createSvcPlan(){try{await API.adm.addSvcPlan({id:document.getElementById('sp-id').value,name:document.getElementById('sp-name').value,tier:document.getElementById('sp-tier').value,duration:document.getElementById('sp-dur').value,price:+document.getElementById('sp-price').value,days:+document.getElementById('sp-days').value,accs:+document.getElementById('sp-accs').value,save_text:document.getElementById('sp-save').value,popular:document.getElementById('sp-pop').checked});toast('Đã tạo gói mới','ok');closeModal('pmodal');loadAdmPlans()}catch(e){toast(e.message,'err')}}
async function delSvcPlan(id){if(!confirm('Xóa gói '+id+'?'))return;try{await API.adm.delSvcPlan(id);toast('Đã xóa','ok');loadAdmPlans()}catch(e){toast(e.message,'err')}}

/* ========== PLAN NAME HELPER ========== */
let _svcPlanCache=null;
async function _loadSvcPlanCache(){if(!_svcPlanCache){try{const d=await API.getPlans();_svcPlanCache=d.service_plans||[]}catch{_svcPlanCache=[]}}return _svcPlanCache}
const PLAN_NAMES={'month1':'Tháng Starter','month5':'Tháng Pro','month10':'Tháng Business','3month1':'3T Starter','3month5':'3T Pro','3month10':'3T Business','free':'Free','unlimited':'Unlimited','week3':'Tuần Starter','week5':'Tuần Pro','week10':'Tuần Business','month3':'Tháng Starter'};
function planName(id){return PLAN_NAMES[id]||id||'—'}
function fmtVND(n){return(n||0).toLocaleString('vi-VN')+'₫'}

/* ========== ADMIN PAYMENTS PAGE ========== */
function renderAdmPay(){return `<div class="page-title">Quản lý Giao dịch</div><div class="page-sub">Tất cả đơn thanh toán</div>
<div class="stats-grid" id="pay-stats"><div class="spin-lg"></div></div>
<div class="adm-toolbar" style="margin-top:16px">
  <select id="ap-status" onchange="loadAdmPay()"><option value="">Tất cả status</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
  <input type="date" id="ap-from" onchange="loadAdmPay()" title="Từ ngày">
  <input type="date" id="ap-to" onchange="loadAdmPay()" title="Đến ngày">
  <button class="btn-s" onclick="document.getElementById('ap-status').value='';document.getElementById('ap-from').value='';document.getElementById('ap-to').value='';loadAdmPay()">✕ Xóa lọc</button>
</div>
<div class="glass-card tbl-wrap" style="margin-top:12px"><table class="adm-tbl"><thead><tr><th>ID</th><th>User</th><th>Gói</th><th>Số tiền</th><th>Mã CK</th><th>Status</th><th>Ngày tạo</th><th>Hoàn thành</th><th>Actions</th></tr></thead><tbody id="apbody"><tr><td colspan="9"><div class="spin-lg"></div></td></tr></tbody></table></div>
<div id="paymodal"></div>`}

async function loadAdmPay(){
  const status=document.getElementById('ap-status')?.value||'';
  const from=document.getElementById('ap-from')?.value||'';
  const to=document.getElementById('ap-to')?.value||'';
  const q=new URLSearchParams();
  if(status)q.set('status',status);if(from)q.set('from',from);if(to)q.set('to',to);
  const body=document.getElementById('apbody');
  const sg=document.getElementById('pay-stats');
  try{
    const d=await API.adm.payments(q.toString());
    const s=d.stats||{};
    if(sg)sg.innerHTML=`<div class="glass-card stat-card"><div class="sv">${fmtVND(s.totalRevenue)}</div><div class="sl">Tổng doanh thu</div></div><div class="glass-card stat-card"><div class="sv">${fmtVND(s.todayRevenue)}</div><div class="sl">Hôm nay</div></div><div class="glass-card stat-card"><div class="sv">${s.completed||0}</div><div class="sl">Hoàn thành</div></div><div class="glass-card stat-card"><div class="sv" style="color:var(--warn)">${s.pending||0}</div><div class="sl">Đang chờ</div></div><div class="glass-card stat-card"><div class="sv">${s.total||0}</div><div class="sl">Tổng đơn</div></div>`;
    const orders=d.orders||[];
    if(!orders.length){if(body)body.innerHTML='<tr><td colspan="9" class="muted">Không có giao dịch</td></tr>';return}
    _apAll=orders;_apPage=0;_renderAdmPayPage();
  }catch(e){
    if(sg)sg.innerHTML=`<p class="err">${e.message}</p>`;
    if(body)body.innerHTML=`<tr><td colspan="9" class="err">${e.message}</td></tr>`;
  }
}
function _renderAdmPayPage(){
  const body=document.getElementById('apbody');if(!body)return;
  if(!_apAll.length){body.innerHTML='<tr><td colspan="9" class="muted">Không có giao dịch</td></tr>';return}
  const start=_apPage*_BP;const visible=_apAll.slice(start,start+_BP);
  body.innerHTML=visible.map(o=>{
      const stCls=o.status==='completed'?'color:var(--ok)':o.status==='pending'?'color:var(--warn)':'color:var(--err)';
      const dt=o.created_at?new Date(o.created_at).toLocaleString():'—';
      const ct=o.completed_at?new Date(o.completed_at).toLocaleString():'—';
      return `<tr>
        <td>${o.id}</td>
        <td class="sm">${o.user_email||''}<br><span style="font-size:10px;color:var(--text3)">${o.user_name||''}</span></td>
        <td><span class="badge">${planName(o.plan_id)}</span></td>
        <td style="font-weight:600">${fmtVND(o.amount)}</td>
        <td class="mono sm">${o.memo_code||''}</td>
        <td style="${stCls};font-weight:600">${o.status}</td>
        <td class="sm">${dt}</td>
        <td class="sm">${ct}</td>
        <td class="acts">${o.status==='pending'?`<button class="btn-s" onclick="approvePay(${o.id})" style="color:var(--ok)">✓ Duyệt</button>`:''}${CU?.role==='superadmin'?`<button class="btn-s danger" onclick="deletePay(${o.id})">Xóa</button>`:''}</td>
      </tr>`}).join('');
  const pg=body.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('ap-pg')){pgDiv=document.createElement('div');pgDiv.className='ap-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_apPage,_apAll.length,'_apGoPage')}
}
async function approvePay(id){
  if(!confirm('Duyệt đơn hàng này? User sẽ được nâng cấp gói.'))return;
  try{await API.adm.updPay(id,{status:'completed'});toast('Đã duyệt','ok');loadAdmPay()}catch(e){toast(e.message,'err')}
}
async function deletePay(id){
  if(!confirm('Xóa đơn hàng này?'))return;
  try{await API.adm.delPay(id);toast('Đã xóa','ok');loadAdmPay()}catch(e){toast(e.message,'err')}
}

/* ========== CTV (AFFILIATE) MANAGEMENT — SUPERADMIN ========== */
function renderAdmCTV(){return `<div class="page-title">Quản lý CTV</div><div class="page-sub">Cộng tác viên & hoa hồng</div>
<div class="stats-grid" id="ctv-stats"><div class="spin-lg"></div></div>
<div class="adm-toolbar" style="margin-top:16px">
  <button class="btn-s" onclick="addCTVModal()">+ Thêm CTV</button>
  <button class="btn-s" onclick="go('admin-comms')">📊 Lịch sử hoa hồng</button>
</div>
<div class="glass-card tbl-wrap" style="margin-top:12px"><table class="adm-tbl"><thead><tr><th>ID</th><th>Email</th><th>Tên</th><th>Mã ref</th><th>Hoa hồng %</th><th>Referrals</th><th>Tổng HH</th><th>Chờ TT</th><th>Đã TT</th><th>Actions</th></tr></thead><tbody id="ctv-body"><tr><td colspan="10"><div class="spin-lg"></div></td></tr></tbody></table></div>
<div id="ctv-modal"></div>`}

async function loadAdmCTV(){
  try{
    const d=await API.aff.list();
    const s=d.stats;
    const sg=document.getElementById('ctv-stats');
    if(sg)sg.innerHTML=`<div class="stat-card"><div class="stat-val">${s.totalAffiliates}</div><div class="stat-lbl">Tổng CTV</div></div><div class="stat-card"><div class="stat-val">${s.totalReferrals}</div><div class="stat-lbl">Tổng Referrals</div></div><div class="stat-card"><div class="stat-val">${(s.totalCommission||0).toLocaleString('vi-VN')}₫</div><div class="stat-lbl">Tổng hoa hồng</div></div><div class="stat-card"><div class="stat-val">${(s.pendingCommission||0).toLocaleString('vi-VN')}₫</div><div class="stat-lbl">Chờ thanh toán</div></div>`;
    const tb=document.getElementById('ctv-body');if(!tb)return;
    if(!d.affiliates.length){tb.innerHTML='<tr><td colspan="10" class="muted">Chưa có CTV</td></tr>';return}
    _acAll=d.affiliates;_acPage=0;_renderAdmCTVPage();
  }catch(e){toast(e.message,'err')}
}
function _renderAdmCTVPage(){
  const tb=document.getElementById('ctv-body');if(!tb)return;
  if(!_acAll.length){tb.innerHTML='<tr><td colspan="10" class="muted">Chưa có CTV</td></tr>';return}
  const start=_acPage*_BP;const visible=_acAll.slice(start,start+_BP);
  tb.innerHTML=visible.map(a=>{
      const link=`https://grok.liveyt.pro/?ref=${a.ref_code}`;
      return `<tr>
        <td>${a.id}</td><td class="sm">${a.email}</td><td>${a.name||'-'}</td>
        <td><span class="pay-copy" onclick="copyText('${link}')" title="${link}" style="cursor:pointer;color:var(--accent)">${a.ref_code} 📋</span></td>
        <td>${a.commission_rate}%</td><td>${a.referral_count}</td>
        <td>${(a.total_commission||0).toLocaleString('vi-VN')}₫</td>
        <td style="color:var(--warn)">${(a.pending_commission||0).toLocaleString('vi-VN')}₫</td>
        <td style="color:var(--ok)">${(a.paid_commission||0).toLocaleString('vi-VN')}₫</td>
        <td class="acts">
          ${a.pending_commission>0?`<button class="btn-s" onclick="payAllCTV(${a.id})" style="color:var(--ok)">💰 TT tất cả</button>`:''}
          <button class="btn-s" onclick="editCTVModal(${a.id},'${a.ref_code}',${a.commission_rate})">✏️</button>
          <button class="btn-s danger" onclick="removeCTV(${a.id})">Xóa</button>
        </td>
      </tr>`}).join('');
  const pg=tb.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('ac-pg')){pgDiv=document.createElement('div');pgDiv.className='ac-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_acPage,_acAll.length,'_acGoPage')}
}

function addCTVModal(){
  const m=document.getElementById('ctv-modal');if(!m)return;
  m.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('ctv-modal')"><div class="glass-card modal" style="max-width:400px;padding:24px">
    <div style="font-size:16px;font-weight:600;margin-bottom:16px">Thêm CTV mới</div>
    <label class="lbl">User ID</label><input id="ctv-uid" type="number" placeholder="ID user">
    <label class="lbl">Mã giới thiệu (tùy chọn)</label><input id="ctv-code" placeholder="VD: CTV-JOHN">
    <label class="lbl">Hoa hồng %</label><input id="ctv-rate" type="number" value="20" min="1" max="50">
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn-primary" onclick="doAddCTV()">Thêm</button><button class="btn-s" onclick="closeModal('ctv-modal')">Hủy</button></div>
  </div></div>`;
}
async function doAddCTV(){
  const uid=parseInt(document.getElementById('ctv-uid')?.value);
  const code=document.getElementById('ctv-code')?.value||'';
  const rate=parseFloat(document.getElementById('ctv-rate')?.value)||20;
  if(!uid){toast('Nhập User ID','err');return}
  try{const d=await API.aff.add({user_id:uid,ref_code:code||undefined,commission_rate:rate});toast('Đã thêm CTV: '+d.ref_code,'ok');closeModal('ctv-modal');loadAdmCTV()}catch(e){toast(e.message,'err')}
}

function editCTVModal(id,code,rate){
  const m=document.getElementById('ctv-modal');if(!m)return;
  m.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal('ctv-modal')"><div class="glass-card modal" style="max-width:400px;padding:24px">
    <div style="font-size:16px;font-weight:600;margin-bottom:16px">Sửa CTV #${id}</div>
    <label class="lbl">Mã giới thiệu</label><input id="ectv-code" value="${code}">
    <label class="lbl">Hoa hồng %</label><input id="ectv-rate" type="number" value="${rate}" min="1" max="50">
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn-primary" onclick="doEditCTV(${id})">Lưu</button><button class="btn-s" onclick="closeModal('ctv-modal')">Hủy</button></div>
  </div></div>`;
}
async function doEditCTV(id){
  const code=document.getElementById('ectv-code')?.value;
  const rate=parseFloat(document.getElementById('ectv-rate')?.value);
  try{await API.aff.upd(id,{ref_code:code,commission_rate:rate});toast('Đã cập nhật','ok');closeModal('ctv-modal');loadAdmCTV()}catch(e){toast(e.message,'err')}
}

async function removeCTV(id){
  if(!confirm('Xóa CTV này? (User vẫn còn, chỉ bỏ quyền CTV)'))return;
  try{await API.aff.del(id);toast('Đã xóa CTV','ok');loadAdmCTV()}catch(e){toast(e.message,'err')}
}

async function payAllCTV(id){
  if(!confirm('Thanh toán tất cả hoa hồng chờ cho CTV này?'))return;
  try{const d=await API.aff.payAll(id);toast(`Đã thanh toán ${d.count} khoản`,'ok');loadAdmCTV()}catch(e){toast(e.message,'err')}
}

/* ========== COMMISSIONS HISTORY — SUPERADMIN ========== */
function renderAdmComms(){return `<div class="page-title">Lịch sử Hoa hồng</div><div class="page-sub">Tất cả hoa hồng CTV</div>
<div class="adm-toolbar">
  <select id="cm-status" onchange="loadAdmComms()"><option value="">Tất cả</option><option value="pending">Chờ TT</option><option value="paid">Đã TT</option></select>
  <button class="btn-s" onclick="go('admin-ctv')">← Quay lại CTV</button>
  <button class="btn-s" onclick="go('admin-redemptions')">🎁 Yêu cầu đổi thưởng</button>
</div>
<div class="glass-card tbl-wrap" style="margin-top:12px"><table class="adm-tbl"><thead><tr><th>ID</th><th>CTV</th><th>Người mua</th><th>Đơn hàng</th><th>Giá trị</th><th>Hoa hồng</th><th>%</th><th>Status</th><th>Ngày</th><th>Actions</th></tr></thead><tbody id="cm-body"><tr><td colspan="10"><div class="spin-lg"></div></td></tr></tbody></table></div>`}

async function loadAdmComms(){
  try{
    const status=document.getElementById('cm-status')?.value||'';
    const d=await API.aff.comms(status?'status='+status:'');
    const tb=document.getElementById('cm-body');if(!tb)return;
    _amAll=d.commissions||[];_amPage=0;_renderAdmCommsPage();
  }catch(e){toast(e.message,'err')}
}
function _renderAdmCommsPage(){
  const tb=document.getElementById('cm-body');if(!tb)return;
  if(!_amAll.length){tb.innerHTML='<tr><td colspan="10" class="muted">Chưa có hoa hồng</td></tr>';return}
  const start=_amPage*_BP;const visible=_amAll.slice(start,start+_BP);
  tb.innerHTML=visible.map(c=>{
      const dt=c.created_at?c.created_at.slice(0,16).replace('T',' '):'';
      const stBadge=c.status==='paid'?'<span style="color:var(--ok)">✓ Đã TT</span>':'<span style="color:var(--warn)">⏳ Chờ</span>';
      return `<tr>
        <td>${c.id}</td><td class="sm">${c.affiliate_email}</td><td class="sm">${c.buyer_email}</td>
        <td>#${c.order_id}</td><td>${c.amount.toLocaleString('vi-VN')}₫</td>
        <td style="font-weight:600;color:var(--ok)">${c.commission.toLocaleString('vi-VN')}₫</td>
        <td>${c.rate}%</td><td>${stBadge}</td><td class="sm">${dt}</td>
        <td class="acts">${c.status==='pending'?`<button class="btn-s" onclick="payComm(${c.id})" style="color:var(--ok)">💰 TT</button>`:''}</td>
      </tr>`}).join('');
  const pg=tb.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('am-pg')){pgDiv=document.createElement('div');pgDiv.className='am-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_amPage,_amAll.length,'_amGoPage')}
}

async function payComm(id){
  try{await API.aff.updComm(id,{status:'paid'});toast('Đã thanh toán','ok');loadAdmComms()}catch(e){toast(e.message,'err')}
}

/* ========== BANK TRANSACTIONS — SUPERADMIN ========== */
function renderAdmBank(){return `<div class="page-title">🏦 Ngân hàng ACB</div><div class="page-sub">Lịch sử giao dịch tài khoản ngân hàng (Web2M API)</div>
<div class="stats-grid" id="bank-stats"><div class="spin-lg"></div></div>
<div class="adm-toolbar" style="margin-top:16px">
  <select id="bk-type" onchange="filterBankTx()"><option value="">Tất cả</option><option value="IN">Tiền vào</option><option value="OUT">Tiền ra</option></select>
  <input id="bk-search" placeholder="Tìm nội dung..." oninput="filterBankTx()" style="max-width:250px">
  <button class="btn-s" onclick="loadAdmBank()">🔄 Làm mới</button>
</div>
<div class="glass-card tbl-wrap" style="margin-top:12px"><table class="adm-tbl"><thead><tr><th>ID</th><th>Thời gian</th><th>Loại</th><th>Số tiền</th><th>Người gửi / Nội dung</th><th>Kênh</th></tr></thead><tbody id="bk-body"><tr><td colspan="6"><div class="spin-lg"></div></td></tr></tbody></table></div>
<div id="bk-pg"></div>`}

let _bankTxAll=[];
let _bankPage=0;
const _bankPP=50;

async function loadAdmBank(){
  const tb=document.getElementById('bk-body');
  const sg=document.getElementById('bank-stats');
  try{
    if(tb)tb.innerHTML='<tr><td colspan="5"><div class="spin-lg"></div></td></tr>';
    const d=await API.bank.transactions();
    _bankTxAll=d.transactions||[];
    // Stats
    const totalIn=_bankTxAll.filter(t=>t.type==='IN').reduce((s,t)=>s+(t.amount||0),0);
    const totalOut=_bankTxAll.filter(t=>t.type==='OUT').reduce((s,t)=>s+(t.amount||0),0);
    const countIn=_bankTxAll.filter(t=>t.type==='IN').length;
    const countOut=_bankTxAll.filter(t=>t.type==='OUT').length;
    if(sg)sg.innerHTML=`<div class="glass-card stat-card"><div class="sv" style="color:var(--ok)">+${fmtVND(totalIn)}</div><div class="sl">Tổng tiền vào</div><div class="ss">${countIn} giao dịch</div></div><div class="glass-card stat-card"><div class="sv" style="color:var(--err)">-${fmtVND(totalOut)}</div><div class="sl">Tổng tiền ra</div><div class="ss">${countOut} giao dịch</div></div><div class="glass-card stat-card"><div class="sv">${fmtVND(totalIn-totalOut)}</div><div class="sl">Chênh lệch</div><div class="ss">${_bankTxAll.length} tổng GD</div></div>`;
    _bankPage=0;
    filterBankTx();
  }catch(e){
    if(sg)sg.innerHTML=`<p class="err">${e.message}</p>`;
    if(tb)tb.innerHTML=`<tr><td colspan="5" class="err">${e.message}</td></tr>`;
  }
}

function filterBankTx(){
  const type=document.getElementById('bk-type')?.value||'';
  const search=(document.getElementById('bk-search')?.value||'').toLowerCase();
  let filtered=_bankTxAll;
  if(type)filtered=filtered.filter(t=>t.type===type);
  if(search)filtered=filtered.filter(t=>(t.description||'').toLowerCase().includes(search)||(t.senderName||'').toLowerCase().includes(search)||(t.receiverName||'').toLowerCase().includes(search));
  _bankPage=0;
  _renderBankTx(filtered);
}

function _bankGoPage(p){_bankPage=p;filterBankTx()}

function _renderBankTx(items){
  const tb=document.getElementById('bk-body');if(!tb)return;
  if(!items.length){tb.innerHTML='<tr><td colspan="6" class="muted">Không có giao dịch</td></tr>';document.getElementById('bk-pg').innerHTML='';return}
  const start=_bankPage*_bankPP;
  const visible=items.slice(start,start+_bankPP);
  tb.innerHTML=visible.map(t=>{
    const isIn=t.type==='IN';
    const amtCls=isIn?'color:var(--ok)':'color:var(--err)';
    const sign=isIn?'+':'-';
    const badge=isIn?'<span style="background:rgba(52,211,153,.12);color:var(--ok);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">VÀO</span>':'<span style="background:rgba(248,113,113,.12);color:var(--err);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">RA</span>';
    // v3 uses postingDate (timestamp ms) or transactionDate (string)
    let dateStr=t.transactionDate||'';
    if(t.postingDate){const d=new Date(t.postingDate);dateStr=d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
    const txId=t.transactionNumber||t.transactionID||'';
    const sender=t.senderName||t.receiverName||'';
    return `<tr>
      <td class="mono sm">${txId}</td>
      <td class="sm" style="white-space:nowrap">${dateStr}</td>
      <td>${badge}</td>
      <td style="${amtCls};font-weight:600;white-space:nowrap">${sign}${(t.amount||0).toLocaleString('vi-VN')}₫</td>
      <td class="sm">${sender?'<span style="color:var(--text2)">'+esc(sender)+'</span><br>':''}<span style="max-width:400px;word-break:break-word;display:inline-block">${esc(t.description||'')}</span></td>
      <td class="sm">${t.isOnline?'Online':'Offline'}</td>
    </tr>`}).join('');
  document.getElementById('bk-pg').innerHTML=_pgHtml(_bankPage,items.length,'_bankGoPage');
}

/* ========== ADMIN REDEMPTIONS — SUPERADMIN ========== */
function renderAdmRedemptions(){return `<div class="page-title">🎁 Yêu cầu đổi thưởng</div><div class="page-sub">Duyệt yêu cầu đổi ngày / rút tiền của CTV</div>
<div class="adm-toolbar">
  <select id="rd-status" onchange="loadAdmRedemptions()"><option value="">Tất cả</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option></select>
  <button class="btn-s" onclick="go('admin-comms')">← Hoa hồng</button>
</div>
<div class="glass-card tbl-wrap" style="margin-top:12px"><table class="adm-tbl"><thead><tr><th>ID</th><th>CTV</th><th>Loại</th><th>Số tiền</th><th>Ngày thêm</th><th>Status</th><th>Ngày tạo</th><th>Ghi chú</th><th>Actions</th></tr></thead><tbody id="rd-body"><tr><td colspan="9"><div class="spin-lg"></div></td></tr></tbody></table></div>`}

async function loadAdmRedemptions(){
  try{
    const status=document.getElementById('rd-status')?.value||'';
    const d=await API.aff.redemptions(status?'status='+status:'');
    const tb=document.getElementById('rd-body');if(!tb)return;
    _arAll=d.redemptions||[];_arPage=0;_renderAdmRedemptionsPage();
  }catch(e){toast(e.message,'err')}
}
function _renderAdmRedemptionsPage(){
  const tb=document.getElementById('rd-body');if(!tb)return;
  if(!_arAll.length){tb.innerHTML='<tr><td colspan="9" class="muted">Chưa có yêu cầu</td></tr>';return}
  const start=_arPage*_BP;const visible=_arAll.slice(start,start+_BP);
  tb.innerHTML=visible.map(r=>{
      const typeBadge=r.type==='days'?'📅 Ngày':'💰 Tiền';
      const stCls=r.status==='approved'?'color:var(--ok)':r.status==='rejected'?'color:var(--err)':'color:var(--warn)';
      const stTxt=r.status==='approved'?'✓ Duyệt':r.status==='rejected'?'✕ Từ chối':'⏳ Chờ';
      const acts=r.status==='pending'?`<button class="btn-s" onclick="approveRedemption(${r.id})" style="color:var(--ok)">✓ Duyệt</button><button class="btn-s danger" onclick="rejectRedemption(${r.id})">✕ Từ chối</button>`:'';
      return `<tr><td>${r.id}</td><td class="sm">${r.affiliate_email||''}</td><td>${typeBadge}</td><td style="font-weight:600">${fmtVND(r.points_used)}</td><td>${r.days_added?r.days_added+' ngày':'-'}</td><td style="${stCls}">${stTxt}</td><td class="sm">${r.created_at?r.created_at.slice(0,10):'-'}</td><td class="sm">${r.note||''}</td><td class="acts">${acts}</td></tr>`}).join('');
  const pg=tb.closest('.tbl-wrap');if(pg){let pgDiv=pg.nextElementSibling;if(!pgDiv||!pgDiv.classList.contains('ar-pg')){pgDiv=document.createElement('div');pgDiv.className='ar-pg';pg.after(pgDiv)}pgDiv.innerHTML=_pgHtml(_arPage,_arAll.length,'_arGoPage')}
}

async function approveRedemption(id){
  if(!confirm('Duyệt yêu cầu này?'))return;
  try{await API.aff.updRedemption(id,{status:'approved'});toast('Đã duyệt','ok');loadAdmRedemptions()}catch(e){toast(e.message,'err')}
}

async function rejectRedemption(id){
  const note=prompt('Lý do từ chối (tùy chọn):');
  try{await API.aff.updRedemption(id,{status:'rejected',note:note||''});toast('Đã từ chối','ok');loadAdmRedemptions()}catch(e){toast(e.message,'err')}
}

/* ========== MY AFFILIATE (CTV SELF-SERVICE) ========== */
function renderMyAffiliate(){return `<div class="page-title">🤝 Dashboard CTV</div><div class="page-sub">Quản lý giới thiệu & hoa hồng của bạn</div>
<div class="stats-grid" id="aff-stats"><div class="spin-lg"></div></div>
<div class="prof-layout" style="margin-top:16px">
  <div class="prof-left">
    <div class="glass-card prof-card" id="aff-link-card"><div class="spin-lg"></div></div>
    <div class="glass-card prof-card" id="aff-redeem-card"><div class="spin-lg"></div></div>
  </div>
  <div class="prof-right">
    <div class="glass-card prof-card">
      <div class="prof-section-title">📋 Lịch sử hoa hồng</div>
      <div id="aff-comms"><div class="spin-lg"></div></div>
    </div>
    <div class="glass-card prof-card">
      <div class="prof-section-title">🔄 Lịch sử đổi thưởng</div>
      <div id="aff-redemptions"><div class="spin-lg"></div></div>
    </div>
    <div class="glass-card prof-card">
      <div class="prof-section-title">👥 Danh sách giới thiệu</div>
      <div id="aff-referrals"><div class="spin-lg"></div></div>
    </div>
  </div>
</div>`}

async function loadMyAffiliate(){
  try{
    const d=await API.myAff.dashboard();
    const s=d.stats;
    // Stats
    const sg=document.getElementById('aff-stats');
    if(sg)sg.innerHTML=`
      <div class="stat-card"><div class="stat-val">${s.referralCount}</div><div class="stat-lbl">Người giới thiệu</div></div>
      <div class="stat-card"><div class="stat-val">${s.referralBuyers}</div><div class="stat-lbl">Đã mua gói</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--ok)">${fmtVND(s.totalCommission)}</div><div class="stat-lbl">Tổng hoa hồng</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--warn)">${fmtVND(s.availableBalance)}</div><div class="stat-lbl">Số dư khả dụng</div></div>`;
    // Link card
    const lc=document.getElementById('aff-link-card');
    if(lc)lc.innerHTML=`
      <div class="prof-section-title">🔗 Link giới thiệu</div>
      <div style="background:var(--card);padding:12px;border-radius:8px;margin:8px 0;word-break:break-all;font-family:monospace;font-size:12px;color:var(--accent)">${d.link}</div>
      <button class="btn-primary" style="width:auto;padding:8px 20px" onclick="copyText('${d.link}')">📋 Copy link</button>
      <div style="margin-top:12px;font-size:12px;color:var(--text2);line-height:1.6">
        <div>Mã giới thiệu: <span style="color:var(--accent);font-weight:600">${d.ref_code}</span></div>
        <div>Tỷ lệ hoa hồng: <span style="color:var(--ok);font-weight:600">${d.commission_rate}%</span></div>
        <div style="margin-top:8px;color:var(--text3)">Chia sẻ link này cho bạn bè. Khi họ đăng ký và mua gói, bạn nhận ${d.commission_rate}% hoa hồng.</div>
      </div>`;
    // Redeem card
    const rc=document.getElementById('aff-redeem-card');
    const ppd=s.pointsPerDay;
    const maxDays=Math.floor(s.availableBalance/ppd);
    if(rc)rc.innerHTML=`
      <div class="prof-section-title">🎁 Đổi thưởng</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.6">
        Số dư: <span style="color:var(--warn);font-weight:600">${fmtVND(s.availableBalance)}</span><br>
        Quy đổi: ${fmtVND(ppd)}/ngày (tối đa ${maxDays} ngày)
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="background:var(--card);padding:14px;border-radius:10px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">📅 Đổi ngày sử dụng</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="aff-days" min="1" max="${maxDays||0}" value="${Math.min(maxDays,7)||0}" placeholder="Số ngày" style="width:80px">
            <span style="font-size:12px;color:var(--text3)" id="aff-days-cost">= ${fmtVND(Math.min(maxDays,7)*ppd)}</span>
            <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="redeemDays()" ${s.availableBalance<ppd?'disabled':''}>Đổi</button>
          </div>
        </div>
        <div style="background:var(--card);padding:14px;border-radius:10px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">💰 Rút tiền mặt</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="aff-cash" min="50000" step="10000" value="${Math.min(s.availableBalance,50000)||0}" placeholder="Số tiền" style="width:120px">
            <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:12px" onclick="redeemCash()" ${s.availableBalance<50000?'disabled':''}>Yêu cầu rút</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Tối thiểu 50,000₫. Cần admin duyệt.</div>
        </div>
      </div>`;
    // Update days cost on input change
    const daysInp=document.getElementById('aff-days');
    if(daysInp)daysInp.addEventListener('input',function(){const dc=document.getElementById('aff-days-cost');if(dc)dc.textContent='= '+fmtVND((parseInt(this.value)||0)*ppd)});
    // Commissions
    const ce=document.getElementById('aff-comms');
    if(ce){
      _myAffComms=d.commissions||[];_myAffCommsPage=0;_renderMyAffComms();
    }
    // Redemptions
    const re=document.getElementById('aff-redemptions');
    if(re){
      if(!d.redemptions.length){re.innerHTML='<div class="muted" style="padding:10px">Chưa có yêu cầu đổi thưởng</div>'}
      else{re.innerHTML=`<table class="adm-tbl"><thead><tr><th>Loại</th><th>Số tiền</th><th>Ngày thêm</th><th>Status</th><th>Ngày tạo</th></tr></thead><tbody>${d.redemptions.map(r=>{
        const typeBadge=r.type==='days'?'📅 Ngày':'💰 Tiền';
        const stCls=r.status==='approved'?'color:var(--ok)':r.status==='rejected'?'color:var(--err)':'color:var(--warn)';
        const stTxt=r.status==='approved'?'✓ Duyệt':r.status==='rejected'?'✕ Từ chối':'⏳ Chờ';
        return `<tr><td>${typeBadge}</td><td>${fmtVND(r.points_used)}</td><td>${r.days_added?r.days_added+' ngày':'-'}</td><td style="${stCls}">${stTxt}</td><td class="sm">${r.created_at?r.created_at.slice(0,10):'-'}</td></tr>`}).join('')}</tbody></table>`}
    }
    // Referrals
    const rf=document.getElementById('aff-referrals');
    if(rf){
      _myAffRefs=d.referrals||[];_myAffRefsPage=0;_renderMyAffRefs();
    }
  }catch(e){toast(e.message,'err')}
}

function _renderMyAffComms(){
  const ce=document.getElementById('aff-comms');if(!ce)return;
  if(!_myAffComms.length){ce.innerHTML='<div class="muted" style="padding:10px">Chưa có hoa hồng</div>';return}
  const start=_myAffCommsPage*_BP;const visible=_myAffComms.slice(start,start+_BP);
  ce.innerHTML=`<table class="adm-tbl"><thead><tr><th>Người mua</th><th>Giá trị</th><th>Hoa hồng</th><th>Status</th><th>Ngày</th></tr></thead><tbody>${visible.map(c=>{
    const stBadge=c.status==='paid'?'<span style="color:var(--ok)">✓ Đã TT</span>':'<span style="color:var(--warn)">⏳ Chờ</span>';
    return `<tr><td class="sm">${c.buyer_email}</td><td>${fmtVND(c.amount)}</td><td style="font-weight:600;color:var(--ok)">${fmtVND(c.commission)}</td><td>${stBadge}</td><td class="sm">${c.created_at?c.created_at.slice(0,10):'-'}</td></tr>`}).join('')}</tbody></table>`+_pgHtml(_myAffCommsPage,_myAffComms.length,'_myAffCommsGoPage');
}
function _renderMyAffRefs(){
  const rf=document.getElementById('aff-referrals');if(!rf)return;
  if(!_myAffRefs.length){rf.innerHTML='<div class="muted" style="padding:10px">Chưa có ai đăng ký qua link của bạn</div>';return}
  const start=_myAffRefsPage*_BP;const visible=_myAffRefs.slice(start,start+_BP);
  rf.innerHTML=`<table class="adm-tbl"><thead><tr><th>Email</th><th>Tên</th><th>Gói</th><th>HH kiếm được</th><th>Ngày ĐK</th></tr></thead><tbody>${visible.map(r=>{
    return `<tr><td class="sm">${r.email}</td><td>${r.name||'-'}</td><td><span class="badge">${planName(r.plan)}</span></td><td style="color:var(--ok)">${fmtVND(r.earned)}</td><td class="sm">${r.created_at?r.created_at.slice(0,10):'-'}</td></tr>`}).join('')}</tbody></table>`+_pgHtml(_myAffRefsPage,_myAffRefs.length,'_myAffRefsGoPage');
}

async function redeemDays(){
  const days=parseInt(document.getElementById('aff-days')?.value)||0;
  if(days<1){toast('Nhập số ngày','err');return}
  const ppd=14286;
  const amount=days*ppd;
  if(!confirm(`Đổi ${fmtVND(amount)} → ${days} ngày sử dụng?`))return;
  try{const d=await API.myAff.redeem({type:'days',amount});toast(d.message,'ok');loadMyAffiliate()}catch(e){toast(e.message,'err')}
}

async function redeemCash(){
  const amount=parseInt(document.getElementById('aff-cash')?.value)||0;
  if(amount<50000){toast('Tối thiểu 50,000₫','err');return}
  if(!confirm(`Yêu cầu rút ${fmtVND(amount)}?`))return;
  try{const d=await API.myAff.redeem({type:'cash',amount});toast(d.message,'ok');loadMyAffiliate()}catch(e){toast(e.message,'err')}
}

/* ========== MODAL UTIL ========== */
function closeModal(id){const el=document.getElementById(id);if(el)el.innerHTML=''}

/* ========== INIT ========== */
(async function init(){
  if(API.valid()){CU=API.getU();if(CU){enter();return}try{const d=await API.me();CU=d.user;API.saveU(CU);enter()}catch(e){API.clear();document.getElementById('auth-screen').classList.add('active')}}
  else{API.clear();document.getElementById('auth-screen').classList.add('active')}
})();







 
 
 
 
