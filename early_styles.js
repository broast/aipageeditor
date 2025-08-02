// Hide the page to prevent FOUC
document.documentElement.style.visibility = 'hidden';

function applyCssEarly(cssRules, id) {
    const styleId = "AIPE_style_head_" + id;
    let style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = cssRules;
    (document.head || document.documentElement).appendChild(style);
}

async function applyAllSavedStyles() {
    try {
        const data = await chrome.storage.local.get(null);
        const globalGenerations = data.globalStyleGenerations || [];
        const generations = data.styleGenerations || {};
        
        const url = window.location.href;
        const pageGenerations = generations[url] || [];

        for (const generation of globalGenerations) {
            if (generation.css) {
                applyCssEarly(generation.css, generation.id);
            }
        }

        for (const generation of pageGenerations) {
            if (generation.css) {
                applyCssEarly(generation.css, generation.id);
            }
        }
    } catch (error) {
        console.error("AIPE Early Styles Error:", error);
    } finally {
        // Show the page after styles are applied
        document.documentElement.style.visibility = 'visible';
    }
}

applyAllSavedStyles();