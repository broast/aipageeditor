console.log("popup.js loaded");
document.addEventListener("DOMContentLoaded", function () {
    let notesField = document.getElementById("notes");
    let saveButton = document.getElementById("save");
    let clearButton = document.getElementById("clear");
    let addElementToContextButton = document.getElementById("addElementToContext");
    let resetContextButton = document.getElementById("resetContext");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        let url = new URL(tabs[0].url);
        let domain = url.hostname;

        saveButton.addEventListener("click", () => {

            let note = notesField.value;

            let siteData = {
                note: note,
                domain: domain,
                data: null
            }

            // make the loadingIndicator visible
            let loadingIndicator = document.getElementById("loadingIndicator");
            loadingIndicator.style.display = "block";

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runProcessUserNote", note: note });
            });

        });

        clearButton.addEventListener("click", () => {
            0
            notesField.value = "";
            chrome.storage.local.remove(domain);
            removeAllGenerations();
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runClear" });
            });
        });

        addElementToContextButton.addEventListener("click", () => {
            // log test
            console.log("Adding element to context");
            // send a message to enable element select mode
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runAddElementToContext" });
            });

        });
    });
});

function addToCommittedDataForDomain(domain, generationData) {
    // there can be multple commits for a domain
    // so we need to keep an array of commits
    // in the "committed" key

    // add the style generation to the popup html

    // hide the loadingIndicator
    let loadingIndicator = document.getElementById("loadingIndicator");
    loadingIndicator.style.display = "none";


    let styleGenerations = document.getElementById("style-generations");
    const ID_PREFIX = "AIPE_GENERATION_";

    // if it is hidden, show it
    if (styleGenerations.style.display === "none") {
        styleGenerations.style.display = "block";
    }

    // if this one already exists, don't add it again
    let existingGeneration = document.getElementById(ID_PREFIX + generationData.id);
    if (existingGeneration) {
        return;
    }

    let styleGeneration = document.createElement("div");

    styleGeneration.className = "style-generation status-bar-field";

    styleGeneration.id = ID_PREFIX + generationData.id;

    // we will show the user notes and some buttons
    // one button to regenerate based on the user notes, another button to allow the user to modify the notes and that would have to reveal an apply button, and then another button to remove the committed generated style
    // the user notes should not be editable until the user clicks the modify button

    let note = generationData.note;

    let noteDiv = document.createElement("div");
    noteDiv.innerText = note;
    // give it a class
    noteDiv.className = "style-generation-note";
    styleGeneration.appendChild(noteDiv);

    let regenerateButton = document.createElement("button");
    regenerateButton.innerText = "🦎 Regenerate";

    regenerateButton.addEventListener("click", () => {
        let loadingIndicator = document.getElementById("loadingIndicator");
        loadingIndicator.style.display = "block";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "runProcessUserNote", note: note, id: generationData.id });
        });
    });


    let modifyButton = document.createElement("button");
    modifyButton.innerText = "✏️ Modify";

    modifyButton.addEventListener("click", () => {
        noteDiv.contentEditable = true;
        noteDiv.focus();
        modifyButton.style.display = "none";
        applyButton.style.display = "inline-block";
    });


    let applyButton = document.createElement("button");
    applyButton.innerText = "🖌️ Apply";
    applyButton.style.display = "none";

    applyButton.addEventListener("click", () => {
        let newNote = noteDiv.innerText;
        generationData.note = newNote;

        // show the loading
        let loadingIndicator = document.getElementById("loadingIndicator");
        loadingIndicator.style.display = "block";

        chrome.storage.local.set({ [domain]: generationData }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runProcessUserNote", note: newNote, id: generationData.id });

                // return to not editable
                noteDiv.contentEditable = false;
                applyButton.style.display = "none";
                modifyButton.style.display = "inline-block";
            });
        });
    });

    // when modifying, if the changes are applied or if focusing on anything else, revert to not editable
    noteDiv.addEventListener("blur", (event) => {
        if (event.relatedTarget == applyButton) {
            return;
        }
        event.preventDefault();

        noteDiv.contentEditable = false;
        applyButton.style.display = "none";
        modifyButton.style.display = "inline-block";

        //restore the original note
        noteDiv.innerText = note;
    });


    let removeButton = document.createElement("button");
    removeButton.innerText = "🗑️ Remove";

    removeButton.addEventListener("click", () => {
        // remove only this generation from the local storage array of generations
        // found at [domain].generations[]
        chrome.storage.local.get([domain], (result) => {
            let data = result[domain];
            let generations = data.generations;
            let newGenerations = generations.filter((generation) => {
                // todo: use id?
                return generation.id !== generationData.id;
            });
            data.generations = newGenerations;
            chrome.storage.local.set({ [domain]: data }, () => {
                styleGenerations.removeChild(styleGeneration);
            });

            // run reapply
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runClearAndReapply" });
            });
        });
    });

    // add a clickable label in the corner of the generation div that allows the user to copy the generated style to the clipboard
    let copyButton = document.createElement("span");

    // make it look like a transpaarent background label
    copyButton.style.background = "none";
    copyButton.style.border = "none";
    copyButton.style.color = "rgba(0, 0, 0, 0.5)";
    copyButton.style.cursor = "pointer";
    copyButton.style.position = "absolute";
    copyButton.style.left = "0px";
    copyButton.style.fontWeight = "normal";
    copyButton.innerText = "📋 Copy CSS";

    // give it a class name
    copyButton.className = "style-generation-copy-button";


    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(generationData.styles).then(() => {
            // change the label to "Copied!" for 1 second
            // with a leading emoji
            copyButton.innerText = "✅ Copied!";
            setTimeout(() => {
                copyButton.innerText = "📋 Copy CSS";
            }, 1000);
        }, (err) => {
            console.error("Could not copy text: ", err);
        });
    });

    // put the buttons in a flex div
    let buttonsDiv = document.createElement("div");
    buttonsDiv.style.display = "flex";
    buttonsDiv.style.justifyContent = "right";



    // add the copy button to the buttons div first
    buttonsDiv.appendChild(copyButton);

    buttonsDiv.appendChild(regenerateButton);
    buttonsDiv.appendChild(modifyButton);
    buttonsDiv.appendChild(applyButton);
    buttonsDiv.appendChild(removeButton);

    styleGeneration.appendChild(buttonsDiv);

    // assign a random pastel background gradient, ending with the gray color
    let randomPastel = Math.floor(Math.random() * 360);
    let randomPastel2 = (randomPastel + 180) % 360;
    let randomPastel3 = (randomPastel + 90) % 360;

    styleGeneration.style.background = `linear-gradient(110deg, hsl(${randomPastel}, 100%, 80%), hsl(${randomPastel2}, 100%, 80%), hsl(${randomPastel3}, 100%, 80%), hsl(0, 0%, 80%))`;

    styleGenerations.appendChild(styleGeneration);
}

function removeAllGenerations() {
    let styleGenerations = document.getElementById("style-generations");
    styleGenerations.innerHTML = "";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updatePopup") {
        let domain = message.domain;
        let data = message.data;
        addToCommittedDataForDomain(domain, data);
    }
});

// on launch, populate commmitted data from local storage for this domain
// from the generations array
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    let url = new URL(tabs[0].url);
    let domain = url.hostname;
    chrome.storage.local.get([domain], (result) => {
        let data = result[domain];
        if (data && data.generations) {
            data.generations.forEach((generation) => {
                addToCommittedDataForDomain(domain, generation);
            });
        }
    });
});

// on load, send a signal to exit element selection mode
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "runExitElementSelectionMode" });
});