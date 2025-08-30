document.documentElement.style.visibility = 'hidden';

function applyCssEarly(cssRules, id) {
    const styleId = "AIPE_style_" + id;
    let style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = cssRules;
    (document.head || document.documentElement).appendChild(style);
}

async function applyAllSavedStyles() {
    try {
        const data = await chrome.storage.local.get(null);
        const globalGenerations = data.global_styles.generations || [];
        // data for domain
        
        const url = window.location.href;
        const domain = new URL(url).hostname;
        const pageGenerations = data[domain].generations || [];

        for (const generation of globalGenerations) {
            if (generation.styles && generation.visible) {
                applyCssEarly(generation.styles, generation.id);
            }
        }

        for (const generation of pageGenerations) {
            if (generation.styles && generation.visible) {
                applyCssEarly(generation.styles, generation.id);
            }
        }
    } catch (error) {
        console.error("AIPE Early Styles Error:", error);
    } finally {
        document.documentElement.style.visibility = 'visible';
    }
}

const observer = new MutationObserver((mutations, obs) => {
  for (const mutation of mutations) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'BODY') {
          applyAllSavedStyles();

          obs.disconnect();

          return;
        }
      }
    }
  }
});

observer.observe(document, {
  childList: true,
  subtree: true 
});
