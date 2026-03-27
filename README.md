# live-markdown-viewer-server
a node server js that renders markdown previews in your browser.

# How to use it?
`node live-markdown-viewer-server.js the/folder/contains/md/files`

And visit http://localhost:3000

Edit the file to use your preferred port if you don't want to use 3000

# What it does
- Lists all md files in the path you provide.
- Auto reloads when the file changed.
- Renders mermaid in the markdown file to diagrams. Click the diagram to view it in fullscreen, and zoom/pan.
