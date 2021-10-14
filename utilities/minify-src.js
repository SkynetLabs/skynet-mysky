const fs = require("fs");
const jsdom = require("jsdom");
const process = require("process");

const { JSDOM } = jsdom;

(async () => {
  // Transform every file passed in to the script.
  process.argv.forEach(async function (arg, index) {
    if (index < 2) {
      return;
    }
    await transformFile(arg);
  });
})();

async function transformFile(filePath) {
  const dom = await JSDOM.fromFile(filePath);
  // Get da dom.
  const document = dom.window.document;

  // Iterate all scripts in the DOM.
  const scripts = document.getElementsByTagName("script");
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];

    // If src exists...
    if (script.src) {
      // Get the src file.
      let srcFile = script.src;
      if (srcFile.startsWith("file://")) {
        srcFile = srcFile.slice("file://".length);
      }

      // Delete the src.
      script.removeAttribute("src");

      // Get the script content.
      const content = fs.readFileSync(srcFile);

      // Set the script content.
      script.text = content;
    }
  }

  // Iterate all links with hrefs in the DOM.
  const links = document.getElementsByTagName("link");
  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    // If href exists...
    if (link.href) {
      // Get the href file.
      let hrefFile = link.href;
      if (hrefFile.startsWith("file://")) {
        hrefFile = hrefFile.slice("file://".length);
      }

      // Get the link content.
      const content = fs.readFileSync(hrefFile);

      // Set the style content.
      const style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode(content));
      link.replaceWith(style);
    }
  }

  // Write to the original file.
  fs.writeFileSync(filePath, dom.serialize());
}
