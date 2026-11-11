// GlobalAz server v3 (Taobao ilə bire-bir: variant qiymətləri, stok, brend): mağaza + admin panel + kataloq + sifarişlər (addım tarixçəsi, Taobao agent). İşə salmaq: npm install && npm start
const fs=require('fs'),path=require('path'),crypto=require('crypto'),express=require('express');
try{for(const l of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
const E=process.env,PORT=E.PORT||3000,PASS=E.ADMIN_PASSWORD||'admin123';
const cfg={rate:+E.CNY_AZN||0.24,usd:1.7,margin:E.MARGIN?+E.MARGIN:12,cargo:E.CARGO_PER_KG?+E.CARGO_PER_KG:6,cust:E.CUSTOMS?+E.CUSTOMS:5,ship:0,wa:E.WHATSAPP||'994500000000'};
const F=path.join(__dirname,'data','db.json');fs.mkdirSync(path.dirname(F),{recursive:true});
let db={products:[],orders:[]};try{db=JSON.parse(fs.readFileSync(F,'utf8'))}catch{}
const save=()=>fs.writeFileSync(F,JSON.stringify(db,null,1));
const uid=()=>crypto.randomBytes(5).toString('hex'),s=(x,n=200)=>String(x==null?'':x).slice(0,n);
db.settings=db.settings||{};if(!db.secret){db.secret=crypto.randomBytes(24).toString('hex');save()}
const sig=e=>crypto.createHmac('sha256',db.secret).update(String(e)).digest('hex').slice(0,32);
const mk=()=>{const e=Date.now()+6048e5;return e+'.'+sig(e)};
const okTok=t=>{const[a,b]=String(t||'').split('.');return +a>Date.now()&&b===sig(a)};
const auth=(q,r,n)=>okTok(q.get('x-token'))?n():r.status(401).json({error:'Giriş tələb olunur'});
const pcfg=()=>({...cfg,...Object.fromEntries(Object.entries(db.settings).filter(([k])=>k in cfg))});
const up=p=>{const c=pcfg();return p.pr>0?p.pr:((p.cny*c.rate)*(1+c.margin/100)+p.kg*c.cargo)*(1+c.cust/100)};
// Seçilmiş variantın qiyməti: variantın öz qiyməti (₼) > məhsulun sabit qiyməti (₼) > variantın ¥ qiymətindən hesablama
const skuOf=(p,i)=>Array.isArray(p.skus)&&Number.isInteger(i)&&i>=0?p.skus[i]:null;
const upS=(p,sk)=>sk?(sk.pr>0?sk.pr:p.pr>0?p.pr:up({...p,pr:0,cny:sk.cny})):up(p);
const H=x=>crypto.createHash('sha256').update(String(x)).digest('hex'),fails={};
const DEFCATS=[['Qadın geyimləri','women'],['Kişi geyimləri','men'],['Ayaqqabı','shoe'],['Çanta və aksesuar','bag'],['Gözəllik və baxım','beauty'],['Telefon və rəqəmsal','phone'],['Məişət texnikası','appliance'],['Ev və dekor','home'],['Mətbəx','kitchen'],['Ana və uşaq','baby'],['Oyuncaqlar','toy'],['İdman və turizm','sport'],['Avto məhsulları','car'],['Zinət və saatlar','jewel'],['Ev heyvanları','pet'],['Kitab və hobbi','book'],['Digər','other']].map(([name,icon],i)=>({id:'c'+(i+1),name,icon}));
const cats=()=>Array.isArray(db.cats)&&db.cats.length?db.cats:DEFCATS;
const hist=(o,k,v,n)=>{(o.hist=o.hist||[]).push({t:new Date().toISOString(),k,v:s(v,80),n:s(n||'',200)})};
const app=express();app.use(express.json({limit:'1mb'}));

// ---- Google (Firebase) giriş: token yoxlanışı (əlavə paket lazım deyil) ----
const FB_KEY=E.FIREBASE_API_KEY||'AIzaSyArQxfkmpcVNs_6uV-6q3EZqWh6KTd9g78',gcache=new Map();
async function gUser(req){
 const t=String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(t.length<100||t.length>4000)return null;
 const c=gcache.get(t);if(c&&c.exp>Date.now())return c.u;
 try{const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+FB_KEY,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:t}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;const u=((await r.json()).users||[])[0];if(!u||!u.email)return null;
  const x={uid:u.localId,email:u.email,name:u.displayName||''};gcache.set(t,{u:x,exp:Date.now()+3e5});if(gcache.size>500)gcache.clear();return x}catch{return null}}

// Taobao/1688 linkini qısa təmiz formaya salır
function canon(u){const m=String(u||'').match(/https?:\/\/[^\s"'<>]+/);if(!m)return'';u=m[0];
 const id=(u.match(/[?&](?:id|offerId)=(\d{6,})/)||u.match(/offer\/(\d{6,})/)||[])[1];
 if(id&&/1688\.com/.test(u))return`https://detail.1688.com/offer/${id}.html`;
 if(id&&/(taobao|tmall)\.com/.test(u))return`https://item.taobao.com/item.htm?id=${id}`;return u}
async function lookup(link){
 const r=await fetch(link,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148','accept-language':'zh-CN,zh;q=0.9'}});
 const h=await r.text(),meta=p=>{const a=h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)`,'i'))||h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`,'i'));return a?a[1]:''};
 const title=(meta('og:title')||(h.match(/<title>([^<]*)/i)||[])[1]||'').trim();
 let img=meta('og:image')||(h.match(/"(?:pic|image|mainPic|picUrl)"\s*:\s*"((?:https?:)?\/\/[^"]+)"/)||[])[1]||'';if(img.startsWith('//'))img='https:'+img;
 const cny=+(meta('og:product:price:amount')||(h.match(/"(?:price|priceText|minPrice)"\s*:\s*"?(\d+(?:\.\d+)?)/)||[])[1]||0);
 return{link:canon(r.url)||link,title,img,cny,blocked:!title||/登录|验证|login|captcha|^(淘宝网|天猫|阿里巴巴)$/i.test(title+' '+r.url)}}
async function tr(t,from='auto',to='az'){
 const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl='+from+'&tl='+to+'&q='+encodeURIComponent(t.slice(0,1500)),{signal:AbortSignal.timeout(10000)});
 return(await r.json())[0].map(x=>x[0]).join('')}

// ---- Taobao məhsul məlumatı: Apify ----
const itemId=l=>(String(l).match(/[?&](?:id|offerId)=(\d{6,})/)||String(l).match(/offer\/(\d{6,})/)||[])[1]||'';
const fixU=u=>{u=String(u||'').trim();return u.startsWith('//')?'https:'+u:u};
const num=v=>{const m=String(v==null?'':v).replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?+m[0]:0};
const cnt=v=>{const t=String(v==null?'':v);let n=num(t);if(/万|w/i.test(t))n*=1e4;else if(/千|k/i.test(t))n*=1e3;return Math.round(n)};
const CJK=/[\u4e00-\u9fff]/;
const SKU_PRICE=['cnyPrice','promotionPrice','promotion_price','salePrice','sale_price','priceCny','price','discountPrice'];
const SKU_ORIG=['originalPrice','original_price','orginal_price','orgPrice','marketPrice','reservePrice'];
const SKU_STOCK=['quantity','stock','inventory','stockQuantity','amountOnSale','canBookCount','available'];
const SKU_IMG=['imageUrl','image','imgUrl','img','picUrl','pic','pic_url'];
function dig(o,keys){const q=[o];let n=0;while(q.length&&n++<5000){const x=q.shift();if(x&&typeof x==='object'){if(!Array.isArray(x))for(const k of keys){if(x[k]!=null&&x[k]!==''&&typeof x[k]!=='object')return x[k]}for(const v of Object.values(x))if(v&&typeof v==='object')q.push(v)}}}
function digArr(o,keys){const q=[o];let n=0;while(q.length&&n++<5000){const x=q.shift();if(x&&typeof x==='object'){if(!Array.isArray(x))for(const k of keys){if(Array.isArray(x[k])&&x[k].length)return x[k]}for(const v of Object.values(x))if(v&&typeof v==='object')q.push(v)}}}
const pick1=(o,ks)=>{for(const k of ks)if(o&&o[k]!=null&&typeof o[k]!=='object'&&o[k]!=='')return o[k]};
// Bəzi Actor-lar variantı "propsNames: '颜色分类:黑色;尺码:S'" və ya "propsIds + propsList" kimi verir — vahid "properties" formasına salırıq
function normSkus(j){const sk=digArr(j,['skus','skuList','sku_list'])||[];if(!sk.length)return;
 const pl=(j&&(j.propsList||j.props_list_map))||{},pim=(j&&(j.propsImages||j.props_images))||{};
 const plGet=id=>Array.isArray(pl)?((pl.find(x=>x&&String(x.id||x.propsId||x.key)===id)||{}).name||''):(pl[id]||'');
 for(const k of sk){if(!k||typeof k!=='object'||Array.isArray(k.properties))continue;const props=[];
  const ids=String(k.propsIds||k.propPath||k.prop_path||'').split(';').filter(Boolean);
  const names=Array.isArray(k.propsNames)?k.propsNames:String(k.propsNames||k.propsName||k.skuName||'').split(';').filter(Boolean);
  const n=Math.max(ids.length,names.length);
  for(let i=0;i<n;i++){let lab=String(names[i]||plGet(ids[i])||'');let nm='',vl=lab;const c=lab.search(/[:：]/);if(c>0){nm=lab.slice(0,c);vl=lab.slice(c+1)}
   if(!nm){const pid=(ids[i]||'').split(':')[0];nm=pid?'Variant '+(i+1):''}
   if(nm&&vl)props.push({name:nm.trim(),value:vl.trim(),imageUrl:fixU(pim[ids[i]]||'')})}
  if(props.length)k.properties=props;
  if(k.quantity==null&&k.stock==null&&k.inventory!=null)k.quantity=k.inventory}}
function parseItem(j){
 normSkus(j);
 const cjk=/[\u4e00-\u9fff]/;
 const names=[dig(j,['nameTrans']),dig(j,['name','title','item_title','subject'])].map(x=>String(x==null?'':x).trim()).filter(Boolean);
 const title=s(names.find(x=>cjk.test(x))||names[0]||'',300);
 const skus=digArr(j,['skus'])||[];
 const sp=skus.map(x=>num(x&&x.cnyPrice)).filter(x=>x>0);
 const top=num(dig(j,['cnyPrice','priceCny','priceCNY','promotion_price','price','sale_price','min_price','orginal_price','original_price','reserve_price']));
 const cny=sp.length?Math.min(...sp):top,cnyMax=sp.length?Math.max(...sp):cny;
 const ia=digArr(j,['item_imgs','main_imgs','images','imageUrls','pictures','pics','pic_urls','imgs','image_list'])||[];
 let imgs=ia.map(x=>fixU(typeof x==='string'?x:pick1(x,['url','img','pic_url','image']))).filter(Boolean);
 const img=fixU(dig(j,['coverImage','mainPictureUrl','mainImage','pic_url','main_img','image','img','pic']))||imgs[0]||'';
 imgs=[...new Set(imgs)].filter(u=>u!==img).slice(0,12);
 let desc=s(String(dig(j,['desc_short','description','desc'])||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),600);
 // (xüsusiyyətlər ayrıca cədvəldə göstərilir, təsvirə təkrar yazılmır)
 // Variantlar: hər qrupun dəyərləri + hər kombinasiyanın (SKU) öz qiyməti, stoku, şəkli
 let opts=[],sk=[];
 const stockOf=k=>{const v=pick1(k,SKU_STOCK);if(v==null||v==='')return -1;if(v===true)return 999;if(v===false)return 0;return cnt(v)};
 if(skus.length){const m=new Map(),vim=new Map();
  const propsOf=k=>((k&&(k.properties||k.props||k.attributes||k.specs))||[]).map(p=>({n:s(p&&(p.displayName||p.name||p.propName||p.attributeName),30).replace(/[:：]/g,' ').trim(),v:s(p&&(p.displayValue||p.value||p.valueName||p.propValue),80).replace(/[,，、]/g,' ').trim(),i:fixU(pick1(p,SKU_IMG))})).filter(x=>x.n&&x.v);
  for(const k of skus)for(const p of propsOf(k)){if(!m.has(p.n))m.set(p.n,[]);const x=m.get(p.n);if(!x.includes(p.v))x.push(p.v);
   const pi=p.i||fixU(pick1(k,SKU_IMG));if(pi&&!/size|尺|码|尺寸/i.test(p.n)){const K=p.n+'\u0001'+p.v;if(!vim.has(K))vim.set(K,pi)}}
  const groups=[...m].slice(0,5).map(([n,v])=>[n,v.slice(0,30)]);
  opts=groups.map(([n,v])=>({n,v,vi:v.map(x=>vim.get(n+'\u0001'+x)||''),nz:n,vz:[...v]}));
  for(const k of skus){const pr=propsOf(k);const idx=groups.map(([n,v])=>{const f=pr.find(x=>x.n===n);return f?v.indexOf(f.v):-1});
   if(idx.some(x=>x<0)&&groups.length)continue;
   const c=num(pick1(k,SKU_PRICE));if(!(c>0))continue;
   sk.push({k:idx,cny:c,o:num(pick1(k,SKU_ORIG))||0,st:stockOf(k),img:fixU(pick1(k,SKU_IMG))})}}
 else{const sb=digArr(j,['sku_base','skuBase','skuList','sku_list'])||[],oa=digArr(j,['sku_props','skuProps','props_list','props'])||[];
  const g2=oa.slice(0,5).map(o=>{const n=s(pick1(o,['name','prop_name','propName','title']),30);
   const va=Array.isArray(o&&o.values)?o.values:Array.isArray(o&&o.value)?o.value:Array.isArray(o&&o.props)?o.props:[];
   const vals=va.slice(0,30).map(x=>({v:s(typeof x==='string'?x:pick1(x,['name','value','valueName','text']),80),id:String(typeof x==='object'&&x?pick1(x,['vid','valueId','id'])||'':''),i:typeof x==='object'?fixU(pick1(x,SKU_IMG)):''})).filter(x=>x.v);
   return{n,pid:String(pick1(o,['pid','propId','id'])||''),vals}}).filter(o=>o.n&&o.vals.length);
  opts=g2.map(o=>({n:o.n,v:o.vals.map(x=>x.v),vi:o.vals.map(x=>x.i||''),nz:o.n,vz:o.vals.map(x=>x.v)}));
  for(const k of sb){const path=String(pick1(k,['propPath','prop_path','properties','skuPath'])||'');if(!path)continue;
   const pairs=path.split(';').map(x=>x.split(':'));
   const idx=g2.map(o=>{const f=pairs.find(([a,b])=>(!o.pid||a===o.pid)&&o.vals.some(x=>x.id===b));return f?o.vals.findIndex(x=>x.id===f[1]):-1});
   if(idx.some(x=>x<0))continue;const c=num(pick1(k,SKU_PRICE));if(!(c>0))continue;
   sk.push({k:idx,cny:c,o:num(pick1(k,SKU_ORIG))||0,st:stockOf(k),img:''})}}
 sk=sk.slice(0,400);
 // əlavə: xüsusiyyətlər, satıcı, video, ətraflı şəkillər
 const attrs=[],seen2=new Set();for(const a of(digArr(j,['productAttrs','attributes','props_list_attrs','specs'])||[])){const n=s(a&&(a.attributeName||a.name||a.key),40),v=s(a&&(a.value||a.val),120),k=n+'|'+v;if(!n||!v||/color classification|颜色分类|尺码|尺寸/i.test(n)||seen2.has(k))continue;seen2.add(k);attrs.push({n,v})}
 const shop=s(dig(j,['shopName','shop_name','sellerNick','seller_nick','storeName','seller']),80);
 let brand=s(dig(j,['brand','brandName','brand_name']),60);
 if(!brand){const b=attrs.find(a=>/品牌|brand|marka/i.test(a.n));if(b)brand=s(b.v,60)}
 const sold=cnt(dig(j,['sold','soldCount','sales','totalSold','sellCount','vagueSellCount','monthSales','month_sales','salesVolume','soldQuantity']));
 const spO=sk.map(x=>x.o).filter(x=>x>0);
 const cnyOrig=spO.length?Math.min(...spO):num(dig(j,['originalPrice','original_price','orginal_price','reserve_price','marketPrice']));
 const vd=fixU(dig(j,['video','videoUrl','video_url','mainVideo']));const video=/^https:\/\//.test(vd)?s(vd,500):'';
 const da=digArr(j,['desc_imgs','detail_images','detailImages','descImages','description_images','descriptionImages','descImgs'])||[];
 let dimgs=[...new Set(da.map(x=>fixU(typeof x==='string'?x:pick1(x,['url','img','src']))).filter(u=>/^https:\/\//.test(u)))].slice(0,20);
 // Bəzi Actor-lar ətraflı şəkilləri "description" HTML-in içində verir — oradan çıxarırıq
 if(!dimgs.length){const dh=String(dig(j,['description','desc','descHtml','detailHtml'])||'');const L=[];dh.replace(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi,(_,u)=>{u=fixU(u);if(/^https:\/\//.test(u))L.push(u);return''});dimgs=[...new Set(L)].slice(0,20)}
 const skMin=sk.length?Math.min(...sk.map(x=>x.cny)):0,skMax=sk.length?Math.max(...sk.map(x=>x.cny)):0;
 return{title,img,imgs,cny:skMin||cny,cnyMax:skMax||cnyMax,cnyOrig:cnyOrig>(skMin||cny)?cnyOrig:0,desc,opts,skus:sk,brand,sold,attrs:attrs.slice(0,40),shop,video,dimgs}}
// ---- Apify: token yalnız .env faylında (APIFY_TOKEN) ----
const AK=E.APIFY_TOKEN||'',AA=(E.APIFY_ACTOR||'khadinakbar~taobao-product-detail-scraper').replace('/','~');
// Əsas Actor çöksə, avtomatik ehtiyat Actor işə düşür (.env: APIFY_ACTOR2; "-" yazsanız söndürülür)
const AA2=(E.APIFY_ACTOR2||'zen-studio~taobao-detail-scraper').replace('/','~');
// Hər Actor linki fərqli sahə adı ilə qəbul edir
function actInput(actor,link){
 if(E.APIFY_INPUT_KEY)return{[E.APIFY_INPUT_KEY]:[link]};
 if(/zen-studio/.test(actor))return{items:[link],fetchReviews:false};
 if(/memo23|jakvbs|logiover|scrapesage/.test(actor))return{startUrls:[link],maxItems:1};
 if(/h1018y|pizani|mlg14/.test(actor))return{urls:[link],productUrls:[link]};
 return{productUrls:[link],maxItems:1}}
async function apifyRun(actor,link){
 const r=await fetch('https://api.apify.com/v2/acts/'+actor+'/run-sync-get-dataset-items?timeout=120',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+AK},body:JSON.stringify(actInput(actor,link)),signal:AbortSignal.timeout(130000)});
 const txt=await r.text();let j=[];try{j=JSON.parse(txt)}catch{}
 if(!r.ok){const m=(j&&j.error&&(j.error.message||j.error.type))||s(txt,150);const run=(String(m).match(/run ID:\s*(\w+)/)||[])[1];
  throw new Error(actor+' → '+r.status+': '+s(m,160)+(run?' | jurnal: https://console.apify.com/actors/runs/'+run:''))}
 if(!Array.isArray(j)||!j[0])throw new Error(actor+' → boş nəticə');
 const x=j[0];if(x&&(x.error||x.errorMessage)&&!x.title&&!x.skus)throw new Error(actor+' → '+s(x.error||x.errorMessage,150));
 return x}
async function apifyRaw(link){
 if(!AK)throw new Error('Apify qoşulmayıb (.env: APIFY_TOKEN)');
 const list=[AA,...(AA2&&AA2!=='-'&&AA2!==AA?[AA2]:[])],errs=[];
 for(const a of list){try{const x=await apifyRun(a,link);x.__actor=a;return x}catch(e){errs.push(e.message);console.error('Apify:',e.message)}}
 throw new Error(errs.join(' || '))}
const rawAny=link=>apifyRaw(link);
async function trOpts(opts){if(!opts.length)return opts;
 try{const L=[];opts.forEach(o=>{L.push(o.n,...o.v)});if(L.join('\n').length>1400)return opts;
  const t=(await tr(L.join('\n'))).split('\n');if(t.length!==L.length)return opts;
  let i=0;const T=(orig,lim,re)=>{const x=t[i++];return CJK.test(orig)?s(String(x||'').replace(re,' ').trim()||orig,lim):orig};return opts.map(o=>({n:T(o.n,30,/[:：]/g),v:o.v.map(x=>T(x,80,/[,，、]/g)),vi:o.vi||[],nz:o.nz||o.n,vz:o.vz||o.v}))}catch{return opts}}
async function trAttrs(a){if(!a.length)return a;try{const L=[];a.forEach(x=>{L.push(x.n,x.v)});const out=[];for(let i=0;i<L.length;){let j=i,len=0;while(j<L.length&&len+L[j].length<1300){len+=L[j].length+1;j++}if(j===i)j=i+1;const t=(await tr(L.slice(i,j).join('\n'))).split('\n');if(t.length!==j-i)return a;out.push(...t);i=j}return a.map((x,k)=>({n:s(out[2*k]||x.n,40),v:s(out[2*k+1]||x.v,120)}))}catch{return a}}

// ---- Mağaza (açıq): src = gizli məhsul ID, Taobao linki müştəriyə göstərilmir ----
app.get('/api/products',(q,r)=>r.json({cfg:pcfg(),cats:cats(),list:db.products.map(p=>({n:p.az||p.zh,c:p.c,img:p.img,imgs:p.imgs||[],desc:p.desc||'',opts:(p.opts||[]).map(o=>({n:o.n,v:o.v,vi:o.vi||[]})),skus:(p.skus||[]).map(x=>({k:x.k,cny:x.cny,o:x.o||0,st:x.st==null?-1:x.st,img:x.img||'',pr:x.pr||0})),brand:p.brand||'',sold:p.sold||0,cnyOrig:p.cnyOrig||0,attrs:p.attrs||[],video:p.video||'',dimgs:p.dimgs||[],cny:p.cny,pr:p.pr,kg:p.kg,src:p.id,from:'ga',t:p.t||0}))}));
app.post('/api/orders',async(q,r)=>{const b=q.body||{};const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Əvvəlcə Google ilə daxil olun'});
 if(!s(b.name)||!s(b.phone)||!s(b.address)||!Array.isArray(b.items)||!b.items.length)return r.status(400).json({error:'Məlumat çatışmır'});
 const items=b.items.slice(0,50).map(i=>{const p=db.products.find(x=>x.id===i.src)||{};const sk=p.id?skuOf(p,+i.sk):null;
  const optZh=sk&&Array.isArray(p.opts)?sk.k.map((v,g)=>{const o=p.opts[g];return o?(o.nz||o.n)+': '+((o.vz||o.v)[v]||o.v[v]||''):''}).filter(Boolean).join('; '):'';
  return{n:s(i.n),q:Math.max(1,+i.q|0),u:p.id?+upS(p,sk).toFixed(2):(+i.u||0),opt:s(i.opt,150),optZh:s(optZh,200),sk:sk?+i.sk:-1,link:p.link||'',zh:p.zh||'',img:s(i.img,500)||p.img||'',shop:p.shop||'',cny:sk?sk.cny:(p.cny||0),kg:p.kg||0}});
 const total=+items.reduce((a,i)=>a+i.u*i.q,0).toFixed(2);
 const o={id:uid(),uid:gu.uid,email:gu.email,gname:gu.name,no:s(b.no,30),date:new Date().toISOString(),name:s(b.name),phone:s(b.phone,40),city:s(b.city,80),address:s(b.address,300),cnote:s(b.cnote,300),items,total,status:'new',pay:'none',track:'',note:'',cost:0,taobaoNo:'',agentSent:false,hist:[]};
 hist(o,'status','new','Müştəri sifariş verdi');db.orders.unshift(o);save();
 r.json({ok:true,no:o.no})});
app.get('/api/my-orders',async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Giriş tələb olunur'});
 r.json({list:db.orders.filter(o=>o.uid===gu.uid).slice(0,50).map(o=>({no:o.no,date:o.date,total:o.total,status:o.status,pay:o.pay,track:o.track,steps:(o.hist||[]).filter(h=>h.k==='status').map(h=>({t:h.t,v:h.v})),items:o.items.map(i=>i.n+(i.opt?' ('+i.opt+')':'')+' × '+i.q)}))})});
app.get('/api/track/:no',(q,r)=>{const o=db.orders.find(x=>x.no===q.params.no);if(!o)return r.status(404).json({error:'Tapılmadı'});r.json({status:o.status,pay:o.pay,track:o.track})});

// ---- Admin ----
app.post('/api/login',(q,r)=>{const f=fails[q.ip]||{n:0,t:0};if(f.n>=5&&Date.now()-f.t<9e5)return r.status(429).json({error:'Çox cəhd. 15 dəqiqə sonra yenidən yoxlayın'});
 const a=Buffer.from(H(q.body&&q.body.password)),b=Buffer.from(db.pass||H(PASS));
 if(!crypto.timingSafeEqual(a,b)){fails[q.ip]={n:f.n+1,t:Date.now()};return r.status(401).json({error:'Parol səhvdir'})}
 delete fails[q.ip];r.json({token:mk()})});
app.get('/api/orders',auth,(q,r)=>r.json({list:db.orders}));
app.patch('/api/orders/:id',auth,(q,r)=>{const o=db.orders.find(x=>x.id===q.params.id);if(!o)return r.status(404).json({error:'Tapılmadı'});const b=q.body||{};
 if(b.status!=null&&s(b.status,20)!==o.status){o.status=s(b.status,20);hist(o,'status',o.status,b.hn)}
 if(b.pay!=null&&s(b.pay,10)!==(o.pay||'none')){o.pay=s(b.pay,10);hist(o,'pay',o.pay)}
 if(b.track!=null&&s(b.track,80)!==(o.track||'')){o.track=s(b.track,80);hist(o,'track',o.track)}
 if(b.taobaoNo!=null&&s(b.taobaoNo,60)!==(o.taobaoNo||'')){o.taobaoNo=s(b.taobaoNo,60);hist(o,'taobao',o.taobaoNo,'Taobao sifariş nömrəsi')}
 if(b.agentSent===true&&!o.agentSent){o.agentSent=true;hist(o,'agent','sent','Sifariş Taobao agentinə göndərildi')}
 if(b.note!=null)o.note=s(b.note,300);if(b.cost!=null)o.cost=+b.cost||0;save();r.json({ok:true,order:o})});
app.get('/api/admin/products',auth,(q,r)=>r.json({list:db.products}));
const clean=b=>({link:canon(b.link),zh:s(b.zh,300),az:s(b.az,300),c:s(b.c,40)||'Digər',img:s(b.img,500),cny:+b.cny||0,kg:+b.kg||0.5,pr:+b.pr||0,desc:s(b.desc,2000),
 imgs:(Array.isArray(b.imgs)?b.imgs:[]).map(x=>s(x,500)).filter(Boolean).slice(0,12),
 opts:(Array.isArray(b.opts)?b.opts:[]).slice(0,6).map(o=>{const v=[],vi=[],vz=[];(Array.isArray(o.v)?o.v:[]).slice(0,40).forEach((x,i)=>{const t=s(x,80).trim();if(t){v.push(t);vi.push(s((o.vi||[])[i],500));vz.push(s((o.vz||[])[i],80))}});return{n:s(o.n,30),v,vi,nz:s(o.nz,30),vz}}).filter(o=>o.n&&o.v.length),
 attrs:(Array.isArray(b.attrs)?b.attrs:[]).slice(0,40).map(a=>({n:s(a&&a.n,40).trim(),v:s(a&&a.v,160).trim()})).filter(a=>a.n&&a.v),
 shop:s(b.shop,80),brand:s(b.brand,60).trim(),sold:Math.max(0,+b.sold|0),cnyOrig:+b.cnyOrig||0,t:+b.t||Date.now(),
 skus:(Array.isArray(b.skus)?b.skus:[]).slice(0,400).map(x=>({k:(Array.isArray(x&&x.k)?x.k:[]).slice(0,6).map(v=>v|0),cny:+(x&&x.cny)||0,o:+(x&&x.o)||0,st:x&&x.st!=null&&x.st!==''?(+x.st|0):-1,img:s(x&&x.img,500),pr:+(x&&x.pr)||0})).filter(x=>x.cny>0||x.pr>0),
 video:/^https:\/\//.test(String(b.video||''))?s(b.video,500):'',
 dimgs:(Array.isArray(b.dimgs)?b.dimgs:[]).map(x=>s(x,500)).filter(x=>/^https:\/\//.test(x)).slice(0,20)});
app.post('/api/admin/products',auth,(q,r)=>{const p={id:uid(),...clean(q.body)};db.products.unshift(p);save();r.json(p)});
app.put('/api/admin/products/:id',auth,(q,r)=>{const i=db.products.findIndex(x=>x.id===q.params.id);if(i<0)return r.status(404).json({error:'Tapılmadı'});db.products[i]={id:q.params.id,...clean(q.body)};save();r.json(db.products[i])});
app.delete('/api/admin/products/:id',auth,(q,r)=>{db.products=db.products.filter(x=>x.id!==q.params.id);save();r.json({ok:true})});
app.post('/api/fetch',auth,async(q,r)=>{const link=canon(q.body&&q.body.url);if(!link)return r.status(400).json({error:'Düzgün link daxil edin'});
 let out=null,apiError='';
 try{const raw=await rawAny(link);const p=parseItem(raw);if(p.title)out={...p,link,via:'api',actor:raw.__actor||AA}}catch(e){apiError=e.message}
 if(out){try{if(out.desc)out.desc=await tr(out.desc)}catch{}out.opts=await trOpts(out.opts);out.attrs=await trAttrs(out.attrs||[]);if(out.shop&&/[\u4e00-\u9fff]/.test(out.shop)){try{out.shop=await tr(out.shop)}catch{}}if(out.brand&&CJK.test(out.brand)){try{out.brand=s(await tr(out.brand),60)}catch{}}return r.json(out)}
 try{r.json({...await lookup(link),via:'page',apiError})}catch(e){r.json({link,title:'',img:'',cny:0,blocked:true,via:'page',apiError})}});
app.post('/api/admin/taobao-test',auth,async(q,r)=>{const link=canon(q.body&&q.body.url);if(!link)return r.status(400).json({error:'Düzgün link daxil edin'});
 const o={configured:!!AK,actor:AA,id:itemId(link)};
 try{const j=await rawAny(link);o.actor=j.__actor||AA;o.parsed=parseItem(j);o.raw=s(JSON.stringify(j),6000)}catch(e){o.error=e.message}r.json(o)});
app.post('/api/translate',auth,async(q,r)=>{try{r.json({text:await tr(s(q.body&&q.body.text,1500))})}catch(e){r.status(502).json({error:'Tərcümə alınmadı'})}});

app.get('/api/admin/catalog',auth,(q,r)=>r.json({list:cats(),counts:Object.fromEntries(cats().map(c=>[c.name,db.products.filter(p=>p.c===c.name).length]))}));
app.put('/api/admin/catalog',auth,(q,r)=>{const old=cats();let L=(Array.isArray(q.body&&q.body.list)?q.body.list:[]).slice(0,60).map(c=>({id:s(c&&c.id,20)||'c'+uid(),name:s(c&&c.name,40).trim(),icon:s(c&&c.icon,20)||'other'})).filter(c=>c.name);
 const seen=new Set();L=L.filter(c=>!seen.has(c.name.toLowerCase())&&seen.add(c.name.toLowerCase()));
 if(!L.some(c=>c.name==='Digər'))L.push({id:'c'+uid(),name:'Digər',icon:'other'});
 for(const c of L){const o=old.find(x=>x.id===c.id);if(o&&o.name!==c.name)db.products.forEach(p=>{if(p.c===o.name)p.c=c.name})}
 const names=new Set(L.map(c=>c.name));db.products.forEach(p=>{if(!names.has(p.c))p.c='Digər'});
 db.cats=L;save();r.json({ok:true,list:L})});
app.get('/api/admin/settings',auth,(q,r)=>r.json({...pcfg(),wh:db.settings.wh||'',agent:db.settings.agent||''}));
app.put('/api/admin/settings',auth,(q,r)=>{const b=q.body||{};for(const k of['rate','margin','cargo','cust']){if(b[k]!==''&&b[k]!=null&&isFinite(+b[k]))db.settings[k]=+b[k]}
 for(const k of['wa','agent'])if(b[k]!=null)db.settings[k]=s(b[k],120).trim();if(b.wh!=null)db.settings.wh=s(b.wh,500).trim();save();r.json({ok:true})});
app.post('/api/admin/password',auth,(q,r)=>{const p=s(q.body&&q.body.password,100);if(p.length<6)return r.status(400).json({error:'Parol ən azı 6 simvol olmalıdır'});db.pass=H(p);save();r.json({ok:true})});
const PUB=path.join(__dirname,'public');
const page=n=>{for(const d of[PUB,__dirname]){try{const L=fs.readdirSync(d).map(f=>{const m=f.match(new RegExp('^'+n+'(\\d*)\\.html$'));return m&&{f,v:+m[1]||0}}).filter(Boolean).sort((a,b)=>b.v-a.v);if(L.length)return path.join(d,L[0].f)}catch{}}return null};
app.get('/admin',(q,r)=>{const f=page('admin');f?r.sendFile(f):r.status(404).send('Admin səhifəsi tapılmadı')});
app.get('/',(q,r)=>{const f=page('index');f?r.sendFile(f):r.status(404).send('Ana səhifə tapılmadı')});
app.use(express.static(path.join(__dirname,'public')));
app.listen(PORT,()=>console.log('GlobalAz: http://localhost:'+PORT+'  |  Admin: http://localhost:'+PORT+'/admin'));
