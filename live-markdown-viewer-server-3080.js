const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3080;
const WATCH_DIR = process.argv[2] || '.';

const html = (body, title) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/highlight.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
<style>
  :root { --bg:#ffffff; --border:#d0d7de; --link:#0969da; --muted:#57606a; --hover:#f3f4f6; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d1117; --border:#30363d; --link:#4493f8; --muted:#8b949e; --hover:#161b22; }
  }
  html { background: var(--bg); scroll-behavior: smooth; }
  body { margin: 0; }
  main { max-width: 860px; margin: 0 auto; padding: 40px 32px 120px; }
  .markdown-body { background: transparent; }
  .markdown-body table { display: table; width: 100%; }
  .back-link { display: inline-block; margin-bottom: 16px; color: var(--link); text-decoration: none; font-size: 14px; }
  .back-link:hover { text-decoration: underline; }
  .hanchor { margin-left: 8px; color: var(--muted); text-decoration: none; opacity: 0; font-weight: normal; }
  h1:hover .hanchor, h2:hover .hanchor, h3:hover .hanchor { opacity: 1; }
  #toc { position: fixed; top: 0; left: 0; width: 230px; height: 100vh; overflow-y: auto;
         padding: 40px 12px 40px 20px; box-sizing: border-box; font-size: 13px;
         font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  #toc .toc-title { font-weight: 600; color: var(--muted); text-transform: uppercase; font-size: 11px;
                    letter-spacing: .05em; margin-bottom: 8px; }
  #toc a { display: block; padding: 3px 8px; color: var(--muted); text-decoration: none;
           border-left: 2px solid transparent; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #toc a:hover { color: var(--link); }
  #toc a.active { color: var(--link); border-left-color: var(--link); }
  #toc a.lvl2 { padding-left: 20px; }
  #toc a.lvl3 { padding-left: 34px; }
  @media (max-width: 1340px) { #toc { display: none; } }
  #q { width: 100%; box-sizing: border-box; padding: 8px 12px; margin-bottom: 20px; font-size: 14px;
       color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
  .dir-group h3 { margin: 24px 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .file-list a { display: flex; justify-content: space-between; gap: 16px; padding: 6px 8px;
                 color: var(--link); text-decoration: none; border-radius: 6px; }
  .file-list a:hover { background: var(--hover); }
  .file-list time { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .mermaid { margin: 24px 0; padding: 16px; overflow-x: auto; cursor: pointer; border: 1px solid var(--border); border-radius: 6px; }
  .mermaid:hover { border-color: var(--link); }
  .mermaid svg { min-width: 800px; width: 100%; height: auto; min-height: 300px; }
  #overlay { display:none; position:fixed; inset:0; z-index:9999; background:var(--bg); }
  #overlay-inner { width:100%; height:100%; overflow:hidden; cursor:grab; }
  #overlay-inner.dragging { cursor:grabbing; }
  #overlay-content { transform-origin: 0 0; }
  #overlay-toolbar { position:fixed; top:16px; right:16px; z-index:10000; display:flex; gap:8px; }
  #overlay-toolbar button { background:var(--bg); color:inherit; border:1px solid var(--border); border-radius:6px; width:36px; height:36px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  #overlay-toolbar button:hover { background:var(--hover); }
</style></head><body>${body}</body></html>`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function findMdFiles(dir) {
  let results = [];
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory() && f.name !== 'node_modules' && !f.name.startsWith('.')) {
        results.push(...findMdFiles(full));
      } else if (f.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url);

  // SSE endpoint for hot reload
  if (url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const interval = setInterval(() => res.write(':\n\n'), 15000); // keepalive
    const watcher = fs.watch(WATCH_DIR, { recursive: true }, (evt, filename) => {
      if (filename && filename.endsWith('.md')) {
        res.write(`data: ${evt}|${filename}\n\n`);
      }
    });
    req.on('close', () => { clearInterval(interval); watcher.close(); });
    return;
  }

  // Serve a specific markdown file
  if (url !== '/' && url !== '/favicon.ico') {
    const filePath = path.join(WATCH_DIR, url.slice(1));
    if (fs.existsSync(filePath) && filePath.endsWith('.md')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const page = `<nav id="toc"></nav><main><a class="back-link" href="/">&larr; All files</a><article id="content" class="markdown-body"></article></main>
<script>
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(content)});
mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', maxTextSize: 100000, flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false } });
document.querySelectorAll('pre code.language-mermaid').forEach(el => {
  const pre = el.parentElement;
  const div = document.createElement('div');
  div.className = 'mermaid';
  div.textContent = el.textContent;
  pre.replaceWith(div);
});
document.querySelectorAll('#content pre code').forEach(el => hljs.highlightElement(el));

// Heading ids, anchor links, table of contents
const heads = Array.from(document.querySelectorAll('#content h1, #content h2, #content h3'));
const used = {};
const tocEntries = heads.map(h => {
  const text = h.textContent;
  let slug = text.toLowerCase().replace(/[^\\p{L}\\p{N}\\s-]/gu, '').trim().replace(/\\s+/g, '-') || 'section';
  if (used[slug] != null) { used[slug]++; slug += '-' + used[slug]; } else used[slug] = 0;
  h.id = slug;
  const anchor = document.createElement('a');
  anchor.className = 'hanchor'; anchor.href = '#' + slug; anchor.textContent = '#';
  h.appendChild(anchor);
  return { h, text, slug, lvl: +h.tagName[1] };
});
let tocLinks = [];
if (tocEntries.length > 1) {
  const toc = document.getElementById('toc');
  const title = document.createElement('div');
  title.className = 'toc-title'; title.textContent = 'Contents';
  toc.appendChild(title);
  tocLinks = tocEntries.map(e => {
    const a = document.createElement('a');
    a.href = '#' + e.slug; a.textContent = e.text; a.className = 'lvl' + e.lvl;
    toc.appendChild(a);
    return a;
  });
}
function updToc() {
  let cur = null;
  for (const e of tocEntries) { if (e.h.getBoundingClientRect().top <= 100) cur = e; else break; }
  tocLinks.forEach(a => a.classList.toggle('active', !!cur && a.getAttribute('href') === '#' + cur.slug));
}
addEventListener('scroll', updToc, { passive: true });

// Preserve scroll position across hot reloads
const skey = 'scroll:' + location.pathname;
function restoreScroll() {
  const saved = sessionStorage.getItem(skey);
  if (saved && !location.hash) window.scrollTo(0, +saved);
  updToc();
}
addEventListener('scroll', () => sessionStorage.setItem(skey, String(scrollY)), { passive: true });

mermaid.run().then(() => {
  document.querySelectorAll('.mermaid').forEach(div => {
    div.addEventListener('click', () => openOverlay(div));
  });
  restoreScroll();
});

function openOverlay(srcDiv) {
  let overlay = document.getElementById('overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.innerHTML = \`
      <div id="overlay-toolbar">
        <button id="oz-in" title="Zoom in">+</button>
        <button id="oz-out" title="Zoom out">&minus;</button>
        <button id="oz-fit" title="Fit to screen">&#8596;</button>
        <button id="oz-close" title="Close">&times;</button>
      </div>
      <div id="overlay-inner"><div id="overlay-content"></div></div>\`;
    document.body.appendChild(overlay);

    let scale = 1, tx = 0, ty = 0, dragging = false, sx, sy;
    const inner = document.getElementById('overlay-inner');
    const content = document.getElementById('overlay-content');
    const apply = () => { content.style.transform = \`translate(\${tx}px,\${ty}px) scale(\${scale})\`; };

    document.getElementById('oz-close').onclick = () => { overlay.style.display = 'none'; };
    document.getElementById('oz-in').onclick = () => { scale *= 1.3; apply(); };
    document.getElementById('oz-out').onclick = () => { scale /= 1.3; apply(); };
    document.getElementById('oz-fit').onclick = () => {
      const svg = content.querySelector('svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect(), uw = r.width/scale, uh = r.height/scale;
      scale = Math.min((window.innerWidth-80)/uw, (window.innerHeight-80)/uh, 3);
      tx = (window.innerWidth - uw*scale)/2;
      ty = (window.innerHeight - uh*scale)/2;
      apply();
    };

    inner.addEventListener('mousedown', e => { dragging=true; sx=e.clientX-tx; sy=e.clientY-ty; inner.classList.add('dragging'); });
    window.addEventListener('mousemove', e => { if(!dragging) return; tx=e.clientX-sx; ty=e.clientY-sy; apply(); });
    window.addEventListener('mouseup', () => { dragging=false; inner.classList.remove('dragging'); });
    inner.addEventListener('wheel', e => { e.preventDefault(); scale *= e.deltaY<0?1.15:1/1.15; apply(); }, {passive:false});
    window.addEventListener('keydown', e => { if(e.key==='Escape') overlay.style.display='none'; });
  }

  const content = document.getElementById('overlay-content');
  content.innerHTML = srcDiv.innerHTML;
  content.style.transform = '';
  overlay.style.display = 'block';
  // Auto fit
  document.getElementById('oz-fit').click();
}

// Reload only when THIS file changes
const me = decodeURIComponent(location.pathname).slice(1);
const es = new EventSource('/__reload');
es.onmessage = e => {
  const file = e.data.slice(e.data.indexOf('|') + 1);
  if (file === me) {
    sessionStorage.setItem(skey, String(scrollY));
    location.reload();
  }
};
</script>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html(page, path.basename(filePath)));
      return;
    }
  }

  // File listing: grouped by directory, filterable, with modified times
  const files = findMdFiles(WATCH_DIR).map(f => {
    let mtime = '';
    try { mtime = fs.statSync(f).mtime.toISOString().slice(0, 16).replace('T', ' '); } catch {}
    return { rel: path.relative(WATCH_DIR, f), mtime };
  }).sort((a, b) => a.rel.localeCompare(b.rel));
  const groups = {};
  for (const f of files) (groups[path.dirname(f.rel)] ||= []).push(f);
  const sections = Object.keys(groups).sort().map(dir =>
    `<div class="dir-group"><h3>${esc(dir === '.' ? '/' : dir + '/')}</h3>` +
    groups[dir].map(f => `<a href="/${esc(f.rel)}"><span>${esc(path.basename(f.rel))}</span><time>${f.mtime}</time></a>`).join('') +
    `</div>`).join('');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html(`<main class="markdown-body"><h2>Markdown Files</h2>
<input id="q" type="search" placeholder="Filter files&hellip;" autofocus>
<div class="file-list">${sections || '<p>No .md files found</p>'}</div></main>
<script>
document.getElementById('q').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.file-list a').forEach(a => {
    a.style.display = decodeURIComponent(a.getAttribute('href')).toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.dir-group').forEach(g => {
    g.style.display = Array.from(g.querySelectorAll('a')).some(a => a.style.display !== 'none') ? '' : 'none';
  });
});
const es = new EventSource('/__reload');
es.onmessage = () => location.reload();
</script>`, 'MD Preview'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Markdown preview: http://localhost:${PORT}`);
  console.log(`Watching: ${path.resolve(WATCH_DIR)}`);
});
