const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
s = s.replace(/links = parsedLinks[\s\S]*?1000\)\);/, links = parsedLinks\n            .filter(link => typeof link === 'string' && link.trim() !== '')\n            .slice(0, 20)\n            .map(link => link.substring(0, 5000)););
fs.writeFileSync('server.js', s);

let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('type="url"', 'type="text"');
html = html.replace('placeholder="https://example.com/..."', 'placeholder="Type a link or text message..."');
html = html.replace('Add Link</button>', 'Add Text</button>');
fs.writeFileSync('public/index.html', html);

let main = fs.readFileSync('public/js/main.js', 'utf8');
main = main.replace(
  "function escapeHtml(str) {",
  "function linkify(text) {\n    const urlRegex = /(https?:\\/\\/[^\\s]+|www\\.[^\\s]+)/g;\n    return escapeHtml(text).replace(urlRegex, function(url) {\n      let href = url;\n      if (url.startsWith('www.')) href = 'http://' + url;\n      return \<a href=\"\\" target=\"_blank\" style=\"color: var(--color-primary-dark); text-decoration: underline;\" onclick=\"event.stopPropagation()\">\</a>\;\n    });\n  }\n\n  function escapeHtml(str) {"
);
main = main.replace(
  "if (!url.startsWith('http://') && !url.startsWith('https://')) {\\n      url = 'https://' + url;\\n    }",
  "// url validation removed"
);
main = main.replace(
  "<div class=\"file-item__name\">\</div>",
  "<div class=\"file-item__name\" style=\"white-space: normal; word-break: break-word;\">\</div>"
);
fs.writeFileSync('public/js/main.js', main);

let mobile = fs.readFileSync('public/js/mobile.js', 'utf8');
mobile = mobile.replace(
  "function escapeHtml(str) {",
  "function linkify(text) {\n    const urlRegex = /(https?:\\/\\/[^\\s]+|www\\.[^\\s]+)/g;\n    return escapeHtml(text).replace(urlRegex, function(url) {\n      let href = url;\n      if (url.startsWith('www.')) href = 'http://' + url;\n      return \<a href=\"\\" target=\"_blank\" style=\"color: var(--color-primary-dark); text-decoration: underline;\" onclick=\"event.stopPropagation()\">\</a>\;\n    });\n  }\n\n  function escapeHtml(str) {"
);
mobile = mobile.replace(
  "<div class=\"file-item__name\" title=\"\\">\</div>",
  "<div class=\"file-item__name\" style=\"white-space: normal; word-break: break-word; overflow: visible;\">\</div>"
);
fs.writeFileSync('public/js/mobile.js', mobile);

let myFiles = fs.readFileSync('public/js/my-files.js', 'utf8');
myFiles = myFiles.replace(
  "function escapeHtml(str) {",
  "function linkify(text) {\n    const urlRegex = /(https?:\\/\\/[^\\s]+|www\\.[^\\s]+)/g;\n    return escapeHtml(text).replace(urlRegex, function(url) {\n      let href = url;\n      if (url.startsWith('www.')) href = 'http://' + url;\n      return \<a href=\"\\" target=\"_blank\" style=\"color: var(--color-primary-dark); text-decoration: underline;\" onclick=\"event.stopPropagation()\">\</a>\;\n    });\n  }\n\n  function escapeHtml(str) {"
);
myFiles = myFiles.replace(
  "<div class=\"file-item__name\">\</div>",
  "<div class=\"file-item__name\" style=\"white-space: normal; word-break: break-word;\">\</div>"
);
fs.writeFileSync('public/js/my-files.js', myFiles);

