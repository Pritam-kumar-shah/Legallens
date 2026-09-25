/**
 * LegalLens — Document Comparison Module
 * Compares two legal documents side-by-side, identifying similarities,
 * differences, and gaps using AI-powered analysis.
 */
(function () {
  "use strict";

  var AI = null;

  function getAI() {
    if (!AI) AI = window.LegalLens.AIEngine;
    return AI;
  }

  var COMPARISON_SYSTEM =
    "You are LegalLens, an expert legal document comparator. " +
    "You help users understand the differences between two legal documents by providing clear, " +
    "structured analysis in plain language. Focus on practical implications for the reader. " +
    "You provide informational assistance only — this is not legal advice.";

  var Comparison = {
    /**
     * Compare two legal documents and return structured differences.
     * @param {string} apiKey - Gemini API key
     * @param {string} doc1Text - First document text
     * @param {string} doc2Text - Second document text
     * @param {string} doc1Name - First document file name
     * @param {string} doc2Name - Second document file name
     * @returns {Promise<object>} Comparison results
     */
    compareDocuments: function (apiKey, doc1Text, doc2Text, doc1Name, doc2Name) {
      var ai = getAI();

      if (!doc1Text || !doc2Text) {
        return Promise.reject(new Error("Both documents must have text content for comparison."));
      }

      var prep1 = ai.prepareText(doc1Text, 30000); // Split token budget between docs
      var prep2 = ai.prepareText(doc2Text, 30000);

      var prompt =
        "Compare the following two legal documents and provide a detailed analysis.\n\n" +
        'DOCUMENT 1 ("' + (doc1Name || "Document 1") + '"):\n---\n' + prep1 + "\n---\n\n" +
        'DOCUMENT 2 ("' + (doc2Name || "Document 2") + '"):\n---\n' + prep2 + "\n---\n\n" +
        "Analyze:\n" +
        "1. Key similarities between the documents\n" +
        "2. Important differences in terms, conditions, or obligations\n" +
        "3. Clauses present in one document but missing from the other (gaps)\n" +
        "4. Which document is more favorable and for whom\n" +
        "5. A practical recommendation for someone reviewing both\n\n" +
        "Respond in this exact JSON format:\n" +
        '{\n' +
        '  "documentTypes": {"doc1": "type of doc 1", "doc2": "type of doc 2"},\n' +
        '  "overallAssessment": "A 2-3 sentence high-level comparison",\n' +
        '  "similarities": [\n' +
        '    {"topic": "string", "description": "string"}\n' +
        '  ],\n' +
        '  "differences": [\n' +
        '    {\n' +
        '      "topic": "string",\n' +
        '      "doc1Position": "What doc 1 says",\n' +
        '      "doc2Position": "What doc 2 says",\n' +
        '      "significance": "high|medium|low",\n' +
        '      "analysis": "Plain-language impact analysis"\n' +
        '    }\n' +
        '  ],\n' +
        '  "gaps": [\n' +
        '    {\n' +
        '      "missingFrom": "doc1|doc2",\n' +
        '      "clause": "What is missing",\n' +
        '      "importance": "high|medium|low",\n' +
        '      "impact": "Why this matters"\n' +
        '    }\n' +
        '  ],\n' +
        '  "recommendation": "Practical recommendation for the reader"\n' +
        '}';

      return ai.generateJSON(apiKey, prompt, COMPARISON_SYSTEM).then(function (result) {
        return {
          documentTypes: result.documentTypes || { doc1: "Unknown", doc2: "Unknown" },
          overallAssessment: result.overallAssessment || "",
          similarities: (result.similarities || []).map(function (s) {
            return { topic: s.topic || "", description: s.description || "" };
          }),
          differences: (result.differences || []).map(function (d) {
            return {
              topic: d.topic || "",
              doc1Position: d.doc1Position || "",
              doc2Position: d.doc2Position || "",
              significance: d.significance || "medium",
              analysis: d.analysis || "",
            };
          }),
          gaps: (result.gaps || []).map(function (g) {
            return {
              missingFrom: g.missingFrom || "unknown",
              clause: g.clause || "",
              importance: g.importance || "medium",
              impact: g.impact || "",
            };
          }),
          recommendation: result.recommendation || "",
          comparedAt: new Date().toISOString(),
        };
      });
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.Comparison = Comparison;
})();
