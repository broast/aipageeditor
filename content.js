console.log("content.js loaded");
async function processUserNote(note, existingId = null) {
    let url = new URL(window.location.href);
    let domain = url.hostname;
    if (note) {

        let cleanedHtmlStructure = getCleanHTMLStructureWithStyles();
        if (cleanedHtmlStructure.length > 10000) {
            //cleanedHtmlStructure = cleanedHtmlStructure.slice(0, 10000);
            // take a random chunk of 10000
            let start = Math.floor(Math.random() * (cleanedHtmlStructure.length - 10000));
            cleanedHtmlStructure = cleanedHtmlStructure.slice(start, start + 10000);
        }

        showToast("Generating new styles for this page...", 3000);
        const apiKey = "KEY GOES HERE"; // replace with your OpenAI API key
        // openai chat completions api
        // post https://api.openai.com/v1/chat/completions

        var selectedElements = window.getElementsForContext();
        var selectedElementsHtml = selectedElements.map(el => {
            // get the outerHTML of the element
            return el.outerHTML;
        }).join("\n");
        var selectedElementsPrompt = selectedElementsHtml ? `The user has selected the following elements html to include in the context: ${selectedElementsHtml}` : "";

        const requestInfo = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
               // model: "o3-mini",
                model: "gpt-4.1",
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

Here is the html structure of the page: ${cleanedHtmlStructure}

As a reminder, the users notes are: ${note}. Please return CSS that will modify the page to match the users notes.. do not confuse the words in the users notes for class names or tags, the user does not know about those and can not see those!! The user only provides visual changes to the user experience. 

Note: Please Do Not change anything the user does not ask you to change.... you will be rewarded as always for high quality work only. Thank you!!! (You have currently earned 7,830 rewards and are on a 23 day streak) `
                    }, //Here are example inner texts for each selector: ${JSON.stringify(listOfExampleInnerTextsForSelectors)}

                ]
            })
        }
        const response = await fetch("https://api.openai.com/v1/chat/completions", requestInfo);
        let responseData = await response.json();
        console.log({ data: responseData });

        if (responseData.choices[0].message.content.startsWith("```css\n")) {
            responseData = responseData.choices[0].message.content.replace("```css\n", "");
            responseData = responseData.replace("```", "");
        } else {
            responseData = responseData.choices[0].message.content;
        }

        // store the data in the local storage for this domain
        // append to the array of data
        let generationId = existingId ? existingId : crypto.randomUUID();
        let generationData = {
            note: note,
            styles: responseData,
            requestBody: requestInfo.body,
            id: generationId
        }

        chrome.storage.local.get(null, (storedData) => {
            if (!storedData[domain]) {
                storedData[domain] = {
                    generations: []
                }
            }

            // ensure generations exists
            if (!storedData[domain].generations) {
                storedData[domain].generations = [];
            }

            if (existingId) {
                // remove the existing generation
                storedData[domain].generations = storedData[domain].generations.filter((generation) => generation.id !== existingId);
            }

            storedData[domain].generations.push(generationData);

            chrome.storage.local.set(storedData);
        }
        );

        applyCssRulesToPage(responseData, generationId);

        showToast("Styles applied to page!", 3000);
        chrome.runtime.sendMessage({ action: "updatePopup", domain: domain, data: generationData });
    }
}

function getCleanHTMLStructureWithStyles() {
    function getCompressedStyles(el) {
        const computed = getComputedStyle(el);
        const defaultStyles = getComputedStyle(document.createElement(el.tagName));

        let stylePairs = [];

        const propsToInclude = ['color', 'width', 'height','top','left','margin','padding','border'
        ];

        for (let prop of propsToInclude) {
            const value = computed.getPropertyValue(prop);
            const defaultValue = defaultStyles.getPropertyValue(prop);
            // convert to shorthand prop name by removing the vowels
            const shorthandProp = prop.replace(/a|e|i|o|u/g, '');

            if (value !== defaultValue) {
                stylePairs.push(`${shorthandProp}:${value}`);
            }
        }

        // get the effective bg color
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
        return null; // default to white or fallback if needed
      }


    function buildTag(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        // only include certain html tags that represent visual elements
        const allowedTags = ['html','body','div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'img', 'table', 'tr', 'td','section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'ul', 'ol', 'li', 'form', 'input', 'select', 'textarea'];
       
        // if its not an allowed tag but has children, we still want to include its children
        let previousChildren = [];
        if (!allowedTags.includes(node.tagName.toLowerCase()) && node.children.length > 0) {
            let children = '';
            for (let child of node.children) {
                // only include one of each tag + class combination, ignore any duplicate tag+class
                tagClass = child.tagName.toLowerCase() + child.className;
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
        const innerTextAttr = node.innerText ? ` text="${truncatedInnerText}"` : '';
        const open = `<${tag}${id}${cls}${style}${innerTextAttr}>`;
        const close = `</${tag}>`;

        let children = '';
        for (let child of node.children) {                
            tagClass = child.tagName.toLowerCase() + child.className;
            if (previousChildren.includes(tagClass)) {
                continue;
            }
            children += buildTag(child);
        }

        return `${open}${children}${close}`;
    }

    return buildTag(document.documentElement);
}

function applyCssRulesToPage(cssRules, id) {
    // if this id exists, remove it
    let existingStyle = document.getElementById("AIPE_style" + id);
    if (existingStyle) {
        existingStyle.remove();
    }

    let style = document.createElement("style");
    // give it a unique id
    style.id = "AIPE_style" + id;

    style.innerHTML = cssRules;
    // if one already exists, replace it

    document.body.appendChild(style);

}

function clearAllAIPEStylesFromPage() {
    let styles = document.querySelectorAll("[id^=AIPE_style]");
    styles.forEach((style) => {
        style.remove();
    });
}

function clearAndReApplyAllGenerations() {
    clearAllAIPEStylesFromPage();
    let url = new URL(window.location.href);
    let domain = url.hostname;
    chrome.storage.local.get(null, (storedData) => {
        if (storedData[domain] && storedData[domain].generations) {
            storedData[domain].generations.forEach((generation) => {
                applyCssRulesToPage(generation.styles, generation.id);
            });
        }
    });

    showToast("Styles applied to page!", 3000);
}

function assignIdsToAnyMissingFromDivsOrButtonsOrLinks() {
    let bodies = document.getElementsByTagName("body");
    for (let i = 0; i < bodies.length; i++) {
        if (bodies[i].id == "") {
            bodies[i].id = "AIPE_body" + i;
        }
    }
    let divs = document.getElementsByTagName("div");
    for (let i = 0; i < divs.length; i++) {
        if (divs[i].id == "") {
            divs[i].id = "AIPE_div" + i;
        }
    }
    let tables = document.getElementsByTagName("table");
    for (let i = 0; i < tables.length; i++) {
        if (tables[i].id == "") {
            tables[i].id = "AIPE_table" + i;
        }
    }
    let trs = document.getElementsByTagName("tr");
    for (let i = 0; i < trs.length; i++) {
        if (trs[i].id == "") {
            trs[i].id = "AIPE_tr" + i;
        }
    }
    let links = document.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
        if (links[i].id == "") {
            links[i].id = "AIPE_link" + i;
        }
    }
    let buttons = document.getElementsByTagName("button");
    for (let i = 0; i < buttons.length; i++) {
        if (buttons[i].id == "") {
            buttons[i].id = "AIPE_button" + i;
        }
    }
}

function getAllUsedCSSClasses() {
    const classSet = new Set();

    document.querySelectorAll('[class]').forEach(el => {
        el.classList.forEach(cls => classSet.add(cls));
    });

    return Array.from(classSet);
}

function getAllUsedTags() {
    const tagSet = new Set();

    document.querySelectorAll('*').forEach(el => {
        tagSet.add(el.tagName.toLowerCase());
    });

    return Array.from(tagSet);
}

function getModifiedStylesForSelector(selector) {
    const temp = document.createElement('div');
    const baseline = document.createElement('div');

    // Check if selector is a tag or a class
    if (/^[a-z]+$/.test(selector)) {
        // It's a tag
        const tempEl = document.createElement(selector);
        const baseEl = document.createElement(selector);
        document.body.appendChild(tempEl);
        document.body.appendChild(baseEl);

        const tempStyles = getComputedStyle(tempEl);
        const baseStyles = getComputedStyle(baseEl); // likely the same tag, but this makes it explicit

        const modifiedStyles = {};
        for (let i = 0; i < tempStyles.length; i++) {
            const prop = tempStyles[i];
            if (tempStyles.getPropertyValue(prop) !== baseStyles.getPropertyValue(prop)) {
                modifiedStyles[prop] = tempStyles.getPropertyValue(prop);
            }
        }

        tempEl.remove();
        baseEl.remove();
        return modifiedStyles;

    } else {
        // It's a class
        temp.className = selector;
        document.body.appendChild(temp);
        document.body.appendChild(baseline);

        const tempStyles = getComputedStyle(temp);
        const baseStyles = getComputedStyle(baseline);

        const modifiedStyles = {};
        for (let i = 0; i < tempStyles.length; i++) {
            const prop = tempStyles[i];
            if (tempStyles.getPropertyValue(prop) !== baseStyles.getPropertyValue(prop)) {
                modifiedStyles[prop] = tempStyles.getPropertyValue(prop);
            }
        }

        temp.remove();
        baseline.remove();
        return modifiedStyles;
    }
}

function getExampleInnerTextForSelector(selector) {
    let elements;

    if (/^[a-z]+$/.test(selector)) {
        // It's a tag name
        elements = document.getElementsByTagName(selector);
    } else {
        // Assume it's a class name
        elements = document.getElementsByClassName(selector);
    }

    if (!elements.length) return null;

    let text = elements[0].innerText;
    // check that its valid
    if (text === undefined) return null;

    // cut off the text if it's too long
    if (text.length > 50) {
        text = text.slice(0, 50) + "...";
    }

    return text;
}

(() => {
  const STYLE_ID   = 'inspector-styles';
  const CLS_HOVER  = 'inspector-hover';
  const CLS_SEL    = 'inspector-selected';
  const CLS_SEL_H  = 'inspector-selectedHover';

  const handlers = {};             // listener refs, toast ref, flag
  const selected = new Set();      // persistent store of selected elements

  // ---------- enable ----------
  window.enableElementSelectionMode = () => {
    if (handlers.enabled) return;
    handlers.enabled = true;

    /* inject CSS so outlines are visible while enabled */
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .${CLS_HOVER}  { outline: 2px solid orange !important; }
        .${CLS_SEL}    { outline: 3px solid blue   !important; }
        .${CLS_SEL_H}  { outline: 3px solid red    !important; }
      `;
      document.head.appendChild(style);
    }

    /* restore blue outline on previously-selected elements */
    for (const el of [...selected]) {
      if (el.isConnected) {
        el.classList.add(CLS_SEL);
      } else {
        selected.delete(el);             // prune elements no longer in DOM
      }
    }

    document.body.style.cursor = 'pointer';

    // click toggles permanent selection
    handlers.click = e => {
      if (e.target === document.body) return;
      const el = e.target;
      const nowSel = el.classList.toggle(CLS_SEL);
      el.classList.remove(CLS_HOVER, CLS_SEL_H);
      nowSel ? selected.add(el) : selected.delete(el);
      e.preventDefault();
      e.stopPropagation();
    };

    // hover in / out
    handlers.over = e => {
      const el = e.target;
      if (el === document.body) return;
      el.classList.contains(CLS_SEL)
        ? el.classList.add(CLS_SEL_H)
        : el.classList.add(CLS_HOVER);
    };
    handlers.out = e => e.target.classList.remove(CLS_HOVER, CLS_SEL_H);

    // Esc key exits mode
    handlers.keydown = e => {
      if (e.key === 'Escape') {
        window.disableElementSelectionMode();
      }
    };

    document.body.addEventListener('click',     handlers.click,  true);
    document.body.addEventListener('mouseover', handlers.over,   true);
    document.body.addEventListener('mouseout',  handlers.out,    true);
    document.addEventListener('keydown',        handlers.keydown);

    // toast
    handlers.toastRef = showAndReturnPersistentToast(
      'You have entered element-selection mode. Click to (de)select, hover to highlight, Esc to exit.'
    );

    console.log('Element selection mode enabled');
  };

  // ---------- disable ----------
  window.disableElementSelectionMode = () => {
    if (!handlers.enabled) return;
    handlers.enabled = false;

    document.body.removeEventListener('click',     handlers.click,  true);
    document.body.removeEventListener('mouseover', handlers.over,   true);
    document.body.removeEventListener('mouseout',  handlers.out,    true);
    document.removeEventListener('keydown',        handlers.keydown);

    document.body.style.cursor = '';

    /* strip ALL outline classes from the page */
    document.querySelectorAll(`.${CLS_HOVER}, .${CLS_SEL_H}, .${CLS_SEL}`)
            .forEach(el => el.classList.remove(CLS_HOVER, CLS_SEL_H, CLS_SEL));

    /* hide outlines by removing the style tag */
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    console.log('Element selection mode disabled (outlines and classes removed until re-enabled)');

    // remove the toast
    if (handlers.toastRef) {
      removeToast(handlers.toastRef);
      handlers.toastRef = null;
    }
  };

  window.getElementsForContext = () => {
    return [...selected];
  };

})();


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

// Ensure container exists
let container = document.querySelector('.toast-container');
if (!container) {
    container = document.createElement('div');
    container.className = 'AIPE_toast-container';
    document.body.appendChild(container);
}

// Toast function
function showToast(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'AIPE_toast';
    toast.textContent = "🪄 " + message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showAndReturnPersistentToast(message) {
    const toast = document.createElement('div');
    toast.className = 'AIPE_toast';
    toast.textContent = "🪄 " + message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    return toast; // return the toast element so it can be removed later
}

function removeToast(toast) {
    if (toast && toast.parentNode) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "runProcessUserNote") {
        try {
            await processUserNote(message.note, message.id);
        } catch (e) {
            showToast("Error processing notes", 3000);
            console.error(e);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runClear") {
        clearAllAIPEStylesFromPage();
    }
    if (message.action === "runClearAndReapply") {
        clearAndReApplyAllGenerations();
    }
});

// handle runAddElementToContext 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runAddElementToContext") {
        enableElementSelectionMode();
    }
});

// runExitElementSelectionMode
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runExitElementSelectionMode") {
        disableElementSelectionMode();
    }
});

clearAndReApplyAllGenerations();