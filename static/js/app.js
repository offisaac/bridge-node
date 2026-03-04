// BridgeNode Main Application Entry
// This file serves as the main application entry point
// It initializes all modules and sets up event listeners

// Application initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('[BridgeNode] Application initializing...');

    // Remove loading class from body to show the page
    document.body.classList.remove('loading');

    // Initialize theme from localStorage
    initializeTheme();

    // Initialize language
    initializeLanguage();

    // Initialize file manager
    initializeFileManager();

    // Initialize WebSocket connection
    initializeWebSocket();

    // Initialize SSE connection
    initializeSSE();

    // Initialize terminal resize
    initializeTerminalResize();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Initialize clipboard monitor
    initializeClipboardMonitor();

    // Initialize drag and drop
    initializeDragAndDrop();

    // Initialize cluster info
    refreshClusterInfo();

    console.log('[BridgeNode] Application initialized');
});

// Theme initialization
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const btn = document.querySelector('.theme-toggle-btn');
        if (btn) btn.textContent = '\u2600\uFE0F';
    }
}

// Language initialization
function initializeLanguage() {
    // Language is handled in i18n.js
    if (typeof applyTranslations === 'function') {
        setTimeout(applyTranslations, 100);
    }
}

// File Manager initialization
function initializeFileManager() {
    // File manager functions are in the main inline script
    // Initialize default path
    const pathInput = document.getElementById('filePath');
    if (pathInput && !pathInput.value) {
        pathInput.value = '~/.claude';
    }
}

// WebSocket initialization
function initializeWebSocket() {
    // WebSocket connection is handled in the main inline script
}

// SSE initialization
function initializeSSE() {
    // SSE connection is handled in the main inline script
}

// Terminal resize initialization
function initializeTerminalResize() {
    // Terminal resize is handled in the main inline script
}

// Keyboard shortcuts initialization
function initializeKeyboardShortcuts() {
    // Keyboard shortcuts are handled in the main inline script
}

// Clipboard monitor initialization
function initializeClipboardMonitor() {
    // Clipboard monitor is handled in the main inline script
}

// Drag and drop initialization
function initializeDragAndDrop() {
    // Drag and drop is handled in the main inline script
}

// Cluster info refresh
function refreshClusterInfo() {
    // Cluster info is handled in the main inline script
}

// Utility functions exposed globally
window.showToast = function(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${type === 'success' ? '\u2705' : type === 'error' ? '\u274C' : type === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F'}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">\u2715</button>
    `;
    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Make toast available globally
if (typeof window.showToast === 'undefined') {
    window.showToast = function(message, type) {
        console.log(`[Toast ${type}]: ${message}`);
    };
}
