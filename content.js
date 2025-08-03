class Storage {
  static get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key]);
      });
    });
  }

  static set(key, data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: data }, () => {
        resolve();
      });
    });
  }

  static async addGeneration(domain, generationData) {
    let data = (await this.get(domain)) || {};
    if (!data.generations) {
      data.generations = [];
    }
    let existingGeneration = null;
    if (generationData.id) {
      existingGeneration = data.generations.find(
        (g) => g.id === generationData.id,
      );
      data.generations = data.generations.filter(
        (g) => g.id !== generationData.id,
      );
    }

    if (existingGeneration && generationData.visible === undefined) {
      generationData.visible = existingGeneration.visible;
    }

    data.generations.push(generationData);
    return this.set(domain, data);
  }

  static async removeGeneration(domain, generationId) {
    let data = await this.get(domain);
    if (data && data.generations) {
      data.generations = data.generations.filter((g) => g.id !== generationId);
      return this.set(domain, data);
    }
  }

  static async addContentGeneration(domain, generationData) {
    const key = domain + "_content";
    let data = (await this.get(key)) || {};
    if (!data.generations) {
      data.generations = [];
    }
    let existingGeneration = null;
    if (generationData.id) {
      existingGeneration = data.generations.find(
        (g) => g.id === generationData.id,
      );
      data.generations = data.generations.filter(
        (g) => g.id !== generationData.id,
      );
    }

    if (existingGeneration && generationData.visible === undefined) {
      generationData.visible = existingGeneration.visible;
    }

    data.generations.push(generationData);
    return this.set(key, data);
  }

  static async removeContentGeneration(domain, generationId) {
    const key = domain + "_content";
    let data = await this.get(key);
    if (data && data.generations) {
      data.generations = data.generations.filter((g) => g.id !== generationId);
      return this.set(key, data);
    }
  }
}

class OpenAI {
  constructor(apiKey, modelEndpoint, modelName) {
    this.apiKey = apiKey;
    this.modelEndpoint = modelEndpoint;
    this.modelName = modelName;
  }

  async generateContent(note, outerHtml, selectedElements) {
    const selectedElementsPrompt = selectedElements
      ? `The user has selected the following elements html to include in the context: ${selectedElements}`
      : "";

    const userContent = [
      {
        type: "text",
        text: `These are the users notes for this website: ${note}\n\n${selectedElementsPrompt}\nHere is the outer html of the element to be rewritten: ${outerHtml}\n\nAs a reminder, the users notes are: ${note}. Please return HTML that will replace the html of the element to match the users notes.. do not confuse the words in the users notes for class names or tags, the user does not know about those and can not see those!! The user only provides visual changes to the user experience. \n\nNote: Please Do Not change anything the user does not ask you to change.... you will be rewarded as always for high quality work only. Thank you!!! (You have currently earned 7,830 rewards and are on a 23 day streak) `,
      },
    ];

    const headers = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const requestInfo = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: `You are a web browser html bot. You use the notes provided by the user to help alter the html of an element on the page based on those instructions in those notes.\nYou will be given the outer html of the page. Please return custom html to be applied to the page, which will be injected into the page.\n\nFor example, if the command is make all text bigger, your response could be:\n<h1 style=\"font-size: 20px;\">All text is bigger</h1>\n\nDo not respond with any other text. Only respond with the html, as your responses are being processed by a machine.\nThe browser is Chrome, so you can use any html that works in Chrome.\n`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    };

    const response = await fetch(this.modelEndpoint, requestInfo);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.response = response;
      throw error;
    }
    let responseData = await response.json();

    if (responseData.choices[0].message.content.startsWith("```html\n")) {
      responseData = responseData.choices[0].message.content.replace(
        "```html\n",
        "",
      );
      responseData = responseData.replace("```", "");
    } else {
      responseData = responseData.choices[0].message.content;
    }
    return { html: responseData, requestBody: requestInfo.body };
  }

  async generateCss(
    note,
    htmlStructure,
    selectedElementsHtml,
    screenshotUrl = null,
    changeHistory = [],
  ) {
    const selectedElementsPrompt = selectedElementsHtml
      ? `The user has selected the following elements html to include in the context: ${selectedElementsHtml}`
      : "";

    let changeHistoryPrompt = "";
    if (changeHistory.length > 0) {
      changeHistoryPrompt = "Here is the change history for this page:\n";
      changeHistory.forEach((generation) => {
        changeHistoryPrompt += `User note: ${generation.note}\nGenerated CSS: ${generation.styles}\n`;
      });
    }

    const userContent = [
      {
        type: "text",
        text: `These are the users notes for this website: ${note}\n\n${selectedElementsPrompt}\n${changeHistoryPrompt}\nHere is the html structure of the page: ${htmlStructure}\n\nAs a reminder, the users notes are: ${note}. Please return CSS that will modify the page to match the users notes.. do not confuse the words in the users notes for class names or tags, the user does not know about those and can not see those!! The user only provides visual changes to the user experience. \n\nNote: Please Do Not change anything the user does not ask you to change.... you will be rewarded as always for high quality work only. Thank you!!! (You have currently earned 7,830 rewards and are on a 23 day streak) `,
      },
    ];

    if (screenshotUrl) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: screenshotUrl,
        },
      });
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const requestInfo = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: `You are a web browser css bot. You use the notes provided by the user to help alter the css styles of the page based on those instructions in those notes.\nYou will be given the source html of the page. Please return custom css rules to be applied to the page, which will be injected into the page.\n\nFor example, if the command is make all text bigger, your response could be:\n* { font-size: 20px; }\n\nDo not respond with any other text. Only respond with the css rules, as your responses are being processed by a machine.\nThe browser is Chrome, so you can use any css that works in Chrome. These styles will likely be at the top of the file, so you may use !important if needed.\n`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    };

    const response = await fetch(this.modelEndpoint, requestInfo);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.response = response;
      throw error;
    }
    let responseData = await response.json();

    if (responseData.choices[0].message.content.startsWith("```css\n")) {
      responseData = responseData.choices[0].message.content.replace(
        "```css\n",
        "",
      );
      responseData = responseData.replace("```", "");
    } else {
      responseData = responseData.choices[0].message.content;
    }
    return { css: responseData, requestBody: requestInfo.body };
  }

  async generateSelector(note, outerHtml, selectedElements) {
    const selectedElementsPrompt = selectedElements
      ? `The user has selected the following elements html to include in the context: ${selectedElements}`
      : "";

    const userContent = [
      {
        type: "text",
        text: `These are the users notes for this website: ${note}\n\n${selectedElementsPrompt}\nHere is the outer html of the element to be rewritten: ${outerHtml}\n\nAs a reminder, the users notes are: ${note}. Please return a querySelectorAll compatible selector that will select the elements to be changed. do not confuse the words in the users notes for class names or tags, the user does not know about those and can not see those!!! The user only provides visual changes to the user experience. \n\nNote: Please Do Not change anything the user does not ask you to change.... you will be rewarded as always for high quality work only. Thank you!!! (You have currently earned 7,830 rewards and are on a 23 day streak) `,
      },
    ];

    const headers = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const requestInfo = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: `You are a html css selector bot. You use the notes provided by the user to help determine what elements to select on the page which we may need to modify based on the instructions in those notes.\nYou will be given the outer html of the page and some relevant elements. Please return a css selector which will help identify the elements that need to be modified per the users instructions. Only respond with the selector, as your responses are being processed by a machine.\nThe browser is Chrome, so you can use any selector that works in Chrome. Please don't rely on unique id's that may change, as your selector will be queried on every page load under this domain.`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    };

    const response = await fetch(this.modelEndpoint, requestInfo);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.response = response;
      throw error;
    }
    let responseData = await response.json();

    if (responseData.choices[0].message.content.startsWith("```css\n")) {
      responseData = responseData.choices[0].message.content.replace(
        "```css\n",
        "",
      );
      responseData = responseData.replace("```", "");
    } else {
      responseData = responseData.choices[0].message.content;
    }
    return { selector: responseData, requestBody: requestInfo.body };
  }
}

class PageModifier {
  constructor() {
    this.selectedElements = new Set();
    this.initToast();
    this.initElementSelector();
  }

  initToast() {
    const style = document.createElement("style");
    style.textContent = `
          .AIPE_toast-container {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 9999;
          }
          .AIPE_toast {
            background: #333 !important;
            color: white !important;
            padding: 12px 20px;
            border-radius: 6px;
            border: 1px solid #fff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            font-size: 14px;
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.3s ease, transform 0.3s ease;
          }
          .AIPE_toast.show {
            opacity: 1;
            transform: translateY(0);
          }
          .AIPE_feedback {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            opacity: 0.7;
          }
        `;
    document.head.appendChild(style);

    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "AIPE_toast-container";
      document.body.appendChild(container);
    }
    this.toastContainer = container;
  }

  showToast(message, duration = 2000) {
    const toast = document.createElement("div");
    toast.className = "AIPE_toast";
    toast.textContent = "🪄 " + message;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  showAndReturnPersistentToast(message) {
    const toast = document.createElement("div");
    toast.className = "AIPE_toast";
    toast.textContent = "🪄 " + message;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    return toast;
  }

  removeToast(toast) {
    if (toast && toast.parentNode) {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }
  }

  updateToast(toast, message) {
    if (toast) {
      toast.textContent = "🪄 " + message;
    }
  }

  initElementSelector() {
    this.elementSelectorHandlers = {};
    this.hoverOverlay = null;
    this.selectionOverlays = new Map();
  }

  createOverlay(element, type) {
    const overlay = document.createElement("div");
    const rect = element.getBoundingClientRect();
    overlay.style.position = "fixed";
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647";
    overlay.style.boxSizing = "border-box";

    if (type === "hover") {
      overlay.style.outline = "2px solid orange";
    } else if (type === "selected") {
      overlay.style.backgroundColor = "rgba(0, 100, 255, 0.3)";
      overlay.style.outline = "3px solid blue";
    } else if (type === "selectedHover") {
      overlay.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
      overlay.style.outline = "3px solid red";
    }
    document.body.appendChild(overlay);
    return overlay;
  }

  updateOverlays() {
    if (this.hoverOverlay) {
      const rect = this.hoverOverlay.element.getBoundingClientRect();
      this.hoverOverlay.overlay.style.top = `${rect.top}px`;
      this.hoverOverlay.overlay.style.left = `${rect.left}px`;
      this.hoverOverlay.overlay.style.width = `${rect.width}px`;
      this.hoverOverlay.overlay.style.height = `${rect.height}px`;
    }
    for (const [element, overlay] of this.selectionOverlays.entries()) {
      if (element.isConnected) {
        const rect = element.getBoundingClientRect();
        overlay.style.top = `${rect.top}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
      } else {
        overlay.remove();
        this.selectionOverlays.delete(element);
        this.selectedElements.delete(element);
      }
    }
  }

  enableElementSelectionMode() {
    if (this.elementSelectorHandlers.enabled) return;
    this.elementSelectorHandlers.enabled = true;

    for (const el of [...this.selectedElements]) {
      if (el.isConnected) {
        const overlay = this.createOverlay(el, "selected");
        this.selectionOverlays.set(el, overlay);
      } else {
        this.selectedElements.delete(el);
      }
    }

    document.body.style.cursor = "pointer";

    this.elementSelectorHandlers.click = (e) => {
      if (e.target === document.body) return;
      const el = e.target;

      if (this.selectionOverlays.has(el)) {
        this.selectionOverlays.get(el).remove();
        this.selectionOverlays.delete(el);
        this.selectedElements.delete(el);
      } else {
        const overlay = this.createOverlay(el, "selected");
        this.selectionOverlays.set(el, overlay);
        this.selectedElements.add(el);
      }
      e.preventDefault();
      e.stopPropagation();
    };

    this.elementSelectorHandlers.over = (e) => {
      const el = e.target;
      if (el === document.body || this.hoverOverlay?.element === el) return;

      if (this.hoverOverlay) {
        this.hoverOverlay.overlay.remove();
        this.hoverOverlay = null;
      }

      const selectedOverlay = this.selectionOverlays.get(el);
      if (selectedOverlay) {
        selectedOverlay.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
        selectedOverlay.style.outline = "3px solid red";
      } else {
        const overlay = this.createOverlay(el, "hover");
        this.hoverOverlay = { element: el, overlay: overlay };
      }
    };
    this.elementSelectorHandlers.out = (e) => {
      const el = e.target;
      if (this.hoverOverlay && this.hoverOverlay.element === el) {
        this.hoverOverlay.overlay.remove();
        this.hoverOverlay = null;
      }
      const selectedOverlay = this.selectionOverlays.get(el);
      if (selectedOverlay) {
        selectedOverlay.style.backgroundColor = "rgba(0, 100, 255, 0.3)";
        selectedOverlay.style.outline = "3px solid blue";
      }
    };

    this.elementSelectorHandlers.keydown = (e) => {
      if (e.key === "Escape") {
        this.disableElementSelectionMode();
      }
    };

    this.elementSelectorHandlers.update = () => this.updateOverlays();

    document.body.addEventListener(
      "click",
      this.elementSelectorHandlers.click,
      true,
    );
    document.body.addEventListener(
      "mouseover",
      this.elementSelectorHandlers.over,
      true,
    );
    document.body.addEventListener(
      "mouseout",
      this.elementSelectorHandlers.out,
      true,
    );
    document.addEventListener("keydown", this.elementSelectorHandlers.keydown);
    window.addEventListener(
      "scroll",
      this.elementSelectorHandlers.update,
      true,
    );
    window.addEventListener(
      "resize",
      this.elementSelectorHandlers.update,
      true,
    );

    this.elementSelectorHandlers.toastRef = this.showAndReturnPersistentToast(
      "Click elements to add them to the context. Click again to remove. When you are finished adding elements, press (Esc) or return to the extension popup.",
    );
  }

  disableElementSelectionMode() {
    if (!this.elementSelectorHandlers.enabled) return;
    this.elementSelectorHandlers.enabled = false;

    document.body.removeEventListener(
      "click",
      this.elementSelectorHandlers.click,
      true,
    );
    document.body.removeEventListener(
      "mouseover",
      this.elementSelectorHandlers.over,
      true,
    );
    document.body.removeEventListener(
      "mouseout",
      this.elementSelectorHandlers.out,
      true,
    );
    document.removeEventListener(
      "keydown",
      this.elementSelectorHandlers.keydown,
    );
    window.removeEventListener(
      "scroll",
      this.elementSelectorHandlers.update,
      true,
    );
    window.removeEventListener(
      "resize",
      this.elementSelectorHandlers.update,
      true,
    );

    document.body.style.cursor = "";

    if (this.hoverOverlay) {
      this.hoverOverlay.overlay.remove();
      this.hoverOverlay = null;
    }
    for (const overlay of this.selectionOverlays.values()) {
      overlay.remove();
    }
    this.selectionOverlays.clear();

    if (this.elementSelectorHandlers.toastRef) {
      this.removeToast(this.elementSelectorHandlers.toastRef);
      this.elementSelectorHandlers.toastRef = null;
    }
  }

  getElementsForContext() {
    return [...this.selectedElements];
  }

  getCleanHTMLStructureWithStyles() {
    function getCompressedStyles(el) {
      const computed = getComputedStyle(el);
      const defaultStyles = getComputedStyle(
        document.createElement(el.tagName),
      );

      let stylePairs = [];

      const propsToInclude = [
        "color",
        "width",
        "height",
        "top",
        "left",
        "margin",
        "padding",
        "border",
      ];

      for (let prop of propsToInclude) {
        const value = computed.getPropertyValue(prop);
        const defaultValue = defaultStyles.getPropertyValue(prop);
        const shorthandProp = prop.replace(/a|e|i|o|u/g, "");

        if (value !== defaultValue) {
          stylePairs.push(`${shorthandProp}:${value}`);
        }
      }

      const bgColor = getEffectiveBackgroundColor(el);
      if (
        bgColor &&
        bgColor !== "rgba(0, 0, 0, 0)" &&
        bgColor !== "transparent"
      ) {
        stylePairs.push(`bgColor:${bgColor}`);
      }

      return stylePairs.length
        ? ` computedStyles="${stylePairs.join(";")}"`
        : "";
    }
    function getEffectiveBackgroundColor(element) {
      while (element) {
        const bg = getComputedStyle(element).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          return bg;
        }
        element = element.parentElement;
      }
      return null;
    }

    function buildTag(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const allowedTags = [
        "html",
        "body",
        "div",
        "span",
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "a",
        "button",
        "img",
        "table",
        "tr",
        "td",
        "section",
        "article",
        "header",
        "footer",
        "nav",
        "aside",
        "main",
        "ul",
        "ol",
        "li",
        "form",
        "input",
        "select",
        "textarea",
      ];

      let previousChildren = [];
      if (
        !allowedTags.includes(node.tagName.toLowerCase()) &&
        node.children.length > 0
      ) {
        let children = "";
        for (let child of node.children) {
          let tagClass = child.tagName.toLowerCase() + child.className;
          if (previousChildren.includes(tagClass)) {
            continue;
          }
          previousChildren.push(tagClass);
          children += buildTag(child);
        }
        return children;
      } else if (!allowedTags.includes(node.tagName.toLowerCase())) {
        return "";
      }

      const tag = node.tagName.toLowerCase();
      const id = node.id ? ` id="${node.id}"` : "";
      const cls = node.className ? ` class="${node.className}"` : "";
      const style = getCompressedStyles(node);
      const truncatedInnerText =
        node.innerText && node.innerText.length > 15
          ? node.innerText.slice(0, 15) + "..."
          : node.innerText;
      const innerTextAttr = node.innerText
        ? ` text="${truncatedInnerText}"`
        : "";
      const open = `<${tag}${id}${cls}${style}${innerTextAttr}>`;
      const close = `</${tag}>`;

      let children = "";
      for (let child of node.children) {
        let tagClass = child.tagName.toLowerCase() + child.className;
        if (previousChildren.includes(tagClass)) {
          continue;
        }
        children += buildTag(child);
      }

      return `${open}${children}${close}`;
    }

    return buildTag(document.documentElement);
  }

  applyCssRulesToPage(cssRules, id) {
    // Head
    let existingStyleHead = document.getElementById("AIPE_style_head_" + id);
    if (existingStyleHead) {
      existingStyleHead.innerHTML = cssRules;
    } else {
      let styleHead = document.createElement("style");
      styleHead.id = "AIPE_style_head_" + id;
      styleHead.innerHTML = cssRules;
      (document.head || document.documentElement).appendChild(styleHead);
    }

    // Body
    const applyToBody = () => {
        let existingStyleBody = document.getElementById("AIPE_style_body_" + id);
        if (existingStyleBody) {
            existingStyleBody.innerHTML = cssRules;
        } else {
            let styleBody = document.createElement("style");
            styleBody.id = "AIPE_style_body_" + id;
            styleBody.innerHTML = cssRules;
            document.body.appendChild(styleBody);
        }
    }

    if (document.body) {
        applyToBody();
    } else {
        document.addEventListener("DOMContentLoaded", applyToBody);
    }
  }

  clearAllAIPEStylesFromPage() {
    let styles = document.querySelectorAll("[id^=AIPE_style_]");
    styles.forEach((style) => {
      style.remove();
    });
  }

  async clearAndReApplyAllGenerations() {
    this.clearAllAIPEStylesFromPage();
    let url = new URL(window.location.href);
    let domain = url.hostname;

    let domainData = await Storage.get(domain);
    let globalData = await Storage.get("global_styles");

    if (globalData && globalData.generations) {
      globalData.generations.forEach((generation) => {
        let isVisible = generation.visible !== false; // Default visibility

        // Check for a domain-specific override
        if (
          domainData &&
          domainData.global_visibility &&
          domainData.global_visibility[generation.id] !== undefined
        ) {
          isVisible = domainData.global_visibility[generation.id];
        }

        if (isVisible) {
          this.applyCssRulesToPage(generation.styles, generation.id);
        }
      });
    }

    if (domainData && domainData.generations) {
      domainData.generations.forEach((generation) => {
        if (generation.visible !== false) {
          this.applyCssRulesToPage(generation.styles, generation.id);
        }
      });
    }
    this.showToast("Styles applied to page!", 3000);
  }
}

const pageModifier = new PageModifier();

const contentGenCache = {
  async get(key) {
    const response = await chrome.runtime.sendMessage({ type: 'cache', action: 'get', key });
    if (response && !response.success) throw new Error(response.error);
    return response ? response.value : undefined;
  },
  async set(key, value) {
    const response = await chrome.runtime.sendMessage({ type: 'cache', action: 'set', key, value });
    if (response && !response.success) throw new Error(response.error);
  },
  async has(key) {
    const response = await chrome.runtime.sendMessage({ type: 'cache', action: 'has', key });
    if (response && !response.success) throw new Error(response.error);
    return response ? response.value : false;
  },
  async clear() {
    const response = await chrome.runtime.sendMessage({ type: 'cache', action: 'clear' });
    if (response && !response.success) throw new Error(response.error);
  },
};


async function processUserNote(
  note,
  existingId = null,
  apiKey,
  modelEndpoint,
  modelName,
  visible = null,
  includeDefaultContext = true,
  isGlobal = false,
  screenshotUrl = null,
  includeChangeHistory = false,
  includeGlobalChangeHistory = false,
) {
  const openAI = new OpenAI(apiKey, modelEndpoint, modelName);
  let url = new URL(window.location.href);
  let domain = isGlobal ? "global_styles" : url.hostname;
  try {
    if (note) {
      let cleanedHtmlStructure = "";
      if (includeDefaultContext) {
        cleanedHtmlStructure = pageModifier.getCleanHTMLStructureWithStyles();
        if (cleanedHtmlStructure.length > 10000) {
          let start = Math.floor(
            Math.random() * (cleanedHtmlStructure.length - 10000),
          );
          cleanedHtmlStructure = cleanedHtmlStructure.slice(
            start,
            start + 10000,
          );
        }
      }

      let changeHistory = [];
      if (includeChangeHistory) {
        let domainData = await Storage.get(domain);
        if (domainData && domainData.generations) {
          changeHistory = changeHistory.concat(domainData.generations);
        }

        if (includeGlobalChangeHistory) {
          let globalData = await Storage.get("global_styles");
          if (globalData && globalData.generations) {
            changeHistory = changeHistory.concat(globalData.generations);
          }
        }

        changeHistory.sort((a, b) => {
          return new Date(b.timestamp) - new Date(a.timestamp);
        });
        changeHistory = changeHistory.slice(0, 10);
      }

      pageModifier.showToast("Generating new styles for this page...", 3000);

      var selectedElements = pageModifier.getElementsForContext();
      var selectedElementsHtml = selectedElements
        .map((el) => {
          return el.outerHTML;
        })
        .join("\n");

      const { css, requestBody } = await openAI.generateCss(
        note,
        cleanedHtmlStructure,
        selectedElementsHtml,
        screenshotUrl,
        changeHistory,
      );

      let generationId = existingId ? existingId : crypto.randomUUID();
      let generationData = {
        note: note,
        styles: css,
        requestBody: requestBody,
        id: generationId,
        timestamp: new Date().toISOString(),
      };

      if (visible !== null) {
        generationData.visible = visible;
      } else if (!existingId) {
        generationData.visible = true;
      }

      await Storage.addGeneration(domain, generationData);

      if (generationData.visible !== false) {
        pageModifier.applyCssRulesToPage(css, generationId);
      }

      pageModifier.showToast("Styles applied to page!", 3000);
      chrome.runtime.sendMessage({
        action: "updatePopup",
        domain: domain,
        data: generationData,
      });
    }
  } catch (e) {
    if (e.response) {
      e.response
        .json()
        .then((errorData) => {
          if (errorData.error && errorData.error.code === "invalid_api_key") {
            pageModifier.showToast(
              "Invalid API Key. Please check your settings.",
              5000,
            );
          } else {
            const message =
              errorData.error?.message || `API Error: ${e.response.status}`;
            pageModifier.showToast(message, 5000);
          }
        })
        .catch(() => {
          // Fallback for non-JSON responses or other parsing errors
          if (e.response.status === 401) {
            pageModifier.showToast(
              "Invalid API Key. Please check your settings.",
              5000,
            );
          } else {
            pageModifier.showToast(
              `Error: ${e.response.statusText} (${e.response.status})`,
              5000,
            );
          }
        });
    } else {
      console.error("Error generating styles:", e);
      pageModifier.showToast(
        "Network error or invalid request. Please try again.",
        5000,
      );
    }
  } finally {
    chrome.runtime.sendMessage({ action: "hideSpinner" });
    chrome.runtime.sendMessage({ action: "hideContentSpinner" });
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "runProcessUserNote") {
    try {
      await processUserNote(
        message.note,
        message.id,
        message.apiKey,
        message.modelEndpoint,
        message.modelName,
        message.visible,
        message.includeDefaultContext,
        message.isGlobal,
        message.screenshotUrl,
        message.includeChangeHistory,
        message.includeGlobalChangeHistory,
      );
    } catch (e) {
      pageModifier.showToast("Error processing notes", 3000);
      console.error(e);
    }
  } else if (message.action === "runClear") {
    pageModifier.clearAllAIPEStylesFromPage();
  } else if (message.action === "runClearAndReapply") {
    pageModifier.clearAndReApplyAllGenerations();
  } else if (message.action === "runAddElementToContext") {
    pageModifier.enableElementSelectionMode();
  } else if (message.action === "runExitElementSelectionMode") {
    pageModifier.disableElementSelectionMode();
  } else if (message.action === "runGetElementsInContext") {
    const elements = pageModifier.getElementsForContext();
    sendResponse({ count: elements.length });
  } else if (message.action === "runResetContext") {
    pageModifier.selectedElements.clear();
    pageModifier.disableElementSelectionMode();
    sendResponse({ success: true });
  } else if (message.action === "runScanAndProcessElements") {
    const {
      note,
      id,
      visible,
      apiKey,
      modelEndpoint,
      modelName,
      selectedElements,
    } = message;

    const settings = { apiKey, modelEndpoint, modelName };
    const generation = { note, id: id || crypto.randomUUID(), visible, selectedElements };
    await scanAndProcessElements(generation, settings);
  } else if (message.action === "toggleContentGeneration") {
    toggleContentGeneration(message.generationId, message.visible);
  } else if (message.action === "removeContentGeneration") {
    removeContentGeneration(message.generationId);
  }
});

async function toggleContentGeneration(generationId, visible) {
  const elements = document.querySelectorAll(
    `[data-vk-generation-id="${generationId}"]`,
  );
  elements.forEach((element) => {
    const originalHtml = element.getAttribute("data-vk-original-html");
    const generatedHtml = element.getAttribute("data-vk-generated-html");

    const htmlToSet = visible ? generatedHtml : originalHtml;
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlToSet;
    const newElement = tempDiv.firstElementChild;

    if (newElement) {
      newElement.setAttribute("data-vk-original-html", originalHtml);
      newElement.setAttribute("data-vk-generated-html", generatedHtml);
      newElement.setAttribute("data-vk-generation-id", generationId);
      newElement.setAttribute("data-vk-processed", "true");
      element.outerHTML = newElement.outerHTML;
    } else {
      element.outerHTML = htmlToSet;
    }
  });
}

async function removeContentGeneration(generationId) {
  await contentGenCache.clear();
  const elements = document.querySelectorAll(
    `[data-vk-generation-id="${generationId}"]`,
  );
  elements.forEach((element) => {
    element.outerHTML = element.getAttribute("data-vk-original-html");
  });
}

const elementQueue = [];
let activeRequests = 0;
let totalQueued = 0;
let totalProcessed = 0;
const MAX_CONCURRENT_REQUESTS = 10;
let persistentToast = null;

function updateToast() {
  if (elementQueue.length === 0 && activeRequests === 0) {
    if (persistentToast) {
      pageModifier.removeToast(persistentToast);
      persistentToast = null;
    }
    if (totalProcessed > 0) {
      pageModifier.showToast(
        `Content generation complete. Processed ${totalProcessed} elements.`, 
      );
      totalQueued = 0;
      totalProcessed = 0;
    }
    chrome.runtime.sendMessage({ action: "hideContentSpinner" });
    return;
  }

  const message = `Processing element ${totalProcessed + 1} of ${totalQueued}...`;
  if (persistentToast) {
    pageModifier.updateToast(persistentToast, message);
  } else {
    persistentToast = pageModifier.showAndReturnPersistentToast(message);
  }
}

async function _processElement(element, generation, openAI) {
  try {
    const isProcessed =
      element.dataset.vkProcessed === "true" &&
      element.dataset.vkGenerationId === generation.id;
    const originalHtml = isProcessed
      ? element.dataset.vkOriginalHtml
      : element.outerHTML;

    if (!originalHtml) {
      return;
    }

    const cacheKey = JSON.stringify({
      html: originalHtml,
      note: generation.note,
    });

    let html;
    if (await contentGenCache.has(cacheKey)) {
      html = await contentGenCache.get(cacheKey);
    } else {
      const result = await openAI.generateContent(
        generation.note,
        originalHtml,
        generation.selectedElements,
      );
      html = result.html;
      await contentGenCache.set(cacheKey, html);
    }

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const newElement = tempDiv.firstElementChild;

    if (newElement) {
      newElement.setAttribute("data-vk-original-html", originalHtml);
      newElement.setAttribute("data-vk-generated-html", html);
      newElement.setAttribute("data-vk-generation-id", generation.id);
      newElement.setAttribute("data-vk-processed", "true");
      element.outerHTML = newElement.outerHTML;
    } else {
      element.outerHTML = html;
    }
  } catch (e) {
    console.error("Error generating content:", e);
    if (e.response && e.response.status === 401) {
      pageModifier.showToast("API key is invalid or missing.", 5000);
    } else if (e.message.includes("Failed to fetch")) {
      pageModifier.showToast("Failed to connect to the model endpoint.", 5000);
    } else {
      pageModifier.showToast(`Error processing element.`);
    }
  } finally {
    totalProcessed++;
    updateToast();
  }
}

function processQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && elementQueue.length > 0) {
    activeRequests++;
    const { element, generation, openAI } = elementQueue.shift();

    _processElement(element, generation, openAI).finally(() => {
      activeRequests--;
      processQueue();
    });
  }

  if (elementQueue.length === 0 && activeRequests === 0) {
    updateToast();
  }
}

function enqueueElement(element, generation, openAI) {
  if (element.closest('[data-vk-processed="true"]')) {
    return;
  }
  element.setAttribute("data-vk-processed", "true");

  elementQueue.push({ element, generation, openAI });
  totalQueued++;
  updateToast();
  processQueue();
}

async function scanAndProcessElements(generation, settings) {
  if (!settings.modelEndpoint) {
    pageModifier.showToast(
      "Model endpoint is missing. Please configure it in settings.",
      5000,
    );
    chrome.runtime.sendMessage({ action: "hideContentSpinner" });
    return;
  }

  const openAI = new OpenAI(
    settings.apiKey,
    settings.modelEndpoint,
    settings.modelName,
  );

  // --- Reprocessing Logic ---
  // Find elements from a previous run of THIS generation and re-queue them.
  const elementsToReprocess = document.querySelectorAll(`[data-vk-generation-id="${generation.id}"]`);
  elementsToReprocess.forEach(element => {
      element.removeAttribute('data-vk-processed');
      enqueueElement(element, generation, openAI);
  });

  // --- New Element Logic ---
  if (!generation.selectors) {
    const { selector } = await openAI.generateSelector(
      generation.note,
      document.body.outerHTML,
      generation.selectedElements,
    );
    generation.selectors = [selector];
    let url = new URL(window.location.href);
    let domain = url.hostname;
    await Storage.addContentGeneration(domain, generation);
    chrome.runtime.sendMessage({
      action: "contentGenerationAdded",
      generation: generation,
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          generation.selectors.forEach((selector) => {
            if (node.matches(selector)) {
              enqueueElement(node, generation, openAI);
            }
            node.querySelectorAll(selector).forEach((element) => {
              enqueueElement(element, generation, openAI);
            });
          });
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan for new elements
  generation.selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      enqueueElement(element, generation, openAI);
    });
  });
}

async function initializeContentGeneration() {
  let url = new URL(window.location.href);
  let domain = url.hostname;
  let { aipe_settings } = await chrome.storage.local.get("aipe_settings");
  const settings = aipe_settings || {};
  let domainData = await Storage.get(domain + "_content");

  if (domainData && domainData.generations) {
    for (const generation of domainData.generations) {
      if (generation.visible === false) continue;
      await scanAndProcessElements(generation, settings);
    }
  }
}

pageModifier.clearAndReApplyAllGenerations();
initializeContentGeneration();