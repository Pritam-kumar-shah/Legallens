/**
 * LegalLens — Chat Module
 * Interactive Q&A about uploaded legal documents.
 * Maintains conversation context and provides grounded, document-based answers.
 */
(function () {
  "use strict";

  var AI = null;

  function getAI() {
    if (!AI) AI = window.LegalLens.AIEngine;
    return AI;
  }

  var CHAT_SYSTEM_INSTRUCTION =
    "You are LegalLens, a helpful legal document assistant. " +
    "The user has uploaded a legal document and wants to ask questions about it.\n\n" +
    "Rules:\n" +
    "1. Answer based ONLY on the provided document content.\n" +
    "2. Use plain, simple language that anyone can understand.\n" +
    "3. If the document doesn't contain information to answer the question, say so clearly.\n" +
    "4. Always remind users that this is informational only and not legal advice, especially for sensitive questions.\n" +
    "5. Reference specific parts of the document when relevant.\n" +
    "6. If a question requires professional legal judgment, recommend consulting a lawyer.\n" +
    "7. Be concise but thorough. Use bullet points for clarity when listing multiple items.\n" +
    "8. If you are unsure, say so honestly rather than guessing.";

  /** Suggested questions that users can click to ask. */
  var SUGGESTED_QUESTIONS = [
    "What are my main obligations under this document?",
    "Are there any termination or cancellation clauses?",
    "What happens if one party breaches the agreement?",
    "Are there any hidden fees or payment obligations?",
    "What are the key deadlines I should be aware of?",
    "Is there a non-compete or exclusivity clause?",
    "What jurisdiction governs this document?",
    "Can I modify or negotiate any of these terms?",
  ];

  var Chat = {
    /** @type {Array<{role: string, content: string}>} */
    _history: [],

    /**
     * Get suggested questions for the chat interface.
     * @returns {string[]}
     */
    getSuggestedQuestions: function () {
      return SUGGESTED_QUESTIONS;
    },

    /**
     * Ask a question about a document.
     * @param {string} apiKey - Gemini API key
     * @param {string} documentText - The document text to reference
     * @param {string} question - The user's question
     * @param {Array<{role: string, content: string}>} [history] - Previous Q&A
     * @returns {Promise<string>} The AI response
     */
    askQuestion: function (apiKey, documentText, question, history) {
      var ai = getAI();

      if (!question || !question.trim()) {
        return Promise.reject(new Error("Please enter a question."));
      }

      if (!documentText) {
        return Promise.reject(new Error("No document selected. Please upload and select a document first."));
      }

      var preparedDoc = ai.prepareText(documentText, 50000); // Leave room for chat history
      var chatContext = Chat._formatHistory(history || []);

      var prompt =
        "LEGAL DOCUMENT:\n" +
        "---\n" +
        preparedDoc +
        "\n---\n\n";

      if (chatContext) {
        prompt += "PREVIOUS CONVERSATION:\n" + chatContext + "\n\n";
      }

      prompt += "USER QUESTION: " + question + "\n\n" + "Provide a helpful, clear, and accurate response.";

      return ai.generateContent(apiKey, prompt, CHAT_SYSTEM_INSTRUCTION);
    },

    /**
     * Format conversation history for context.
     * @param {Array<{role: string, content: string}>} history
     * @returns {string}
     * @private
     */
    _formatHistory: function (history) {
      if (!history || history.length === 0) return "";

      // Keep only the last 6 exchanges to stay within token limits
      var recent = history.slice(-12);

      return recent
        .map(function (msg) {
          var label = msg.role === "user" ? "User" : "Assistant";
          var content = msg.content;
          // Truncate very long messages in history
          if (content.length > 500) {
            content = content.substring(0, 500) + "...";
          }
          return label + ": " + content;
        })
        .join("\n");
    },

    /**
     * Clear chat history.
     */
    clearHistory: function () {
      Chat._history = [];
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.Chat = Chat;
})();
