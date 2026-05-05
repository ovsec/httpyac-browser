# Privacy Policy for httpOwl

**Last updated: May 5, 2026**

This privacy policy outlines how the **httpOwl** Chrome extension handles your data.

## Data Collection
httpOwl **does not collect, store, or transmit any personal data** to the developer or any third-party servers.

## Data Handling

### 1. User Variables & Environments
*   **Storage:** API keys, base URLs, and other variables are stored exclusively in your browser's local storage (`chrome.storage.local`).
*   **Transmission:** These variables are never sent to the developer. They are only used locally to populate the request body/headers before execution.

### 2. HTTP Requests
*   **Execution:** The extension sends HTTP requests directly from your browser to the endpoints **you define** in your code blocks.
*   **Interception:** The developer does not intercept, log, or store the requests, responses, or headers.
*   **CORS:** The extension uses the background service worker to bypass CORS restrictions, allowing you to test APIs that would otherwise be blocked by the browser. This request is made from your browser to your destination server; no intermediate developer server is involved.

### 3. Page Scanning
*   **Scanning:** The extension scans the DOM of the active webpage to detect text matching the `.http` format (specifically `###` separators).
*   **Privacy:** This scanning is performed entirely within the extension's memory. No page content is transmitted to the developer.

## Permissions Explanation
*   **`activeTab`**: Required to allow the extension to access the content of the tab you are currently viewing when you click the extension icon or run a request.
*   **`storage`**: Required to save your variables and environment configurations so they persist across browser sessions.
*   **`host_permissions` (`<all_urls>`)**: Required to allow the extension to inject run buttons on any webpage where you might have `.http` code (GitHub, Confluence, internal wikis, etc.) and to allow the service worker to fetch requests to any API endpoint you specify.

## Changes to Privacy Policy
We may update this policy periodically. Changes will be posted on this page with an updated revision date.

## Contact
If you have questions about this privacy policy, please contact the developer via the [GitHub repository](https://github.com/YOUR_USERNAME/httpyac-browser).
