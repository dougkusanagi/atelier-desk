import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
// Precaches only application code. API responses, credentials and board data stay in IndexedDB.
export function offlineShell(): Plugin {
  return {
    name: 'atelier-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith('.map'));
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 16);
      const source = `const CACHE='atelier-shell-${version}';
const FILES=${JSON.stringify([...files.map((name) => '/' + name), '/icon.svg', '/manifest.webmanifest'])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('atelier-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/collab/'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('/index.html',{ignoreVary:true}).then(response=>response||Response.error())));return;}
 if(FILES.includes(url.pathname))event.respondWith(caches.match(url.pathname,{ignoreVary:true}).then(response=>response||fetch(request)));
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
