const fs = require('fs');
const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
for (const file of files) {
  let html = fs.readFileSync('public/' + file, 'utf8');
  if (!html.includes('dialogs.js')) {
    html = html.replace(/<script/, '<script src="/js/dialogs.js"></script>\n  <script');
    fs.writeFileSync('public/' + file, html);
    console.log('Injected into ' + file);
  }
}
