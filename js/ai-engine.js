/**
 * LegalLens — AI Engine
 * Google Gemini API integration via REST.
 * Handles prompt construction, API calls, response parsing, and error recovery.
 */
(function () {
  "use strict";

  var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  var MAX_RETRIES = 2;
  var RETRY_DELAY = 1500; // ms

  var AIEngine = {
    /**
     * Call the Gemini API with a text prompt.
     * @param {string} apiKey - Gemini API key
     * @param {string} prompt - User prompt
     * @param {string} [systemInstruction] - System instruction for the model
     * @returns {Promise<string>} Raw text response
     */
    generateContent: function (apiKey, prompt, systemInstruction) {
      if (!apiKey) return Promise.reject(new Error("Gemini API key is not configured."));
      if (!prompt) return Promise.reject(new Error("Prompt cannot be empty."));

      var body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      return AIEngine._callWithRetry(apiKey, body, 0);
    },

    /**
     * Call Gemini and parse the response as JSON.
     * @param {string} apiKey
     * @param {string} prompt
     * @param {string} [systemInstruction]
     * @returns {Promise<object>} Parsed JSON object
     */
    generateJSON: function (apiKey, prompt, systemInstruction) {
      // Add JSON instruction to the prompt
      var jsonPrompt = prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation before or after the JSON.";

      return AIEngine.generateContent(apiKey, jsonPrompt, systemInstruction).then(function (text) {
        var parsed = window.LegalLens.Utils.safeParseJSON(text);
        if (!parsed) {
          throw new Error("Failed to parse AI response as JSON. Raw response: " + text.substring(0, 200));
        }
        return parsed;
      });
    },

    /**
     * Internal: Call the API with retry logic.
     * @param {string} apiKey
     * @param {object} body
     * @param {number} attempt
     * @returns {Promise<string>}
     * @private
     */
    _callWithRetry: function (apiKey, body, attempt) {
      var url = GEMINI_API_URL + "?key=" + encodeURIComponent(apiKey);

      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (response) {
          if (response.ok) {
            return response.json();
          }

          // Handle specific error codes
          if (response.status === 429) {
            // Rate limited — retry with backoff
            if (attempt < MAX_RETRIES) {
              var delay = RETRY_DELAY * Math.pow(2, attempt);
              return new Promise(function (resolve) {
                setTimeout(resolve, delay);
              }).then(function () {
                return AIEngine._callWithRetry(apiKey, body, attempt + 1);
              });
            }
            throw new Error("Rate limited by Gemini API. Please wait a moment and try again.");
          }

          if (response.status === 400) {
            return response.json().then(function (err) {
              throw new Error("Invalid request: " + (err.error?.message || "Unknown error"));
            });
          }

          if (response.status === 403) {
            throw new Error("Invalid API key. Please check your Gemini API key in settings.");
          }

          throw new Error("Gemini API error (HTTP " + response.status + ")");
        })
        .then(function (data) {
          // Handle already-resolved retry case
          if (typeof data === "string") return data;

          // Extract text from Gemini response
          if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            var parts = data.candidates[0].content.parts;
            if (parts && parts.length > 0) {
              return parts
                .map(function (p) {
                  return p.text || "";
                })
                .join("");
            }
          }

          // Check for blocked content
          if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === "SAFETY") {
            throw new Error("The AI could not process this content due to safety filters.");
          }

          throw new Error("Unexpected API response format.");
        })
        .catch(function (err) {
          // Network error retry
          if (err.name === "TypeError" && err.message.includes("fetch") && attempt < MAX_RETRIES) {
            var delay = RETRY_DELAY * Math.pow(2, attempt);
            return new Promise(function (resolve) {
              setTimeout(resolve, delay);
            }).then(function () {
              return AIEngine._callWithRetry(apiKey, body, attempt + 1);
            });
          }
          throw err;
        });
    },

    /**
     * Validate that an API key works by making a minimal test call.
     * @param {string} apiKey
     * @returns {Promise<boolean>}
     */
    validateKey: function (apiKey) {
      return AIEngine.generateContent(apiKey, "Respond with exactly: OK")
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
    },

    /**
     * Chunk long text to fit within token limits.
     * Gemini 2.0 Flash supports ~1M tokens, but we keep prompts reasonable.
     * @param {string} text
     * @param {number} [maxChars=60000] - Max characters per chunk
     * @returns {string} Truncated text with notice if truncated
     */
    prepareText: function (text, maxChars) {
      maxChars = maxChars || 60000;
      if (!text) return "";
      if (text.length <= maxChars) return text;

      var truncated = text.substring(0, maxChars);
      // Try to cut at a paragraph or sentence boundary
      var lastParagraph = truncated.lastIndexOf("\n\n");
      if (lastParagraph > maxChars * 0.8) {
        truncated = truncated.substring(0, lastParagraph);
      } else {
        var lastSentence = truncated.lastIndexOf(". ");
        if (lastSentence > maxChars * 0.8) {
          truncated = truncated.substring(0, lastSentence + 1);
        }
      }

      return truncated + "\n\n[NOTE: Document was truncated due to length. Analysis covers the first " + Math.round((truncated.length / text.length) * 100) + "% of the document.]";
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.AIEngine = AIEngine;
})();
