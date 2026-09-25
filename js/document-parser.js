/**
 * LegalLens — Document Parser
 * Client-side parsing for PDF, DOCX, and TXT files.
 * Uses PDF.js and Mammoth.js loaded from CDN.
 */
(function () {
  "use strict";

  var Utils = null;

  function getUtils() {
    if (!Utils) Utils = window.LegalLens.Utils;
    return Utils;
  }

  var DocumentParser = {
    /**
     * Parse an uploaded file and extract its text content.
     * @param {File} file - The uploaded file
     * @returns {Promise<{id: string, name: string, text: string, metadata: object, fileType: string}>}
     */
    parseFile: function (file) {
      var u = getUtils();
      var validation = u.validateFile(file);
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error));
      }

      var ext = (file.name.split(".").pop() || "").toLowerCase();
      var parseFunc;

      switch (ext) {
        case "pdf":
          parseFunc = DocumentParser.parsePDF;
          break;
        case "docx":
          parseFunc = DocumentParser.parseDOCX;
          break;
        case "txt":
          parseFunc = DocumentParser.parseTXT;
          break;
        default:
          return Promise.reject(new Error("Unsupported file type: " + ext));
      }

      return parseFunc(file).then(function (text) {
        // Clean and normalize the extracted text
        var cleanText = DocumentParser._cleanText(text);

        if (!cleanText || cleanText.trim().length < 10) {
          throw new Error("Could not extract meaningful text from the file. The document may be scanned or image-based.");
        }

        var metadata = DocumentParser._extractMetadata(cleanText, file);

        return {
          id: u.generateId(),
          name: file.name,
          text: cleanText,
          metadata: metadata,
          fileType: ext,
          uploadedAt: new Date().toISOString(),
        };
      });
    },

    /**
     * Parse a PDF file using PDF.js.
     * @param {File} file
     * @returns {Promise<string>}
     */
    parsePDF: function (file) {
      return new Promise(function (resolve, reject) {
        if (typeof pdfjsLib === "undefined") {
          reject(new Error("PDF.js library not loaded. Cannot parse PDF files."));
          return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
          var typedArray = new Uint8Array(e.target.result);

          // Set worker source
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

          pdfjsLib
            .getDocument({ data: typedArray })
            .promise.then(function (pdf) {
              var totalPages = pdf.numPages;
              var textPromises = [];

              for (var i = 1; i <= totalPages; i++) {
                textPromises.push(DocumentParser._extractPDFPage(pdf, i));
              }

              return Promise.all(textPromises);
            })
            .then(function (pages) {
              resolve(pages.join("\n\n"));
            })
            .catch(function (err) {
              reject(new Error("Failed to parse PDF: " + err.message));
            });
        };

        reader.onerror = function () {
          reject(new Error("Failed to read file."));
        };

        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Extract text from a single PDF page.
     * @param {object} pdf - PDF.js document
     * @param {number} pageNum - Page number (1-indexed)
     * @returns {Promise<string>}
     * @private
     */
    _extractPDFPage: function (pdf, pageNum) {
      return pdf.getPage(pageNum).then(function (page) {
        return page.getTextContent().then(function (textContent) {
          return textContent.items
            .map(function (item) {
              return item.str;
            })
            .join(" ");
        });
      });
    },

    /**
     * Parse a DOCX file using Mammoth.js.
     * @param {File} file
     * @returns {Promise<string>}
     */
    parseDOCX: function (file) {
      return new Promise(function (resolve, reject) {
        if (typeof mammoth === "undefined") {
          reject(new Error("Mammoth.js library not loaded. Cannot parse DOCX files."));
          return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
          mammoth
            .extractRawText({ arrayBuffer: e.target.result })
            .then(function (result) {
              if (result.messages && result.messages.length > 0) {
                console.warn("LegalLens: DOCX parsing warnings:", result.messages);
              }
              resolve(result.value);
            })
            .catch(function (err) {
              reject(new Error("Failed to parse DOCX: " + err.message));
            });
        };

        reader.onerror = function () {
          reject(new Error("Failed to read file."));
        };

        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Parse a plain text file.
     * @param {File} file
     * @returns {Promise<string>}
     */
    parseTXT: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
          resolve(e.target.result);
        };
        reader.onerror = function () {
          reject(new Error("Failed to read text file."));
        };
        reader.readAsText(file, "UTF-8");
      });
    },

    /**
     * Clean and normalize extracted text.
     * @param {string} text
     * @returns {string}
     * @private
     */
    _cleanText: function (text) {
      if (!text) return "";
      return text
        .replace(/\r\n/g, "\n") // Normalize line endings
        .replace(/\r/g, "\n")
        .replace(/\t/g, " ") // Tabs to spaces
        .replace(/ +/g, " ") // Multiple spaces to single
        .replace(/\n{3,}/g, "\n\n") // Multiple blank lines to double
        .trim();
    },

    /**
     * Extract metadata from parsed text and file.
     * @param {string} text
     * @param {File} file
     * @returns {object}
     * @private
     */
    _extractMetadata: function (text, file) {
      var u = getUtils();
      return {
        fileName: file.name,
        fileSize: file.size,
        fileSizeFormatted: u.formatFileSize(file.size),
        wordCount: u.wordCount(text),
        charCount: text.length,
        lineCount: text.split("\n").length,
        sections: u.extractSections(text),
        estimatedPages: Math.max(1, Math.ceil(u.wordCount(text) / 300)),
      };
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.DocumentParser = DocumentParser;
})();
