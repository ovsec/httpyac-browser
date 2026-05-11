# Privacy Policy for httpOwl

**Last updated: May 11, 2026**

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
*   **OAuth tokens:** If you configure OAuth2 client_credentials via extension variables, the credentials and tokens remain entirely in your browser's local storage and memory. No credentials are sent to any third party.
*   **CORS:** The extension uses the background service worker to bypass CORS restrictions, allowing you to test APIs that would otherwise be blocked by the browser. This request is made from your browser to your destination server; no intermediate developer server is involved.

### 3. Page Scanning
*   **Scanning:** The extension scans the DOM of the active webpage to detect text matching the `.http` format (specifically `###` separators).
*   **Privacy:** This scanning is performed entirely within the extension's memory. No page content is transmitted to the developer.

## Permissions Explanation
*   **`storage`**: Required to save your variables, environment configurations, and request results so they persist across browser sessions.
*   **`host_permissions` (`<all_urls>`)**: Required for two purposes: (1) the content script injects run buttons on any webpage where `.http` request blocks may appear (GitHub, Confluence, internal wikis, documentation sites), and (2) the background service worker makes HTTP requests to any API endpoint you specify in your request blocks, bypassing browser CORS restrictions.

## Data Retention
Completed request results are temporarily stored in `chrome.storage.session` and are automatically discarded after 30 minutes or when you close the tab. No data persists beyond your browsing session without explicit user action (e.g., downloading an HTML report).

## Changes to Privacy Policy
We may update this policy periodically. Changes will be posted on this page with an updated revision date.

## Contact
If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/ovsec/httpyac-browser).
