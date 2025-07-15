chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-screenshot",
    title: "Send Screenshot with Prompt",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-screenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      chrome.storage.local.set({ screenshotUrl: dataUrl }, () => {
        // You can add a notification or some other feedback to the user here
      });
    });
  }
});
