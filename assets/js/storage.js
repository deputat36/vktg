const KEY='etagi-raskleyka-state-v1',SAVED='etagi-raskleyka-saved-v1';
export function autoSave(state){try{localStorage.setItem(KEY,JSON.stringify({...state,photoOne:'',photoTwo:''}))}catch(e){console.warn(e)}}
export function loadAutoSave(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
export function saveNamed(state){localStorage.setItem(SAVED,JSON.stringify(state))}
export function loadNamed(){return JSON.parse(localStorage.getItem(SAVED)||'null')}
