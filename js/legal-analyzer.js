/**
 * LegalLens — Legal Analyzer
 * Orchestrates document analysis: summary, clause extraction, risk assessment, checklists.
 * Uses crafted legal prompts for high-quality, structured AI output.
 */
(function () {
  "use strict";

  var AI = null;

  function getAI() {
    if (!AI) AI = window.LegalLens.AIEngine;
    return AI;
  }

  /** System instruction shared across all legal analysis prompts. */
  var SYSTEM_INSTRUCTION =
    "You are LegalLens, an expert AI legal document analyst. " +
    "You help non-lawyers understand legal documents by providing clear, accurate, and practical analysis. " +
    "Always use plain, simple language. Explain legal terms when you must use them. " +
    "Be thorough but concise. Focus on what matters most to the reader. " +
    "IMPORTANT: You provide informational assistance only — never state or imply that your output constitutes legal advice.";

  var LegalAnalyzer = {
    /**
     * Run a full analysis on a document: summary + clauses + risks + checklist.
     * @param {string} apiKey - Gemini API key
     * @param {string} text - Document text
     * @param {string} docName - Document file name
     * @returns {Promise<{summary: object, clauses: object, risks: object, checklist: object}>}
     */
    analyzeDocument: function (apiKey, text, docName) {
      var ai = getAI();
      var preparedText = ai.prepareText(text);

      // Run all four analyses in parallel for speed
      return Promise.all([
        LegalAnalyzer.generateSummary(apiKey, preparedText, docName),
        LegalAnalyzer.extractClauses(apiKey, preparedText),
        LegalAnalyzer.assessRisks(apiKey, preparedText),
        LegalAnalyzer.generateChecklist(apiKey, preparedText),
      ]).then(function (results) {
        return {
          summary: results[0],
          clauses: results[1],
          risks: results[2],
          checklist: results[3],
          analyzedAt: new Date().toISOString(),
        };
      });
    },

    /**
     * Generate a plain-language summary of the document.
     * @param {string} apiKey
     * @param {string} text
     * @param {string} [docName]
     * @returns {Promise<object>}
     */
    generateSummary: function (apiKey, text, docName) {
      var prompt =
        "Analyze the following legal document" +
        (docName ? ' ("' + docName + '")' : "") +
        " and provide a comprehensive yet easy-to-understand summary.\n\n" +
        "Your summary should:\n" +
        "1. Identify the type of document (contract, NDA, lease, terms of service, privacy policy, etc.)\n" +
        "2. State the key parties involved\n" +
        "3. Summarize the main purpose and terms in plain language (2-3 paragraphs)\n" +
        "4. List the most important points a non-lawyer should understand\n" +
        "5. Note any unusual or concerning provisions\n\n" +
        "Use simple, clear language that a person without legal training can understand.\n\n" +
        "DOCUMENT:\n" + text + "\n\n" +
        'Respond in this exact JSON format:\n' +
        '{\n' +
        '  "documentType": "string",\n' +
        '  "parties": ["party1", "party2"],\n' +
        '  "summary": "2-3 paragraph plain-language summary",\n' +
        '  "keyPoints": ["point 1", "point 2", "..."],\n' +
        '  "concerns": ["concern 1", "concern 2"]\n' +
        '}';

      return getAI().generateJSON(apiKey, prompt, SYSTEM_INSTRUCTION).then(function (result) {
        // Ensure all expected fields exist
        return {
          documentType: result.documentType || "Unknown",
          parties: result.parties || [],
          summary: result.summary || "Summary could not be generated.",
          keyPoints: result.keyPoints || [],
          concerns: result.concerns || [],
        };
      });
    },

    /**
     * Extract and categorize important clauses.
     * @param {string} apiKey
     * @param {string} text
     * @returns {Promise<object>}
     */
    extractClauses: function (apiKey, text) {
      var prompt =
        "Extract and categorize ALL important clauses from the following legal document.\n\n" +
        "For each clause, identify:\n" +
        '1. category: one of ["obligation", "right", "restriction", "termination", "liability", "indemnification", "confidentiality", "payment", "deadline", "dispute_resolution", "intellectual_property", "warranty", "other"]\n' +
        "2. title: A brief descriptive title\n" +
        "3. content: The key text or a clear paraphrase\n" +
        "4. plainLanguage: What this means in everyday terms\n" +
        '5. importance: "high", "medium", or "low"\n\n' +
        "DOCUMENT:\n" + text + "\n\n" +
        'Respond in this exact JSON format:\n' +
        '{\n' +
        '  "clauses": [\n' +
        '    {\n' +
        '      "category": "string",\n' +
        '      "title": "string",\n' +
        '      "content": "string",\n' +
        '      "plainLanguage": "string",\n' +
        '      "importance": "high|medium|low"\n' +
        '    }\n' +
        '  ]\n' +
        '}';

      return getAI().generateJSON(apiKey, prompt, SYSTEM_INSTRUCTION).then(function (result) {
        return {
          clauses: (result.clauses || []).map(function (c) {
            return {
              category: c.category || "other",
              title: c.title || "Untitled Clause",
              content: c.content || "",
              plainLanguage: c.plainLanguage || "",
              importance: c.importance || "medium",
            };
          }),
        };
      });
    },

    /**
     * Assess potential risks and red flags in the document.
     * @param {string} apiKey
     * @param {string} text
     * @returns {Promise<object>}
     */
    assessRisks: function (apiKey, text) {
      var prompt =
        "Analyze the following legal document and identify potential risks, concerns, and red flags.\n\n" +
        "For each risk, provide:\n" +
        '1. severity: "high", "medium", or "low"\n' +
        '2. category: one of ["financial", "legal_liability", "compliance", "timeline", "privacy", "intellectual_property", "termination", "ambiguity", "missing_clause", "unfair_terms"]\n' +
        "3. title: Brief risk title\n" +
        "4. description: Clear explanation of the risk in plain language\n" +
        "5. affectedClause: Which part of the document creates this risk\n" +
        "6. mitigation: What could be done to address this risk\n\n" +
        "Also provide an overall risk level and note any missing protections.\n\n" +
        "DOCUMENT:\n" + text + "\n\n" +
        'Respond in this exact JSON format:\n' +
        '{\n' +
        '  "overallRiskLevel": "high|medium|low",\n' +
        '  "riskScore": 5,\n' +
        '  "risks": [\n' +
        '    {\n' +
        '      "severity": "string",\n' +
        '      "category": "string",\n' +
        '      "title": "string",\n' +
        '      "description": "string",\n' +
        '      "affectedClause": "string",\n' +
        '      "mitigation": "string"\n' +
        '    }\n' +
        '  ],\n' +
        '  "missingProtections": ["string"]\n' +
        '}';

      return getAI().generateJSON(apiKey, prompt, SYSTEM_INSTRUCTION).then(function (result) {
        return {
          overallRiskLevel: result.overallRiskLevel || "medium",
          riskScore: Math.min(10, Math.max(1, result.riskScore || 5)),
          risks: (result.risks || []).map(function (r) {
            return {
              severity: r.severity || "medium",
              category: r.category || "other",
              title: r.title || "Unknown Risk",
              description: r.description || "",
              affectedClause: r.affectedClause || "",
              mitigation: r.mitigation || "",
            };
          }),
          missingProtections: result.missingProtections || [],
        };
      });
    },

    /**
     * Generate an actionable checklist based on the document.
     * @param {string} apiKey
     * @param {string} text
     * @returns {Promise<object>}
     */
    generateChecklist: function (apiKey, text) {
      var prompt =
        "Based on the following legal document, generate a practical actionable checklist.\n\n" +
        "Create items for:\n" +
        "1. Things to verify before signing\n" +
        "2. Key dates and deadlines to track\n" +
        "3. Obligations and responsibilities to be aware of\n" +
        "4. Important questions to ask a lawyer about this document\n" +
        "5. Required follow-up actions\n" +
        "6. Documents or information you need to gather\n\n" +
        "Each item should be specific, actionable, and understandable by a non-lawyer.\n\n" +
        "DOCUMENT:\n" + text + "\n\n" +
        'Respond in this exact JSON format:\n' +
        '{\n' +
        '  "checklist": [\n' +
        '    {\n' +
        '      "category": "verification|deadline|obligation|legal_question|action|documentation",\n' +
        '      "item": "string - the checklist item",\n' +
        '      "priority": "high|medium|low",\n' +
        '      "details": "string - additional context"\n' +
        '    }\n' +
        '  ]\n' +
        '}';

      return getAI().generateJSON(apiKey, prompt, SYSTEM_INSTRUCTION).then(function (result) {
        return {
          checklist: (result.checklist || []).map(function (c) {
            return {
              category: c.category || "action",
              item: c.item || "",
              priority: c.priority || "medium",
              details: c.details || "",
              completed: false,
            };
          }),
        };
      });
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.LegalAnalyzer = LegalAnalyzer;
})();
