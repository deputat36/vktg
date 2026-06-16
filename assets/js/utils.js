export const $=id=>document.getElementById(id);
export const esc=(v='')=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
export const nl=(v='')=>String(v).split(/\n+/).map(x=>x.trim()).filter(Boolean);
export function readFileAsDataURL(file){return new Promise((res,rej)=>{if(!file){res('');return}const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
export function downloadText(filename,text,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
export function debounce(fn,wait=400){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
