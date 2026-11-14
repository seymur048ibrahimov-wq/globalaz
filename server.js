// GlobalAz server v4 (premium mağaza: hesab, ünvanlar, rəylər, kuponlar, vitrin, statistika, ehtiyat nüsxə) — əsası v3 (Taobao ilə bire-bir: variant qiymətləri, stok, brend): mağaza + admin panel + kataloq + sifarişlər (addım tarixçəsi, Taobao agent). İşə salmaq: npm install && npm start
const fs=require('fs'),path=require('path'),crypto=require('crypto'),express=require('express');
try{for(const l of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
const E=process.env,PORT=E.PORT||3000,PASS=E.ADMIN_PASSWORD||'admin123';
const cfg={rate:+E.CNY_AZN||0.24,usd:1.7,margin:E.MARGIN?+E.MARGIN:12,cargo:E.CARGO_PER_KG?+E.CARGO_PER_KG:6,cust:E.CUSTOMS?+E.CUSTOMS:5,ship:0,wa:E.WHATSAPP||'994500000000'};
const F=path.join(E.DATA_DIR||path.join(__dirname,'data'),'db.json');fs.mkdirSync(path.dirname(F),{recursive:true});
let db={products:[],orders:[]};try{db=JSON.parse(fs.readFileSync(F,'utf8'))}catch{}
const save=()=>{const t=F+'.tmp';fs.writeFileSync(t,JSON.stringify(db));fs.renameSync(t,F)};
let saveT=null;const saveSoon=()=>{if(!saveT)saveT=setTimeout(()=>{saveT=null;try{save()}catch(e){console.error('save:',e.message)}},4000)};
const uid=()=>crypto.randomBytes(5).toString('hex'),s=(x,n=200)=>String(x==null?'':x).slice(0,n);
db.settings=db.settings||{};db.products=db.products||[];db.orders=db.orders||[];db.users=db.users||{};db.reviews=db.reviews||[];db.coupons=db.coupons||[];db.banners=db.banners||[];db.stats=db.stats||{};db.stats.q=db.stats.q||{};db.stats.days=db.stats.days||{};
const today=()=>new Date().toISOString().slice(0,10);
const day=()=>{const k=today(),D=db.stats.days;if(!D[k]){D[k]={v:0,u:0,o:0,r:0};const ks=Object.keys(D).sort();while(ks.length>180)delete D[ks.shift()]}return D[k]};if(!db.secret){db.secret=crypto.randomBytes(24).toString('hex');save()}
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
const app=express();app.set('trust proxy',1);
app.use((q,r,n)=>{r.set('X-Content-Type-Options','nosniff');r.set('Referrer-Policy','strict-origin-when-cross-origin');n()});
// Sadə sorğu limiti (IP + ünvan üzrə) — spam və kobud güc cəhdlərinə qarşı
const hits=new Map();const rl=(n,ms)=>(q,r,nx)=>{const k=q.ip+'|'+q.path,now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);if(a.length>=n)return r.status(429).json({error:'Çox sorğu göndərildi. Bir az sonra yenidən yoxlayın'});a.push(now);hits.set(k,a);if(hits.size>8000)hits.clear();nx()};
// Ehtiyat nüsxənin bərpası böyük fayl ola bilər — ümumi 1mb limitindən əvvəl ayrıca qeydiyyat
app.post('/api/admin/restore',auth,express.json({limit:'40mb'}),(q,r)=>{
 const b=q.body&&q.body.db;if(!b||typeof b!=='object'||!Array.isArray(b.products)||!Array.isArray(b.orders))return r.status(400).json({error:'Fayl düzgün ehtiyat nüsxə deyil'});
 const keep={secret:db.secret,pass:db.pass};db={...b,...keep};if(!db.pass)delete db.pass;
 for(const k of['settings','users','stats'])if(!db[k]||typeof db[k]!=='object')db[k]={};for(const k of['reviews','coupons','banners'])if(!Array.isArray(db[k]))db[k]=[];db.stats.q=db.stats.q||{};db.stats.days=db.stats.days||{};
 save();r.json({ok:true,products:db.products.length,orders:db.orders.length})});
app.use(express.json({limit:'1mb'}));

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
// pizani/taobao-product-scraper cavabı ({sellerInfo, productInfo:{priceCNY,imgList,options[]}}) — ümumi formaya salırıq
function normPz(j){const p=j&&j.productInfo;if(!p||typeof p!=='object'||Array.isArray(p))return j;const si=(j.sellerInfo&&typeof j.sellerInfo==='object')?j.sellerInfo:{};
 const at=p.atributtes||p.attributes||p.atributes,attrs=Array.isArray(at)?at.map(a=>Array.isArray(a)?{name:a[0],value:a[1]}:{name:a&&(a.name||a.key||a.attributeName||a.label),value:a&&(a.value||a.val||a.text)}):(at&&typeof at==='object'?Object.entries(at).map(([k,v])=>({name:k,value:Array.isArray(v)?v.join(' / '):v})):[]);
 const imgs=Array.isArray(p.imgList)?p.imgList:[];
 return{title:p.titleCN||p.title||'',cnyPrice:p.priceCNY,originalPrice:p.originalPriceCNY||0,coverImage:imgs[0]||'',images:imgs,desc_imgs:Array.isArray(p.descriptionImages)?p.descriptionImages:[],shopName:si.shopTitle||'',productAttrs:attrs.filter(a=>a.name&&a.value!=null&&typeof a.value!=='object'),
  skus:(Array.isArray(p.options)?p.options:[]).filter(o=>o&&o.name).map(o=>({cnyPrice:o.priceCNY,quantity:o.stock==null?undefined:o.stock,imageUrl:o.imgUrl||'',properties:[{name:'规格',value:String(o.name),imageUrl:o.imgUrl||''}]}))}}
function parseItem(j){
 j=normPz(j);normSkus(j);
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
// Əsas Actor: zen-studio (rəng/ölçü variantları, qiymət, stok, brend verir). Başqasını istəsəniz: APIFY_PRIMARY
// .env-dəki APIFY_ACTOR (köhnə khadinakbar) avtomatik EHTİYAT olur — əsas Actor alınmasa ona keçilir
// İşləməyən köhnə aktorlar (zen-studio detail: pulsuz limit bitib; khadinakbar: FAILED) Environment-də qalsa belə nəzərə alınmır.
// zen-studio-nu ödənişli planda geri qaytarmaq üçün: APIFY_FORCE=1
const DEAD=/zen-studio.taobao-detail-scraper|khadinakbar/,envA=v=>{v=String(v||'').trim().replace('/','~');return v&&(E.APIFY_FORCE||!DEAD.test(v))?v:''};
const AK=E.APIFY_TOKEN||'',AA=envA(E.APIFY_PRIMARY)||'pizani~taobao-product-scraper';
const AA2=envA(E.APIFY_ACTOR2)||envA(E.APIFY_ACTOR)||'jakvbs~taobao-tmall';
// Hər Actor linki fərqli sahə adı ilə qəbul edir
function actInput(actor,link){
 if(E.APIFY_INPUT_KEY)return{[E.APIFY_INPUT_KEY]:[link]};
 if(/zen-studio/.test(actor))return{items:[link],fetchReviews:false};
 if(/pizani/.test(actor))return{product_url:link};
 if(/memo23|jakvbs|logiover|scrapesage/.test(actor))return{startUrls:[link],maxItems:1};
 if(/h1018y|mlg14/.test(actor))return{urls:[link],productUrls:[link]};
 return{productUrls:[link],maxItems:1}}
async function apifyRun(actor,link){
 const r=await fetch('https://api.apify.com/v2/acts/'+actor+'/run-sync-get-dataset-items?timeout=120',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+AK},body:JSON.stringify(actInput(actor,link)),signal:AbortSignal.timeout(130000)});
 const txt=await r.text();let j=[];try{j=JSON.parse(txt)}catch{}
 if(!r.ok){const m=(j&&j.error&&(j.error.message||j.error.type))||s(txt,150);const run=(String(m).match(/run ID:\s*(\w+)/)||[])[1];
  throw new Error(actor+' → '+r.status+': '+s(m,160)+(run?' | jurnal: https://console.apify.com/actors/runs/'+run:''))}
 if(!Array.isArray(j)||!j[0])throw new Error(actor+' → boş nəticə');
 const x=j[0];if(x&&(x.error||x.errorMessage)&&!x.title&&!x.skus&&!x.productInfo)throw new Error(actor+' → '+s(x.error||x.errorMessage,150));
 return x}
async function apifyRaw(link){
 if(!AK)throw new Error('Apify qoşulmayıb (.env: APIFY_TOKEN)');
 const list=[AA,...(AA2&&AA2!=='-'&&AA2!==AA?[AA2]:[])],errs=[];
 for(const a of list){try{const x=await apifyRun(a,link);x.__actor=a;return x}catch(e){console.error('Apify:',e.message);
  if(/ 402: .*concurrent/i.test(e.message))throw new Error('Apify-da eyni anda çox Actor işləyir (pulsuz plan limiti 5). console.apify.com/actors/runs səhifəsində "Running" olanları Abort edin və 1 dəqiqə sonra yenidən yoxlayın');
  if(/ 40[13]: /.test(e.message))throw new Error('Apify token-i səhvdir və ya etibarsızdır (APIFY_TOKEN): '+e.message);
  errs.push(e.message)}}
 throw new Error(errs.join(' || '))}
const rawAny=link=>apifyRaw(link);
async function trOpts(opts){if(!opts.length)return opts;
 try{const L=[];opts.forEach(o=>{L.push(o.n,...o.v)});if(L.join('\n').length>1400)return opts;
  const t=(await tr(L.join('\n'))).split('\n');if(t.length!==L.length)return opts;
  let i=0;const T=(orig,lim,re)=>{const x=t[i++];return CJK.test(orig)?s(String(x||'').replace(re,' ').trim()||orig,lim):orig};return opts.map(o=>({n:T(o.n,30,/[:：]/g),v:o.v.map(x=>T(x,80,/[,，、]/g)),vi:o.vi||[],nz:o.nz||o.n,vz:o.vz||o.v}))}catch{return opts}}
async function trAttrs(a){if(!a.length)return a;try{const L=[];a.forEach(x=>{L.push(x.n,x.v)});const out=[];for(let i=0;i<L.length;){let j=i,len=0;while(j<L.length&&len+L[j].length<1300){len+=L[j].length+1;j++}if(j===i)j=i+1;const t=(await tr(L.slice(i,j).join('\n'))).split('\n');if(t.length!==j-i)return a;out.push(...t);i=j}return a.map((x,k)=>({n:s(out[2*k]||x.n,40),v:s(out[2*k+1]||x.v,120)}))}catch{return a}}

// ---- Mağaza (açıq): src = gizli məhsul ID, Taobao linki müştəriyə göstərilmir ----
// Müştəri hesabı: ilk girişdə yaradılır, hər sorğuda "son aktivlik" yenilənir
function touch(gu){let u=db.users[gu.uid];if(!u){u=db.users[gu.uid]={uid:gu.uid,email:gu.email,name:gu.name||'',phone:'',addr:[],cart:[],fav:[],created:new Date().toISOString()};day().u++}
 u.email=gu.email;if(!u.name&&gu.name)u.name=gu.name;u.last=new Date().toISOString();saveSoon();return u}
const rstat=()=>{const m={};for(const v of db.reviews){if(v.hid)continue;const x=m[v.pid]||(m[v.pid]={s:0,n:0});x.s+=v.r;x.n++}return m};
const store=()=>{const t=db.settings;return{ann:t.ann||'',banners:db.banners,pages:t.pages||{},dmin:+t.dmin||15,dmax:+t.dmax||25,cod:t.cod!==false,card:t.card!==false,phone:t.phone||'',email:t.email||'',ig:t.ig||''}};
app.get('/api/products',(q,r)=>{const R=rstat();r.json({cfg:pcfg(),cats:cats(),store:store(),list:db.products.filter(p=>!p.hid).map(p=>({n:p.az||p.zh,c:p.c,img:p.img,imgs:p.imgs||[],desc:p.desc||'',opts:(p.opts||[]).map(o=>({n:o.n,v:o.v,vi:o.vi||[]})),skus:(p.skus||[]).map(x=>({k:x.k,cny:x.cny,o:x.o||0,st:x.st==null?-1:x.st,img:x.img||'',pr:x.pr||0})),brand:p.brand||'',sold:p.sold||0,cnyOrig:p.cnyOrig||0,attrs:p.attrs||[],video:p.video||'',dimgs:p.dimgs||[],cny:p.cny,pr:p.pr,kg:p.kg,src:p.id,from:'ga',t:p.t||0,feat:!!p.feat,ra:R[p.id]?+(R[p.id].s/R[p.id].n).toFixed(1):0,rn:R[p.id]?R[p.id].n:0}))})});
// ---- Hesab: profil, ünvanlar, səbət və sevimlilərin sinxronu ----
const meOut=u=>({email:u.email,name:u.name||'',phone:u.phone||'',addr:u.addr||[],cart:u.cart||[],fav:u.fav||[]});
app.get('/api/me',async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Giriş tələb olunur'});r.json(meOut(touch(gu)))});
app.put('/api/me',rl(60,6e4),async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Giriş tələb olunur'});const u=touch(gu),b=q.body||{};
 if(b.name!=null)u.name=s(b.name,80).trim();if(b.phone!=null)u.phone=s(b.phone,40).trim();
 if(Array.isArray(b.addr))u.addr=b.addr.slice(0,8).map(a=>({id:s(a&&a.id,12)||uid(),name:s(a&&a.name,80).trim(),phone:s(a&&a.phone,40).trim(),city:s(a&&a.city,80).trim(),address:s(a&&a.address,300).trim()})).filter(a=>a.address);
 if(Array.isArray(b.cart))u.cart=b.cart.slice(0,50).map(i=>({src:s(i&&i.src,20),sk:Number.isInteger(i&&i.sk)?i.sk:-1,q:Math.max(1,Math.min(99,+(i&&i.q)|0)),opt:s(i&&i.opt,150),n:s(i&&i.n,120),img:s(i&&i.img,500),u:+(i&&i.u)||0})).filter(i=>i.src);
 if(Array.isArray(b.fav))u.fav=b.fav.slice(0,300).map(x=>s(x,20)).filter(Boolean);
 u.cartT=new Date().toISOString();saveSoon();r.json({ok:true})});
// ---- Rəylər ----
const bought=(uidv,p)=>db.orders.some(o=>o.uid===uidv&&o.status!=='cancel'&&o.items.some(i=>i.pid===p.id||(i.link&&i.link===p.link)));
const shortName=n=>{const a=String(n||'').trim().split(/\s+/);return a[0]?a[0]+(a[1]?' '+a[1][0]+'.':''):'Müştəri'};
app.get('/api/reviews/:pid',(q,r)=>r.json({list:db.reviews.filter(v=>v.pid===q.params.pid&&!v.hid).slice(0,100).map(v=>({name:v.name,r:v.r,text:v.text,t:v.t,vb:!!v.vb,reply:v.reply||''}))}));
app.post('/api/reviews',rl(6,6e4),async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Rəy yazmaq üçün daxil olun'});const b=q.body||{},p=db.products.find(x=>x.id===b.src);
 const rt=Math.round(+b.r);if(!p||!(rt>=1&&rt<=5))return r.status(400).json({error:'Qiymətləndirmə seçin'});const u=touch(gu);
 const v={id:uid(),pid:p.id,uid:gu.uid,name:shortName(u.name||gu.name||gu.email.split('@')[0]),r:rt,text:s(b.text,600).trim(),t:new Date().toISOString(),vb:bought(gu.uid,p)};
 const i=db.reviews.findIndex(x=>x.pid===p.id&&x.uid===gu.uid);if(i>=0){v.id=db.reviews[i].id;v.reply=db.reviews[i].reply||'';db.reviews[i]=v}else db.reviews.unshift(v);save();r.json({ok:true})});
// ---- Kuponlar ----
const cpFind=c=>db.coupons.find(x=>x.on!==false&&x.code===String(c||'').trim().toUpperCase());
function cpCalc(c,sub){if(!c)return{err:'Belə kupon tapılmadı'};if(c.exp&&Date.now()>new Date(c.exp+'T23:59:59').getTime())return{err:'Kuponun vaxtı bitib'};
 if(c.max>0&&(c.used||0)>=c.max)return{err:'Kuponun istifadə limiti dolub'};if(sub<(c.min||0))return{err:'Bu kupon üçün minimum məbləğ: '+c.min+' ₼'};
 const d=c.type==='fix'?c.val:sub*c.val/100;return{disc:+Math.min(sub,Math.max(0,d)).toFixed(2)}}
app.post('/api/coupon',rl(20,6e4),(q,r)=>{const b=q.body||{},c=cpFind(b.code),x=cpCalc(c,+b.sub||0);if(x.err)return r.status(400).json({error:x.err});r.json({code:c.code,type:c.type,val:c.val,min:c.min||0,disc:x.disc})});
// ---- Statistika hadisələri: baxış, axtarış, ziyarət (şəxsi məlumat saxlanmır) ----
app.post('/api/ev',rl(240,6e4),(q,r)=>{const b=q.body||{};
 if(b.k==='v'){const p=db.products.find(x=>x.id===b.src);if(p)p.views=(p.views||0)+1}
 else if(b.k==='q'){const t=s(b.q,40).trim().toLowerCase();if(t.length>1&&t!=='__proto__'&&t!=='constructor'){const Q=db.stats.q;Q[t]=(+Q[t]||0)+1;const ks=Object.keys(Q);if(ks.length>400)ks.sort((a,c)=>Q[a]-Q[c]).slice(0,120).forEach(k=>delete Q[k])}}
 else if(b.k==='h')day().v++;
 saveSoon();r.json({ok:true})});
app.post('/api/orders',rl(8,6e4),async(q,r)=>{const b=q.body||{};const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Əvvəlcə hesabınıza daxil olun'});
 if(!s(b.name).trim()||!s(b.phone).trim()||!s(b.address).trim()||!Array.isArray(b.items)||!b.items.length)return r.status(400).json({error:'Ad, telefon və ünvan tələb olunur'});
 const items=[];for(const i of b.items.slice(0,50)){const p=db.products.find(x=>x.id===(i&&i.src)&&!x.hid);
  if(!p)return r.status(409).json({error:'Səbətdəki bəzi məhsullar artıq satışda deyil. Səbəti yeniləyin'});
  const sk=skuOf(p,+i.sk);if(sk&&sk.st===0)return r.status(409).json({error:'“'+s(p.az||p.zh,60)+'” — seçdiyiniz variant bitib'});
  const optZh=sk&&Array.isArray(p.opts)?sk.k.map((v,g)=>{const o=p.opts[g];return o?(o.nz||o.n)+': '+((o.vz||o.v)[v]||o.v[v]||''):''}).filter(Boolean).join('; '):'';
  items.push({pid:p.id,n:s(p.az||p.zh,200),q:Math.max(1,Math.min(99,+i.q|0)),u:+upS(p,sk).toFixed(2),opt:s(i.opt,150),optZh:s(optZh,200),sk:sk?+i.sk:-1,link:p.link||'',zh:p.zh||'',img:s(i.img,500)||p.img||'',shop:p.shop||'',cny:sk?sk.cny:(p.cny||0),kg:p.kg||0})}
 const sub=+items.reduce((a,i)=>a+i.u*i.q,0).toFixed(2);let disc=0,coupon='';
 if(s(b.coupon,30).trim()){const c=cpFind(b.coupon),x=cpCalc(c,sub);if(x.err)return r.status(400).json({error:x.err});disc=x.disc;coupon=c.code;c.used=(c.used||0)+1}
 const total=+(sub-disc).toFixed(2),no='GA-'+Date.now().toString(36).toUpperCase()+crypto.randomBytes(1).toString('hex').toUpperCase();
 const o={id:uid(),uid:gu.uid,email:gu.email,gname:gu.name,no,date:new Date().toISOString(),name:s(b.name).trim(),phone:s(b.phone,40).trim(),city:s(b.city,80).trim(),address:s(b.address,300).trim(),cnote:s(b.cnote,300),items,sub,disc,coupon,total,pm:b.pm==='card'?'card':'cod',status:'new',pay:'none',track:'',note:'',cost:0,taobaoNo:'',agentSent:false,hist:[]};
 hist(o,'status','new','Müştəri sifariş verdi');db.orders.unshift(o);
 const u=touch(gu);if(!u.name)u.name=o.name;if(!u.phone)u.phone=o.phone;u.cart=[];
 if(!(u.addr||[]).some(a=>a.address===o.address&&a.phone===o.phone)){u.addr=[{id:uid(),name:o.name,phone:o.phone,city:o.city,address:o.address},...(u.addr||[])].slice(0,8)}
 const d=day();d.o=(d.o||0)+1;d.r=+((d.r||0)+total).toFixed(2);save();
 r.json({ok:true,no:o.no,total})});
const myOut=o=>({no:o.no,date:o.date,sub:o.sub||o.total,disc:o.disc||0,total:o.total,status:o.status,pay:o.pay,pm:o.pm||'',track:o.track,name:o.name,phone:o.phone,city:o.city,address:o.address,steps:(o.hist||[]).filter(h=>h.k==='status').map(h=>({t:h.t,v:h.v})),items:o.items.map(i=>({src:i.pid||'',sk:i.sk,n:i.n,opt:i.opt||'',q:i.q,u:i.u,img:i.img||''}))});
app.get('/api/my-orders',async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Giriş tələb olunur'});
 r.json({list:db.orders.filter(o=>o.uid===gu.uid).slice(0,60).map(myOut)})});
// Müştəri yalnız hələ işlənməyə başlamamış ("yeni") sifarişini ləğv edə bilər
app.post('/api/my-orders/:no/cancel',rl(10,6e4),async(q,r)=>{const gu=await gUser(q);if(!gu)return r.status(401).json({error:'Giriş tələb olunur'});
 const o=db.orders.find(x=>x.no===q.params.no&&x.uid===gu.uid);if(!o)return r.status(404).json({error:'Sifariş tapılmadı'});
 if(o.status!=='new')return r.status(409).json({error:'Sifariş artıq işlənir. Ləğv üçün bizimlə əlaqə saxlayın'});
 o.status='cancel';hist(o,'status','cancel','Müştəri ləğv etdi');save();r.json({ok:true,order:myOut(o)})});
app.get('/api/track/:no',(q,r)=>{const o=db.orders.find(x=>x.no===q.params.no);if(!o)return r.status(404).json({error:'Tapılmadı'});r.json({status:o.status,pay:o.pay,track:o.track})});

// ---- Admin ----
app.post('/api/login',rl(20,6e4),(q,r)=>{const f=fails[q.ip]||{n:0,t:0};if(f.n>=5&&Date.now()-f.t<9e5)return r.status(429).json({error:'Çox cəhd. 15 dəqiqə sonra yenidən yoxlayın'});
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
app.delete('/api/orders/:id',auth,(q,r)=>{db.orders=db.orders.filter(x=>x.id!==q.params.id);save();r.json({ok:true})});
app.get('/api/admin/products',auth,(q,r)=>r.json({list:db.products}));
const clean=b=>({link:canon(b.link),zh:s(b.zh,300),az:s(b.az,300),c:s(b.c,40)||'Digər',img:s(b.img,500),cny:+b.cny||0,kg:+b.kg||0.5,pr:+b.pr||0,desc:s(b.desc,2000),
 imgs:(Array.isArray(b.imgs)?b.imgs:[]).map(x=>s(x,500)).filter(Boolean).slice(0,12),
 opts:(Array.isArray(b.opts)?b.opts:[]).slice(0,6).map(o=>{const v=[],vi=[],vz=[];(Array.isArray(o.v)?o.v:[]).slice(0,40).forEach((x,i)=>{const t=s(x,80).trim();if(t){v.push(t);vi.push(s((o.vi||[])[i],500));vz.push(s((o.vz||[])[i],80))}});return{n:s(o.n,30),v,vi,nz:s(o.nz,30),vz}}).filter(o=>o.n&&o.v.length),
 attrs:(Array.isArray(b.attrs)?b.attrs:[]).slice(0,40).map(a=>({n:s(a&&a.n,40).trim(),v:s(a&&a.v,160).trim()})).filter(a=>a.n&&a.v),
 shop:s(b.shop,80),hid:!!b.hid,feat:!!b.feat,brand:s(b.brand,60).trim(),sold:Math.max(0,+b.sold|0),cnyOrig:+b.cnyOrig||0,t:+b.t||Date.now(),
 skus:(Array.isArray(b.skus)?b.skus:[]).slice(0,400).map(x=>({k:(Array.isArray(x&&x.k)?x.k:[]).slice(0,6).map(v=>v|0),cny:+(x&&x.cny)||0,o:+(x&&x.o)||0,st:x&&x.st!=null&&x.st!==''?(+x.st|0):-1,img:s(x&&x.img,500),pr:+(x&&x.pr)||0})).filter(x=>x.cny>0||x.pr>0),
 video:/^https:\/\//.test(String(b.video||''))?s(b.video,500):'',
 dimgs:(Array.isArray(b.dimgs)?b.dimgs:[]).map(x=>s(x,500)).filter(x=>/^https:\/\//.test(x)).slice(0,20)});
app.post('/api/admin/products',auth,(q,r)=>{const p={id:uid(),...clean(q.body)};db.products.unshift(p);save();r.json(p)});
app.put('/api/admin/products/:id',auth,(q,r)=>{const i=db.products.findIndex(x=>x.id===q.params.id);if(i<0)return r.status(404).json({error:'Tapılmadı'});const old=db.products[i];db.products[i]={id:q.params.id,...clean(q.body),t:old.t||Date.now(),views:old.views||0};save();r.json(db.products[i])});
app.delete('/api/admin/products/:id',auth,(q,r)=>{db.products=db.products.filter(x=>x.id!==q.params.id);db.reviews=db.reviews.filter(v=>v.pid!==q.params.id);save();r.json({ok:true})});
// Toplu əməliyyat: gizlət/göstər, seçilmiş et, kataloqu dəyiş, sil
app.post('/api/admin/products-bulk',auth,(q,r)=>{const b=q.body||{},ids=new Set(Array.isArray(b.ids)?b.ids:[]);let n=0;
 if(b.act==='del'){const L=db.products.length;db.products=db.products.filter(p=>!ids.has(p.id));db.reviews=db.reviews.filter(v=>!ids.has(v.pid));n=L-db.products.length}
 else for(const p of db.products){if(!ids.has(p.id))continue;n++;if(b.act==='hide')p.hid=true;else if(b.act==='show')p.hid=false;else if(b.act==='feat')p.feat=true;else if(b.act==='unfeat')p.feat=false;else if(b.act==='cat'&&s(b.c,40))p.c=s(b.c,40)}
 save();r.json({ok:true,n})});
// ---- Müştərilər (CRM) ----
app.get('/api/admin/users',auth,(q,r)=>{const m={};for(const o of db.orders){if(!o.uid)continue;const x=m[o.uid]||(m[o.uid]={n:0,t:0,last:''});if(o.status!=='cancel'){x.n++;x.t+=o.total}if(o.date>x.last)x.last=o.date}
 const L=Object.values(db.users).map(u=>({uid:u.uid,email:u.email,name:u.name||'',phone:u.phone||'',addr:u.addr||[],cart:u.cart||[],cartT:u.cartT||'',fav:(u.fav||[]).length,created:u.created,last:u.last,orders:(m[u.uid]||{}).n||0,spent:+(((m[u.uid]||{}).t||0)).toFixed(2),lastOrder:(m[u.uid]||{}).last||''}));
 for(const o of db.orders){if(o.uid&&!db.users[o.uid]&&!L.some(x=>x.uid===o.uid))L.push({uid:o.uid,email:o.email||'',name:o.name||o.gname||'',phone:o.phone||'',addr:[{id:'o',name:o.name,phone:o.phone,city:o.city,address:o.address}],cart:[],cartT:'',fav:0,created:o.date,last:o.date,orders:m[o.uid].n,spent:+m[o.uid].t.toFixed(2),lastOrder:m[o.uid].last})}
 r.json({list:L})});
// ---- Rəylərin idarəsi ----
app.get('/api/admin/reviews',auth,(q,r)=>r.json({list:db.reviews.map(v=>{const p=db.products.find(x=>x.id===v.pid)||{};return{...v,pn:p.az||p.zh||'(silinmiş məhsul)',pimg:p.img||''}})}));
app.patch('/api/admin/reviews/:id',auth,(q,r)=>{const v=db.reviews.find(x=>x.id===q.params.id);if(!v)return r.status(404).json({error:'Tapılmadı'});const b=q.body||{};if(b.hid!=null)v.hid=!!b.hid;if(b.reply!=null)v.reply=s(b.reply,400).trim();save();r.json({ok:true})});
app.delete('/api/admin/reviews/:id',auth,(q,r)=>{db.reviews=db.reviews.filter(x=>x.id!==q.params.id);save();r.json({ok:true})});
// ---- Kuponların idarəsi ----
app.get('/api/admin/coupons',auth,(q,r)=>r.json({list:db.coupons}));
app.put('/api/admin/coupons',auth,(q,r)=>{const seen=new Set();db.coupons=(Array.isArray(q.body&&q.body.list)?q.body.list:[]).slice(0,100).map(c=>({code:s(c&&c.code,30).trim().toUpperCase().replace(/[^A-Z0-9_-]/g,''),type:c&&c.type==='fix'?'fix':'pct',val:Math.max(0,+(c&&c.val)||0),min:Math.max(0,+(c&&c.min)||0),max:Math.max(0,+(c&&c.max)|0),exp:/^\d{4}-\d{2}-\d{2}$/.test(String(c&&c.exp||''))?c.exp:'',used:Math.max(0,+(c&&c.used)|0),on:!(c&&c.on===false)})).filter(c=>c.code&&c.val>0&&(c.type==='fix'||c.val<=100)&&!seen.has(c.code)&&seen.add(c.code));save();r.json({ok:true,list:db.coupons})});
// ---- Vitrin: elan zolağı, bannerlər, məlumat səhifələri, çatdırılma və ödəniş ----
app.get('/api/admin/content',auth,(q,r)=>r.json(store()));
app.put('/api/admin/content',auth,(q,r)=>{const b=q.body||{},t=db.settings;
 if(b.ann!=null)t.ann=s(b.ann,160).trim();for(const k of['phone','email','ig'])if(b[k]!=null)t[k]=s(b[k],120).trim();
 if(+b.dmin>0)t.dmin=Math.min(120,+b.dmin|0);if(+b.dmax>0)t.dmax=Math.max(t.dmin||1,Math.min(180,+b.dmax|0));
 if(b.cod!=null)t.cod=!!b.cod;if(b.card!=null)t.card=!!b.card;if(t.cod===false&&t.card===false)t.cod=true;
 if(b.pages&&typeof b.pages==='object'){t.pages={};for(const k of['about','delivery','returns','privacy','terms'])if(b.pages[k]!=null)t.pages[k]=s(b.pages[k],6000)}
 if(Array.isArray(b.banners))db.banners=b.banners.slice(0,8).map(x=>({t:s(x&&x.t,80).trim(),s:s(x&&x.s,160).trim(),img:/^https:\/\//.test(String(x&&x.img||''))?s(x.img,500):'',c:s(x&&x.c,40),btn:s(x&&x.btn,30).trim()})).filter(x=>x.t||x.img);
 save();r.json({ok:true,...store()})});
// ---- Statistika və ehtiyat nüsxə ----
app.get('/api/admin/stats',auth,(q,r)=>r.json({days:db.stats.days,q:Object.entries(db.stats.q).sort((a,b)=>b[1]-a[1]).slice(0,30),views:db.products.filter(p=>p.views>0).sort((a,b)=>b.views-a.views).slice(0,15).map(p=>({id:p.id,n:p.az||p.zh,img:p.img,views:p.views})),users:Object.keys(db.users).length,disk:{file:F,persistent:!!E.DATA_DIR}}));
app.get('/api/admin/backup',auth,(q,r)=>{const{secret,pass,...rest}=db;r.set('Content-Disposition','attachment; filename="globalaz-backup-'+today()+'.json"');r.json({v:4,at:new Date().toISOString(),db:rest})});
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
 for(const k of['wa','agent'])if(b[k]!=null)db.settings[k]=s(b[k],120).trim().replace(/[^\d]/g,'');if(b.wh!=null)db.settings.wh=s(b.wh,500).trim();save();r.json({ok:true})});
app.post('/api/admin/password',auth,(q,r)=>{const p=s(q.body&&q.body.password,100);if(p.length<6)return r.status(400).json({error:'Parol ən azı 6 simvol olmalıdır'});db.pass=H(p);save();r.json({ok:true})});
const PUB=path.join(__dirname,'public');
const page=n=>{for(const d of[PUB,__dirname]){try{const L=fs.readdirSync(d).map(f=>{const m=f.match(new RegExp('^'+n+'(\\d*)\\.html$'));return m&&{f,v:+m[1]||0}}).filter(Boolean).sort((a,b)=>b.v-a.v);if(L.length)return path.join(d,L[0].f)}catch{}}return null};
const ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB347"/><stop offset="1" stop-color="#FF5A00"/></linearGradient><radialGradient id="b" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#3a2410"/><stop offset="1" stop-color="#0b0b0d"/></radialGradient></defs><rect width="512" height="512" rx="112" fill="#0B0B0D"/><circle cx="256" cy="246" r="150" fill="url(#b)" stroke="url(#a)" stroke-width="14"/><path d="M106 246h300M256 96c50 45 50 255 0 300M256 96c-50 45-50 255 0 300M131 171c70 30 180 30 250 0M131 321c70-30 180-30 250 0" stroke="url(#a)" stroke-width="9" fill="none" opacity=".75"/><path d="M46 316c40 70 240 60 390-60 30-25 45-50 35-70" stroke="url(#a)" stroke-width="32" fill="none" stroke-linecap="round"/></svg>';
app.get('/icon.svg',(q,r)=>{r.set('Cache-Control','public, max-age=86400');r.type('image/svg+xml').send(ICON)});
app.get('/manifest.webmanifest',(q,r)=>r.type('application/manifest+json').send(JSON.stringify({name:'GlobalAz',short_name:'GlobalAz',description:'Dünya bir toxunuşla yaxındadır',start_url:'/',display:'standalone',background_color:'#0B0B0D',theme_color:'#0B0B0D',lang:'az',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]})));
app.get('/healthz',(q,r)=>r.json({ok:true,v:'4.1',actor:AA,actor2:AA2,apify:!!AK,products:db.products.length}));
app.get('/admin',(q,r)=>{const f=page('admin');f?r.sendFile(f):r.status(404).send('Admin səhifəsi tapılmadı')});
app.get('/',(q,r)=>{const f=page('index');f?r.sendFile(f):r.status(404).send('Ana səhifə tapılmadı')});
app.use(express.static(path.join(__dirname,'public')));
for(const sg of['SIGTERM','SIGINT'])process.on(sg,()=>{try{save()}catch{}process.exit(0)});
app.listen(PORT,()=>console.log('GlobalAz: http://localhost:'+PORT+'  |  Admin: http://localhost:'+PORT+'/admin'));
