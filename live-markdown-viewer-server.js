const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const WATCH_DIR = process.argv[2] || '.';

const html = (body, title) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-light.min.css">
<style>
  html { background: #fff; }
  body { margin: 40px auto; padding: 0 20px; }
  .markdown-body { background: transparent; }
  .markdown-body table { display: table; width: 100%; }
  .back-link { display: inline-block; margin-bottom: 16px; color: #0969da; text-decoration: none; font-size: 14px; }
  .back-link:hover { text-decoration: underline; }
  .file-list a { display: block; padding: 6px 0; color: #0969da; text-decoration: none; }
  .file-list a:hover { text-decoration: underline; }
  .mermaid { margin: 24px 0; padding: 16px; overflow-x: auto; cursor: pointer; border: 1px solid #d0d7de; border-radius: 6px; }
  .mermaid:hover { border-color: #0969da; }
  .mermaid svg { min-width: 800px; width: 100%; height: auto; min-height: 300px; }
  #overlay { display:none; position:fixed; inset:0; z-index:9999; background:rgba(255,255,255,0.97); }
  #overlay-inner { width:100%; height:100%; overflow:hidden; cursor:grab; }
  #overlay-inner.dragging { cursor:grabbing; }
  #overlay-content { transform-origin: 0 0; }
  #overlay-toolbar { position:fixed; top:16px; right:16px; z-index:10000; display:flex; gap:8px; }
  #overlay-toolbar button { background:#fff; border:1px solid #d0d7de; border-radius:6px; width:36px; height:36px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  #overlay-toolbar button:hover { background:#f3f4f6; }
</style></head><body class="markdown-body">${body}</body></html>`;

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
        res.write(`data: ${filename}\n\n`);
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
      const page = `<a class="back-link" href="/">&larr; All files</a><div id="content"></div>
<script>
document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(content)});
mermaid.initialize({ startOnLoad: false, theme: 'default', maxTextSize: 100000, flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false } });
document.querySelectorAll('pre code.language-mermaid').forEach(el => {
  const pre = el.parentElement;
  const div = document.createElement('div');
  div.className = 'mermaid';
  div.textContent = el.textContent;
  pre.replaceWith(div);
});
mermaid.run().then(() => {
  // Make mermaid divs clickable
  document.querySelectorAll('.mermaid').forEach(div => {
    div.addEventListener('click', () => openOverlay(div));
  });
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
const es = new EventSource('/__reload');
es.onmessage = () => location.reload();
</script>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html(page, path.basename(filePath)));
      return;
    }
  }

  // File listing
  const files = findMdFiles(WATCH_DIR).map(f => path.relative(WATCH_DIR, f));
  const links = files.map(f => `<a href="/${f}">${f}</a>`).join('');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html(`<h2>Markdown Files</h2><div class="file-list">${links || '<p>No .md files found</p>'}</div>
<script>const es = new EventSource('/__reload'); es.onmessage = () => location.reload();</script>`, 'MD Preview'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Markdown preview: http://localhost:${PORT}`);
  console.log(`Watching: ${path.resolve(WATCH_DIR)}`);
});
