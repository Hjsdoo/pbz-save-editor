const $ = id => document.getElementById(id);
const td = new TextDecoder('utf-8',{fatal:true}), te = new TextEncoder();
const MAGIC = new Uint8Array([80,66,90,83,1,1,0,0]);
const KEY_BYTES = Uint8Array.from('15a1fe0f55e0eb298e7c9461548351696a2a0700ed2d17ba1f871457e8f93e2d'.match(/../g),n=>parseInt(n,16));
const LIMIT=64*1024*1024;
const abilityLabels=[['HeiShi8','锋芒（推测）'],['ShaChiHuPo8','凝神（推测）'],['MemoryFlower8','易筋（推测）']];
const largeFlowers=[{"id":"FA_0205","name":"虚空的记忆之花","petals":["F_02051","F_02052","F_02053","F_02054","F_02055","F_02056"]},{"id":"FA_0300","name":"七星弟子的记忆之花","petals":["F_03002","F_03003","F_03004","F_03005","F_03006","F_03007"]},{"id":"FA_0501","name":"萤火的记忆之花","petals":["F_05011","F_05012","F_05013","F_05014","F_05015","F_05016"]},{"id":"FA_0603","name":"舞狮尊主的记忆之花","petals":["F_06031","F_06032","F_06033","F_06034","F_06035","F_06036"]},{"id":"FA_0604","name":"众正道头领的记忆之花","petals":["F_06041","F_06042","F_06043","F_06044","F_06045","F_06046"]},{"id":"FA_0801","name":"烟儿的记忆之花","petals":["F_08011","F_08012","F_08013","F_08014","F_08015","F_08016"]},{"id":"FA_1200","name":"冷荼的记忆之花","petals":["F_12001","FS_12001","FS_12002","FS_12003","FS_12004","FS_14001"]},{"id":"FA_1800","name":"玄礼的记忆之花","petals":["FS_18001","FS_18002","FS_18003","FS_18004","FS_18005","FS_18006"]},{"id":"FA_1802","name":"风雪刀客的记忆之花","petals":["F_18021","F_18022","F_18023","F_18024","F_18025","F_18026"]},{"id":"FA_7000","name":"关于“荒行子”的记忆之花","petals":["F_70001","F_70002","F_70003","F_70004","F_70005","F_70006"]}];
const materials=[['Item_001','黑石'],['Item_002','杀气琥珀']];
let state=null,decodeKraken;
function equal(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function join(...parts){const out=new Uint8Array(parts.reduce((a,b)=>a+b.length,0));let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;}
function u16(b,p){if(p+2>b.length)throw Error('目录数据不完整');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(p,true);}
function u32(b,p){if(p+4>b.length)throw Error('目录数据不完整');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p,true);}
function set32(b,p,v){new DataView(b.buffer,b.byteOffset,b.byteLength).setUint32(p,v,true);}
function message(s,error=false){$('status').textContent=s;$('status').classList.toggle('error',error);}
async function key(){return crypto.subtle.importKey('raw',KEY_BYTES,{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function decrypt(block,k){if(block.length<36||!equal(block.slice(0,8),MAGIC))throw Error('存档块格式不正确');return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:block.slice(8,20),tagLength:128},k,join(block.slice(36),block.slice(20,36))));}
async function encrypt(raw,k){const nonce=crypto.getRandomValues(new Uint8Array(12));const b=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},k,raw));return join(MAGIC,nonce,b.slice(-16),b.slice(0,-16));}
async function inflate(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());}
async function kraken(bytes,size){if(!decodeKraken){const mod=await import('https://cdn.jsdelivr.net/npm/ooz-wasm@2.0.0/index.js');if(typeof mod.decompress!=='function')throw Error('解压组件不可用');decodeKraken=mod.decompress;}return decodeKraken(bytes,size);}
function parseDirectory(dir,fileSize,base,count,header){if(!equal(dir.slice(0,12),header))throw Error('目录头校验失败');let p=12,off=0;const arr=[];for(let i=0;i<count;i++){const n=u16(dir,p);p+=2;if(p+n+14>dir.length)throw Error('目录记录不完整');const name=td.decode(dir.slice(p,p+n));p+=n;const entry={name,pos:p,alg:dir[p],raw:u32(dir,p+2),off:u32(dir,p+6),len:u32(dir,p+10)};if(entry.off!==off||entry.len<36||entry.raw>LIMIT)throw Error('存档块尺寸异常');if(arr.some(e=>e.name===name))throw Error('重复存档槽位');off+=entry.len;p+=14;arr.push(entry);}if(p!==dir.length||base+off!==fileSize)throw Error('存档目录长度不匹配');return arr;}
async function decodeSlot(file,entry,k){const compressed=await decrypt(file.slice(state.base+entry.off,state.base+entry.off+entry.len),k);let raw;if(entry.alg===0)raw=compressed;else if(entry.alg===1)raw=await inflate(compressed);else if(entry.alg===2)raw=await kraken(compressed,entry.raw);else throw Error('不支持的压缩格式');if(raw.length!==entry.raw)throw Error('解压长度不匹配');return td.decode(raw);}
function blockStored(raw){const parts=[];for(let i=0;i<raw.length;i+=0x40000)parts.push(new Uint8Array([0xcc,0x06]),raw.slice(i,i+0x40000));return join(...parts);}
function closeObject(text,start){const re=/"(?:[^"\\]|\\[\s\S])*"|[{}]/g;re.lastIndex=start;let depth=0,m;while((m=re.exec(text))){if(m[0]==='{')depth++;if(m[0]==='}'&&--depth===0)return m.index+1;}throw Error('存档数据结构不完整');}
function escapeRe(s){return s.replace(/[.*+?^\x24{}()|[\]\\]/g,'\\$&');}
function objectRange(text,name){const re=new RegExp(escapeRe(JSON.stringify(name))+'\\s*:\\s*\\{','g'),hits=[...text.matchAll(re)];if(hits.length!==1)throw Error('无法唯一定位字段 '+name);const start=hits[0].index+hits[0][0].length-1;return[start,closeObject(text,start)];}
function withObject(text,name,fn){const [a,b]=objectRange(text,name);return text.slice(0,a)+fn(text.slice(a,b))+text.slice(b);}
function setInteger(object,field,value,allowInsert=false){const re=new RegExp('('+escapeRe(JSON.stringify(field))+'\\s*:\\s*)(-?\\d+)(?=\\s*[,}])','g'),hits=[...object.matchAll(re)];if(hits.length===1)return object.replace(re,(_,prefix)=>prefix+value);if(hits.length===0&&allowInsert)return '{'+JSON.stringify(field)+':'+value+(object.trim()==='{}'?'':',')+object.slice(1);throw Error('无法修改字段 '+field);}
function integer(value,min,max,label){if(!/^\d+$/.test(String(value)))throw Error(label+'请输入整数');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(label+'范围为 '+min+'–'+max);return n;}
async function openFile(file){if(!file)return;if(file.size>LIMIT)throw Error('文件过大');const data=new Uint8Array(await file.arrayBuffer());if(data.length<48||String.fromCharCode(...data.slice(0,4))!=='PBZS'||data[4]!==3)throw Error('仅支持 PBZS v3 存档');const count=u16(data,6),size=u32(data,8),base=12+size;if(count<1||count>1024||base>data.length||size<36)throw Error('存档头不正确');const k=await key();let dir;try{dir=await decrypt(data.slice(12,base),k);}catch{throw Error('无法验证存档，可能是游戏版本或密钥不兼容');}const entries=parseDirectory(dir,data.length,base,count,data.slice(0,12));state={data,dir,base,entries,k,active:'',current:'',raw:'',saved:null};const adv=entries.find(e=>e.name==='__Advanced__');if(!adv)throw Error('未找到账号信息槽位');state.active=JSON.parse(await decodeSlot(data,adv,k)).LastContinueSlot;const playable=entries.filter(e=>/^(AutoSave\d+|ManualSave\d+|NightmareRun\d+)$/.test(e.name));if(!playable.length)throw Error('未找到可编辑槽位');$('slot').replaceChildren(...playable.map(e=>{const o=document.createElement('option');o.value=e.name;o.textContent=e.name+(e.name===state.active?' · 继续游戏':'');return o;}));$('slot').value=playable.some(e=>e.name===state.active)?state.active:playable[0].name;await selectSlot($('slot').value);$('filename').textContent=file.name;$('editor').hidden=false;message('存档已通过认证，可以开始编辑');}
async function selectSlot(name){const entry=state.entries.find(e=>e.name===name),raw=await decodeSlot(state.data,entry,state.k),obj=JSON.parse(raw);if(!obj.Player||!obj.Inventory)throw Error('槽位缺少角色或背包数据');state.current=name;state.raw=raw;state.saved=obj;render();}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function render(){const o=state.saved,inv=o.Inventory;$('dust').value=o.Player.Dust??0;$('dust-info').textContent=Number(o.Player.Dust??0).toLocaleString();$('days').textContent=o.Player.RemainingDays??'—';$('weapon-count').textContent=Object.keys(inv.MainWeaponInfos??{}).length+Object.keys(inv.ShaChiWeaponInfo??{}).length;const list=$('weapon-list');list.replaceChildren();for(const [title,group,field] of [['主武器','MainWeaponInfos','WeaponLevel'],['影之武装','ShaChiWeaponInfo','ShaChiWeaponLevel']]){list.append(node('div','group-title',title));for(const [id,item] of Object.entries(inv[group]??{})){const row=node('div','weapon-row');row.dataset.search=id.toLowerCase();const description=node('div');description.append(node('strong','',id),node('small','',item[field]===undefined?'原始等级字段未记录':'当前记录等级 '+item[field]));const input=node('input');input.type='number';input.min=1;input.max=60;input.step=1;input.inputMode='numeric';input.placeholder='未记录';input.title='输入整数，范围 1–60';input.setAttribute('aria-label',id+' 等级，输入 1 至 60');if(item[field]!==undefined)input.value=item[field];input.dataset.group=group;input.dataset.id=id;input.dataset.field=field;row.append(description,input);list.append(row);}}const abilities=$('ability-list');abilities.replaceChildren();const values=o.AbilityNode_RenewalHun?.AbilityNodes??{};for(const [id,label] of abilityLabels){const row=node('div','ability-row'),title=node('div');title.append(node('strong','',label),node('small','',id));const input=node('input');input.type='number';input.min=0;input.max=30;input.step=1;input.inputMode='numeric';input.title='输入整数，范围 0–30';input.value=values[id]??'';input.dataset.ability=id;input.setAttribute('aria-label',label+' 等级，输入 0 至 30');row.append(title,input);abilities.append(row);}renderCollectibles();renderAccessories();filterWeapons();}
function renderCollectibles(){
  const inv=state.saved.Inventory.InventoryInfos??{}, list=$('material-list');list.replaceChildren();
  for(const [id,label] of materials){
    const row=node('div','material-row'), title=node('div');title.append(node('strong','',label),node('small','',id));row.append(title);
    for(const [field,caption] of [['CurrentAmount','背包数量'],['MaxAmount','累计记录']]){
      const box=node('label','material-field');box.append(node('span','',caption));const input=node('input');input.type='number';input.min=0;input.max=2147483647;input.step=1;input.inputMode='numeric';input.placeholder='未记录';input.dataset.material=id;input.dataset.field=field;input.setAttribute('aria-label',label+caption);if(inv[id]?.[field]!==undefined)input.value=inv[id][field];box.append(input);row.append(box);
    }list.append(row);
  }
  const flowerList=$('flower-list');flowerList.replaceChildren();let completed=0;
  for(const f of largeFlowers){const petals=f.petals.filter(id=>Number(inv[id]?.CurrentAmount)>0).length, hasParent=Number(inv[f.id]?.CurrentAmount)>0, done=hasParent&&petals===f.petals.length;if(done)completed++;
    const row=node('label','flower-row'),checkbox=node('input');checkbox.type='checkbox';checkbox.dataset.flower=f.id;checkbox.disabled=done;
    const info=node('span','flower-info');info.append(node('strong','',f.name),node('small','',done?'已完成':('碎片 '+petals+' / 6'+(hasParent?' · 已有花记录':''))));row.append(checkbox,info);flowerList.append(row);
  }
  $('flower-count').textContent='已记录完整：'+completed+' / '+largeFlowers.length;
}
function renderAccessories(){
  const list=$('accessory-list'), infos=state.saved.Inventory.AccessoryInfos??{}, equipped=state.saved.Inventory.AccessoryIDs??[];
  list.replaceChildren();
  const entries=Object.entries(infos);
  if(!entries.length){list.append(node('p','', '此槽位没有饰品记录。'));return;}
  for(const [id,item] of entries){
    const row=node('div','accessory-row');row.dataset.search=id.toLowerCase();
    const details=node('div');const level=item?.CurrentLevel;
    details.append(node('strong','',id),node('small','',(equipped.includes(id)?'已装备 · ':'')+'存档强化值：'+(level??'未记录')+' · 轮回记录：'+(item?.ReincarnationCount??0)));
    const input=node('input');input.type='number';input.min=0;input.max=8;input.step=1;input.inputMode='numeric';input.dataset.accessory=id;
    input.setAttribute('aria-label',id+' 存档强化值，输入 0 至 8');
    if(Number.isSafeInteger(level))input.value=String(level);else{input.disabled=true;input.placeholder='未记录';}
    row.append(details,input);list.append(row);
  }
  filterAccessories();
}
function filterAccessories(){const q=$('accessory-search').value.trim().toLowerCase();for(const row of document.querySelectorAll('.accessory-row'))row.hidden=!row.dataset.search.includes(q);}
function editAccessories(raw,original){
  const infos=original.Inventory.AccessoryInfos??{},changes=[];
  for(const input of document.querySelectorAll('input[data-accessory]')){
    if(input.disabled)continue;
    const id=input.dataset.accessory, old=infos[id]?.CurrentLevel;
    if(!Number.isSafeInteger(old))throw Error(id+' 的饰品等级记录无效');
    if(input.value===String(old))continue;
    const value=integer(input.value,0,8,id+' 饰品强化值');
    if(value!==old)changes.push([id,value]);
  }
  if(!changes.length)return raw;
  return withObject(raw,'Inventory',s=>withObject(s,'AccessoryInfos',t=>{
    for(const [id,value] of changes)t=withObject(t,id,o=>setInteger(o,'CurrentLevel',value));
    return t;
  }));
}
function filterWeapons(){const q=$('search').value.trim().toLowerCase();for(const row of document.querySelectorAll('.weapon-row'))row.hidden=!row.dataset.search.includes(q);}
function makeEdits(){const original=state.saved;let raw=state.raw;const dust=integer($('dust').value,0,99999999,'尘数量');if(dust!==original.Player.Dust)raw=withObject(raw,'Player',s=>setInteger(s,'Dust',dust));for(const [group,field] of [['MainWeaponInfos','WeaponLevel'],['ShaChiWeaponInfo','ShaChiWeaponLevel']]){const inputs=[...document.querySelectorAll('input[data-group]')].filter(i=>i.dataset.group===group),changes=[];for(const input of inputs){const item=original.Inventory[group][input.dataset.id],old=item[field];if(input.value===''){if(old!==undefined)throw Error(input.dataset.id+' 的等级不能为空');continue;}if(old!==undefined&&input.value===String(old))continue;const v=integer(input.value,1,60,input.dataset.id+' 等级');if(v!==old)changes.push({id:input.dataset.id,value:v,missing:old===undefined});}if(changes.length)raw=withObject(raw,group,segment=>{for(const c of changes)segment=withObject(segment,c.id,obj=>setInteger(obj,field,c.value,c.missing));return segment;});}const nodes=original.AbilityNode_RenewalHun?.AbilityNodes??{},changes=[];for(const input of document.querySelectorAll('[data-ability]')){if(input.value==='')continue;if(nodes[input.dataset.ability]!==undefined&&input.value===String(nodes[input.dataset.ability]))continue;const n=integer(input.value,0,30,input.dataset.ability);if(n!==nodes[input.dataset.ability])changes.push([input.dataset.ability,n]);}if(changes.length)raw=withObject(raw,'AbilityNode_RenewalHun',s=>withObject(s,'AbilityNodes',t=>{for(const [name,n] of changes)t=setInteger(t,name,n,nodes[name]===undefined);return t;}));return editAccessories(editCollectibles(raw,original),original);}
function editCollectibles(raw,original){
  const infos=original.Inventory.InventoryInfos;if(!infos||typeof infos!=='object')throw Error('槽位缺少收集物品数据');
  const changes=new Map();
  function set(id,field,value){if(!changes.has(id))changes.set(id,{});changes.get(id)[field]=value;}
  for(const [id,label] of materials){const inputs=[...document.querySelectorAll('input[data-material]')].filter(i=>i.dataset.material===id), old=infos[id];
    const changed=inputs.some(i=>i.value!==String(old?.[i.dataset.field]??''));if(!changed)continue;
    for(const input of inputs){if(input.value==='')throw Error(label+'的数量和累计记录都需要填写');const n=integer(input.value,0,2147483647,label+input.parentElement.textContent);if(n!==old?.[input.dataset.field])set(id,input.dataset.field,n);}
  }
  for(const input of document.querySelectorAll('input[data-flower]:checked')){const flower=largeFlowers.find(f=>f.id===input.dataset.flower);if(!flower)throw Error('记忆之花记录不正确');for(const id of [flower.id,...flower.petals]){const old=infos[id];if(!(Number(old?.CurrentAmount)>0))set(id,'CurrentAmount',1);if(!(Number(old?.MaxAmount)>0))set(id,'MaxAmount',1);}}
  if(!changes.size)return raw;
  const time=original.PBZGameSystem?.DateTimeString;if(typeof time!=='string'||!/^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$/.test(time))throw Error('无法确定存档时间，不能新增收集记录');
  const cycle=original.PBZGameSystem?.CycleCount;if(!Number.isSafeInteger(cycle)||cycle<0)throw Error('无法确定存档轮回，不能新增收集记录');
  return withObject(raw,'Inventory',invText=>withObject(invText,'InventoryInfos',segment=>{
    for(const [id,fields] of changes){if(infos[id]){segment=withObject(segment,id,obj=>{for(const [field,value] of Object.entries(fields))obj=setInteger(obj,field,value,infos[id][field]===undefined);return obj;});}
      else{const item={CurrentAmount:fields.CurrentAmount??1,MaxAmount:fields.MaxAmount??1,FirstAddTime:time,DirtyTime:time,AcquiredCycle:id.startsWith('Item_')?cycle:0};const trimmed=segment.trimEnd(),suffix=segment.slice(trimmed.length);segment=trimmed.slice(0,-1)+(trimmed.trim()==='{}'?'':',')+JSON.stringify(id)+':'+JSON.stringify(item)+'}'+suffix;}
    }return segment;
  }));
}
async function build(){const raw=makeEdits();if(raw===state.raw)throw Error('没有需要导出的修改');const target=state.entries.find(e=>e.name===state.current),encoded=te.encode(raw),block=await encrypt(blockStored(encoded),state.k),dir=state.dir.slice(),blocks=[];let offset=0;for(const e of state.entries){const b=e.name===target.name?block:state.data.slice(state.base+e.off,state.base+e.off+e.len);set32(dir,e.pos+6,offset);if(e.name===target.name){dir[e.pos]=2;set32(dir,e.pos+2,encoded.length);set32(dir,e.pos+10,b.length);}blocks.push(b);offset+=b.length;}const result=join(state.data.slice(0,12),await encrypt(dir,state.k),...blocks);const verifiedDir=await decrypt(result.slice(12,state.base),state.k),verified=parseDirectory(verifiedDir,result.length,state.base,state.entries.length,result.slice(0,12));if(await decodeSlot(result,verified.find(e=>e.name===target.name),state.k)!==raw)throw Error('导出校验失败');for(const e of state.entries){if(e.name===target.name)continue;const v=verified.find(x=>x.name===e.name);if(!equal(result.slice(state.base+v.off,state.base+v.off+v.len),state.data.slice(state.base+e.off,state.base+e.off+e.len)))throw Error('其他槽位校验失败');}return result;}
$('file').addEventListener('change',async e=>{try{message('正在读取存档…');$('editor').hidden=true;await openFile(e.target.files[0]);}catch(err){state=null;message(err.message||'读取失败',true);}});
$('drop').addEventListener('dragover',e=>e.preventDefault());$('drop').addEventListener('drop',async e=>{e.preventDefault();try{message('正在读取存档…');$('editor').hidden=true;await openFile(e.dataTransfer.files[0]);}catch(err){state=null;message(err.message||'读取失败',true);}});
$('slot').addEventListener('change',async e=>{try{if(makeEdits()!==state.raw&&!confirm('切换槽位会放弃当前未导出的修改，是否继续？')){e.target.value=state.current;return;}await selectSlot(e.target.value);message('已切换存档槽位');}catch(err){e.target.value=state.current;message(err.message,true);}});
$('search').addEventListener('input',filterWeapons);
$('accessory-search').addEventListener('input',filterAccessories);
$('accessory-list').addEventListener('input',event=>{const input=event.target;if(!input.matches('input[data-accessory]'))return;const old=state.saved.Inventory.AccessoryInfos?.[input.dataset.accessory]?.CurrentLevel;const valid=input.value===String(old)||(/^\d+$/.test(input.value)&&Number(input.value)>=0&&Number(input.value)<=8);input.setAttribute('aria-invalid',String(!valid));input.setCustomValidity(valid?'':'请输入 0–8 的整数');});
function validateLevel(input) {
  const isWeapon = Boolean(input.dataset.group);
  const min = isWeapon ? 1 : 0;
  const max = isWeapon ? 60 : 30;
  const original = isWeapon
    ? state.saved.Inventory[input.dataset.group]?.[input.dataset.id]?.[input.dataset.field]
    : state.saved.AbilityNode_RenewalHun?.AbilityNodes?.[input.dataset.ability];
  const unchanged = original !== undefined && input.value === String(original);
  const optional = original === undefined && input.value === '';
  const valid = unchanged || optional || (/^\d+$/.test(input.value) && Number(input.value) >= min && Number(input.value) <= max);
  input.setAttribute('aria-invalid', String(!valid));
  input.setCustomValidity(valid ? '' : '请输入 ' + min + '–' + max + ' 的整数');
}
for (const container of [$('weapon-list'), $('ability-list')]) {
  container.addEventListener('input', event => {
    if (event.target.matches('input[data-group], input[data-ability]')) {
      validateLevel(event.target);
    }
  });
}
$('raise').addEventListener('click',()=>{for(const input of document.querySelectorAll('input[data-group]')){if(input.value===''||Number(input.value)<30)input.value=30;validateLevel(input);}message('已将低于 30 级及未记录等级的武器设为 30 级');});
for(const tab of document.querySelectorAll('.tab'))tab.addEventListener('click',()=>{for(const t of document.querySelectorAll('.tab')){const selected=t===tab;t.classList.toggle('active',selected);t.setAttribute('aria-selected',String(selected));$(t.dataset.tab).hidden=!selected;}});
$('download').addEventListener('click',async()=>{const button=$('download');button.disabled=true;try{message('正在生成并校验存档…');const bytes=await build(),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='PBZSaveGame.sav';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);message('修改版已生成并通过回读校验');}catch(err){message(err.message||'导出失败',true);}finally{button.disabled=false;}});

