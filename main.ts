import { Plugin, MarkdownPostProcessorContext, PluginSettingTab, Setting, App, TFile, normalizePath } from 'obsidian';
import { createHash } from 'crypto';

interface TexPluginSettings {
  server: string;
  apiPath: string;
  header: string[];
  documentHeader: string[];
  documentFooter: string[];
  packages: string[];
  scale: string;
}

interface Result {
  imageURL?: string;
  error?: string;
} 

function getFilename(url:string):string {
  return url.split('/').pop() as string;
}

function generateHash(source: string):string {
  return createHash('sha256').update(source).digest('hex');
}

const DEFAULT_SETTINGS: TexPluginSettings = {
  server: "https://tex.tools",
  apiPath: "/api/convert",
  header: [
    "\\documentclass{article}",
    "\\pagestyle{empty}"
  ],
  documentHeader: [
    "\\begin{document}",
    "\\mathlig{->}{\\rightarrow}",
    "\\mathlig{|-}{\\vdash}",
    "\\mathlig{=>}{\\Rightarrow}",
    "\\mathligson"
  ],
  documentFooter: [
    "\\end{document}"
  ],
  packages: [
    "\\usepackage{floatflt,amsmath,amssymb}",
    "\\usepackage[ligature, inference]{semantic}"
  ],
  scale: "100%"
};

export default class TeTeXPlugin extends Plugin {
  settings: TexPluginSettings;

  async onload() {
    console.log("onload():0");
    await this.loadSettings();
    console.log("onload():1");

    console.log("this.app", this.app);

    this.addSettingTab(new TeTeXSettingTab(this.app, this));
    console.log("onload():2");

    this.registerMarkdownCodeBlockProcessor("tetex", this.process.bind(this));
    console.log("onload():3");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async process(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    console.log("process():0");
    const texDocument = this.generateTeXDocument(source);
    const hash = generateHash(texDocument);
    const filename = hash + ".png";
    console.log("process():1");
    const activeFilePath = this.app.workspace.getActiveFile()?.path;
    console.log("process():2");
    const path = await this.app.fileManager.getAvailablePathForAttachment(filename, activeFilePath);
    console.log("process():3");
    
    console.log("path = ", path);

    if (!await this.app.vault.adapter.exists(path)) {
      console.log("process():3");
      const result:Result|false = await this.fetchImageURL(hash, texDocument);
      console.log("process():4");

      console.log("result = ", result);
     
      if (result) {
        if (!result.error) {
          const data = await this.fetchImage(result.imageURL!);

          if (data) {
            console.log("process():5");
            await this.app.vault.createBinary(path, data);
            console.log("process():6");
          }
          else
            console.log("error: Unable to fetch image.");
        }
      }
      else
        console.log("error: Unable to connect to server or server error."); // TODO: fetch() errors
    }

    console.log("process():7");
    this.renderImage(el, this.app.vault.adapter.getResourcePath(path));
    console.log("process():8");
  }

  generateTeXDocument(fragment: string):string {
    return [
      ...this.settings.header,
      ...this.settings.packages,
      ...this.settings.documentHeader,
      fragment,
      ...this.settings.documentFooter
    ].join('\n').trim();
  }

  async fetchImageURL(hash:string, texDocument:string):Promise<Result|false> {
    // TODO: fetch() errors
    const response = await fetch(this.settings.server + this.settings.apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "hash": hash,
        "latexInput": texDocument,
        "outputScale": this.settings.scale,
        "outputFormat": "PNG"
      })
    });

    if (response.ok)
      return await response.json();
    else
      return false;
  }

  async fetchImage(path:string):Promise<ArrayBuffer|false> {
    // TODO: fetch() errors
    const response = await fetch(this.settings.server + "/" + path);

    if (response.ok) {
      return await response.arrayBuffer();
    }
    else
      return false;
  }

  async storeImage(path: string, data:ArrayBuffer):Promise<void> {
    await this.app.vault.createBinary(path, data);
  }
/*
  async processTeTeXBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const texDocument = generateTeX(source);

    const hash = generateHash(texDocument);

    const response = await fetch(`${this.settings.server}${this.settings.apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "hash": hash,
        "latexInput": texDocument,
        "outputScale": this.settings.scale,
        "outputFormat": "PNG"
      })
    });

    if (response.ok) {
      const result:Result = await response.json();

      console.log("result.imageURL = ", result.imageURL);

      if (!result.error) {
        const path = await this.store(this.settings.server + "/" + result.imageURL!);

        console.log("path: ", path);

        if (path) {
          this.render(el, path);
        }
      }
      else {
        this.error(el, result.error);
        console.log("Error: ", result.error);
      }
    }
  }
*/

  renderImage(el: HTMLElement, imagePath: string) {
    const div = el.createEl("div");
    const img = div.createEl("img");
    img.src = imagePath;
  }

  renderImageBase64(el: HTMLElement, imageData: ArrayBuffer) {
    const base64image = btoa(String.fromCharCode(...new Uint8Array(imageData)));
    const div = el.createEl("div");
    const img = div.createEl("img");
    img.src = "data:image/jpeg;base64," + base64image;
  }

  error(el: HTMLElement, error: string) {
    const div = el.createEl("div");
    div.innerText = error;
  }
}

class TeTeXSettingTab extends PluginSettingTab {
  plugin: TeTeXPlugin;

  constructor(app: App, plugin: TeTeXPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'TeTeX Plugin Settings' });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('The TeTeX server URL')
      .addText(text => text
        .setPlaceholder('Enter server URL')
        .setValue(this.plugin.settings.server)
        .onChange(async (value) => {
          this.plugin.settings.server = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('API Path')
      .setDesc('The TeTeX server API path')
      .addText(text => text
        .setPlaceholder('Enter API path')
        .setValue(this.plugin.settings.apiPath)
        .onChange(async (value) => {
          this.plugin.settings.apiPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Document Header')
      .setDesc('Lines to include at the beginning of the document')
      .addTextArea(textArea => textArea
        .setPlaceholder('Enter document header')
        .setValue(this.plugin.settings.documentHeader.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.documentHeader = value.split('\n');
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Packages')
      .setDesc('Packages to include in the document')
      .addTextArea(textArea => textArea
        .setPlaceholder('Enter packages')
        .setValue(this.plugin.settings.packages.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.packages = value.split('\n');
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Document Footer')
      .setDesc('Lines to include at the end of the document')
      .addTextArea(textArea => textArea
        .setPlaceholder('Enter document footer')
        .setValue(this.plugin.settings.documentFooter.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.documentFooter = value.split('\n');
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Scale')
      .setDesc('Scale factor')
      .addText(text => text
        .setPlaceholder('Enter scale factor')
        .setValue(this.plugin.settings.scale)
        .onChange(async (value) => {
          this.plugin.settings.scale = value;
          await this.plugin.saveSettings();
        }));
  }
}
