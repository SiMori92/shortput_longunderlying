// W-79: build the header-art catalogue as URLs only (no image files in the repo or the database).
// Source: Wikimedia Commons' "Google Art Project works by <artist>" categories — Google's own Art Project
// scans, each record naming its Google Arts & Culture asset. A work is kept only when Commons marks it
// Public domain or CC0, a Google Arts & Culture asset id is present, and the image is landscape enough for the
// header crop. Images are hotlinked from upload.wikimedia.org; captions open the Google Arts & Culture page.
// Usage: node tools/build-art-catalog.mjs  (writes src/ui/artwork-catalog.json; ~2 minutes, polite to the API)
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const API='https://commons.wikimedia.org/w/api.php';
const UA='strategy-monitor-artwork-catalog/1.0 (generic client)';
const ARTISTS={'Claude Monet':22,'Pierre-Auguste Renoir':14,'Camille Pissarro':14,'Alfred Sisley':10,'Edgar Degas':10,'Vincent van Gogh':18,'Paul Cézanne':12,'Mary Cassatt':6,'Gustave Caillebotte':6,'Berthe Morisot':4,'Édouard Manet':8,'Georges Seurat':5,'Paul Signac':6,'Paul Gauguin':8};
const MIN_RATIO=1.1,WIDTH=1280;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(params){
 const url=`${API}?${new URLSearchParams({format:'json',maxlag:'5',...params})}`;
 for(let attempt=0;attempt<6;attempt++){
  const res=await fetch(url,{headers:{'User-Agent':UA}});const text=await res.text();
  if(res.ok){try{const j=JSON.parse(text);if(!j.error)return j}catch{/* rate-limit page */}}
  await sleep(4000*(attempt+1));
 }
 throw new Error(`Commons API failed: ${params.list??params.prop}`);
}
const strip=s=>String(s??'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function gacId(meta){
 const all=Object.values(meta).map(v=>String(v?.value??'')).join(' ');
 const pats=[/artsandculture\.google\.com\/asset\/(?:[^/"\s]+\/)?([A-Za-z0-9_-]{12,16})\b/,/culturalinstitute\/[^"\s]*?asset-viewer\/(?:[^/"\s]+\/)?([A-Za-z0-9_-]{12,16})\b/,/Google Arts (?:&amp;|&) Culture\s*(?:—|-|&#8212;)\s*([A-Za-z0-9_-]{12,16})\b/,/\b([A-Za-z0-9_-]{14}) at Google Cultural Institute/];
 for(const p of pats){const m=all.match(p);if(m)return m[1]}return null;
}
/** Commons ObjectName often embeds Wikidata markup (title QS:P1476,en:"…"); prefer the English value, then any quoted value. */
function cleanTitle(raw){
 const s=strip(raw);const en=s.match(/QS:P1476,en:"([^"]+)"/)||s.match(/QS:Len,"([^"]+)"/);if(en)return en[1].trim();
 const any=s.match(/QS:P1476,[a-z-]+:"([^"]+)"/)||s.match(/QS:L[a-z-]+,"([^"]+)"/);if(any)return any[1].trim();
 return s.replace(/\s*(?:title|label) QS:.*$/,'').replace(/^(?:English|French|Swedish|German|Dutch|Spanish|Italian):\s*/i,'').trim();
}
const slug=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
async function filesOf(artist){
 const out=[];let cont={};
 do{const j=await api({action:'query',list:'categorymembers',cmtype:'file',cmlimit:'500',cmtitle:`Category:Google Art Project works by ${artist}`,...cont});out.push(...j.query.categorymembers.map(m=>m.title));cont=j.continue??null;await sleep(1200)}while(cont);
 return out;
}
async function infos(titles){
 const out=[];
 for(let i=0;i<titles.length;i+=40){
  const j=await api({action:'query',prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:String(WIDTH),titles:titles.slice(i,i+40).join('|')});
  out.push(...Object.values(j.query.pages));await sleep(1500);
 }
 return out;
}
const catalog=[];const seen=new Set();
for(const [artist,want] of Object.entries(ARTISTS)){
 const titles=await filesOf(artist);const pages=await infos(titles);const picked=[];
 for(const p of pages){
  const ii=p.imageinfo?.[0];if(!ii?.thumburl)continue;const m=ii.extmetadata??{};
  const lic=strip(m.LicenseShortName?.value);if(!/^(public domain|cc0)/i.test(lic))continue;
  if(ii.width/ii.height<MIN_RATIO)continue;
  const id=gacId(m);if(!id||seen.has(id))continue;
  const title=cleanTitle(m.ObjectName?.value)||p.title.replace(/^File:/,'').replace(/\.[a-z]+$/i,'').replace(/ - Google Art Project.*$/,'').replace(new RegExp(`^${artist}\\s*-\\s*`),'');
  if(!title||/sketch|study for|drawing|untitled/i.test(title))continue;
  // Curation for a work tool that may be screen-shared: no nudes or bathing scenes.
  if(/nude|naked|bather|bathing|bath\b|toilette|odalisque|bain|baigneu|venus/i.test(title))continue;
  const year=(strip(m.DateTimeOriginal?.value).match(/\b1[89]\d\d\b/)??[''])[0];
  picked.push({id:`${slug(artist)}-${slug(title)}-${id.slice(0,4).toLowerCase()}`,artist,title:title.slice(0,120),year,image:ii.thumburl.replace(/\?.*$/,''),sourceLabel:'Google Arts & Culture',source:`https://artsandculture.google.com/asset/${id}`,commons:ii.descriptionurl,license:lic});seen.add(id);
 }
 picked.sort((a,b)=>a.title.localeCompare(b.title));
 const step=Math.max(1,picked.length/want);const chosen=[];for(let k=0;k<picked.length&&chosen.length<want;k+=step)chosen.push(picked[Math.floor(k)]);
 catalog.push(...chosen);console.log(`${artist}: ${titles.length} files, ${picked.length} eligible, ${chosen.length} kept`);
}
const out=join(dirname(fileURLToPath(import.meta.url)),'..','src','ui','artwork-catalog.json');
writeFileSync(out,JSON.stringify({builtAt:new Date().toISOString().slice(0,10),source:'Wikimedia Commons — Google Art Project categories',works:catalog},null,1)+'\n');
console.log(`wrote ${catalog.length} works to src/ui/artwork-catalog.json`);
