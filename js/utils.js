/**
 * LegalLens — Utility Functions
 * Shared helpers for sanitization, formatting, notifications, and DOM utilities.
 */
(function () {
  "use strict";

  const Utils = {
    /**
     * Generate a unique ID for documents and sessions.
     * @returns {string} UUID-like string
     */
    generateId: function () {
      return "ll-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
    },

    /**
     * Sanitize a string to prevent XSS when inserting into DOM.
     * @param {string} text - Raw text
     * @returns {string} Escaped HTML-safe string
     */
    sanitizeHTML: function (text) {
      if (typeof text !== "string") return "";
      var div = document.createElement("div");
      div.appendChild(document.createTextNode(text));
      return div.innerHTML;
    },

    /**
     * Convert markdown-like text to safe HTML for display.
     * Supports **bold**, *italic*, `code`, \n→<br>, and - list items.
     * @param {string} text - Text with simple markdown
     * @returns {string} HTML string
     */
    markdownToHTML: function (text) {
      if (!text) return "";
      var safe = Utils.sanitizeHTML(text);
      return safe
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
        .replace(/\n/g, "<br>");
    },

    /**
     * Format a file size in bytes to a human-readable string.
     * @param {number} bytes
     * @returns {string}
     */
    formatFileSize: function (bytes) {
      if (bytes === 0) return "0 B";
      var units = ["B", "KB", "MB", "GB"];
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
    },

    /**
     * Truncate text to a maximum length, adding ellipsis.
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncateText: function (text, maxLength) {
      if (!text || text.length <= maxLength) return text || "";
      return text.substring(0, maxLength) + "…";
    },

    /**
     * Format a date to a locale-friendly string.
     * @param {Date|string} date
     * @returns {string}
     */
    formatDate: function (date) {
      var d = date instanceof Date ? date : new Date(date);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },

    /**
     * Debounce a function call.
     * @param {Function} fn
     * @param {number} delay - Milliseconds
     * @returns {Function}
     */
    debounce: function (fn, delay) {
      var timer = null;
      return function () {
        var context = this;
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () {
          fn.apply(context, args);
        }, delay);
      };
    },

    /**
     * Show a toast notification.
     * @param {string} message - Notification text
     * @param {"success"|"error"|"info"|"warning"} type - Notification type
     * @param {number} [duration=4000] - Auto-dismiss duration in ms
     */
    showNotification: function (message, type, duration) {
      type = type || "info";
      duration = duration || 4000;

      var area = document.getElementById("notification-area");
      if (!area) return;

      var notif = document.createElement("div");
      notif.className = "notification notification-" + type + " slide-in";
      notif.setAttribute("role", "alert");

      var icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
      notif.innerHTML =
        '<span class="notification-icon">' + (icons[type] || "ℹ️") + "</span>" +
        '<span class="notification-text">' + Utils.sanitizeHTML(message) + "</span>" +
        '<button class="notification-close" aria-label="Dismiss notification">&times;</button>';

      notif.querySelector(".notification-close").addEventListener("click", function () {
        Utils._dismissNotification(notif);
      });

      area.appendChild(notif);

      setTimeout(function () {
        Utils._dismissNotification(notif);
      }, duration);
    },

    /** @private */
    _dismissNotification: function (notif) {
      if (!notif || !notif.parentNode) return;
      notif.classList.remove("slide-in");
      notif.classList.add("slide-out");
      setTimeout(function () {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
      }, 300);
    },

    /**
     * Show or hide the loading overlay.
     * @param {boolean} show
     * @param {string} [message] - Loading message
     */
    showLoading: function (show, message) {
      var overlay = document.getElementById("loading-overlay");
      var text = document.getElementById("loading-text");
      if (!overlay) return;

      if (show) {
        if (text && message) text.textContent = message;
        overlay.classList.add("visible");
        overlay.setAttribute("aria-hidden", "false");
      } else {
        overlay.classList.remove("visible");
        overlay.setAttribute("aria-hidden", "true");
      }
    },

    /**
     * Count words in a text string.
     * @param {string} text
     * @returns {number}
     */
    wordCount: function (text) {
      if (!text) return 0;
      return text.trim().split(/\s+/).filter(Boolean).length;
    },

    /**
     * Extract simple section headers from legal text.
     * @param {string} text
     * @returns {string[]}
     */
    extractSections: function (text) {
      if (!text) return [];
      var lines = text.split("\n");
      var sections = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        // Common legal section patterns: numbered sections, ALLCAPS headings
        if (/^(ARTICLE|SECTION|CLAUSE|PART)\s+/i.test(line) || /^\d+\.\s+[A-Z]/.test(line) || (line === line.toUpperCase() && line.length > 3 && line.length < 80 && /[A-Z]/.test(line))) {
          sections.push(line);
        }
      }
      return sections;
    },

    /**
     * Safely parse JSON, returning null on failure.
     * @param {string} text
     * @returns {object|null}
     */
    safeParseJSON: function (text) {
      try {
        // Try to extract JSON from markdown code blocks if present
        var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1].trim());
        }
        return JSON.parse(text);
      } catch (e) {
        // Try to find JSON object/array in the text
        var start = text.indexOf("{");
        var end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          try {
            return JSON.parse(text.substring(start, end + 1));
          } catch (e2) {
            return null;
          }
        }
        return null;
      }
    },

    /**
     * Validate that a file meets upload requirements.
     * @param {File} file
     * @returns {{valid: boolean, error: string|null}}
     */
    validateFile: function (file) {
      var MAX_SIZE = 10 * 1024 * 1024; // 10 MB
      var ALLOWED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
      var EXT_MAP = { pdf: true, docx: true, txt: true };

      if (!file) return { valid: false, error: "No file provided." };

      var ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!EXT_MAP[ext]) {
        return { valid: false, error: "Unsupported file type '" + ext + "'. Please upload PDF, DOCX, or TXT." };
      }

      if (file.size > MAX_SIZE) {
        return { valid: false, error: "File too large (" + Utils.formatFileSize(file.size) + "). Maximum size is 10 MB." };
      }

      if (file.size === 0) {
        return { valid: false, error: "File is empty." };
      }

      return { valid: true, error: null };
    },

    /**
     * Create a DOM element with attributes and children.
     * @param {string} tag
     * @param {object} attrs
     * @param {(string|HTMLElement)[]} children
     * @returns {HTMLElement}
     */
    createElement: function (tag, attrs, children) {
      var el = document.createElement(tag);
      if (attrs) {
        for (var key in attrs) {
          if (key === "className") el.className = attrs[key];
          else if (key === "innerHTML") el.innerHTML = attrs[key];
          else if (key === "textContent") el.textContent = attrs[key];
          else if (key.startsWith("on")) el.addEventListener(key.substring(2).toLowerCase(), attrs[key]);
          else el.setAttribute(key, attrs[key]);
        }
      }
      if (children) {
        for (var i = 0; i < children.length; i++) {
          if (typeof children[i] === "string") {
            el.appendChild(document.createTextNode(children[i]));
          } else if (children[i]) {
            el.appendChild(children[i]);
          }
        }
      }
      return el;
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.Utils = Utils;
})();
