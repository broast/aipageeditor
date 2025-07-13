

class Storage {
    static get(domain) {
        return new Promise((resolve) => {
            chrome.storage.local.get(domain, (result) => {
                resolve(result[domain]);
            });
        });
    }

    static set(domain, data) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [domain]: data }, () => {
                resolve();
            });
        });
    }

    static async addGeneration(domain, generationData) {
        let data = await this.get(domain) || {};
        if (!data.generations) {
            data.generations = [];
        }
        if (generationData.id) {
            data.generations = data.generations.filter(g => g.id !== generationData.id);
        }
        data.generations.push(generationData);
        return this.set(domain, data);
    }

    static async removeGeneration(domain, generationId) {
        let data = await this.get(domain);
        if (data && data.generations) {
            data.generations = data.generations.filter(g => g.id !== generationId);
            return this.set(domain, data);
        }
    }
}

class OpenAI {
    constructor(apiKey, modelEndpoint, modelName) {
        this.apiKey = apiKey;
        this.modelEndpoint = modelEndpoint;
        this.modelName = modelName;
    }

    async generateCss(note, htmlStructure, selectedElementsHtml) {
        const selectedElementsPrompt = selectedElementsHtml ? `The user has selected the following elements html to include in the context: ${selectedElementsHtml}` : "";

        const requestInfo = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: [
                    {
                        role: "system", content: `You are a web browser css bot. You use the notes provided by the user to help alter the css styles of the page based on those instructions in those notes.
You will be given the source html of the page. Please return custom css rules to be applied to the page, which will be injected into the page.

For example, if the command is make all text bigger, your response could be:
* { font-size: 20px; }

Do not respond with any other text. Only respond with the css rules, as your responses are being processed by a machine.
The browser is Chrome, so you can use any css that works in Chrome. These styles will likely be at the top of the file, so you may use !important if needed.
` },
                    {
                        role: "user", content: `These are the users notes for this website: ${note}

${selectedElementsPrompt}

Here is the html structure of the page: ${htmlStructure}

As a reminder, the users notes are: ${note}. Please return CSS that will modify the page to match the users notes.. do not confuse the words in the users notes for class names or tags, the user does not know about those and can not see those!! The user only provides visual changes to the user experience. 

Note: Please Do Not change anything the user does not ask you to change.... you will be rewarded as always for high quality work only. Thank you!!! (You have currently earned 7,830 rewards and are on a 23 day streak) `
                    },

                ]
            })
        };

        const response = await fetch(this.modelEndpoint, requestInfo);
        let responseData = await response.json();

        if (responseData.choices[0].message.content.startsWith("```css\n")) {
            responseData = responseData.choices[0].message.content.replace("```css\n", "");
            responseData = responseData.replace("```", "");
        } else {
            responseData = responseData.choices[0].message.content;
        }
        return {css: responseData, requestBody: requestInfo.body};
    }
}

class PageModifier {
    constructor() {
        this.selectedElements = new Set();
        this.initToast();
        this.initElementSelector();
    }

    initToast() {
        const style = document.createElement('style');
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

        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'AIPE_toast-container';
            document.body.appendChild(container);
        }
        this.toastContainer = container;
    }

    showToast(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'AIPE_toast';
        toast.textContent = "🪄 " + message;
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    showAndReturnPersistentToast(message) {
        const toast = document.createElement('div');
        toast.className = 'AIPE_toast';
        toast.textContent = "🪄 " + message;
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        return toast;
    }

    removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }
    }

    initElementSelector() {
        this.elementSelectorHandlers = {};
        this.STYLE_ID = 'inspector-styles';
        this.CLS_HOVER = 'inspector-hover';
        this.CLS_SEL = 'inspector-selected';
        this.CLS_SEL_H = 'inspector-selectedHover';
    }

    enableElementSelectionMode() {
        if (this.elementSelectorHandlers.enabled) return;
        this.elementSelectorHandlers.enabled = true;

        if (!document.getElementById(this.STYLE_ID)) {
            const style = document.createElement('style');
            style.id = this.STYLE_ID;
            style.textContent = `
                .${this.CLS_HOVER}  { outline: 2px solid orange !important; }
                .${this.CLS_SEL}    { outline: 3px solid blue   !important; }
                .${this.CLS_SEL_H}  { outline: 3px solid red    !important; }
            `;
            document.head.appendChild(style);
        }

        for (const el of [...this.selectedElements]) {
            if (el.isConnected) {
                el.classList.add(this.CLS_SEL);
            } else {
                this.selectedElements.delete(el);
            }
        }

        document.body.style.cursor = 'pointer';

        this.elementSelectorHandlers.click = e => {
            if (e.target === document.body) return;
            const el = e.target;
            const nowSel = el.classList.toggle(this.CLS_SEL);
            el.classList.remove(this.CLS_HOVER, this.CLS_SEL_H);
            nowSel ? this.selectedElements.add(el) : this.selectedElements.delete(el);
            e.preventDefault();
            e.stopPropagation();
        };

        this.elementSelectorHandlers.over = e => {
            const el = e.target;
            if (el === document.body) return;
            el.classList.contains(this.CLS_SEL)
                ? el.classList.add(this.CLS_SEL_H)
                : el.classList.add(this.CLS_HOVER);
        };
        this.elementSelectorHandlers.out = e => e.target.classList.remove(this.CLS_HOVER, this.CLS_SEL_H);

        this.elementSelectorHandlers.keydown = e => {
            if (e.key === 'Escape') {
                this.disableElementSelectionMode();
            }
        };

        document.body.addEventListener('click', this.elementSelectorHandlers.click, true);
        document.body.addEventListener('mouseover', this.elementSelectorHandlers.over, true);
        document.body.addEventListener('mouseout', this.elementSelectorHandlers.out, true);
        document.addEventListener('keydown', this.elementSelectorHandlers.keydown);

        this.elementSelectorHandlers.toastRef = this.showAndReturnPersistentToast(
            'You have entered element-selection mode. Click to (de)select, hover to highlight, Esc to exit.'
        );
    }

    disableElementSelectionMode() {
        if (!this.elementSelectorHandlers.enabled) return;
        this.elementSelectorHandlers.enabled = false;

        document.body.removeEventListener('click', this.elementSelectorHandlers.click, true);
        document.body.removeEventListener('mouseover', this.elementSelectorHandlers.over, true);
        document.body.removeEventListener('mouseout', this.elementSelectorHandlers.out, true);
        document.removeEventListener('keydown', this.elementSelectorHandlers.keydown);

        document.body.style.cursor = '';

        document.querySelectorAll(`.${this.CLS_HOVER}, .${this.CLS_SEL_H}, .${this.CLS_SEL}`)
            .forEach(el => el.classList.remove(this.CLS_HOVER, this.CLS_SEL_H, this.CLS_SEL));

        const style = document.getElementById(this.STYLE_ID);
        if (style) style.remove();

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
            const defaultStyles = getComputedStyle(document.createElement(el.tagName));
    
            let stylePairs = [];
    
            const propsToInclude = ['color', 'width', 'height','top','left','margin','padding','border'
            ];
    
            for (let prop of propsToInclude) {
                const value = computed.getPropertyValue(prop);
                const defaultValue = defaultStyles.getPropertyValue(prop);
                const shorthandProp = prop.replace(/a|e|i|o|u/g, '');
    
                if (value !== defaultValue) {
                    stylePairs.push(`${shorthandProp}:${value}`);
                }
            }
    
            const bgColor = getEffectiveBackgroundColor(el);
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                stylePairs.push(`bgColor:${bgColor}`);
            }
    
            return stylePairs.length ? ` computedStyles="${stylePairs.join(';')}"` : '';
        }
        function getEffectiveBackgroundColor(element) {
            while (element) {
              const bg = getComputedStyle(element).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                return bg;
              }
              element = element.parentElement;
            }
            return null;
          }
    
    
        function buildTag(node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            const allowedTags = ['html','body','div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'img', 'table', 'tr', 'td','section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'ul', 'ol', 'li', 'form', 'input', 'select', 'textarea'];
           
            let previousChildren = [];
            if (!allowedTags.includes(node.tagName.toLowerCase()) && node.children.length > 0) {
                let children = '';
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
                return '';
            }
    
            const tag = node.tagName.toLowerCase();
            const id = node.id ? ` id=\"${node.id}\"` : '';
            const cls = node.className ? ` class=\"${node.className}\"` : '';
            const style = getCompressedStyles(node);
            const truncatedInnerText = node.innerText && node.innerText.length > 15 ? node.innerText.slice(0, 15) + "..." : node.innerText;
            const innerTextAttr = node.innerText ? ` text=\"${truncatedInnerText}\"` : '';
            const open = `<${tag}${id}${cls}${style}${innerTextAttr}>`;
            const close = `</${tag}>`;
    
            let children = '';
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
        let existingStyle = document.getElementById("AIPE_style" + id);
        if (existingStyle) {
            existingStyle.remove();
        }

        let style = document.createElement("style");
        style.id = "AIPE_style" + id;
        style.innerHTML = cssRules;
        document.body.appendChild(style);
    }

    clearAllAIPEStylesFromPage() {
        let styles = document.querySelectorAll("[id^=AIPE_style]");
        styles.forEach((style) => {
            style.remove();
        });
    }

    async clearAndReApplyAllGenerations() {
        this.clearAllAIPEStylesFromPage();
        let url = new URL(window.location.href);
        let domain = url.hostname;
        let data = await Storage.get(domain);
        if (data && data.generations) {
            data.generations.forEach((generation) => {
                this.applyCssRulesToPage(generation.styles, generation.id);
            });
        }
        this.showToast("Styles applied to page!", 3000);
    }
}

const pageModifier = new PageModifier();

async function processUserNote(note, existingId = null, apiKey, modelEndpoint, modelName) {
    const openAI = new OpenAI(apiKey, modelEndpoint, modelName);
    let url = new URL(window.location.href);
    let domain = url.hostname;
    if (note) {
        let cleanedHtmlStructure = pageModifier.getCleanHTMLStructureWithStyles();
        if (cleanedHtmlStructure.length > 10000) {
            let start = Math.floor(Math.random() * (cleanedHtmlStructure.length - 10000));
            cleanedHtmlStructure = cleanedHtmlStructure.slice(start, start + 10000);
        }

        pageModifier.showToast("Generating new styles for this page...", 3000);

        var selectedElements = pageModifier.getElementsForContext();
        var selectedElementsHtml = selectedElements.map(el => {
            return el.outerHTML;
        }).join("\n");

        const {css, requestBody} = await openAI.generateCss(note, cleanedHtmlStructure, selectedElementsHtml);

        let generationId = existingId ? existingId : crypto.randomUUID();
        let generationData = {
            note: note,
            styles: css,
            requestBody: requestBody,
            id: generationId
        }

        await Storage.addGeneration(domain, generationData);

        pageModifier.applyCssRulesToPage(css, generationId);

        pageModifier.showToast("Styles applied to page!", 3000);
        chrome.runtime.sendMessage({ action: "updatePopup", domain: domain, data: generationData });
    }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "runProcessUserNote") {
        try {
            await processUserNote(message.note, message.id, message.apiKey, message.modelEndpoint, message.modelName);
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
        sendResponse({ count: pageModifier.getElementsForContext().length });
    } else if (message.action === "runResetContext") {
        pageModifier.selectedElements.clear();
        pageModifier.disableElementSelectionMode();
        sendResponse({ success: true });
    }
});

pageModifier.clearAndReApplyAllGenerations();
