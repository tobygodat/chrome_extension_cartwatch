/**
 * Checkout Guard Content Script
 * Detects checkout contexts, extracts cart totals, and highlights risky payment options.
 */

(() => {
    if (window.checkoutGuardInjected) return;
    window.checkoutGuardInjected = true;

    /** @type {const} */
    const PALETTE = {
        BLACK: "#000000",
        NAVY: "#14213D",
        ACCENT: "#FCA311",
        GRAY: "#E5E5E5",
        WHITE: "#FFFFFF",
    };

    const USER_BALANCE_DEFAULT = 1250;
    const MUTATION_DEBOUNCE_MS = 200;
    const MODAL_RESHOW_THRESHOLD = 0.01;
    const INTENT_COOLDOWN_MS = 8000;
    const MODAL_ID = "checkout-guard-overlay";
    const TOAST_ID = "checkout-guard-toast";
    const DEBUG = true;

    const CART_ITEM_SELECTORS = [
        ".cart-item",
        ".line-item",
        "li.cart__row",
        ".checkout-cart-item",
        ".order-summary__section .product",
        ".basket-item",
        ".cart__item",
        ".sc-list-item.sc-list-item-border",
        '[data-asin][data-removed="false"]',
    ];

    const PRICE_SELECTORS = [
        ".price",
        ".cart-item__price",
        ".line-price",
        ".product-price",
        ".order-summary__emphasis",
        ".a-price .a-offscreen",
        "[data-test='line-item-price']",
        "[data-qa='cart-item-price']",
    ];

    const TOTAL_SELECTORS = [
        "#sc-subtotal-amount-activecart",
        "[data-test='subtotal-amount']",
        "[data-testid*='subtotal' i]",
        "[data-qa*='subtotal' i]",
        "[id*='subtotal' i]",
        "[class*='subtotal' i]",
        "[data-test='order-total']",
        "[data-testid*='order-total' i]",
        "[data-qa*='order-total' i]",
        "#order-total",
        "[id*='order-total' i]",
        ".order-total",
        "[class*='order-total' i]",
        "[data-test='grand-total']",
        "[data-testid*='grand-total' i]",
        "[data-qa*='grand-total' i]",
        "[id*='grand-total' i]",
        "[class*='grand-total' i]",
        ".total-price",
        "[class*='total' i]",
        "[id*='total' i]",
        // eBay-specific selectors
        "[data-test-id='CART_SUMMARY_SUBTOTAL']",
        "[data-test-id*='subtotal' i]",
        ".cart-summary-subtotal",
        ".cart-subtotal",
        ".subtotal-amount",
        // Shopify selectors
        ".cart__subtotal",
        ".order-summary__section--subtotal",
        ".payment-due-label",
        ".skeleton-while-loading--tabular-nums",
        // WooCommerce selectors
        ".cart-subtotal .amount",
        ".order-total .amount",
        ".woocommerce-Price-amount",
        // Generic e-commerce selectors
        "[data-price-target='subtotal']",
        "[data-automation-id*='subtotal']",
        ".checkout-subtotal",
        ".cart-total-price",
        ".order-summary-total",
    ];

    const QUANTITY_SELECTORS = [
        "input[name*='quantity' i]",
        "select[name*='quantity' i]",
        "[data-test='item-quantity']",
        "span[class*='quantity' i]",
        "div[class*='quantity' i]",
    ];

    const EXCLUDE_SECTION_SELECTORS = [
        "#sc-saved-cart",
        ".saved-items",
        ".save-for-later",
        ".sc-recommendations",
        ".sc-upsell",
        ".recommendations",
        "[data-component-type='s-atf-recs']",
        "[data-test='cart-saved-for-later']",
    ];

    const EXCLUDE_KEYWORDS = [
        "save for later",
        "saved items",
        "sponsored",
        "recommend",
        "frequently bought",
        "customers also bought",
        "related items",
    ];

    const CHECKOUT_BUTTON_SELECTORS = [
        "#sc-buy-box-ptc-button",
        "#sc-buy-box-ptc-button-announce",
        "button[name*='checkout' i]",
        "button[id*='checkout' i]",
        "button[data-test*='checkout' i]",
        "button[data-action*='proceed-to-checkout' i]",
        "button[data-testid*='checkout' i]",
        "a[href*='checkout' i]",
    ];

    const BNPL_KEYWORDS = [
        "pay later",
        "pay over time",
        "pay in 4",
        "pay in four",
        "installments",
        "installment",
        "buy now pay later",
        "bnpl",
        "financing",
        "interest-free",
        "affirm",
        "klarna",
        "afterpay",
        "sezzle",
        "zip",
        "paypal credit",
        "split it",
        "pay monthly",
        "pay weekly",
    ];

    const INTENT_KEYWORDS = Array.from(new Set([...BNPL_KEYWORDS]));

    const CHECKOUT_KEYWORDS = ["cart", "checkout", "bag", "basket", "review"];

    const CURRENCY_REGEX =
        /(?<!\w)([$€£])\s?(\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?!\w)/g;

    function pushPopupSummary(summary) {
        try {
            chrome.storage.local.set({ checkout_guard_summary: summary });
        } catch (error) {
            logDebug("Failed to update popup summary", error);
        }
    }

    const state = {
        shadowHost: null,
        shadowRoot: null,
        observer: null,
        currentBalance: USER_BALANCE_DEFAULT,
        latestCurrencySymbol: "$",
        lastCartTotal: null,
        cartDismissed: false,
        cartContainer: null,
        cartContextScore: 0,
        totalNode: null,
        totalNodeObserver: null,
        totalNodeText: "",
        paymentHint: null,
        intentCooldown: new WeakMap(),
        focusRestore: null,
    };

    console.log('[CheckoutGuard] Extension loading on:', window.location.href);
    init();

    async function init() {
        console.log('[CheckoutGuard] Initializing extension...');
        await hydrateBalance();
        setupBalanceChangeListener();
        setupShadowModal();
        setupIntentListeners();
        setupCartChangeListeners();
        setupEscAndClickAway();
        startMutationObserver();
        console.log('[CheckoutGuard] About to analyze context...');
        analyzeContext();
    }

    function setupBalanceChangeListener() {
        // Listen for when user data changes (e.g., login/logout)
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName === "local" && changes.cartwatch_user_data) {
                console.log("Content: User data changed, refreshing balance");
                await hydrateBalance();
                // Force update the modal with new balance
                analyzeContext({ forceUpdate: true });
            }
        });
    }

    function setupCartChangeListeners() {
        const handler = debounce(
            () => analyzeContext({ forceUpdate: true }),
            150
        );

        document.addEventListener(
            "input",
            (e) => {
                const t = e.target;
                if (!t) return;
                if (t.matches?.(QUANTITY_SELECTORS.join(","))) handler();
                // Many sites render totals/prices as live text fields/spans updated via input events
                if (t.closest?.(state.cartContainer ? undefined : "body"))
                    handler();
            },
            true
        );

        document.addEventListener(
            "change",
            (e) => {
                const t = e.target;
                if (t?.matches?.(QUANTITY_SELECTORS.join(","))) handler();
            },
            true
        );
    }

    async function hydrateBalance() {
        try {
            // Get user data from local storage
            const userData = await chrome.storage.local.get(
                "cartwatch_user_data"
            );
            const user = userData.cartwatch_user_data;

            if (!user || !user.uid) {
                console.log(
                    "Content: No user data found, using default balance"
                );
                state.currentBalance = USER_BALANCE_DEFAULT;
                return;
            }

            // Fetch user's actual balance from accounts collection
            console.log("Content: Fetching balance for user:", user.uid);
            console.log("Content: Using customerId:", user.customerId);
            const balanceResponse = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: "getUserBalance", customerId: user.customerId },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                "Content: Chrome runtime error:",
                                chrome.runtime.lastError
                            );
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response && response.error) {
                            console.error(
                                "Content: Response error:",
                                response.error
                            );
                            reject(new Error(response.error));
                        } else if (!response) {
                            console.error(
                                "Content: No response from background script"
                            );
                            reject(
                                new Error("No response from background script")
                            );
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            if (
                balanceResponse &&
                typeof balanceResponse.balance === "number"
            ) {
                state.currentBalance = balanceResponse.balance;
                console.log(
                    "Content: Updated balance from accounts:",
                    state.currentBalance
                );
            } else {
                console.log(
                    "Content: No balance found, using stored balance or default"
                );
                // Fallback to user's stored balance or default
                state.currentBalance = user.balance || USER_BALANCE_DEFAULT;
            }
        } catch (error) {
            console.error("Content: Failed to fetch balance from API:", error);
            // Fallback to default
            state.currentBalance = USER_BALANCE_DEFAULT;
        }
    }

    function setupShadowModal() {
        const existing = document.getElementById(MODAL_ID);
        if (existing) existing.remove();

        const host = document.createElement("div");
        host.id = MODAL_ID;
        host.style.position = "fixed";
        host.style.inset = "0";
        host.style.zIndex = "2147483647";
        host.style.pointerEvents = "none";

        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `${styles()}${modalMarkup()}`;

        document.documentElement.appendChild(host);

        state.shadowHost = host;
        state.shadowRoot = shadow;

        const overlay = shadow.querySelector(".cg-overlay");
        overlay?.addEventListener("click", (event) => {
            if (event.target === overlay) hideModal();
        });

        const closeBtn = shadow.querySelector(".cg-close");
        closeBtn?.addEventListener("click", hideModal);

        const gotIt = shadow.querySelector(".cg-primary");
        gotIt?.addEventListener("click", hideModal);
    }

    function setupEscAndClickAway() {
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") hideModal();
        });
    }

    function setupIntentListeners() {
        document.addEventListener(
            "click",
            (event) => {
                const trigger = findIntentTrigger(event.target);
                if (!trigger) return;

                const now = Date.now();
                const last = state.intentCooldown.get(trigger) || 0;
                if (now - last < INTENT_COOLDOWN_MS) return;
                state.intentCooldown.set(trigger, now);

                const payload = buildIntentPayload(trigger);
                if (!payload) return;

                chrome.runtime.sendMessage(
                    { action: "classifyPurchase", payload },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            showToast(
                                `Intent check failed: ${chrome.runtime.lastError.message}`,
                                "error"
                            );
                            return;
                        }
                        if (!response || response.error) {
                            showToast(
                                `Intent check failed: ${
                                    response?.error || "unknown error"
                                }`,
                                "error"
                            );
                            return;
                        }
                        handleIntentResult(response);
                    }
                );
            },
            true
        );
    }

    function startMutationObserver() {
        if (state.observer) state.observer.disconnect();
        state.observer = new MutationObserver(
            debounce((records) => {
                if (records.length === 0) return;
                const significant = records.some((record) => {
                    if (
                        record.type === "childList" &&
                        (record.addedNodes.length || record.removedNodes.length)
                    ) {
                        return true;
                    }
                    if (record.type === "characterData") {
                        return true;
                    }
                    if (record.type === "attributes") {
                        // Attribute changes (e.g., value/data-total/class updates) can reflect subtotal updates
                        return true;
                    }
                    return false;
                });
                if (!significant) return;

                if (
                    state.cartContainer &&
                    !document.contains(state.cartContainer)
                ) {
                    state.cartContainer = null;
                }

                analyzeContext();
            }, MUTATION_DEBOUNCE_MS)
        );

        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                "value",
                "aria-live",
                "aria-checked",
                "aria-selected",
                "data-total",
                "data-quantity",
                "data-qty",
                "class",
            ],
        });
    }

    function bindTotalNodeObserver() {
        try {
            if (state.totalNodeObserver) {
                state.totalNodeObserver.disconnect();
                state.totalNodeObserver = null;
            }
            const node = state.totalNode;
            if (!node || !document.contains(node)) return;
            const obs = new MutationObserver(
                debounce(() => {
                    const current = node.textContent || "";
                    if (current !== state.totalNodeText) {
                        state.totalNodeText = current;
                        analyzeContext({ forceUpdate: true });
                    }
                }, 50)
            );
            obs.observe(node, {
                characterData: true,
                subtree: true,
                childList: true,
                attributes: true,
            });
            state.totalNodeObserver = obs;
        } catch (e) {
            logDebug("bindTotalNodeObserver failed", e);
        }
    }

    function analyzeContext(options = {}) {
        const { forceUpdate = false } = options;
        const context = detectCheckoutContext();
        state.cartContextScore = context.score;

        if (!context.isCheckout) {
            hideModal();
            pushPopupSummary({
                status: "inactive",
                updatedAt: Date.now(),
            });
            return;
        }

        if (!state.cartContainer || forceUpdate || context.containerChanged) {
            state.cartContainer = context.container || findCartContainer();
        }

        const parsed = collectCartData(state.cartContainer || document.body);
        if (!parsed) {
            hideModal();
            return;
        }

        state.paymentHint = detectBnplHint(
            context.paymentSection || document.body
        );

        if (parsed.currencySymbol) {
            state.latestCurrencySymbol = parsed.currencySymbol;
        }

        // Prefer detected subtotal/grand-total text over item-sum when available
        const explicitSubtotal = findExplicitTotal(
            state.cartContainer || document.body
        );
        // Ensure subtotal node observer is attached to the freshly detected node
        bindTotalNodeObserver();
        let cartTotal = explicitSubtotal?.amount ?? parsed.total;
        if ((parsed.items?.length || 0) === 0 && !explicitSubtotal) {
            cartTotal = 0;
        }
        if (state.paymentHint?.type === "bnpl") {
            // keep original total for BNPL warnings
        }

        const remaining = state.currentBalance - cartTotal;

        const totalChanged =
            state.lastCartTotal === null ||
            cartTotal !== state.lastCartTotal ||
            Math.abs(cartTotal - state.lastCartTotal) > MODAL_RESHOW_THRESHOLD;

        // ALWAYS update modal content when total changes or modal is visible
        if (totalChanged || state.modalVisible || forceUpdate) {
            // Get fresh cart total right before updating modal
            const currentExplicitSubtotal = findExplicitTotal(
                state.cartContainer || document.body
            );
            const currentCartTotal =
                currentExplicitSubtotal?.amount ?? cartTotal;
            const currentRemaining = state.currentBalance - currentCartTotal;

            console.log(
                "Content: Using current cart total for modal:",
                currentCartTotal
            );

            updateModal({
                balance: state.currentBalance,
                total: currentCartTotal,
                remaining: currentRemaining,
                items: parsed.items,
                paymentHint: state.paymentHint,
            });
        }

        state.lastCartSummary = parsed;
        state.lastCartTotal = cartTotal;

        const shouldShow =
            forceUpdate ||
            totalChanged ||
            (!state.cartDismissed && !state.modalVisible);

        // Don't show modal if cart total is $0
        if (shouldShow && cartTotal > 0) {
            showModal();
        }
        // Get current total for popup summary too
        const summaryExplicitSubtotal = findExplicitTotal(
            state.cartContainer || document.body
        );
        const summaryCartTotal = summaryExplicitSubtotal?.amount ?? cartTotal;

        pushPopupSummary({
            status: "active",
            total: summaryCartTotal,
            currencySymbol: state.latestCurrencySymbol,
            paymentHint: state.paymentHint?.type || null,
            balance: state.currentBalance,
            updatedAt: Date.now(),
        });
    }

    function detectCheckoutContext() {
        console.log('[CheckoutGuard] Detecting checkout context for:', window.location.href);
        let score = 0;
        let containerChanged = false;
        let container = state.cartContainer;
        let paymentSection = null;

        try {
            const url = new URL(window.location.href);
            const path = url.pathname.toLowerCase();
            const hostname = url.hostname.toLowerCase();
            console.log('[CheckoutGuard] Checking URL path:', path, 'hostname:', hostname);

            // Check both path and hostname for checkout keywords
            if (CHECKOUT_KEYWORDS.some((keyword) => path.includes(keyword) || hostname.includes(keyword))) {
                score += 2;
                console.log('[CheckoutGuard] URL path or hostname matches checkout keywords, score +2');
            }
        } catch (error) {
            logDebug("URL parse failed", error);
        }

        const lowerTitle = document.title.toLowerCase();
        if (CHECKOUT_KEYWORDS.some((keyword) => lowerTitle.includes(keyword)))
            score += 1;

        const heading = document.querySelector("h1, h2");
        const headingText = heading?.textContent?.toLowerCase() || "";
        if (CHECKOUT_KEYWORDS.some((keyword) => headingText.includes(keyword)))
            score += 1;

        container = container || findCartContainer();
        if (container) {
            const priceNodes = getVisiblePriceNodes(container);
            if (priceNodes.length >= 3) score += 2;

            const quantityNodes = Array.from(
                container.querySelectorAll(QUANTITY_SELECTORS.join(","))
            ).filter(isVisible);
            if (quantityNodes.length >= 1) score += 1;

            const totalNodes = findTotalNodes(container);
            if (totalNodes.length >= 1) score += 2;

            const checkoutButton = container.querySelector(
                CHECKOUT_BUTTON_SELECTORS.join(",")
            );
            if (checkoutButton && isVisible(checkoutButton)) score += 2;

            const host = window.location.hostname;
            if (/amazon\./i.test(host)) score += 2;
            if (/ebay\./i.test(host)) {
                score += 2;
                console.log('[CheckoutGuard] eBay domain detected, score +2');
            }
            if (/walmart\./i.test(host)) {
                score += 2;
                console.log('[CheckoutGuard] Walmart domain detected, score +2');
            }
            if (/shopify/i.test(document.documentElement.outerHTML)) score += 1;
            if (/woocommerce/i.test(document.documentElement.outerHTML))
                score += 1;
        }

        paymentSection = findPaymentSection(document.body);
        if (paymentSection) score += 1;

        // Site-specific checkout thresholds
        const host = window.location.hostname;
        let threshold = 4;
        if (/walmart\./i.test(host)) {
            threshold = 3;
            console.log('[CheckoutGuard] Using Walmart-specific threshold: 3');
        }

        const isCheckout = score >= threshold;
        console.log('[CheckoutGuard] Final checkout detection - Score:', score, 'IsCheckout:', isCheckout);

        if (container && container !== state.cartContainer) {
            containerChanged = true;
        }

        return {
            isCheckout,
            score,
            containerChanged,
            container,
            paymentSection,
        };
    }

    function findCartContainer() {
        const explicitSelectors = [
            "#sc-active-cart",
            "#cart-root",
            "form[action*='cart']",
            ".cart-items",
            "[data-test='cart-root']",
            "[data-testid='cart-root']",
            "section[aria-label*='cart']",
        ];

        for (const selector of explicitSelectors) {
            const el = document.querySelector(selector);
            if (el && isValidCartContainer(el)) return el;
        }

        const priceNodes = getVisiblePriceNodes(document.body);
        const scoreMap = new Map();

        priceNodes.forEach((node) => {
            let current = node.parentElement;
            let depth = 0;
            while (current && depth < 6) {
                if (!isValidCartContainer(current)) {
                    current = current.parentElement;
                    depth += 1;
                    continue;
                }

                const entry = scoreMap.get(current) || {
                    node: current,
                    score: 0,
                };
                entry.score += depth === 0 ? 4 : 1 / (depth + 1);
                if (current.querySelector(CHECKOUT_BUTTON_SELECTORS.join(",")))
                    entry.score += 2;
                scoreMap.set(current, entry);

                current = current.parentElement;
                depth += 1;
            }
        });

        const best = [...scoreMap.values()]
            .filter(({ node }) => isValidCartContainer(node))
            .sort((a, b) => b.score - a.score)[0];
        return best?.node || null;
    }

    function isValidCartContainer(node) {
        if (!node || !isVisible(node)) return false;
        if (node.closest(EXCLUDE_SECTION_SELECTORS.join(","))) return false;
        const text = node.textContent?.toLowerCase() || "";
        if (EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword)))
            return false;
        return true;
    }

    function collectCartData(scope) {
        if (!scope) return null;
        const items = [];
        const seen = new Set();
        let currencySymbol = state.latestCurrencySymbol;

        const candidateSelectors = new Set([
            ...CART_ITEM_SELECTORS,
            ...PRICE_SELECTORS,
        ]);

        candidateSelectors.forEach((selector) => {
            scope.querySelectorAll(selector).forEach((node) => {
                const itemNode = findAncestorItem(node);
                if (!itemNode) return;
                if (!isValidCartContainer(itemNode)) return;

                if (seen.has(itemNode)) return;

                const priceInfo = findPriceForItem(itemNode);
                if (!priceInfo) return;

                const quantity = extractQuantity(itemNode) || 1;
                const title = extractTitle(itemNode) || "Item";

                seen.add(itemNode);
                currencySymbol = priceInfo.symbol || currencySymbol;
                items.push({
                    title,
                    unitPrice: priceInfo.amount,
                    quantity,
                    amount: priceInfo.amount * quantity,
                });
            });
        });

        const explicitTotal = findExplicitTotal(scope);
        const itemsSum = items.reduce((sum, item) => sum + item.amount, 0);
        const total =
            explicitTotal?.amount ?? (items.length > 0 ? itemsSum : 0);

        if (!Number.isFinite(total)) return null;
        return {
            items,
            total,
            currencySymbol: explicitTotal?.symbol || currencySymbol,
        };
    }

    function findExplicitTotal(scope) {
        // For all e-commerce sites, first try to find subtotal by scanning for "Subtotal" text
        const subtotalResult = findSubtotalByText(scope);
        if (subtotalResult) {
            state.totalNode = subtotalResult.element;
            state.totalNodeText = state.totalNode?.textContent || "";
            return subtotalResult.price;
        }

        const totals = findTotalNodes(scope).map((el) => ({
            element: el,
            price: parsePrice(el.textContent),
        }));
        const valid = totals.filter(({ price }) => price);
        if (!valid.length) return null;

        // Prefer subtotal/grand/order nodes, but also cache the chosen node for precise observing
        const rank = (text) =>
            /sub\s*total/i.test(text)
                ? 0
                : /order\s*total/i.test(text)
                ? 1
                : /grand\s*total/i.test(text)
                ? 2
                : 3;

        valid.sort(
            (a, b) =>
                rank(a.element.textContent || "") -
                rank(b.element.textContent || "")
        );

        // Cache the best node so we can attach a dedicated observer
        state.totalNode = valid[0].element;
        state.totalNodeText = state.totalNode?.textContent || "";
        return valid[0].price;
    }

    function findSubtotalByText(scope) {
        logDebug('Starting findSubtotalByText search...');
        logDebug('Current hostname:', window.location.hostname);

        // Keywords to look for across all e-commerce sites
        const subtotalKeywords = [
            'subtotal',
            'sub total',
            'sub-total',
            'cart total',
            'order total',
            'total',
            'amount due',
            'you pay'
        ];

        logDebug('Searching for keywords:', subtotalKeywords);

        // Scan entire document for elements containing subtotal keywords
        const allElements = Array.from(document.querySelectorAll('*'));
        logDebug(`Scanning ${allElements.length} elements...`);

        for (const keyword of subtotalKeywords) {
            for (const element of allElements) {
                const text = element.textContent || '';

                // Look for elements that contain the keyword but aren't too long
                if (new RegExp(keyword, 'i').test(text) && text.length < 150 && isVisible(element)) {
                    logDebug(`Found element with keyword "${keyword}":`, { text: text.substring(0, 100), element });

                    // Skip if element contains excluded keywords
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('shipping') || lowerText.includes('tax') || lowerText.includes('fee')) {
                        logDebug(`Skipping element due to exclusion keywords: ${text.substring(0, 50)}`);
                        continue;
                    }

                    // Check if this element itself contains a price
                    const priceInElement = parsePrice(text);
                    if (priceInElement && priceInElement.amount > 0) {
                        logDebug(`Found price in element with keyword "${keyword}":`, { price: priceInElement, text });
                        return { element, price: priceInElement };
                    }

                    // Look in parent container for price
                    const parent = element.parentElement;
                    if (parent) {
                        const parentPrice = parsePrice(parent.textContent);
                        if (parentPrice && parentPrice.amount > 0) {
                            return { element: parent, price: parentPrice };
                        }

                        // Look for price elements within parent (generic selectors for all sites)
                        const priceSelectors = [
                            '.price', '.a-price', '.a-price-whole', '.a-color-price',
                            '[class*="price"]', '[class*="amount"]', '[class*="total"]',
                            '.cost', '.value', '.sum', '.currency',
                            '[data-price]', '[data-amount]', '[data-total]'
                        ];

                        const priceElements = parent.querySelectorAll(priceSelectors.join(','));
                        for (const priceEl of priceElements) {
                            if (isVisible(priceEl)) {
                                const price = parsePrice(priceEl.textContent);
                                if (price && price.amount > 0) {
                                    return { element: priceEl, price };
                                }
                            }
                        }
                    }

                    // Look for adjacent elements with prices
                    let next = element.nextElementSibling;
                    let attempts = 0;
                    while (next && next !== element.parentElement && attempts < 3) {
                        const nextPrice = parsePrice(next.textContent);
                        if (nextPrice && nextPrice.amount > 0 && isVisible(next)) {
                            return { element: next, price: nextPrice };
                        }
                        next = next.nextElementSibling;
                        attempts++;
                    }

                    // Look for previous sibling elements with prices
                    let prev = element.previousElementSibling;
                    attempts = 0;
                    while (prev && prev !== element.parentElement && attempts < 3) {
                        const prevPrice = parsePrice(prev.textContent);
                        if (prevPrice && prevPrice.amount > 0 && isVisible(prev)) {
                            return { element: prev, price: prevPrice };
                        }
                        prev = prev.previousElementSibling;
                        attempts++;
                    }
                }
            }
        }

        logDebug('No subtotal found by text search');
        return null;
    }

    function findTotalNodes(scope) {
        const totals = [];
        TOTAL_SELECTORS.forEach((selector) => {
            scope.querySelectorAll(selector).forEach((node) => {
                if (!isVisible(node)) return;
                if (node.closest(EXCLUDE_SECTION_SELECTORS.join(","))) return;
                totals.push(node);
            });
        });
        return totals;
    }

    function findAncestorItem(node) {
        let current = node;
        let depth = 0;
        while (current && depth < 6) {
            if (
                CART_ITEM_SELECTORS.some((selector) =>
                    current.matches(selector)
                )
            ) {
                return current;
            }
            current = current.parentElement;
            depth += 1;
        }
        return node.closest("li, article, section, div");
    }

    function findPriceForItem(node) {
        const candidates = new Set();
        if (node.matches(PRICE_SELECTORS.join(","))) candidates.add(node);
        node.querySelectorAll(PRICE_SELECTORS.join(",")).forEach((el) =>
            candidates.add(el)
        );

        const prices = [...candidates]
            .filter(
                (candidate) =>
                    isVisible(candidate) &&
                    !candidate.closest(EXCLUDE_SECTION_SELECTORS.join(",")) &&
                    !containsExcludedText(candidate) &&
                    !isStruckThrough(candidate)
            )
            .map((candidate) => parsePrice(candidate.textContent))
            .filter(Boolean);

        if (!prices.length) {
            const parsed = parsePrice(node.textContent);
            if (parsed) return parsed;
            return null;
        }

        return prices.sort((a, b) => a.amount - b.amount)[0];
    }

    function detectBnplHint(scope) {
        if (!scope) return null;
        const section = findPaymentSection(scope);
        if (!section) return null;

        const text = section.textContent || "";
        const normalized = text.replace(/\s+/g, " ").toLowerCase();

        const bnplMatch = BNPL_KEYWORDS.find((keyword) =>
            normalized.includes(keyword)
        );
        if (bnplMatch) {
            return {
                type: "bnpl",
                keyword: bnplMatch,
                details: extractSnippet(section, bnplMatch),
            };
        }

        return null;
    }

    function findPaymentSection(scope) {
        const selectors = [
            "#payment-section",
            "#payment-options",
            "#payment-methods",
            "#checkout-payment",
            "form[name*='payment']",
            "form[action*='payment']",
            "section[data-test*='payment']",
            "section[aria-label*='payment']",
            ".payment-options",
            ".payment-section",
            ".payment-method",
            "#pmts",
            "#spc-payment",
            "#payment-information",
        ];

        const isCandidate = (node) => {
            if (!node) return false;
            const text = node.textContent?.toLowerCase() || "";
            if (text.includes("cart") || text.includes("subtotal"))
                return false;
            return isVisible(node);
        };

        for (const selector of selectors) {
            const match = scope.querySelector(selector);
            if (isCandidate(match)) return match;
        }

        const heading = Array.from(
            scope.querySelectorAll("h1, h2, h3, h4, [role='heading']")
        ).find((h) => {
            const text = h.textContent?.toLowerCase() || "";
            return (
                text.includes("payment") ||
                text.includes("billing") ||
                text.includes("installment") ||
                text.includes("financing")
            );
        });

        if (heading) {
            const container = heading.closest("section, div, form");
            if (isCandidate(container)) return container;
        }

        return null;
    }

    function extractSnippet(node, keyword) {
        const text = node.textContent || "";
        const lower = text.toLowerCase();
        const index = lower.indexOf(keyword.toLowerCase());
        if (index === -1) return text.slice(0, 160).replace(/\s+/g, " ").trim();
        const start = Math.max(0, index - 120);
        const end = Math.min(text.length, index + 240);
        return text.slice(start, end).replace(/\s+/g, " ").trim();
    }

    async function calculateSavingsGoalProgress(caption, paymentHint, highest) {
        try {
            // Wait 0.25s for DOM to fully update after cart changes
            await new Promise((resolve) => setTimeout(resolve, 250));

            // Get current cart total dynamically from the webpage
            console.log("Content: Attempting to find cart total...");
            console.log("Content: state.cartContainer:", state.cartContainer);

            const explicitSubtotal = findExplicitTotal(
                state.cartContainer || document.body
            );
            console.log("Content: explicitSubtotal result:", explicitSubtotal);

            let cartTotal = explicitSubtotal?.amount || 0;
            console.log("Content: Current cart total after delay:", cartTotal);

            // If cart total is 0, try to get it from the latest parsed data
            if (cartTotal === 0 && state.lastCartTotal !== null) {
                console.log(
                    "Content: Using cached cart total:",
                    state.lastCartTotal
                );
                cartTotal = state.lastCartTotal;
                console.log("Content: Using fallback cart total:", cartTotal);
            }

            // Get user data from storage
            const userData = await chrome.storage.local.get(
                "cartwatch_user_data"
            );
            const user = userData.cartwatch_user_data;

            if (!user || !user.uid) {
                // Fallback to original tip
                caption.textContent = paymentHint
                    ? paymentHint.details ||
                      "Review the payment terms carefully."
                    : highest
                    ? `Tip: remove ${highest} to stay on budget.`
                    : "Review your cart before purchasing.";
                return;
            }

            // Get user's savings goal from their account data
            const savingsGoal = user.savings_goal || 0;

            // Fetch financial profile to get FCF for savings goal calculation
            console.log("Content: Fetching financial profile with customerId:", user.customerId);
            const financialProfile = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: "getFinancialProfile", customerId: user.customerId },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response && response.error) {
                            reject(new Error(response.error));
                        } else if (!response) {
                            reject(
                                new Error("No response from background script")
                            );
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            console.log("Content: Received financial profile response:", financialProfile);
            console.log("Content: Financial profile profile data:", financialProfile?.profile);
            console.log("Content: Final adjusted FCF from profile:", financialProfile?.profile?.final_adjusted_fcf);
            console.log("Content: All profile fields:", financialProfile?.profile ? Object.keys(financialProfile.profile) : "No profile");

            // Extract FCF from the profile data (which comes from the 'data' object in Firestore)
            const finalAdjustedFcf = financialProfile?.profile?.final_adjusted_fcf || 0;

            if (savingsGoal <= 0 || finalAdjustedFcf <= 0) {
                // Fallback to original tip
                caption.textContent = paymentHint
                    ? paymentHint.details ||
                      "Review the payment terms carefully."
                    : highest
                    ? `Tip: remove ${highest} to stay on budget.`
                    : "Review your cart before purchasing.";
                return;
            }

            // Calculate if this purchase will help or hurt savings goal
            const projectedMonthlySavings = finalAdjustedFcf - cartTotal;
            const monthsToGoal = savingsGoal / projectedMonthlySavings;

            if (paymentHint) {
                caption.textContent =
                    paymentHint.details ||
                    "Review the payment terms carefully.";
            } else if (projectedMonthlySavings > 0) {
                // Purchase is affordable and helps savings
                if (monthsToGoal <= 12) {
                    caption.textContent = `Great! This purchase keeps you on track to reach your $${savingsGoal} savings goal in ${Math.ceil(
                        monthsToGoal
                    )} months.`;
                } else {
                    caption.textContent = `This purchase is affordable, but you'll need ${Math.ceil(
                        monthsToGoal
                    )} months to reach your $${savingsGoal} savings goal.`;
                }
            } else {
                // Purchase exceeds free cash flow
                const overspend = Math.abs(projectedMonthlySavings);
                caption.textContent = `Warning: This purchase exceeds your monthly net income by $${overspend.toFixed(
                    2
                )}. Consider removing ${
                    highest || "an item"
                } to stay on track.`;
            }
        } catch (error) {
            console.error("Error calculating savings goal progress:", error);
            // Fallback to original tip
            caption.textContent = paymentHint
                ? paymentHint.details || "Review the payment terms carefully."
                : highest
                ? `Tip: remove ${highest} to stay on budget.`
                : "Review your cart before purchasing.";
        }
    }

    function updateModal({ balance, total, remaining, items, paymentHint }) {
        const { shadowRoot } = state;
        if (!shadowRoot) {
            console.log("Content: No shadowRoot found in updateModal");
            return;
        }

        console.log("Content: updateModal called with:", {
            balance,
            total,
            remaining,
            paymentHint,
        });


        const formatter = new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currencyFromSymbol(state.latestCurrencySymbol),
        });

        const balanceNode = shadowRoot.getElementById("cg-balance-value");
        const totalNode = shadowRoot.getElementById("cg-total-value");
        const afterNode = shadowRoot.getElementById("cg-after-value");
        const chip = shadowRoot.getElementById("cg-after-chip");
        const tipNode = shadowRoot.getElementById("cg-tip");
        const bar = shadowRoot.getElementById("cg-progress-fill");
        const caption = shadowRoot.getElementById("cg-caption");

        console.log("Content: DOM elements found:", {
            balanceNode: !!balanceNode,
            totalNode: !!totalNode,
            afterNode: !!afterNode,
            chip: !!chip,
            tipNode: !!tipNode,
            bar: !!bar,
            caption: !!caption,
        });

        if (
            !balanceNode ||
            !totalNode ||
            !chip ||
            !tipNode ||
            !bar ||
            !caption
        ) {
            console.log(
                "Content: Missing required DOM elements, aborting modal update"
            );
            return;
        }

        balanceNode.textContent = formatter.format(balance);
        console.log("Content: Set balance to:", formatter.format(balance));

        if (paymentHint) {
            console.log("Content: Using paymentHint display mode");
            totalNode.textContent =
                paymentHint.type === "bnpl"
                    ? "Installment plan detected"
                    : "Additional check";
            chip.textContent =
                paymentHint.type === "bnpl" ? "Installments" : "Check";
            chip.className =
                paymentHint.type === "bnpl"
                    ? "cg-chip cg-negative"
                    : "cg-chip cg-positive";
            tipNode.textContent =
                paymentHint.type === "bnpl"
                    ? "Installments detected. Verify total financed cost and schedule."
                    : "Review details before proceeding.";
            bar.style.transform = "scaleX(1)";
        } else {
            console.log("Content: Using normal display mode");
            const formattedTotal = formatter.format(total);
            console.log(
                "Content: Setting total to:",
                formattedTotal,
                "from raw total:",
                total
            );
            totalNode.textContent = formattedTotal;

            const formattedRemaining = formatter.format(remaining);
            console.log(
                "Content: Setting remaining to:",
                formattedRemaining,
                "from raw remaining:",
                remaining
            );

            // Use the chip element directly since afterNode is nested inside it
            chip.textContent = formattedRemaining;
            chip.className = `cg-chip ${
                remaining < 0 ? "cg-negative" : "cg-positive"
            }`;
            tipNode.textContent =
                remaining < 0
                    ? `This puts you ${formatter.format(
                          Math.abs(remaining)
                      )} below zero.`
                    : `You'll have ${formatter.format(remaining)} left.`;
            const percent =
                state.currentBalance <= 0
                    ? 1
                    : Math.min(1, Math.max(0, total / state.currentBalance));
            bar.style.transform = `scaleX(${percent})`;
        }

        // Filter out items with CSS-like titles or very long titles
        const validItems = items.filter((item) => {
            const title = item.title || "";
            // Filter out CSS-like content, very long titles, or titles with special characters
            return (
                title.length < 100 &&
                !title.includes("{") &&
                !title.includes("}") &&
                !title.includes("display:") &&
                !title.includes("flex") &&
                !title.includes("float:") &&
                title.trim().length > 0
            );
        });

        const highest = validItems
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .map((item) => item.title)[0];

        // Calculate savings goal progress with current cart total
        calculateSavingsGoalProgress(caption, paymentHint, highest);
    }

    function showModal() {
        const overlay = state.shadowRoot?.querySelector(".cg-overlay");
        if (!overlay) return;
        overlay.classList.remove("cg-hidden");
        state.modalVisible = true;
        state.cartDismissed = false;

        const card = overlay.querySelector(".cg-card");
        const focusable = card?.querySelector("button.cg-primary");
        state.focusRestore = document.activeElement;
        if (focusable) focusable.focus();
    }

    function hideModal() {
        const overlay = state.shadowRoot?.querySelector(".cg-overlay");
        if (!overlay) return;
        overlay.classList.add("cg-hidden");
        state.modalVisible = false;
        state.cartDismissed = true;
        if (
            state.focusRestore &&
            typeof state.focusRestore.focus === "function"
        ) {
            try {
                state.focusRestore.focus();
            } catch (error) {
                logDebug("Focus restore failed", error);
            }
        }
    }

    function showToast(message, tone = "info", duration = 5000) {
        document.getElementById(TOAST_ID)?.remove();

        const toast = document.createElement("div");
        toast.id = TOAST_ID;
        toast.role = "alert";
        toast.textContent = message;
        Object.assign(toast.style, {
            position: "fixed",
            top: "16px",
            right: "16px",
            zIndex: "2147483647",
            maxWidth: "360px",
            padding: "12px 16px",
            borderRadius: "10px",
            fontFamily: "Inter, 'Segoe UI', sans-serif",
            fontSize: "14px",
            lineHeight: "1.4",
            boxShadow: "0 12px 30px rgba(20,33,61,0.25)",
            cursor: "pointer",
            whiteSpace: "pre-line",
        });

        const palette = {
            error: { background: "#fef2f2", color: "#991b1b" },
            warning: { background: "#fffbeb", color: "#92400e" },
            success: { background: "#ecfdf5", color: "#065f46" },
            info: { background: "#e0f2fe", color: "#0c4a6e" },
        };
        const style = palette[tone] || palette.info;
        toast.style.background = style.background;
        toast.style.color = style.color;

        toast.addEventListener("click", () => toast.remove());
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function findIntentTrigger(node) {
        let current = node;
        let depth = 0;
        while (current && depth < 6) {
            if (
                current.matches?.(
                    "button, a, [role='button'], input[type='submit']"
                )
            ) {
                const text = extractIntentText(current);
                if (isIntentKeyword(text)) {
                    return current;
                }
            }
            current = current.parentElement;
            depth += 1;
        }
        return null;
    }

    function extractIntentText(el) {
        const candidates = [
            el.innerText,
            el.textContent,
            el.getAttribute?.("aria-label"),
            el.getAttribute?.("value"),
            el.getAttribute?.("data-action"),
            el.getAttribute?.("data-test"),
            el.getAttribute?.("data-testid"),
        ];
        const found = candidates.find(
            (value) => value && value.trim().length > 2
        );
        return found ? found.replace(/\s+/g, " ").trim() : "";
    }

    function buildIntentPayload(trigger) {
        const text = extractIntentText(trigger);
        if (!text) return null;
        const context = gatherContext(trigger);
        return {
            text,
            context,
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
        };
    }

    function gatherContext(trigger) {
        const snippets = new Set();
        let current = trigger;
        let depth = 0;
        while (current && depth < 5) {
            const content = current.textContent;
            if (content) {
                const sanitized = content.replace(/\s+/g, " ").trim();
                if (sanitized && sanitized.length < 400)
                    snippets.add(sanitized);
            }
            current = current.parentElement;
            depth += 1;
        }
        return [...snippets];
    }

    function handleIntentResult(result) {
        const { purchaseType, confidence, reason } = result;
        const type = purchaseType || "other";
        const confidencePercent = Math.round((confidence || 0) * 100);

        if (type === "subscription" || type === "bnpl") {
            showToast(
                `${
                    type === "subscription" ? "Subscription" : "Pay later"
                } detected (${confidencePercent}% confidence). ${
                    reason || "Review the payment terms before proceeding."
                }`,
                type === "subscription" ? "warning" : "info"
            );

            analyzeContext({ forceUpdate: true });
        }
    }

    function getVisiblePriceNodes(scope) {
        return Array.from(
            scope.querySelectorAll(PRICE_SELECTORS.join(","))
        ).filter(
            (node) =>
                isVisible(node) &&
                !containsExcludedText(node) &&
                !isStruckThrough(node)
        );
    }

    function containsExcludedText(node) {
        const text = node.textContent?.toLowerCase() || "";
        return EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword));
    }

    function parsePrice(text) {
        if (!text) return null;
        let match;
        let result = null;
        CURRENCY_REGEX.lastIndex = 0;
        while ((match = CURRENCY_REGEX.exec(text))) {
            const symbol = match[1];
            const raw = match[2]
                .replace(/\s/g, "")
                .replace(/,(?=\d{3}(?!\d))/g, "")
                .replace(/\.(?=\d{3}(?!\d))/g, "")
                .replace(/,(\d{2})$/, ".$1")
                .replace(/\.(\d{2})$/, ".$1");
            const amount = parseFloat(raw);
            if (!Number.isNaN(amount)) {
                result = { symbol, amount };
                break;
            }
        }
        return result;
    }

    function extractTitle(node) {
        const candidate = node.querySelector(
            "h1, h2, h3, h4, .title, .product-title, .a-truncate-cut, .cart-item-name, [data-test='cart-item-title'], a[href]"
        );
        if (candidate?.textContent) {
            return candidate.textContent
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160);
        }
        return (
            node.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) || ""
        );
    }

    function extractQuantity(node) {
        for (const selector of QUANTITY_SELECTORS) {
            const el = node.querySelector(selector);
            if (!el || !isVisible(el)) continue;
            const value = readQuantity(el);
            if (Number.isFinite(value) && value >= 1) return value;
        }
        return 1;
    }

    function readQuantity(el) {
        if (el.tagName === "SELECT" || el.tagName === "INPUT") {
            const parsed = parseInt(el.value, 10);
            if (!Number.isNaN(parsed) && parsed >= 1) return parsed;
        }
        const valueAttr = el.getAttribute("value");
        if (valueAttr) {
            const parsed = parseInt(valueAttr, 10);
            if (!Number.isNaN(parsed) && parsed >= 1) return parsed;
        }
        const text = el.textContent;
        if (text) {
            const match = text.match(/\d+/);
            if (match) {
                const parsed = parseInt(match[0], 10);
                if (!Number.isNaN(parsed) && parsed >= 1) return parsed;
            }
        }
        return 1;
    }

    function isVisible(node) {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isStruckThrough(node) {
        const style = window.getComputedStyle(node);
        return style.textDecoration.includes("line-through");
    }

    function currencyFromSymbol(symbol) {
        switch (symbol) {
            case "€":
                return "EUR";
            case "£":
                return "GBP";
            default:
                return "USD";
        }
    }

    function debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }

    function logDebug(message, data) {
        if (!DEBUG) return;
        console.log(`[CheckoutGuard] ${message}`, data);
    }

    function styles() {
        return `
      <style>
        :host {
          all: initial;
        }
        .cg-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(20,33,61,0.55);
          pointer-events: auto;
          z-index: 2147483647;
        }
        .cg-overlay.cg-hidden {
          display: none;
        }
        .cg-card {
          width: min(85vw, 400px);
          background: ${PALETTE.WHITE};
          border-radius: 18px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.25);
          overflow: hidden;
          font-family: "Inter", "Segoe UI", sans-serif;
          color: ${PALETTE.NAVY};
          display: grid;
          gap: 18px;
          padding: 24px 20px 28px;
        }
        .cg-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
          font-size: 18px;
        }
        .cg-close {
          background: none;
          border: none;
          color: ${PALETTE.NAVY};
          font-size: 28px;
          cursor: pointer;
        }
        .cg-body {
          display: grid;
          gap: 16px;
        }
        .cg-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 15px;
        }
        .cg-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
        }
        .cg-chip.cg-positive {
          background: ${PALETTE.GRAY};
          color: ${PALETTE.NAVY};
        }
        .cg-chip.cg-negative {
          background: ${PALETTE.BLACK};
          color: ${PALETTE.ACCENT};
        }
        .cg-progress {
          height: 6px;
          background: rgba(20,33,61,0.15);
          border-radius: 999px;
          overflow: hidden;
        }
        .cg-progress-fill {
          height: 100%;
          background: ${PALETTE.ACCENT};
          transform-origin: left;
          transform: scaleX(0);
          transition: transform 0.2s ease;
        }
        .cg-tip {
          margin-top: 6px;
          font-size: 14px;
          color: rgba(20,33,61,0.78);
        }
        .cg-caption {
          font-size: 13px;
          color: rgba(20,33,61,0.6);
        }
        .cg-footer {
          display: flex;
          justify-content: center;
          gap: 14px;
        }
        .cg-primary {
          background: ${PALETTE.ACCENT};
          color: ${PALETTE.BLACK};
          border: none;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
      </style>
    `;
    }

    function modalMarkup() {
        return `
      <div class="cg-overlay cg-hidden" role="dialog" aria-modal="true">
        <div class="cg-card">
          <div class="cg-header">
            <span>Checkout Guard</span>
            <button class="cg-close" aria-label="Close">×</button>
          </div>
          <div class="cg-body">
            <div class="cg-row">
              <span>Current balance</span>
              <strong id="cg-balance-value">$0.00</strong>
            </div>
            <div class="cg-row">
              <span>Cart total</span>
              <strong id="cg-total-value">$0.00</strong>
            </div>
            <div class="cg-row">
              <span>After purchase</span>
              <span class="cg-chip cg-positive" id="cg-after-chip">
                <strong id="cg-after-value">$0.00</strong>
              </span>
            </div>
            <div>
              <div class="cg-progress">
                <div class="cg-progress-fill" id="cg-progress-fill"></div>
              </div>
              <p class="cg-tip" id="cg-tip">You'll have $0.00 left.</p>
            </div>
            <p class="cg-caption" id="cg-caption">Review your cart before purchasing.</p>
          </div>
          <div class="cg-footer">
            <button class="cg-primary" type="button">Got it</button>
          </div>
        </div>
      </div>
    `;
    }
})();
