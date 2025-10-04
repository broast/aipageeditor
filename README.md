# AI Page Editor
<img src="icon128.png" width="128" alt="Project Logo">
A browser extension for editing live web pages in the browser with AI-generated styles and content. 

## Demo
[![Watch the demo](https://github.com/user-attachments/assets/75d95e9f-0469-420a-b081-db67268c0128)](https://github.com/user-attachments/assets/00005bea-f849-4de2-b0b4-ec447b15c460)

## Features
- **Style Generation**: Generate CSS styles to apply to live web pages.
- **Global Styles**: Apply styles globally across all websites.
- **Content Generation**: Process page content with AI to generate new text and HTML.
- **Layer Management**: Generated content is organized into layers for easy management.
- **Context Management**: Manage information included in AI requests, such as page HTML, screenshots, custom selected DOM nodes, and change history
- **Bring Your Own Model**: Input your own model endpoints for custom AI processing.

## Getting Started
### Chrome Web Store
- Not yet available.

### Manual Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/broast/aipageeditor.git
   cd ai-page-editor
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the cloned repository directory.
5. Open the extension popup by clicking the extension icon in the toolbar.
6. Configure a model endpoint and API key in the settings.
7. Start generating styles and content for web pages.
