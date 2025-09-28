# Security Setup Guide for CartWatch Chrome Extension

This guide ensures your API keys and sensitive configuration are never committed to the public repository.

## 🔒 Security Overview

- **API keys are gitignored** - Never committed to version control
- **Local configuration files** - Stored separately from the repository
- **Example files provided** - For easy setup without exposing secrets
- **Clear error messages** - Help developers identify missing configuration

## 🚀 Quick Setup

### 1. Copy Configuration Files

```bash
# Copy the example Firebase configuration
cp firebase-config.example.js firebase-config.local.js

# Edit firebase-config.local.js with your actual Firebase credentials
```

### 2. Configure Firebase

Edit `firebase-config.local.js` with your actual Firebase project details:

```javascript
const firebaseConfig = {
    apiKey: "your_actual_firebase_api_key",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456",
};
```

### 3. Configure API Keys

Update the following files with your actual API keys:

- **Gemini API Key**: Update in `background.js` (line with `DEFAULT_API_KEY`)
- **Firebase Config**: Update in `firebase-config.local.js`

## 🛡️ Security Features

### Gitignore Protection

The following files are automatically excluded from git:

```
# API Keys and sensitive configuration
firebase-config.local.js
config.local.js
secrets.js
.env
.env.*
!.env.example
```

### Configuration Structure

```
checkout-bnpl-detector/
├── firebase-config.js          # Main config (imports from local)
├── firebase-config.example.js  # Template (committed)
├── firebase-config.local.js    # Actual config (gitignored)
└── .gitignore                  # Protects sensitive files
```

### Error Handling

The extension provides clear error messages if configuration is missing:

- ✅ **Success**: "Firebase configuration loaded from firebase-config.local.js"
- ❌ **Error**: "firebase-config.local.js not found!"
- ⚠️ **Warning**: "Using example configuration - Firebase will not work"

## 🔧 Development Workflow

### For New Developers

1. **Clone the repository**
2. **Copy configuration files**:
   ```bash
   cp firebase-config.example.js firebase-config.local.js
   ```
3. **Edit with actual credentials**
4. **Load extension in Chrome**

### For Production Deployment

1. **Ensure firebase-config.local.js exists** with production credentials
2. **Package the extension** (local config is included in package)
3. **Deploy to Chrome Web Store**

## 🚨 Security Checklist

Before committing or deploying:

- [ ] `firebase-config.local.js` is not in git status
- [ ] No API keys in committed files
- [ ] Example files contain placeholder values only
- [ ] `.env` files are gitignored
- [ ] Sensitive configuration is in gitignored files

## 🔍 Verification

### Check Git Status

```bash
git status
# Should NOT show:
# - firebase-config.local.js
# - .env files
# - Any files with actual API keys
```

### Check Gitignore

```bash
git check-ignore firebase-config.local.js
# Should return: firebase-config.local.js
```

## 🆘 Troubleshooting

### "firebase-config.local.js not found"

**Solution**: Copy the example file and configure it:
```bash
cp firebase-config.example.js firebase-config.local.js
# Edit with your actual Firebase credentials
```

### "Firebase will not work"

**Solution**: Make sure your `firebase-config.local.js` has actual credentials, not placeholder values.

### Extension won't load

**Solution**: Check browser console for configuration errors and ensure all required files exist.

## 📚 Additional Resources

- [Firebase Setup Guide](https://firebase.google.com/docs/web/setup)
- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Environment Variables Best Practices](https://12factor.net/config)

---

**Remember**: Never commit API keys or sensitive configuration to version control!
