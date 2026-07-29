# live-markdown-viewer-server
a node server js that renders markdown previews in your browser.

# How to use it?
`node live-markdown-viewer-server.js the/folder/contains/md/files`

And visit http://localhost:3081 (or use `live-markdown-viewer-server-3080.js` for port 3080).

Set the `PORT` env var to use a different port: `PORT=3000 node live-markdown-viewer-server.js docs`

# What it does
- Lists all md files in the path you provide, grouped by folder, with last-modified times and a filter box.
- Auto reloads when the file you are viewing changes (other files' changes no longer trigger a reload), and keeps your scroll position across reloads.
- Dark mode: follows your system theme (page, code blocks, and mermaid diagrams).
- Syntax highlighting for fenced code blocks (highlight.js).
- Table of contents sidebar (on wide screens) with active-section highlighting, plus `#` anchor links on headings.
- Renders mermaid in the markdown file to diagrams. Click the diagram to view it in fullscreen, and zoom/pan.
- Quick file switcher dropdown on every file page — jump between files of the same project without going back to the list.
- Split view (`⧉ Split` link, or `/__split?left=a.md&right=b.md`): two files side by side in one tab, each pane with its own hot reload; drag the divider to resize, `⇄` to swap panes. The URL updates as you pick files, so a split layout is bookmarkable.
