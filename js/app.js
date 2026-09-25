/**
 * LegalLens — Main Application Controller
 * Orchestrates UI interactions, state management, and coordination between modules.
 * Entry point for the application.
 */
(function () {
  "use strict";

  /* ────────────────── State ────────────────── */
  var state = {
    documents: [],        // [{id, name, text, metadata, fileType, uploadedAt}]
    currentDocId: null,
    analysisResults: {},  // {docId: {summary, clauses, risks, checklist}}
    chatHistories: {},    // {docId: [{role, content}]}
    geminiKey: null,
    firebaseReady: false,
  };

  var Utils, Parser, AI, Analyzer, ChatModule, Comparison, Firebase;

  /* ────────────────── Initialization ────────────────── */

  function init() {
    Utils = window.LegalLens.Utils;
    Parser = window.LegalLens.DocumentParser;
    AI = window.LegalLens.AIEngine;
    Analyzer = window.LegalLens.LegalAnalyzer;
    ChatModule = window.LegalLens.Chat;
    Comparison = window.LegalLens.Comparison;
    Firebase = window.LegalLens.Firebase;

    loadSavedConfig();
    bindEvents();
    initTheme();
    populateSuggestedQuestions();

    // Show setup modal if no API key saved
    if (!state.geminiKey) {
      showSetupModal();
    } else {
      hideSetupModal();
    }
  }

  /* ────────────────── Configuration ────────────────── */

  function loadSavedConfig() {
    try {
      state.geminiKey = localStorage.getItem("ll_gemini_key") || null;
      var fbConfig = localStorage.getItem("ll_firebase_config");
      if (fbConfig) {
        var config = JSON.parse(fbConfig);
        Firebase.init(config).then(function (ok) {
          state.firebaseReady = ok;
        });
      }
    } catch (e) {
      console.warn("LegalLens: Failed to load saved config:", e);
    }
  }

  function showSetupModal() {
    var modal = document.getElementById("setup-modal");
    if (modal) {
      modal.classList.add("visible");
      modal.setAttribute("aria-hidden", "false");
      var input = document.getElementById("gemini-key-input");
      if (input) input.focus();
    }
  }

  function hideSetupModal() {
    var modal = document.getElementById("setup-modal");
    if (modal) {
      modal.classList.remove("visible");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function handleSaveSetup() {
    var keyInput = document.getElementById("gemini-key-input");
    var fbInput = document.getElementById("firebase-config-input");

    var key = keyInput ? keyInput.value.trim() : "";
    if (!key) {
      Utils.showNotification("Please enter your Gemini API key.", "error");
      return;
    }

    // Save Gemini key
    state.geminiKey = key;
    localStorage.setItem("ll_gemini_key", key);

    // Parse and save Firebase config if provided
    if (fbInput && fbInput.value.trim()) {
      try {
        var fbConfig = JSON.parse(fbInput.value.trim());
        localStorage.setItem("ll_firebase_config", JSON.stringify(fbConfig));
        Firebase.init(fbConfig).then(function (ok) {
          state.firebaseReady = ok;
          if (ok) Utils.showNotification("Firebase connected! Your analysis history will be saved.", "success");
        });
      } catch (e) {
        Utils.showNotification("Invalid Firebase config JSON. Continuing without persistence.", "warning");
      }
    }

    hideSetupModal();
    Utils.showNotification("Setup complete! You can now upload and analyze legal documents.", "success");
  }

  function handleSkipFirebase() {
    var keyInput = document.getElementById("gemini-key-input");
    var key = keyInput ? keyInput.value.trim() : "";

    if (!key) {
      Utils.showNotification("Please enter your Gemini API key first.", "error");
      return;
    }

    state.geminiKey = key;
    localStorage.setItem("ll_gemini_key", key);
    hideSetupModal();
    Utils.showNotification("Setup complete! Running without Firebase persistence.", "info");
  }

  /* ────────────────── Theme ────────────────── */

  function initTheme() {
    var saved = localStorage.getItem("ll_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeButton(saved);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") || "light";
    var next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ll_theme", next);
    updateThemeButton(next);
  }

  function updateThemeButton(theme) {
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " mode");
    }
  }

  /* ────────────────── Tab Navigation ────────────────── */

  function switchTab(tabName) {
    // Update tab buttons
    var tabs = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute("data-tab") === tabName;
      tabs[i].classList.toggle("active", isActive);
      tabs[i].setAttribute("aria-selected", isActive ? "true" : "false");
    }

    // Update panels
    var panels = document.querySelectorAll(".tab-panel");
    for (var j = 0; j < panels.length; j++) {
      var panelName = panels[j].id.replace("panel-", "");
      var isVisible = panelName === tabName;
      panels[j].hidden = !isVisible;
      panels[j].setAttribute("aria-hidden", !isVisible ? "true" : "false");
    }
  }

  function switchResultTab(resultName) {
    var buttons = document.querySelectorAll(".result-tab-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", buttons[i].getAttribute("data-result") === resultName);
    }

    var panels = ["summary", "clauses", "risks", "checklist"];
    for (var j = 0; j < panels.length; j++) {
      var el = document.getElementById(panels[j] + "-content");
      if (el) el.hidden = panels[j] !== resultName;
    }
  }

  /* ────────────────── Document Upload ────────────────── */

  function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var zone = document.getElementById("drop-zone");
    if (zone) zone.classList.remove("drag-over");

    var files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;

    for (var i = 0; i < files.length; i++) {
      uploadFile(files[i]);
    }

    // Reset file input
    var input = document.getElementById("file-input");
    if (input) input.value = "";
  }

  function uploadFile(file) {
    var validation = Utils.validateFile(file);
    if (!validation.valid) {
      Utils.showNotification(validation.error, "error");
      return;
    }

    Utils.showLoading(true, "Parsing " + file.name + "...");

    Parser.parseFile(file)
      .then(function (doc) {
        state.documents.push(doc);
        renderDocumentList();
        updateDocumentSelectors();
        Utils.showNotification("'" + doc.name + "' uploaded successfully! (" + doc.metadata.wordCount + " words)", "success");
      })
      .catch(function (err) {
        Utils.showNotification("Failed to parse " + file.name + ": " + err.message, "error");
      })
      .finally(function () {
        Utils.showLoading(false);
      });
  }

  function removeDocument(docId) {
    state.documents = state.documents.filter(function (d) { return d.id !== docId; });
    delete state.analysisResults[docId];
    delete state.chatHistories[docId];
    renderDocumentList();
    updateDocumentSelectors();
    Utils.showNotification("Document removed.", "info");
  }

  function renderDocumentList() {
    var list = document.getElementById("document-list");
    if (!list) return;

    if (state.documents.length === 0) {
      list.innerHTML = '<div class="empty-state" id="empty-state"><span class="empty-icon">📄</span><p>No documents uploaded yet</p><p class="empty-subtitle">Upload PDF, DOCX, or TXT files to get started</p></div>';
      return;
    }

    var html = "";
    for (var i = 0; i < state.documents.length; i++) {
      var doc = state.documents[i];
      var icon = { pdf: "📕", docx: "📘", txt: "📄" }[doc.fileType] || "📄";
      var analyzed = state.analysisResults[doc.id] ? '<span class="badge badge-success">Analyzed</span>' : "";

      html +=
        '<div class="document-card" data-doc-id="' + doc.id + '">' +
          '<div class="doc-icon">' + icon + '</div>' +
          '<div class="doc-info">' +
            '<h3 class="doc-name">' + Utils.sanitizeHTML(doc.name) + '</h3>' +
            '<div class="doc-meta">' +
              '<span>' + doc.metadata.fileSizeFormatted + '</span>' +
              '<span>' + doc.metadata.wordCount.toLocaleString() + ' words</span>' +
              '<span>~' + doc.metadata.estimatedPages + ' pages</span>' +
              analyzed +
            '</div>' +
          '</div>' +
          '<button class="doc-delete-btn" data-delete-id="' + doc.id + '" aria-label="Remove ' + Utils.sanitizeHTML(doc.name) + '" title="Remove document">&times;</button>' +
        '</div>';
    }

    list.innerHTML = html;

    // Bind delete buttons
    var deleteBtns = list.querySelectorAll(".doc-delete-btn");
    for (var j = 0; j < deleteBtns.length; j++) {
      deleteBtns[j].addEventListener("click", function (e) {
        var id = e.currentTarget.getAttribute("data-delete-id");
        removeDocument(id);
      });
    }
  }

  function updateDocumentSelectors() {
    var selectors = ["doc-select-analyze", "compare-doc1-select", "compare-doc2-select", "chat-doc-select"];

    for (var s = 0; s < selectors.length; s++) {
      var select = document.getElementById(selectors[s]);
      if (!select) continue;

      var currentVal = select.value;
      select.innerHTML = '<option value="">-- Select a document --</option>';

      for (var i = 0; i < state.documents.length; i++) {
        var doc = state.documents[i];
        var option = document.createElement("option");
        option.value = doc.id;
        option.textContent = doc.name;
        select.appendChild(option);
      }

      // Restore previous selection if still valid
      if (currentVal && state.documents.some(function (d) { return d.id === currentVal; })) {
        select.value = currentVal;
      }
    }

    // Enable/disable analyze button
    var analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) analyzeBtn.disabled = state.documents.length === 0;

    var compareBtn = document.getElementById("compare-btn");
    if (compareBtn) compareBtn.disabled = state.documents.length < 2;
  }

  /* ────────────────── Analysis ────────────────── */

  function handleAnalyze() {
    var select = document.getElementById("doc-select-analyze");
    var docId = select ? select.value : "";

    if (!docId) {
      Utils.showNotification("Please select a document to analyze.", "warning");
      return;
    }

    if (!state.geminiKey) {
      Utils.showNotification("API key not configured. Click the ⚙ settings button.", "error");
      return;
    }

    var doc = state.documents.find(function (d) { return d.id === docId; });
    if (!doc) return;

    // Check if already analyzed
    if (state.analysisResults[docId]) {
      renderAnalysisResults(docId);
      Utils.showNotification("Showing cached analysis. Upload again to re-analyze.", "info");
      return;
    }

    Utils.showLoading(true, "Analyzing '" + doc.name + "'... This may take a minute.");

    Analyzer.analyzeDocument(state.geminiKey, doc.text, doc.name)
      .then(function (results) {
        state.analysisResults[docId] = results;
        renderAnalysisResults(docId);
        renderDocumentList(); // Update badge

        // Save to Firebase if available
        if (state.firebaseReady) {
          Firebase.saveAnalysis(docId, doc.name, results);
        }

        Utils.showNotification("Analysis complete!", "success");
      })
      .catch(function (err) {
        Utils.showNotification("Analysis failed: " + err.message, "error");
      })
      .finally(function () {
        Utils.showLoading(false);
      });
  }

  function renderAnalysisResults(docId) {
    var results = state.analysisResults[docId];
    if (!results) return;

    var container = document.getElementById("analysis-results");
    var placeholder = document.getElementById("analysis-placeholder");
    if (placeholder) placeholder.hidden = true;
    if (container) container.hidden = false;

    renderSummary(results.summary);
    renderClauses(results.clauses);
    renderRisks(results.risks);
    renderChecklist(results.checklist, docId);

    // Show summary tab by default
    switchResultTab("summary");
  }

  function renderSummary(summary) {
    var el = document.getElementById("summary-content");
    if (!el || !summary) return;

    var html =
      '<div class="summary-header">' +
        '<span class="badge badge-info">' + Utils.sanitizeHTML(summary.documentType) + '</span>' +
        (summary.parties.length > 0 ? '<div class="parties"><strong>Parties:</strong> ' + summary.parties.map(Utils.sanitizeHTML).join(", ") + '</div>' : "") +
      '</div>' +
      '<div class="summary-text">' + Utils.markdownToHTML(summary.summary) + '</div>';

    if (summary.keyPoints.length > 0) {
      html += '<div class="key-points"><h4>📌 Key Points</h4><ul>';
      for (var i = 0; i < summary.keyPoints.length; i++) {
        html += '<li>' + Utils.sanitizeHTML(summary.keyPoints[i]) + '</li>';
      }
      html += '</ul></div>';
    }

    if (summary.concerns.length > 0) {
      html += '<div class="concerns"><h4>⚠️ Concerns</h4><ul>';
      for (var j = 0; j < summary.concerns.length; j++) {
        html += '<li>' + Utils.sanitizeHTML(summary.concerns[j]) + '</li>';
      }
      html += '</ul></div>';
    }

    el.innerHTML = html;
  }

  function renderClauses(clausesData) {
    var el = document.getElementById("clauses-content");
    if (!el || !clausesData) return;

    var clauses = clausesData.clauses || [];
    if (clauses.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No significant clauses identified.</p></div>';
      return;
    }

    var categoryIcons = {
      obligation: "📋", right: "✅", restriction: "🚫", termination: "🔚",
      liability: "⚖️", indemnification: "🛡️", confidentiality: "🔒",
      payment: "💰", deadline: "📅", dispute_resolution: "🤝",
      intellectual_property: "💡", warranty: "📦", other: "📎"
    };

    var html = '<div class="clauses-list">';
    for (var i = 0; i < clauses.length; i++) {
      var c = clauses[i];
      var icon = categoryIcons[c.category] || "📎";
      html +=
        '<div class="clause-item importance-' + c.importance + '">' +
          '<div class="clause-header">' +
            '<span class="clause-icon">' + icon + '</span>' +
            '<h4 class="clause-title">' + Utils.sanitizeHTML(c.title) + '</h4>' +
            '<span class="badge badge-' + c.importance + '">' + c.importance + '</span>' +
            '<span class="badge badge-category">' + Utils.sanitizeHTML(c.category.replace(/_/g, " ")) + '</span>' +
          '</div>' +
          '<div class="clause-content"><p>' + Utils.sanitizeHTML(c.content) + '</p></div>' +
          '<div class="clause-plain"><strong>In plain terms:</strong> ' + Utils.sanitizeHTML(c.plainLanguage) + '</div>' +
        '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function renderRisks(risksData) {
    var el = document.getElementById("risks-content");
    if (!el || !risksData) return;

    var risks = risksData.risks || [];

    // Risk score meter
    var scoreColor = risksData.riskScore <= 3 ? "low" : risksData.riskScore <= 6 ? "medium" : "high";
    var html =
      '<div class="risk-overview">' +
        '<div class="risk-score-container">' +
          '<div class="risk-score-label">Overall Risk</div>' +
          '<div class="severity-meter">' +
            '<div class="severity-fill severity-' + scoreColor + '" style="width: ' + (risksData.riskScore * 10) + '%"></div>' +
          '</div>' +
          '<div class="risk-score-value">' + risksData.riskScore + '/10 — <span class="badge badge-' + risksData.overallRiskLevel + '">' + risksData.overallRiskLevel.toUpperCase() + '</span></div>' +
        '</div>' +
      '</div>';

    if (risks.length > 0) {
      html += '<div class="risks-list">';
      for (var i = 0; i < risks.length; i++) {
        var r = risks[i];
        html +=
          '<div class="risk-item severity-' + r.severity + '">' +
            '<div class="risk-header">' +
              '<h4>' + Utils.sanitizeHTML(r.title) + '</h4>' +
              '<span class="badge badge-' + r.severity + '">' + r.severity.toUpperCase() + '</span>' +
            '</div>' +
            '<p class="risk-description">' + Utils.sanitizeHTML(r.description) + '</p>' +
            (r.affectedClause ? '<p class="risk-clause"><strong>Affected area:</strong> ' + Utils.sanitizeHTML(r.affectedClause) + '</p>' : '') +
            '<p class="risk-mitigation"><strong>💡 Suggestion:</strong> ' + Utils.sanitizeHTML(r.mitigation) + '</p>' +
          '</div>';
      }
      html += '</div>';
    }

    if (risksData.missingProtections && risksData.missingProtections.length > 0) {
      html += '<div class="missing-protections"><h4>🔍 Missing Protections</h4><ul>';
      for (var j = 0; j < risksData.missingProtections.length; j++) {
        html += '<li>' + Utils.sanitizeHTML(risksData.missingProtections[j]) + '</li>';
      }
      html += '</ul></div>';
    }

    el.innerHTML = html;
  }

  function renderChecklist(checklistData, docId) {
    var el = document.getElementById("checklist-content");
    if (!el || !checklistData) return;

    var items = checklistData.checklist || [];
    if (items.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No checklist items generated.</p></div>';
      return;
    }

    var categoryLabels = {
      verification: "✔️ Verify", deadline: "📅 Deadline", obligation: "📋 Obligation",
      legal_question: "❓ Ask Lawyer", action: "🔧 Action", documentation: "📁 Gather"
    };

    var html = '<div class="checklist-controls"><button id="export-checklist-btn" class="btn btn-secondary">📥 Export Checklist</button></div>';
    html += '<div class="checklist-list">';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var label = categoryLabels[item.category] || "📎 Item";
      html +=
        '<div class="checklist-item priority-' + item.priority + '">' +
          '<label class="checklist-label">' +
            '<input type="checkbox" class="checklist-check" data-index="' + i + '" data-doc-id="' + docId + '"' + (item.completed ? " checked" : "") + '>' +
            '<span class="checkmark"></span>' +
            '<span class="checklist-text">' + Utils.sanitizeHTML(item.item) + '</span>' +
          '</label>' +
          '<div class="checklist-meta">' +
            '<span class="badge badge-category">' + label + '</span>' +
            '<span class="badge badge-' + item.priority + '">' + item.priority + '</span>' +
          '</div>' +
          (item.details ? '<p class="checklist-details">' + Utils.sanitizeHTML(item.details) + '</p>' : '') +
        '</div>';
    }
    html += '</div>';
    el.innerHTML = html;

    // Bind checkbox events
    var checks = el.querySelectorAll(".checklist-check");
    for (var j = 0; j < checks.length; j++) {
      checks[j].addEventListener("change", function (e) {
        var idx = parseInt(e.target.getAttribute("data-index"));
        var dId = e.target.getAttribute("data-doc-id");
        if (state.analysisResults[dId]) {
          state.analysisResults[dId].checklist.checklist[idx].completed = e.target.checked;
        }
      });
    }

    // Bind export button
    var exportBtn = document.getElementById("export-checklist-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () { exportChecklist(docId); });
    }
  }

  function exportChecklist(docId) {
    var results = state.analysisResults[docId];
    if (!results || !results.checklist) return;

    var doc = state.documents.find(function (d) { return d.id === docId; });
    var text = "LEGALLENS - DOCUMENT REVIEW CHECKLIST\n";
    text += "Document: " + (doc ? doc.name : "Unknown") + "\n";
    text += "Generated: " + Utils.formatDate(new Date()) + "\n";
    text += "=" .repeat(50) + "\n\n";

    var items = results.checklist.checklist;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      text += (item.completed ? "[x] " : "[ ] ") + item.item + "\n";
      text += "    Category: " + item.category + " | Priority: " + item.priority + "\n";
      if (item.details) text += "    Details: " + item.details + "\n";
      text += "\n";
    }

    text += "\nDISCLAIMER: This checklist is for informational purposes only and does not constitute legal advice.";

    // Download as text file
    var blob = new Blob([text], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "legallens-checklist-" + (doc ? doc.name.replace(/\.[^.]+$/, "") : "export") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
    Utils.showNotification("Checklist exported!", "success");
  }

  /* ────────────────── Comparison ────────────────── */

  function handleCompare() {
    var sel1 = document.getElementById("compare-doc1-select");
    var sel2 = document.getElementById("compare-doc2-select");
    var id1 = sel1 ? sel1.value : "";
    var id2 = sel2 ? sel2.value : "";

    if (!id1 || !id2) {
      Utils.showNotification("Please select two documents to compare.", "warning");
      return;
    }

    if (id1 === id2) {
      Utils.showNotification("Please select two different documents.", "warning");
      return;
    }

    if (!state.geminiKey) {
      Utils.showNotification("API key not configured. Click the ⚙ settings button.", "error");
      return;
    }

    var doc1 = state.documents.find(function (d) { return d.id === id1; });
    var doc2 = state.documents.find(function (d) { return d.id === id2; });
    if (!doc1 || !doc2) return;

    Utils.showLoading(true, "Comparing documents... This may take a minute.");

    Comparison.compareDocuments(state.geminiKey, doc1.text, doc2.text, doc1.name, doc2.name)
      .then(function (results) {
        renderComparisonResults(results, doc1.name, doc2.name);

        if (state.firebaseReady) {
          Firebase.saveComparison(Utils.generateId(), results);
        }

        Utils.showNotification("Comparison complete!", "success");
      })
      .catch(function (err) {
        Utils.showNotification("Comparison failed: " + err.message, "error");
      })
      .finally(function () {
        Utils.showLoading(false);
      });
  }

  function renderComparisonResults(results, name1, name2) {
    var container = document.getElementById("comparison-results");
    var placeholder = document.getElementById("compare-placeholder");
    if (placeholder) placeholder.hidden = true;
    if (!container) return;
    container.hidden = false;

    var html =
      '<div class="comparison-overview">' +
        '<h3>Comparison: ' + Utils.sanitizeHTML(name1) + ' vs ' + Utils.sanitizeHTML(name2) + '</h3>' +
        '<p class="comparison-assessment">' + Utils.sanitizeHTML(results.overallAssessment) + '</p>' +
        '<div class="doc-types">' +
          '<span class="badge badge-info">Doc 1: ' + Utils.sanitizeHTML(results.documentTypes.doc1) + '</span>' +
          '<span class="badge badge-info">Doc 2: ' + Utils.sanitizeHTML(results.documentTypes.doc2) + '</span>' +
        '</div>' +
      '</div>';

    // Similarities
    if (results.similarities.length > 0) {
      html += '<div class="comparison-section"><h4>✅ Similarities</h4>';
      for (var i = 0; i < results.similarities.length; i++) {
        var s = results.similarities[i];
        html += '<div class="comparison-item diff-same"><strong>' + Utils.sanitizeHTML(s.topic) + ':</strong> ' + Utils.sanitizeHTML(s.description) + '</div>';
      }
      html += '</div>';
    }

    // Differences
    if (results.differences.length > 0) {
      html += '<div class="comparison-section"><h4>🔄 Key Differences</h4>';
      for (var j = 0; j < results.differences.length; j++) {
        var d = results.differences[j];
        html +=
          '<div class="comparison-item diff-modified">' +
            '<div class="diff-header"><strong>' + Utils.sanitizeHTML(d.topic) + '</strong> <span class="badge badge-' + d.significance + '">' + d.significance + '</span></div>' +
            '<div class="diff-sides">' +
              '<div class="diff-doc1"><strong>' + Utils.sanitizeHTML(name1) + ':</strong> ' + Utils.sanitizeHTML(d.doc1Position) + '</div>' +
              '<div class="diff-doc2"><strong>' + Utils.sanitizeHTML(name2) + ':</strong> ' + Utils.sanitizeHTML(d.doc2Position) + '</div>' +
            '</div>' +
            '<p class="diff-analysis"><em>' + Utils.sanitizeHTML(d.analysis) + '</em></p>' +
          '</div>';
      }
      html += '</div>';
    }

    // Gaps
    if (results.gaps.length > 0) {
      html += '<div class="comparison-section"><h4>🔍 Gaps</h4>';
      for (var k = 0; k < results.gaps.length; k++) {
        var g = results.gaps[k];
        var missingLabel = g.missingFrom === "doc1" ? name1 : name2;
        html +=
          '<div class="gap-item">' +
            '<span class="badge badge-' + g.importance + '">' + g.importance + '</span> ' +
            '<strong>Missing from ' + Utils.sanitizeHTML(missingLabel) + ':</strong> ' +
            Utils.sanitizeHTML(g.clause) +
            (g.impact ? '<p class="gap-impact">' + Utils.sanitizeHTML(g.impact) + '</p>' : '') +
          '</div>';
      }
      html += '</div>';
    }

    // Recommendation
    if (results.recommendation) {
      html += '<div class="comparison-section recommendation"><h4>💡 Recommendation</h4><p>' + Utils.sanitizeHTML(results.recommendation) + '</p></div>';
    }

    container.innerHTML = html;
  }

  /* ────────────────── Chat ────────────────── */

  function handleChatSend() {
    var input = document.getElementById("chat-input");
    var select = document.getElementById("chat-doc-select");
    var question = input ? input.value.trim() : "";
    var docId = select ? select.value : "";

    if (!question) return;

    if (!docId) {
      Utils.showNotification("Please select a document to chat about.", "warning");
      return;
    }

    if (!state.geminiKey) {
      Utils.showNotification("API key not configured.", "error");
      return;
    }

    var doc = state.documents.find(function (d) { return d.id === docId; });
    if (!doc) return;

    // Initialize chat history for this doc
    if (!state.chatHistories[docId]) {
      state.chatHistories[docId] = [];
    }

    // Add user message
    var userMsg = { role: "user", content: question };
    state.chatHistories[docId].push(userMsg);
    appendChatMessage(userMsg);

    // Clear input
    input.value = "";
    input.focus();

    // Show typing indicator
    showTypingIndicator();

    // Hide suggested questions
    var suggested = document.getElementById("suggested-questions");
    if (suggested) suggested.hidden = true;

    ChatModule.askQuestion(state.geminiKey, doc.text, question, state.chatHistories[docId])
      .then(function (answer) {
        hideTypingIndicator();
        var assistantMsg = { role: "assistant", content: answer };
        state.chatHistories[docId].push(assistantMsg);
        appendChatMessage(assistantMsg);

        if (state.firebaseReady) {
          Firebase.saveChatMessage(docId, userMsg);
          Firebase.saveChatMessage(docId, assistantMsg);
        }
      })
      .catch(function (err) {
        hideTypingIndicator();
        var errorMsg = { role: "assistant", content: "Sorry, I encountered an error: " + err.message + ". Please try again." };
        state.chatHistories[docId].push(errorMsg);
        appendChatMessage(errorMsg);
      });
  }

  function appendChatMessage(msg) {
    var container = document.getElementById("chat-messages");
    if (!container) return;

    // Remove welcome message if present
    var welcome = container.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    var div = document.createElement("div");
    div.className = "chat-message chat-" + msg.role;
    div.setAttribute("role", "article");

    var label = msg.role === "user" ? "You" : "LegalLens";
    div.innerHTML =
      '<div class="message-sender">' + label + '</div>' +
      '<div class="message-content">' + Utils.markdownToHTML(msg.content) + '</div>';

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    var container = document.getElementById("chat-messages");
    if (!container) return;

    var div = document.createElement("div");
    div.className = "chat-message chat-assistant typing";
    div.id = "typing-indicator";
    div.innerHTML = '<div class="message-sender">LegalLens</div><div class="typing-dots"><span></span><span></span><span></span></div>';

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTypingIndicator() {
    var indicator = document.getElementById("typing-indicator");
    if (indicator) indicator.remove();
  }

  function populateSuggestedQuestions() {
    var container = document.getElementById("suggested-questions");
    if (!container) return;

    var questions = ChatModule.getSuggestedQuestions();
    var html = '<p class="suggested-label">Try asking:</p>';
    for (var i = 0; i < Math.min(4, questions.length); i++) {
      html += '<button class="suggested-question" data-question="' + Utils.sanitizeHTML(questions[i]) + '">' + Utils.sanitizeHTML(questions[i]) + '</button>';
    }
    container.innerHTML = html;

    // Bind click events
    var btns = container.querySelectorAll(".suggested-question");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function (e) {
        var q = e.target.getAttribute("data-question");
        var input = document.getElementById("chat-input");
        if (input) {
          input.value = q;
          handleChatSend();
        }
      });
    }
  }

  /* ────────────────── Event Binding ────────────────── */

  function bindEvents() {
    // Setup modal
    var saveBtn = document.getElementById("save-setup-btn");
    if (saveBtn) saveBtn.addEventListener("click", handleSaveSetup);

    var skipBtn = document.getElementById("skip-firebase-btn");
    if (skipBtn) skipBtn.addEventListener("click", handleSkipFirebase);

    // Settings button (re-open setup)
    var settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", showSetupModal);

    // Theme toggle
    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

    // Dismiss disclaimer
    var disclaimer = document.getElementById("legal-disclaimer");
    if (disclaimer) {
      var dismissBtn = disclaimer.querySelector(".dismiss-btn");
      if (dismissBtn) {
        dismissBtn.addEventListener("click", function () {
          disclaimer.hidden = true;
        });
      }
    }

    // Tab navigation
    var tabBtns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener("click", function (e) {
        switchTab(e.currentTarget.getAttribute("data-tab"));
      });
    }

    // Result sub-tabs
    document.addEventListener("click", function (e) {
      if (e.target.classList.contains("result-tab-btn")) {
        switchResultTab(e.target.getAttribute("data-result"));
      }
    });

    // File upload — drop zone
    var dropZone = document.getElementById("drop-zone");
    if (dropZone) {
      dropZone.addEventListener("click", function () {
        var input = document.getElementById("file-input");
        if (input) input.click();
      });
      dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", function () {
        dropZone.classList.remove("drag-over");
      });
      dropZone.addEventListener("drop", handleFileDrop);
    }

    var fileInput = document.getElementById("file-input");
    if (fileInput) fileInput.addEventListener("change", handleFileDrop);

    // Analyze
    var analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) analyzeBtn.addEventListener("click", handleAnalyze);

    // Compare
    var compareBtn = document.getElementById("compare-btn");
    if (compareBtn) compareBtn.addEventListener("click", handleCompare);

    // Chat
    var chatSendBtn = document.getElementById("chat-send-btn");
    if (chatSendBtn) chatSendBtn.addEventListener("click", handleChatSend);

    var chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleChatSend();
        }
      });
    }

    // Keyboard navigation for tabs
    var navTabs = document.getElementById("nav-tabs");
    if (navTabs) {
      navTabs.addEventListener("keydown", function (e) {
        var tabs = navTabs.querySelectorAll(".tab-btn");
        var current = Array.prototype.indexOf.call(tabs, document.activeElement);
        if (current === -1) return;

        var next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          next = (current + 1) % tabs.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          next = (current - 1 + tabs.length) % tabs.length;
        }

        if (next !== -1) {
          e.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }
      });
    }
  }

  /* ────────────────── Bootstrap ────────────────── */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.App = { getState: function () { return state; } };
})();
