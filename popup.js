class PopupManager {
  constructor() {
    this.stylesNotesField = document.getElementById("notes");
    this.stylesSaveButton = document.getElementById("save");
    this.stylesClearButton = document.getElementById("clear");

    this.contentNotesField = document.getElementById("contentGenerationNote");
    this.contentSaveButton = document.getElementById("saveContent");
    this.contentClearButton = document.getElementById("clearContent");

    this.contentLoadingIndicator = document.getElementById(
      "contentLoadingIndicator",
    );

    this.globalStyleCheckbox = document.getElementById("global-style-checkbox");
    this.loadingIndicator = document.getElementById("loadingIndicator");
    this.spinner = new HourglassSpinner("hourglass-emoji");
    this.contentSpinner = new HourglassSpinner("content-hourglass-emoji");

    this.addElementToContextButton = document.getElementById(
      "addElementToContext",
    );
    this.resetContextButton = document.getElementById("resetContext");
    this.includeDefaultContext = document.getElementById(
      "includeDefaultContext",
    );
    this.sendScreenshot = document.getElementById("sendScreenshot");
    this.includeChangeHistory = document.getElementById("includeChangeHistory");
    this.includeGlobalChangeHistory = document.getElementById(
      "includeGlobalChangeHistory",
    );

    this.apiKeyField = document.getElementById("apiKey");
    this.modelEndpointField = document.getElementById("modelEndpoint");
    this.modelNameField = document.getElementById("modelName");
    this.saveSettingsButton = document.getElementById("saveSettings");

    this.suppressToastNotifications = document.getElementById(
      "suppressToastNotifications",
    );
    this.maxConcurrentRequests = document.getElementById(
      "maxConcurrentRequests",
    );
    this.themeSelector = document.getElementById("theme-selector");

    this.styleGenerations = document.getElementById("style-generations");
    this.contentGenerations = document.getElementById("content-generations");

    this.spinner.animateHourglass();
    this.contentSpinner.animateHourglass();
    this.initEventListeners();
    this.initTabs();
    this.loadGenerations();
    this.loadContentGenerations();
    this.loadSettings();
    this.loadTheme();
    this.updateTitle();
    this.loadContextSettings();
    this.loadTextareaContent();
    this.clearStylesNoteOnNextUpdate = false;
    this.clearContentNoteOnNextUpdate = false;
  }

  async loadTextareaContent() {
    const storageKey = "textareaContent";
    const result = await new Promise(resolve => chrome.storage.local.get(storageKey, resolve));
    const savedContent = result[storageKey] || {};
    if (savedContent.styles) {
      this.stylesNotesField.value = savedContent.styles;
    }
    if (savedContent.content) {
      this.contentNotesField.value = savedContent.content;
    }
    this.updateSaveButtonState();
  }

  saveTextareaContent() {
    const storageKey = "textareaContent";
    const contentToSave = {
      styles: this.stylesNotesField.value,
      content: this.contentNotesField.value,
    };
    chrome.storage.local.set({ [storageKey]: contentToSave });
  }

  async updateTitle() {
    const tabs = await this.getActiveTabs();
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    document.querySelector(".title-bar-text").innerText =
      `🎨 AI Page Editor (${domain})`;
  }

  async initTabs() {
    const tabLists = document.querySelectorAll('[role="tablist"]');
    const storageKey = "activeTabs";
    const savedTabs = (await new Promise(resolve => chrome.storage.local.get(storageKey, resolve)))[storageKey] || {};

    tabLists.forEach(tablist => {
      const tablistId = tablist.id;
      if (!tablistId) {
        console.warn("Tablist found without an ID, skipping persistence for it.", tablist);
        return;
      }

      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const panels = tabs
        .map(t => document.getElementById(t.querySelector("a").getAttribute("href").slice(1)))
        .filter(Boolean);

      const showActive = () => {
        const activeTab = tabs.find(t => t.getAttribute("aria-selected") === "true");
        if (!activeTab) return;
        const activeId = activeTab.querySelector("a").getAttribute("href").slice(1);
        panels.forEach(p => (p.hidden = p.id !== activeId));
      };

      // Set initial active tab
      const activeTabHref = savedTabs[tablistId];
      let activeTab = tabs.find(t => t.querySelector("a").getAttribute("href") === activeTabHref);
      if (!activeTab) {
        activeTab = tabs[0];
      }
      tabs.forEach(t => t.setAttribute("aria-selected", "false"));
      activeTab.setAttribute("aria-selected", "true");

      tabs.forEach(tab => {
        tab.addEventListener("click", async (e) => {
          e.preventDefault();
          tabs.forEach(t => t.setAttribute("aria-selected", "false"));
          tab.setAttribute("aria-selected", "true");

          const newActiveTabHref = tab.querySelector("a").getAttribute("href");
          const currentSavedTabs = (await new Promise(resolve => chrome.storage.local.get(storageKey, resolve)))[storageKey] || {};
          currentSavedTabs[tablistId] = newActiveTabHref;
          await new Promise(resolve => chrome.storage.local.set({ [storageKey]: currentSavedTabs }, resolve));

          showActive();
          this.updateAdvancedOptionsMaxHeight();
        });
      });

      showActive();
    });
  }

  updateAdvancedOptionsMaxHeight() {
    const content = document.getElementById("advanced-options-content");
    if (content.style.maxHeight && content.style.maxHeight !== "0px") {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  }

  initEventListeners() {
    this.stylesSaveButton.addEventListener("click", () => this.saveNote());
    this.stylesClearButton.addEventListener("click", () => this.clearAll());
    this.contentSaveButton.addEventListener("click", () => this.saveContent());
    this.contentClearButton.addEventListener("click", () =>
      this.clearContentGenerations(),
    );

    this.addElementToContextButton.addEventListener("click", () =>
      this.addElementToContext(),
    );
    this.resetContextButton.addEventListener("click", () =>
      this.resetContext(),
    );
    this.includeDefaultContext.addEventListener("change", () => {
      this.saveContextSettings();
      this.updateContextLabel();
    });
    this.sendScreenshot.addEventListener("change", () => {
      this.saveContextSettings();
      this.updateContextLabel();
    });

    this.includeChangeHistory.addEventListener("change", () => {
      this.includeGlobalChangeHistory.disabled =
        !this.includeChangeHistory.checked;
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
    this.suppressToastNotifications.addEventListener("change", debouncedSave);
    this.maxConcurrentRequests.addEventListener("input", debouncedSave);
    this.themeSelector.addEventListener("change", () => this.saveTheme());

    const debouncedSaveText = this.debounce(() => this.saveTextareaContent(), 300);
    this.stylesNotesField.addEventListener("input", () => {
      this.updateSaveButtonState();
      debouncedSaveText();
    });
    this.contentNotesField.addEventListener("input", () => {
      this.updateSaveButtonState();
      debouncedSaveText();
    });

    this.updateSaveButtonState();

    document
      .getElementById("advanced-options-toggle")
      .addEventListener("click", () => {
        const content = document.getElementById("advanced-options-content");
        const toggle = document.getElementById("advanced-options-toggle");
        if (content.style.maxHeight) {
          content.style.maxHeight = null;
          toggle.innerText = "▶ Advanced options";
        } else {
          content.style.maxHeight = content.scrollHeight + "px";
          toggle.innerText = "▼ Advanced options";
          this.updateAdvancedOptionsMaxHeight();
        }
      });

    chrome.runtime.onMessage.addListener(
      async (message, sender, sendResponse) => {
        if (message.action === "updatePopup") {
          this.styleGenerations.innerHTML = "";
          await this.loadGenerations();
          if (this.clearStylesNoteOnNextUpdate) {
            this.stylesNotesField.value = "";
            const storageKey = "textareaContent";
            chrome.storage.local.get(storageKey, (result) => {
              let content = result[storageKey] || {};
              delete content.styles;
              chrome.storage.local.set({ [storageKey]: content });
            });
            this.clearStylesNoteOnNextUpdate = false;
          }
        } else if (message.action === "hideSpinner") {
          this.loadingIndicator.style.display = "none";
        } else if (message.action === "hideContentSpinner") {
          this.contentLoadingIndicator.style.display = "none";
        } else if (message.action === "contentGenerationAdded") {
          this.loadContentGenerations();
          if (this.clearContentNoteOnNextUpdate) {
            this.contentNotesField.value = "";
            const storageKey = "textareaContent";
            chrome.storage.local.get(storageKey, (result) => {
              let content = result[storageKey] || {};
              delete content.content;
              chrome.storage.local.set({ [storageKey]: content });
            });
            this.clearContentNoteOnNextUpdate = false;
          }
        }
      },
    );

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "runExitElementSelectionMode",
      });
    });

    this.updateContextLabel();
  }

  updateContextLabel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "runGetElementsInContext" },
        (response) => {
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
        },
      );
    });
  }

  updateSaveButtonState() {
    this.stylesSaveButton.disabled = this.stylesNotesField.value.trim() === "";
    this.contentSaveButton.disabled =
      this.contentNotesField.value.trim() === "";
  }

  async saveContent() {
    const note = this.contentNotesField.value;
    if (note.trim() === "") {
      return;
    }

    this.contentLoadingIndicator.style.display = "block";
    const tabs = await this.getActiveTabs();
    const settings = this.getSettingsFromInputs();

    this.clearContentNoteOnNextUpdate = true;

    chrome.tabs.sendMessage(tabs[0].id, {
      action: "runScanAndProcessElements",
      note: note,
      apiKey: settings.apiKey,
      modelEndpoint: settings.modelEndpoint,
      modelName: settings.modelName,
      includeChangeHistory: this.includeChangeHistory.checked,
      includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
    });
  }

  async saveNote() {
    let note = this.stylesNotesField.value;
    if (note.trim() === "") {
      return;
    }
    this.loadingIndicator.style.display = "block";
    const tabs = await this.getActiveTabs();
    const settings = this.getSettingsFromInputs();
    const isGlobal = this.globalStyleCheckbox.checked;

    this.clearStylesNoteOnNextUpdate = true;

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
        includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
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
    this.stylesNotesField.value = "";
    const tabs = await this.getActiveTabs();
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    chrome.storage.local.remove(domain);

    // remove all non-global styles from the UI
    const allGenerations =
      this.styleGenerations.querySelectorAll(".style-generation");
    allGenerations.forEach((generation) => {
      if (!generation.isGlobal) {
        generation.remove();
      }
    });

    chrome.tabs.sendMessage(tabs[0].id, { action: "runClearAndReapply" });
  }

  async clearContentGenerations() {
    this.contentNotesField.value = "";
    const tabs = await this.getActiveTabs();
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    chrome.storage.local.remove(domain + "_content");
    this.contentGenerations.innerHTML = "";
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "runClearContentGenerations",
    });
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

    const result = await new Promise((resolve) =>
      chrome.storage.local.get(["global_styles", domain], resolve),
    );

    let globalData = result["global_styles"];
    if (globalData && globalData.generations) {
      for (const generation of globalData.generations) {
        await this.addGenerationToPopup("global_styles", generation, true);
      }
    }

    let domainData = result[domain];
    if (domainData && domainData.generations) {
      for (const generation of domainData.generations) {
        await this.addGenerationToPopup(domain, generation, false);
      }
    }
  }

  async addGenerationToPopup(storageKey, generationData, isGlobal) {
    this.loadingIndicator.style.display = "none";
    const ID_PREFIX = "AIPE_GENERATION_";

    const tabs = await this.getActiveTabs();
    const url = new URL(tabs[0].url);
    const domain = url.hostname;

    if (this.styleGenerations.style.display === "none") {
      this.styleGenerations.style.display = "block";
    }

    let existingGeneration = document.getElementById(
      ID_PREFIX + generationData.id,
    );
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
    visibilityCheckbox.style.marginRight = "5px";

    if (isGlobal) {
      const result = await new Promise((resolve) =>
        chrome.storage.local.get([domain], resolve),
      );
      const domainData = result[domain];
      if (
        domainData &&
        domainData.global_visibility &&
        domainData.global_visibility[generationData.id] !== undefined
      ) {
        visibilityCheckbox.checked =
          domainData.global_visibility[generationData.id];
      } else {
        visibilityCheckbox.checked = generationData.visible !== false;
      }
    } else {
      visibilityCheckbox.checked = generationData.visible !== false;
    }

    visibilityCheckbox.addEventListener("change", async () => {
      const tabs = await this.getActiveTabs();
      if (isGlobal) {
        const result = await new Promise((resolve) =>
          chrome.storage.local.get(domain, resolve),
        );
        let domainData = result[domain] || {};
        if (!domainData.global_visibility) {
          domainData.global_visibility = {};
        }
        domainData.global_visibility[generationData.id] =
          visibilityCheckbox.checked;
        await new Promise((resolve) =>
          chrome.storage.local.set({ [domain]: domainData }, resolve),
        );
      } else {
        const result = await new Promise((resolve) =>
          chrome.storage.local.get(storageKey, resolve),
        );
        let data = result[storageKey];
        if (data && data.generations) {
          let targetGeneration = data.generations.find(
            (g) => g.id === generationData.id,
          );
          if (targetGeneration) {
            targetGeneration.visible = visibilityCheckbox.checked;
            await new Promise((resolve) =>
              chrome.storage.local.set({ [storageKey]: data }, resolve),
            );
          }
        }
      }
      // Notify content script to re-apply styles
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "runClearAndReapply",
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

    const sendMessage = (note, screenshotUrl = null) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "runProcessUserNote",
        note: note,
        id: generationData.id,
        visible: generationData.visible,
        apiKey: this.getSettingsFromInputs().apiKey,
        modelEndpoint: this.getSettingsFromInputs().modelEndpoint,
        modelName: this.getSettingsFromInputs().modelName,
        includeDefaultContext: this.includeDefaultContext.checked,
        isGlobal: isGlobal,
        screenshotUrl: screenshotUrl,
        includeChangeHistory: this.includeChangeHistory.checked,
        includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
      });
    };

    let regenerateButton = document.createElement("button");
    regenerateButton.innerText = "🦎";
    regenerateButton.title = "Regenerate";
    regenerateButton.className = "style-generation-action-button-icon";
    regenerateButton.addEventListener("click", async () => {
      this.loadingIndicator.style.display = "block";
      if (this.sendScreenshot.checked) {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
          sendMessage(generationData.note, dataUrl);
        });
      } else {
        sendMessage(generationData.note);
      }
    });

    let modifyButton = document.createElement("button");
    modifyButton.innerText = "✏️";
    modifyButton.title = "Modify";
    modifyButton.className = "style-generation-action-button-icon";
    let applyButton = document.createElement("button");
    applyButton.innerText = "✔️";
    applyButton.title = "Apply";
    applyButton.className = "style-generation-action-button-icon";
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

      if (this.sendScreenshot.checked) {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
          sendMessage(newNote, dataUrl);
        });
      } else {
        sendMessage(newNote);
      }

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
    removeButton.innerText = "🗑️";
    removeButton.title = "Remove";
    removeButton.className = "style-generation-action-button-icon";
    removeButton.addEventListener("click", () => {
      chrome.storage.local.get([storageKey], (result) => {
        let data = result[storageKey];
        let generations = data.generations;
        let newGenerations = generations.filter((generation) => {
          return generation.id !== generationData.id;
        });
        data.generations = newGenerations;
        chrome.storage.local.set({ [storageKey]: data }, () => {
          styleGeneration.remove();
        });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "runClearAndReapply",
          });
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
    copyButton.className = "style-generation-action-button";
    copyButton.addEventListener("click", () => {
      let css = generationData.styles || "";
      navigator.clipboard.writeText(css).then(
        () => {
          copyButton.innerText = "✅ Copied!";
          setTimeout(() => {
            copyButton.innerText = "📋 Copy CSS";
          }, 1000);
        },
        (err) => {
          console.error("Could not copy text: ", err);
        },
      );
    });

    let buttonsDiv = document.createElement("div");
    buttonsDiv.className = "action-buttons-container";
    buttonsDiv.style.display = "flex";
    buttonsDiv.style.justifyContent = "right";
    buttonsDiv.appendChild(copyButton);
    buttonsDiv.appendChild(regenerateButton);

    if (isGlobal) {
      let regenerateOverrideButton = document.createElement("button");
      regenerateOverrideButton.innerText = "🧬";
      regenerateOverrideButton.title = "Regenerate and override global style";
      regenerateOverrideButton.className = "style-generation-action-button-icon";
      regenerateOverrideButton.addEventListener("click", async () => {
        this.loadingIndicator.style.display = "block";

        const sendMessage = (screenshotUrl = null) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "runProcessUserNote",
            note: generationData.note,
            apiKey: this.getSettingsFromInputs().apiKey,
            modelEndpoint: this.getSettingsFromInputs().modelEndpoint,
            modelName: this.getSettingsFromInputs().modelName,
            includeDefaultContext: this.includeDefaultContext.checked,
            isGlobal: false,
            screenshotUrl: screenshotUrl,
            includeChangeHistory: this.includeChangeHistory.checked,
            includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
            globalStyleToOverride: generationData.id,
          });
        };
        if (this.sendScreenshot.checked) {
          chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            sendMessage(dataUrl);
          });
        } else {
          sendMessage();
        }
      });
      buttonsDiv.appendChild(regenerateOverrideButton);
    }

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

  addContentGenerationToPopup(domain, generationData) {
    this.contentLoadingIndicator.style.display = "none";
    const ID_PREFIX = "AIPE_GENERATION_CONTENT_";

    if (this.contentGenerations.style.display === "none") {
      this.contentGenerations.style.display = "block";
    }

    let existingGeneration = document.getElementById(
      ID_PREFIX + generationData.id,
    );
    if (existingGeneration) {
      existingGeneration.remove();
    }

    let contentGeneration = document.createElement("div");
    contentGeneration.className = "style-generation status-bar-field";
    contentGeneration.id = ID_PREFIX + generationData.id;
    contentGeneration.style.position = "relative";

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
      chrome.storage.local.get([domain + "_content"], (result) => {
        let data = result[domain + "_content"];
        if (!data) return;
        let generations = data.generations;
        let targetGeneration = generations.find(
          (g) => g.id === generationData.id,
        );
        if (targetGeneration) {
          targetGeneration.visible = visibilityCheckbox.checked;
        }
        data.generations = generations;
        chrome.storage.local.set({ [domain + "_content"]: data });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "toggleContentGeneration",
            generationId: generationData.id,
            visible: visibilityCheckbox.checked,
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
    contentGeneration.appendChild(topContainer);

    let regenerateButton = document.createElement("button");
    regenerateButton.innerText = "🦎";
    regenerateButton.title = "Regenerate";
    regenerateButton.className = "style-generation-action-button-icon";
    regenerateButton.addEventListener("click", async () => {
      this.contentLoadingIndicator.style.display = "block";
      const tabs = await this.getActiveTabs();
      const settings = this.getSettingsFromInputs();
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "runScanAndProcessElements",
        note: generationData.note,
        id: generationData.id,
        visible: generationData.visible,
        apiKey: settings.apiKey,
        modelEndpoint: settings.modelEndpoint,
        modelName: settings.modelName,
        selectors: generationData.selectors,
        selectedElements: generationData.selectedElements,
        includeChangeHistory: this.includeChangeHistory.checked,
        includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
      });
    });

    let modifyButton = document.createElement("button");
    modifyButton.innerText = "✏️";
    modifyButton.title = "Modify";
    modifyButton.className = "style-generation-action-button-icon";
    let applyButton = document.createElement("button");
    applyButton.innerText = "✔️";
    applyButton.title = "Apply";
    applyButton.className = "style-generation-action-button-icon";
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
      chrome.storage.local.get([domain + "_content"], (result) => {
        let data = result[domain + "_content"];
        let generations = data.generations;
        let targetGeneration = generations.find(
          (g) => g.id === generationData.id,
        );
        if (targetGeneration) {
          targetGeneration.note = newNote;
        }
        data.generations = generations;
        chrome.storage.local.set({ [domain + "_content"]: data });
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
    removeButton.innerText = "🗑️";
    removeButton.title = "Remove";
    removeButton.className = "style-generation-action-button-icon";
    removeButton.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "removeContentGeneration",
          generationId: generationData.id,
        });
      });

      chrome.storage.local.get([domain + "_content"], (result) => {
        let data = result[domain + "_content"];
        if (!data) return;
        let generations = data.generations;
        let newGenerations = generations.filter((generation) => {
          return generation.id !== generationData.id;
        });
        data.generations = newGenerations;
        chrome.storage.local.set({ [domain + "_content"]: data }, () => {
          contentGeneration.remove();
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
    copyButton.innerText = "📋 Copy Selector";
    copyButton.className = "style-generation-action-button";
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(generationData.selectors.join(", ")).then(
        () => {
          copyButton.innerText = "✅ Copied!";
          setTimeout(() => {
            copyButton.innerText = "📋 Copy Selector";
          }, 1000);
        },
        (err) => {
          console.error("Could not copy text: ", err);
        },
      );
    });

    let buttonsDiv = document.createElement("div");
    buttonsDiv.className = "action-buttons-container";
    buttonsDiv.style.display = "flex";
    buttonsDiv.style.justifyContent = "right";
    buttonsDiv.appendChild(copyButton);
    buttonsDiv.appendChild(regenerateButton);
    buttonsDiv.appendChild(modifyButton);
    buttonsDiv.appendChild(applyButton);
    buttonsDiv.appendChild(removeButton);
    contentGeneration.appendChild(buttonsDiv);

    let randomPastel = Math.floor(Math.random() * 360);
    let randomPastel2 = (randomPastel + 180) % 360;
    let randomPastel3 = (randomPastel + 90) % 360;
    contentGeneration.style.background = `linear-gradient(110deg, hsl(${randomPastel}, 100%, 80%), hsl(${randomPastel2}, 100%, 80%), hsl(${randomPastel3}, 100%, 80%), hsl(0, 0%, 80%))`;

    this.contentGenerations.appendChild(contentGeneration);
  }

  async loadContentGenerations() {
    const tabs = await this.getActiveTabs();
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    this.contentGenerations.innerHTML = "";
    chrome.storage.local.get([domain + "_content"], (result) => {
      let data = result[domain + "_content"];
      if (data && data.generations) {
        data.generations.forEach((generation) => {
          this.addContentGenerationToPopup(domain, generation);
        });
      }
    });
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
      modelName: this.modelNameField.value,
      suppressToastNotifications: this.suppressToastNotifications.checked,
      maxConcurrentRequests: this.maxConcurrentRequests.value,
    };
    chrome.storage.local.set({ aipe_settings: settings });
  }

  loadSettings() {
    chrome.storage.local.get(["aipe_settings"], (result) => {
      const settings = result.aipe_settings || {};
      this.apiKeyField.value = settings.apiKey || "";
      this.modelEndpointField.value =
        settings.modelEndpoint || "https://api.openai.com/v1/chat/completions";
      this.modelNameField.value = settings.modelName || "gpt-4.1";
      this.suppressToastNotifications.checked =
        settings.suppressToastNotifications || false;
      this.maxConcurrentRequests.value = settings.maxConcurrentRequests === undefined ? 10 : settings.maxConcurrentRequests;
    });
  }

  saveTheme() {
    const theme = this.themeSelector.value;
    chrome.storage.local.set({ aipe_theme: theme }, () => {
      this.applyTheme(theme);
    });
  }

  loadTheme() {
    chrome.storage.local.get(["aipe_theme"], (result) => {
      const theme = result.aipe_theme || "default";
      this.themeSelector.value = theme;
      this.applyTheme(theme);
    });
  }

  applyTheme(theme) {
    const themeIds = ["dark-theme", "light-theme", "matrix-theme"];

    for (const id of themeIds) {
      const sheet = document.getElementById(id);
      if (sheet) {
        sheet.disabled = (id !== `${theme}-theme`);
      }
    }

    /* a hack since deferring didn't work, nor did the next frame - theoretically we have to detect when the stylesheet changes are done applying. With no network requests, I find 100ms to be reasonable, and also for this to be a low risk item. A workaround is to click a option tab to reset the height the same way. */
    setTimeout(this.updateAdvancedOptionsMaxHeight.bind(this), 100);
  }

  getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["aipe_settings"], (result) => {
        const settings = result.aipe_settings || {};
        const defaults = {
          apiKey: "",
          modelEndpoint: "https://api.openai.com/v1/chat/completions",
          modelName: "gpt-4.1",
        };
        resolve({
          apiKey: settings.apiKey || defaults.apiKey,
          modelEndpoint: settings.modelEndpoint || defaults.modelEndpoint,
          modelName: settings.modelName || defaults.modelName,
        });
      });
    });
  }

  getSettingsFromInputs() {
    return {
      apiKey: this.apiKeyField.value,
      modelEndpoint: this.modelEndpointField.value,
      modelName: this.modelNameField.value,
    };
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
      sendScreenshot: this.sendScreenshot.checked,
      includeChangeHistory: this.includeChangeHistory.checked,
      includeGlobalChangeHistory: this.includeGlobalChangeHistory.checked,
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
        this.includeDefaultContext.checked =
          data.includeDefaultContext !== false;
        this.sendScreenshot.checked = data.sendScreenshot === true;
        this.includeChangeHistory.checked = data.includeChangeHistory === true;
        this.includeGlobalChangeHistory.checked =
          data.includeGlobalChangeHistory === true;
      }
      this.includeGlobalChangeHistory.disabled =
        !this.includeChangeHistory.checked;
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
  constructor(elementId) {
    this.hourglassElement = document.getElementById(elementId);

    this.emptyingDuration = 1500;
    this.pauseAfterEmptyingDuration = 500;
    this.rotationDuration = 800;
  }

  /**
   * Initiates the hourglass animation sequence.
   */
  animateHourglass() {
    this.hourglassElement.textContent = "⏳";
    this.hourglassElement.classList.remove("rotating");
    this.hourglassElement.style.transform = "rotate(0deg)";

    setTimeout(() => {
      this.hourglassElement.textContent = "⌛";
      this.hourglassElement.style.transform = "rotate(0deg)";

      setTimeout(() => {
        this.hourglassElement.classList.add("rotating");

        this.hourglassElement.addEventListener(
          "animationend",
          this.handleRotationEnd.bind(this),
          { once: true },
        );
      }, this.pauseAfterEmptyingDuration);
    }, this.emptyingDuration);
  }

  handleRotationEnd() {
    this.hourglassElement.classList.remove("rotating");
    this.hourglassElement.textContent = "⏳";
    this.hourglassElement.style.transform = "rotate(0deg)";

    this.animateHourglass();
  }
}

document.addEventListener("DOMContentLoaded", function () {
  new PopupManager();
});

// on close, send a signal to exit element selection mode
window.addEventListener("beforeunload", function () {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "runExitElementSelectionMode",
    });
  });
});
