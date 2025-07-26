class PopupManager {
    constructor() {
        this.notesField = document.getElementById("notes");
        this.saveButton = document.getElementById("save");
        this.clearButton = document.getElementById("clear");
        this.addElementToContextButton = document.getElementById("addElementToContext");
        this.resetContextButton = document.getElementById("resetContext");
        this.loadingIndicator = document.getElementById("loadingIndicator");
        this.styleGenerations = document.getElementById("style-generations");
        this.includeDefaultContext = document.getElementById("includeDefaultContext");
        this.globalStyleCheckbox = document.getElementById("global-style-checkbox");
        this.sendScreenshot = document.getElementById("sendScreenshot");
        this.includeChangeHistory = document.getElementById("includeChangeHistory");
        this.includeGlobalChangeHistory = document.getElementById("includeGlobalChangeHistory");

        this.apiKeyField = document.getElementById("apiKey");
        this.modelEndpointField = document.getElementById("modelEndpoint");
        this.modelNameField = document.getElementById("modelName");
        this.saveSettingsButton = document.getElementById("saveSettings");
        this.spinner = new HourglassSpinner();
        
        this.spinner.animateHourglass();
        this.initEventListeners();
        this.initTabs();
        this.loadGenerations();
        this.loadSettings();
        this.updateTitle();
        this.loadContextSettings();
    }

    async updateTitle() {
        const tabs = await this.getActiveTabs();
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        document.querySelector(".title-bar-text").innerText = `🎨 AI Page Style Editor (${domain})`;
    }

    initTabs() {
        document.querySelectorAll('[role="tablist"]').forEach(tablist => {
            const tabs = [...tablist.querySelectorAll('[role="tab"]')];
            const panels = tabs
                .map(t => document.getElementById(t.querySelector('a').getAttribute('href').slice(1)))
                .filter(Boolean);

            const showActive = () => {
                const activeId = tabs.find(t => t.getAttribute('aria-selected') === 'true')
                    .querySelector('a').getAttribute('href').slice(1);
                panels.forEach(p => p.hidden = p.id !== activeId);
            };

            tabs.forEach(tab => {
                tab.addEventListener('click', e => {
                    e.preventDefault();                    // keep hash out of the URL
                    tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
                    tab.setAttribute('aria-selected', 'true');
                    showActive();
                });
            });

            showActive();                              // set correct initial state
        });
    }


    initEventListeners() {
        this.saveButton.addEventListener("click", () => this.saveNote());
        this.clearButton.addEventListener("click", () => this.clearAll());
        this.addElementToContextButton.addEventListener("click", () => this.addElementToContext());
        this.resetContextButton.addEventListener("click", () => this.resetContext());
        this.includeDefaultContext.addEventListener("change", () => {
            this.saveContextSettings();
            this.updateContextLabel();
        });
        this.sendScreenshot.addEventListener("change", () => {
            this.updateContextLabel();
        });

        this.includeChangeHistory.addEventListener("change", () => {
            this.includeGlobalChangeHistory.disabled = !this.includeChangeHistory.checked;
            if (!this.includeChangeHistory.checked) {
                this.includeGlobalChangeHistory.checked = false;
            }
            this.saveContextSettings();
            this.updateContextLabel();
        });

        this.includeGlobalChangeHistory.addEventListener("change", () => {
            this.saveContextSettings();
            this.updateContextLabel();
        });

        const debouncedSave = this.debounce(() => this.saveSettings(), 500);
        this.apiKeyField.addEventListener("input", debouncedSave);
        this.modelEndpointField.addEventListener("input", debouncedSave);
        this.modelNameField.addEventListener("input", debouncedSave);

        this.notesField.addEventListener("input", () => this.updateSaveButtonState());
        this.updateSaveButtonState();

        document.getElementById("advanced-options-toggle").addEventListener("click", () => {
            const content = document.getElementById("advanced-options-content");
            const toggle = document.getElementById("advanced-options-toggle");
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                toggle.innerText = "▶ Advanced options";
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
                toggle.innerText = "▼ Advanced options";
            }
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "updatePopup") {
                this.styleGenerations.innerHTML = "";
                this.loadGenerations();
            }
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "runExitElementSelectionMode" });
        });

        this.updateContextLabel();

    }

    updateContextLabel() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "runGetElementsInContext" }, (response) => {
                if (response) {
                    let contextControl = document.getElementById("contextControl");
                    let contextCount = contextControl.querySelector(".context-count");
                    let count = response.count;
                    let text = `Elements in context: ${count}`;
                    if (this.includeDefaultContext.checked) {
                        if (count > 0) {
                            text += " + Default";
                        } else {
                            text = "Elements in context: Default";
                        }
                    }

                    if (this.sendScreenshot.checked) {
                        text += " + Screenshot";
                    }

                    if (this.includeChangeHistory.checked) {
                        text += " + Change History";
                    }

                    if (this.includeGlobalChangeHistory.checked) {
                        text += " (Global)";
                    }

                    contextCount.innerText = text;
                }
            });
        });
    }

    updateSaveButtonState() {
        this.saveButton.disabled = this.notesField.value.trim() === "";
    }

    async saveNote() {
        let note = this.notesField.value;
        if (note.trim() === "") {
            return;
        }
        this.loadingIndicator.style.display = "block";
        const tabs = await this.getActiveTabs();
        const settings = await this.getSettings();
        const isGlobal = this.globalStyleCheckbox.checked;

        const sendMessage = (screenshotUrl = null) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "runProcessUserNote",
                note: note,
                apiKey: settings.apiKey,
                modelEndpoint: settings.modelEndpoint,
                modelName: settings.modelName,
                includeDefaultContext: this.includeDefaultContext.checked,
                isGlobal: isGlobal,
                screenshotUrl: screenshotUrl,
                includeChangeHistory: this.includeChangeHistory.checked,
                includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked
            });
        };

        if (this.sendScreenshot.checked) {
            chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
                sendMessage(dataUrl);
            });
        } else {
            sendMessage();
        }
    }

    async clearAll() {
        this.notesField.value = "";
        const tabs = await this.getActiveTabs();
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        chrome.storage.local.remove(domain);

        // remove all non-global styles from the UI
        const allGenerations = this.styleGenerations.querySelectorAll(".style-generation");
        allGenerations.forEach((generation) => {
            if (!generation.isGlobal) {
                generation.remove();
            }
        });

        chrome.tabs.sendMessage(tabs[0].id, { action: "runClearAndReapply" });
    }

    async addElementToContext() {
        const tabs = await this.getActiveTabs();
        chrome.tabs.sendMessage(tabs[0].id, { action: "runAddElementToContext" });
    }

    async resetContext() {
        const tabs = await this.getActiveTabs();
        chrome.tabs.sendMessage(tabs[0].id, { action: "runResetContext" }, () => {
            this.includeDefaultContext.checked = true;
            this.saveContextSettings();
            this.updateContextLabel();
        });
    }

    async loadGenerations() {
        const tabs = await this.getActiveTabs();
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        this.styleGenerations.innerHTML = "";
        chrome.storage.local.get(["global_styles", domain], (result) => {
            let globalData = result["global_styles"];
            if (globalData && globalData.generations) {
                globalData.generations.forEach((generation) => {
                    this.addGenerationToPopup("global_styles", generation, true);
                });
            }

            let domainData = result[domain];
            if (domainData && domainData.generations) {
                domainData.generations.forEach((generation) => {
                    this.addGenerationToPopup(domain, generation, false);
                });
            }
        });
    }

    addGenerationToPopup(domain, generationData, isGlobal) {
        this.loadingIndicator.style.display = "none";
        const ID_PREFIX = "AIPE_GENERATION_";

        if (this.styleGenerations.style.display === "none") {
            this.styleGenerations.style.display = "block";
        }

        let existingGeneration = document.getElementById(ID_PREFIX + generationData.id);
        if (existingGeneration) {
            // it already exists, but we should update it
            existingGeneration.remove();
        }

        let styleGeneration = document.createElement("div");
        styleGeneration.className = "style-generation status-bar-field";
        styleGeneration.id = ID_PREFIX + generationData.id;
        styleGeneration.style.position = "relative";
        styleGeneration.isGlobal = isGlobal;

        let topContainer = document.createElement("div");
        topContainer.style.display = "flex";
        topContainer.style.alignItems = "center";

        let visibilityCheckbox = document.createElement("input");
        visibilityCheckbox.type = "checkbox";
        const checkboxId = "vis-checkbox-" + generationData.id;
        visibilityCheckbox.id = checkboxId;
        visibilityCheckbox.checked = generationData.visible !== false;
        visibilityCheckbox.style.marginRight = "5px";

        visibilityCheckbox.addEventListener("change", () => {
            chrome.storage.local.get([domain], (result) => {
                let data = result[domain];
                let generations = data.generations;
                let targetGeneration = generations.find((g) => g.id === generationData.id);
                if (targetGeneration) {
                    targetGeneration.visible = visibilityCheckbox.checked;
                }
                data.generations = generations;
                chrome.storage.local.set({ [domain]: data }, () => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "runClearAndReapply" });
                    });
                });
            });
        });

        let label = document.createElement("label");
        label.htmlFor = checkboxId;

        let noteDiv = document.createElement("div");
        noteDiv.innerText = generationData.note;
        noteDiv.className = "style-generation-note";
        label.appendChild(noteDiv);

        label.addEventListener("click", (event) => {
            if (noteDiv.isContentEditable) {
                event.preventDefault();
            }
        });

        topContainer.appendChild(visibilityCheckbox);
        topContainer.appendChild(label);
        styleGeneration.appendChild(topContainer);

        let regenerateButton = document.createElement("button");
        regenerateButton.innerText = "🦎 Regenerate";
        regenerateButton.addEventListener("click", async () => {
            this.loadingIndicator.style.display = "block";
            const tabs = await this.getActiveTabs();
            const settings = await this.getSettings();
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "runProcessUserNote",
                note: generationData.note,
                id: generationData.id,
                visible: generationData.visible,
                apiKey: settings.apiKey,
                modelEndpoint: settings.modelEndpoint,
                modelName: settings.modelName,
                isGlobal: isGlobal
            });
        });

        let modifyButton = document.createElement("button");
        modifyButton.innerText = "✏️ Modify";
        let applyButton = document.createElement("button");
        applyButton.innerText = "🖌️ Apply";
        applyButton.style.display = "none";

        modifyButton.addEventListener("click", () => {
            noteDiv.contentEditable = true;
            noteDiv.focus();
            modifyButton.style.display = "none";
            applyButton.style.display = "inline-block";
        });

        applyButton.addEventListener("click", async () => {
            let newNote = noteDiv.innerText;
            generationData.note = newNote;
            this.loadingIndicator.style.display = "block";
            const settings = await this.getSettings();
            const tabs = await this.getActiveTabs();
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "runProcessUserNote",
                note: newNote,
                id: generationData.id,
                visible: generationData.visible,
                apiKey: settings.apiKey,
                modelEndpoint: settings.modelEndpoint,
                modelName: settings.modelName,
                isGlobal: isGlobal
            });
            noteDiv.contentEditable = false;
            applyButton.style.display = "none";
            modifyButton.style.display = "inline-block";
        });

        noteDiv.addEventListener("blur", (event) => {
            if (event.relatedTarget == applyButton) {
                return;
            }
            event.preventDefault();
            noteDiv.contentEditable = false;
            applyButton.style.display = "none";
            modifyButton.style.display = "inline-block";
            noteDiv.innerText = generationData.note;
        });

        let removeButton = document.createElement("button");
        removeButton.innerText = "🗑️ Remove";
        removeButton.addEventListener("click", () => {
            chrome.storage.local.get([domain], (result) => {
                let data = result[domain];
                let generations = data.generations;
                let newGenerations = generations.filter((generation) => {
                    return generation.id !== generationData.id;
                });
                data.generations = newGenerations;
                chrome.storage.local.set({ [domain]: data }, () => {
                    styleGeneration.remove();
                });
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "runClearAndReapply" });
                });
            });
        });

        let copyButton = document.createElement("span");
        copyButton.style.background = "none";
        copyButton.style.border = "none";
        copyButton.style.color = "rgba(0, 0, 0, 0.5)";
        copyButton.style.cursor = "pointer";
        copyButton.style.position = "absolute";
        copyButton.style.left = "0px";
        copyButton.style.fontWeight = "normal";
        copyButton.innerText = "📋 Copy CSS";
        copyButton.className = "style-generation-copy-button";
        copyButton.addEventListener("click", () => {
            navigator.clipboard.writeText(generationData.styles).then(() => {
                copyButton.innerText = "✅ Copied!";
                setTimeout(() => {
                    copyButton.innerText = "📋 Copy CSS";
                }, 1000);
            }, (err) => {
                console.error("Could not copy text: ", err);
            });
        });

        let buttonsDiv = document.createElement("div");
        buttonsDiv.style.display = "flex";
        buttonsDiv.style.justifyContent = "right";
        buttonsDiv.appendChild(copyButton);
        buttonsDiv.appendChild(regenerateButton);
        buttonsDiv.appendChild(modifyButton);
        buttonsDiv.appendChild(applyButton);
        buttonsDiv.appendChild(removeButton);
        styleGeneration.appendChild(buttonsDiv);

        if (isGlobal) {
            let randomPastel = Math.floor(Math.random() * 360);
            styleGeneration.style.background = `hsl(${randomPastel}, 100%, 80%)`;
            let globalLabel = document.createElement("div");
            globalLabel.innerText = "Global 🌐";
            globalLabel.style.position = "absolute";
            globalLabel.style.top = "5px";
            globalLabel.style.right = "5px";
            globalLabel.style.color = "white";
            globalLabel.style.backgroundColor = "black";
            globalLabel.style.fontSize = "10px";
            globalLabel.style.fontWeight = "bold";
            styleGeneration.appendChild(globalLabel);
        } else {
            let randomPastel = Math.floor(Math.random() * 360);
            let randomPastel2 = (randomPastel + 180) % 360;
            let randomPastel3 = (randomPastel + 90) % 360;
            styleGeneration.style.background = `linear-gradient(110deg, hsl(${randomPastel}, 100%, 80%), hsl(${randomPastel2}, 100%, 80%), hsl(${randomPastel3}, 100%, 80%), hsl(0, 0%, 80%))`;
        }

        this.styleGenerations.appendChild(styleGeneration);
    }

    getActiveTabs() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs);
            });
        });
    }

    saveSettings() {
        const settings = {
            apiKey: this.apiKeyField.value,
            modelEndpoint: this.modelEndpointField.value,
            modelName: this.modelNameField.value
        };
        chrome.storage.local.set({ 'aipe_settings': settings });
    }

    loadSettings() {
        chrome.storage.local.get(['aipe_settings'], (result) => {
            const settings = result.aipe_settings;
            if (settings) {
                this.apiKeyField.value = settings.apiKey || '';
                this.modelEndpointField.value = settings.modelEndpoint || 'https://api.openai.com/v1/chat/completions';
                this.modelNameField.value = settings.modelName || 'gpt-4.1';
            }
        });
    }

    getSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aipe_settings'], (result) => {
                resolve(result.aipe_settings || {});
            });
        });
    }

    debounce(func, delay) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    async saveContextSettings() {
        const tabs = await this.getActiveTabs();
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        let data = {
            includeDefaultContext: this.includeDefaultContext.checked,
            includeChangeHistory: this.includeChangeHistory.checked,
            includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked
        };
        chrome.storage.local.set({ [domain + "_contextSettings"]: data });
    }

    async loadContextSettings() {
        const tabs = await this.getActiveTabs();
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        chrome.storage.local.get([domain + "_contextSettings"], (result) => {
            let data = result[domain + "_contextSettings"];
            if (data) {
                this.includeDefaultContext.checked = data.includeDefaultContext !== false;
                this.includeChangeHistory.checked = data.includeChangeHistory === true;
                this.includeGlobalChangeHistory.checked = data.includeGlobalChangeHistory === true;
            }
            this.includeGlobalChangeHistory.disabled = !this.includeChangeHistory.checked;
            this.updateContextLabel();
        });
    }
}

class HourglassSpinner {
    /**
     * Initializes the HourglassSpinner with default durations and elements.
     */
    hourglassElement; // Element to animate
    emptyingDuration; // Duration for the top-full hourglass (⏳) to
    pauseAfterEmptyingDuration; // Duration for the bottom-full hourglass (⌛) before rotation
    rotationDuration; // Duration for the 180-degree rotation

    // constructor
    constructor() {
        this.hourglassElement = document.getElementById('hourglass-emoji');

        this.emptyingDuration = 1500; 
        this.pauseAfterEmptyingDuration = 500; 
        this.rotationDuration = 800; 
    }

    /**
     * Initiates the hourglass animation sequence.
     */
    animateHourglass() {
        this.hourglassElement.textContent = '⏳';
        this.hourglassElement.classList.remove('rotating');
        this.hourglassElement.style.transform = 'rotate(0deg)';

        setTimeout(() => {
            this.hourglassElement.textContent = '⌛'; 
            this.hourglassElement.style.transform = 'rotate(0deg)'; 

            setTimeout(() => {
                this.hourglassElement.classList.add('rotating'); 

                this.hourglassElement.addEventListener('animationend', this.handleRotationEnd.bind(this), { once: true });

            }, this.pauseAfterEmptyingDuration);

        }, this.emptyingDuration);
    }

    handleRotationEnd() {
        this.hourglassElement.classList.remove('rotating');
        this.hourglassElement.textContent = '⏳';
        this.hourglassElement.style.transform = 'rotate(0deg)';

        this.animateHourglass();
    }

}

document.addEventListener("DOMContentLoaded", function () {
    new PopupManager();
});


// on close, send a signal to exit element selection mode
window.addEventListener("beforeunload", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "runExitElementSelectionMode" });
    });
});