// Gravewright 3D Dice — AGPL-3.0-only; see LICENSE.md and THIRD_PARTY_NOTICES.md.
import {DiceRenderer} from './renderer.js';
import {notation,preferences,FONTS} from './notation.js';
import messages from './messages.js';
let instance;
class Module {
 async start(ctx) {
  this.ctx=ctx;this.pending=new Map();this.ids=new Set();this.queue=[];this.disposed=false;
  ctx.styles.use('styles.css');ctx.onDispose(()=>this.dispose());
  this.i18n=ctx.i18n??ctx.api.i18n;
  this.stopCatalog=this.i18n?.register(messages);
  const languageChanged=()=>{
   if(this.disposed)return;
   this.errors={worker:this.text('errors.worker_failed'),timeout:this.text('errors.simulation_timed_out'),deactivated:this.text('errors.deactivated')};
   this.updateDialogText?.();
  };
  this.stopLanguage=this.i18n?.onChange(languageChanged);languageChanged();
  this.fonts=[];
  await Promise.all(Object.keys(FONTS).map(async id=>{const face=new FontFace('gw3d-'+id,`url("${ctx.assets.url('assets/fonts/'+id+'.ttf')}")`,{weight:'600'});await face.load();if(!this.disposed){document.fonts.add(face);this.fonts.push(face);}}));
  if(ctx.signal.aborted)return;
  this.saved=await ctx.storage.user.get('appearance');this.prefs=preferences(this.saved?.value);
  this.worker=new Worker(ctx.assets.url('physics-worker.js'));
  this.worker.onmessage=({data})=>{const request=this.pending.get(data.id);if(!request)return;this.pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(new Error(data.error)):request.resolve(data.result);};
  this.worker.onerror=()=>{for(const r of this.pending.values()){clearTimeout(r.timer);r.reject(new Error(this.errors.worker));}this.pending.clear();};
  this.layer=document.createElement('div');this.layer.className='gw3d-layer';this.layer.hidden=true;
  this.layer.setAttribute('translate','no');
  this.stage=document.createElement('div');this.stage.className='gw3d-stage';this.caption=document.createElement('p');this.caption.className='gw3d-caption';this.caption.role='status';this.layer.append(this.stage,this.caption);document.body.append(this.layer);
  document.addEventListener('pointerdown',()=>{if(!this.audio){try{this.audio=new AudioContext();}catch{}}if(this.audio?.state==='suspended')void this.audio.resume();},{signal:ctx.signal});
  ctx.api.events.on('chat.message',message=>this.receive(message));
 }
 text(key){return this.i18n?.t(key)??messages.en[key]??key;}
 receive(message) {
  if(this.disposed || !message.roll || message.deleted || this.ids.has(message.id))return;
  this.ids.add(message.id);if(this.ids.size>1024)this.ids.delete(this.ids.values().next().value);
  const dice=notation(message);if(!dice.length)return;
  // Only live, already-authorized chat events enter this queue; no history replay
  // or extra socket is used. Private rolls stay with their native audience.
  this.queue.push({message,dice});void this.drain();
 }
 simulate(dice,width,height) {
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(this.errors.timeout));},20000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,dice,width:Math.min(width,40),height,seed:crypto.getRandomValues(new Uint32Array(1))[0]});});
 }
 async drain() {
  if(this.running || this.disposed)return;this.running=true;
  try {
   while(this.queue.length && !this.disposed) {
    const {message,dice}=this.queue.shift();this.layer.hidden=false;
    this.view??=new DiceRenderer(this.stage);this.view.size();
    this.caption.textContent=[message.from?.name,message.roll.label||message.roll.expression].filter(Boolean).join(' · ');
    for(let i=0;i<dice.length&&!this.disposed;i+=24){
     const batch=dice.slice(i,i+24),result=await this.simulate(batch,this.view.width*.88,this.view.height*.82);
     if(this.disposed)break;
     this.view.set(batch,result.landing,this.prefs);this.layer.dataset.state='rolling';
     await this.replay(this.view,result);
     if(this.disposed)break;
     this.layer.dataset.state='settled';this.layer.dataset.values=JSON.stringify(batch.map(d=>d.value));
     await this.pause(1800);
    }
   }
  }catch(error){if(!this.disposed)console.error('Gravewright 3D Dice:',error);}
  finally{this.running=false;if(this.layer){this.layer.hidden=true;this.layer.dataset.state='idle';}this.view?.clear();}
 }
 pause(ms){return new Promise(resolve=>{this.pauseResolve=resolve;this.pauseTimer=setTimeout(()=>{this.pauseResolve=null;resolve();},ms);});}
 replay(view,result) {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){view.frame(result.frames.at(-1));return Promise.resolve();}
  return new Promise(resolve=>{this.replayResolve=resolve;let start,impact=0;const tick=time=>{
   if(this.disposed){resolve();return;}start??=time;const frame=Math.min(Math.floor((time-start)/1000*60),result.frames.length-1);
   view.frame(result.frames[frame]);
   while(impact<result.impacts.length&&result.impacts[impact][0]<=frame){const hit=result.impacts[impact++];if(frame-hit[0]<4)this.sound(hit[1]);}
   if(frame===result.frames.length-1){this.replayResolve=null;resolve();}else this.raf=requestAnimationFrame(tick);
  };this.raf=requestAnimationFrame(tick);});
 }
 sound(speed){if(!this.audio||this.audio.state!=='running'||this.audio.currentTime-(this.lastSound??0)<.045)return;const t=this.audio.currentTime;this.lastSound=t;const osc=this.audio.createOscillator(),gain=this.audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(130+Math.random()*200,t);gain.gain.setValueAtTime(Math.min(speed/800,.045),t);gain.gain.exponentialRampToValueAtTime(.0001,t+.055);osc.connect(gain).connect(this.audio.destination);osc.start(t);osc.stop(t+.06);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
 async customize() {
  if(this.dialog){this.dialog.focus();return;}
  const dialog=document.createElement('section');dialog.className='gw3d-customize';dialog.setAttribute('translate','no');this.dialog=dialog;
  const labels=[];
  const labelText=(element,key)=>{labels.push([element,key]);element.textContent=this.text(key);return element;};
  const h=labelText(document.createElement('h2'),'customize.title');h.id='gw3d-title-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',h.id);dialog.append(h);
  const form=document.createElement('form');dialog.append(form);
  const preview=document.createElement('div');preview.className='gw3d-preview';preview.setAttribute('role','img');form.append(preview);
  const draft={...this.prefs};let previewView,previewGeneration=0,noticeKey='';
  const open=()=>this.dialog===dialog&&dialog.isConnected&&!this.disposed;
  const showNotice=key=>{noticeKey=key;notice.textContent=key?this.text(key):'';};
  const render=async()=>{const generation=++previewGeneration;try{previewView??=new DiceRenderer(preview,{height:5});previewView.size();const dice=[{sides:20,value:20},{sides:6,value:6}],r=await this.simulate(dice,previewView.width*.8,previewView.height*.65);if(!open()||generation!==previewGeneration)return;previewView.set(dice,r.landing,draft);const frame=[...r.frames.at(-1)];frame[0]=-1.4;frame[2]=0;frame[7]=1.4;frame[9]=0;previewView.frame(frame);}catch(error){if(open()&&generation===previewGeneration)showNotice('status.preview_unavailable');}};
  for(const [key,caption] of [['diceColor','appearance.dice_color'],['textColor','appearance.text_color'],['font','appearance.font']]) {
   const label=document.createElement('label');label.append(labelText(document.createElement('span'),caption));
   const input=document.createElement(key==='font'?'select':'input');input.name=key;
   if(key==='font')for(const [id,name] of Object.entries(FONTS))input.add(new Option(name,id));else input.type='color';
   input.value=draft[key];input.addEventListener('input',()=>{draft[key]=input.value;clearTimeout(this.previewTimer);this.previewTimer=setTimeout(()=>void render(),120);});label.append(input);form.append(label);
  }
  const notice=document.createElement('p');notice.role='status';notice.className='gw3d-notice';form.append(notice);
  const actions=document.createElement('footer'),cancel=labelText(document.createElement('button'),'actions.cancel'),save=labelText(document.createElement('button'),'actions.save');cancel.type='button';cancel.onclick=()=>dialog.close();save.type='submit';actions.append(cancel,save);form.append(actions);
  const credits=document.createElement('p');credits.className='gw3d-credits';credits.append(document.createTextNode('Based on Dice So Nice · Simone & JDW · AGPLv3 · No warranty. '));
  for(const [url,title] of [['https://github.com/Gravewright/Gravewright-3D-Dice','links.source'],[this.ctx.assets.url('LICENSE.md'),'links.license']]){const a=labelText(document.createElement('a'),title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';credits.append(a,document.createTextNode(' '));}dialog.append(credits);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{this.saved=await this.ctx.storage.user.set('appearance',preferences(draft),{expectedRevision:this.saved?.revision??null});if(!open())return;this.prefs=preferences(draft);dialog.close();}catch(error){if(!open())return;if(error.code==='conflict'){try{this.saved=await this.ctx.storage.user.get('appearance');if(open())showNotice('status.conflict');}catch{if(open())showNotice('status.save_failed');}}else showNotice('status.save_failed');}finally{save.disabled=false;}};
  const updateText=()=>{dialog.lang=this.i18n?.locale??'en';for(const [element,key] of labels)element.textContent=this.text(key);preview.setAttribute('aria-label',this.text('appearance.preview'));if(noticeKey)notice.textContent=this.text(noticeKey);};
  const cleanup=()=>{clearTimeout(this.previewTimer);previewGeneration++;previewView?.dispose();dialog.remove();if(this.dialog===dialog)this.dialog=null;if(this.updateDialogText===updateText)this.updateDialogText=null;};
  dialog.addEventListener('close',cleanup,{once:true});
  this.updateDialogText=updateText;updateText();
  try{this.ctx.api.ui.openModal(dialog,{nested:true,canClose:()=>!save.disabled});}catch(error){cleanup();throw error;}
  void render();
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.dialog?.close(true);this.stopLanguage?.();this.stopCatalog?.();this.queue=[];this.worker?.terminate();for(const r of this.pending.values()){clearTimeout(r.timer);r.reject(new Error(this.errors?.deactivated??messages.en['errors.deactivated']));}this.pending.clear();cancelAnimationFrame(this.raf);clearTimeout(this.pauseTimer);this.pauseResolve?.();this.replayResolve?.();this.view?.dispose();this.layer?.remove();this.audio?.close();for(const font of this.fonts??[])document.fonts.delete(font);}
}
export default {
 async start(ctx){instance=new Module();await instance.start(ctx);},
 register(){},
 customize(){return instance.customize();},
 stop(){instance?.dispose();instance=null;}
};
