# CartWatch - Affordability Alert Chrome Extension

**Real-time affordability & consequence alerts for shoppers**

CartWatch is a Chrome Extension (Manifest V3) that warns shoppers at click-time if a purchase is payment-related and whether they can afford it, then shows a concise popup with potential consequences.

## Features

-   🔍 **Smart Payment Detection**: Uses Gemini AI to classify click context as payment-related
-   💰 **Affordability Assessment**: Integrates with Risk Scoring API to determine payment feasibility
-   🚨 **Real-time Alerts**: Shows in-page popups and Chrome notifications
-   ⚙️ **Configurable Settings**: Customizable risk horizon, API endpoints, and alert preferences
-   🔒 **Privacy-Focused**: Minimal data collection, no PII storage
-   ♿ **Accessible**: High contrast, ARIA support, keyboard navigation

## Quick Start

### 1. Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The CartWatch icon should appear in your Chrome toolbar

### 2. Configuration

1. Click the CartWatch icon in your toolbar
2. Click "Settings" to open the options page
3. Enter your **Gemini API Key** (required):
    - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
    - Create a new API key
    - Copy and paste it into the settings
4. Optionally configure a **Risk Scoring API URL** (uses built-in logic if not provided)
5. Adjust other settings as needed
6. Click "Save Settings"

### 3. Usage

-   Navigate to any e-commerce website
-   Click on payment-related buttons (Buy Now, Checkout, etc.)
-   CartWatch will analyze the click context and show affordability alerts
-   Alerts appear as popups in the bottom-right corner for 5 seconds

## Architecture

### Files Structure

```
cartwatch-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content.js            # Click monitoring and popup display
├── options.html          # Settings page
├── options.js            # Settings page logic
├── popup.html            # Extension popup
├── popup.js              # Popup logic
├── icon128.png           # Extension icon
├── create_icon.html      # Icon generator utility
└── test-pages/           # Test HTML files
```

### Core Components

#### Background Service Worker (`background.js`)

-   Handles Gemini API classification requests
-   Manages Risk Scoring API calls
-   Implements debouncing and error handling
-   Provides mock risk assessment when API unavailable

#### Content Script (`content.js`)

-   Monitors all page clicks
-   Extracts click context (text, nearby elements)
-   Displays affordability alerts as in-page popups
-   Handles accessibility and responsive design

#### Options Page (`options.html` + `options.js`)

-   Configuration interface for API keys and settings
-   Form validation and auto-save functionality
-   Privacy information and help text

#### Popup (`popup.html` + `popup.js`)

-   Extension status display
-   Session statistics
-   Quick access to settings and testing

## API Integration

### Gemini API (Required)

**Purpose**: Classify click context as payment-related

**Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`

**Request Format**:

```json
{
    "contents": [
        {
            "parts": [
                {
                    "text": "Analyze this text for payment intent..."
                }
            ]
        }
    ],
    "generationConfig": {
        "temperature": 0,
        "maxOutputTokens": 200,
        "responseMimeType": "application/json"
    }
}
```

**Response Format**:

```json
{
  "is_payment": boolean,
  "confidence": number,
  "reason": string
}
```

### Risk Scoring API (Optional)

**Purpose**: Assess affordability and payment risk

**Request Format**:

```json
{
  "amount": number,
  "merchant": string,
  "url": string,
  "userSignals": {
    "text": string,
    "horizonDays": number
  }
}
```

**Response Format**:

```json
{
  "canPay": boolean,
  "probability": number,
  "horizonDays": number,
  "reason": string,
  "suggestion": string
}
```

## Configuration

### Storage Schema

Settings are stored in `chrome.storage.sync`:

```javascript
{
  "geminiApiKey": "string",        // Required: Gemini API key
  "riskApiUrl": "string",          // Optional: Risk API endpoint
  "riskHorizonDays": number,       // Default: 30 days
  "enableNotifications": boolean,  // Default: true
  "enablePopup": boolean          // Default: true
}
```

### Session Statistics

Session data is stored in `chrome.storage.local`:

```javascript
{
  "sessionClicksAnalyzed": number,
  "sessionPaymentsDetected": number,
  "sessionAlertsShown": number
}
```

## Privacy & Security

### Data Collection

-   **Minimal Context**: Only extracts ≤400 characters of click context
-   **No PII**: No personal information, browsing history, or financial data collected
-   **Domain Only**: Sends only page domain, not full URLs
-   **Temporary**: All API communications are temporary and encrypted

### Data Storage

-   **Local Only**: Settings stored locally in browser
-   **No Tracking**: No analytics or tracking mechanisms
-   **No Third Parties**: Data only sent to configured APIs

### Permissions Rationale

-   `storage`: Store user settings and session data
-   `notifications`: Show Chrome notifications for alerts
-   `activeTab`: Access current tab for click monitoring
-   `<all_urls>`: Monitor clicks on all websites

## Testing

1. Load the unpacked extension via `chrome://extensions`.
2. Use the browser action popup `Quick Test` button to open the built-in ecommerce sandbox pages.
3. Click payment-oriented buttons (e.g., “Buy Now”, “Proceed to Checkout”). A centered modal should appear with affordability guidance.
4. Navigate between test pages after triggering an alert—the modal should replay on the new page, confirming cross-page persistence.
5. Use the popup `Debug` button to confirm the content script is active and the modal renderer works.
6. Review the options page to verify new toggles (debug logging, confidence threshold) save correctly.

## Development

### Prerequisites

-   Chrome browser with developer mode enabled
-   Gemini API key from Google AI Studio
-   Optional: Risk Scoring API endpoint

### Local Development

1. Clone the repository
2. Make changes to the source files
3. Reload the extension in `chrome://extensions/`
4. Test on various websites

### Building

No build process required - the extension runs directly from source files.

### Debugging

-   **Background Script**: Check `chrome://extensions/` → CartWatch → "Inspect views: background page"
-   **Content Script**: Use browser DevTools on any webpage
-   **Options Page**: Right-click on options page → "Inspect"
-   **Popup**: Right-click on extension icon → "Inspect popup"

## Troubleshooting

### Common Issues

**"Gemini API key not configured"**

-   Go to Settings and enter your Gemini API key
-   Ensure the key is valid and has proper permissions

**"No popup appears when clicking"**

-   Check if popup is enabled in settings
-   Verify the click context contains payment-related text
-   Check browser console for errors

**"Extension not working on certain sites"**

-   Some sites may block content scripts
-   Check if the site has Content Security Policy restrictions
-   Try refreshing the page

**"API requests failing"**

-   Check your internet connection
-   Verify API keys are correct
-   Check browser console for network errors

### Debug Mode

Enable debug logging by opening browser console and running:

```javascript
localStorage.setItem("cartwatch-debug", "true");
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style

-   Use ES6+ features
-   Follow Chrome Extension best practices
-   Include error handling
-   Add comments for complex logic

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review browser console for errors
3. Open an issue on GitHub
4. Include browser version and error messages

## Changelog

### v1.0.0

-   Initial release
-   Gemini API integration
-   Risk assessment with mock fallback
-   In-page popup alerts
-   Chrome notifications
-   Settings page
-   Session statistics
-   Accessibility features
-   Privacy-focused design

---

**CartWatch** - Making online shopping more mindful, one click at a time.
