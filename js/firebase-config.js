/**
 * LegalLens — Firebase Configuration & Firestore Helpers
 * Handles Firebase initialization, anonymous auth, and Firestore persistence.
 * Firebase is OPTIONAL — the app works without it (in-memory only).
 */
(function () {
  "use strict";

  var db = null;
  var auth = null;
  var userId = null;
  var initialized = false;

  var FirebaseConfig = {
    /**
     * Check whether Firebase SDK is available.
     * @returns {boolean}
     */
    isAvailable: function () {
      return typeof firebase !== "undefined" && firebase.app;
    },

    /**
     * Check whether Firebase has been initialized.
     * @returns {boolean}
     */
    isInitialized: function () {
      return initialized && db !== null;
    },

    /**
     * Initialize Firebase with the user-provided config.
     * @param {object} config - Firebase config object
     * @returns {Promise<boolean>} true if successful
     */
    init: function (config) {
      return new Promise(function (resolve) {
        try {
          if (!FirebaseConfig.isAvailable()) {
            console.warn("LegalLens: Firebase SDK not loaded, running without persistence.");
            resolve(false);
            return;
          }

          // Validate required config keys
          var required = ["apiKey", "authDomain", "projectId"];
          for (var i = 0; i < required.length; i++) {
            if (!config[required[i]]) {
              console.warn("LegalLens: Missing Firebase config key '" + required[i] + "'.");
              resolve(false);
              return;
            }
          }

          // Initialize Firebase app
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }

          db = firebase.firestore();
          auth = firebase.auth();

          // Sign in anonymously for session management
          auth
            .signInAnonymously()
            .then(function (cred) {
              userId = cred.user.uid;
              initialized = true;
              console.log("LegalLens: Firebase initialized, user:", userId);
              resolve(true);
            })
            .catch(function (err) {
              console.warn("LegalLens: Anonymous auth failed:", err.message);
              // Firestore still works without auth if rules allow
              initialized = true;
              resolve(true);
            });
        } catch (err) {
          console.warn("LegalLens: Firebase init failed:", err.message);
          resolve(false);
        }
      });
    },

    /**
     * Save a document analysis result to Firestore.
     * @param {string} docId - Document identifier
     * @param {string} docName - Document file name
     * @param {object} analysis - Analysis results
     * @returns {Promise<void>}
     */
    saveAnalysis: function (docId, docName, analysis) {
      if (!initialized || !db) return Promise.resolve();

      var data = {
        docId: docId,
        docName: docName,
        analysis: JSON.stringify(analysis),
        userId: userId || "anonymous",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      return db
        .collection("analyses")
        .doc(docId)
        .set(data)
        .then(function () {
          console.log("LegalLens: Analysis saved to Firestore.");
        })
        .catch(function (err) {
          console.warn("LegalLens: Failed to save analysis:", err.message);
        });
    },

    /**
     * Save a document comparison result to Firestore.
     * @param {string} compId - Comparison identifier
     * @param {object} comparison - Comparison results
     * @returns {Promise<void>}
     */
    saveComparison: function (compId, comparison) {
      if (!initialized || !db) return Promise.resolve();

      return db
        .collection("comparisons")
        .doc(compId)
        .set({
          compId: compId,
          comparison: JSON.stringify(comparison),
          userId: userId || "anonymous",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch(function (err) {
          console.warn("LegalLens: Failed to save comparison:", err.message);
        });
    },

    /**
     * Save a chat message to Firestore.
     * @param {string} docId - Related document ID
     * @param {object} message - {role, content, timestamp}
     * @returns {Promise<void>}
     */
    saveChatMessage: function (docId, message) {
      if (!initialized || !db) return Promise.resolve();

      return db
        .collection("chats")
        .add({
          docId: docId,
          role: message.role,
          content: message.content,
          userId: userId || "anonymous",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch(function (err) {
          console.warn("LegalLens: Failed to save chat message:", err.message);
        });
    },

    /**
     * Get analysis history for the current user.
     * @param {number} [limit=20] - Max results
     * @returns {Promise<object[]>}
     */
    getAnalysisHistory: function (limit) {
      if (!initialized || !db) return Promise.resolve([]);
      limit = limit || 20;

      var query = db.collection("analyses").orderBy("createdAt", "desc").limit(limit);

      if (userId) {
        query = query.where("userId", "==", userId);
      }

      return query
        .get()
        .then(function (snapshot) {
          var results = [];
          snapshot.forEach(function (doc) {
            var data = doc.data();
            data.analysis = LegalLens.Utils.safeParseJSON(data.analysis);
            results.push(data);
          });
          return results;
        })
        .catch(function (err) {
          console.warn("LegalLens: Failed to fetch history:", err.message);
          return [];
        });
    },

    /**
     * Get chat history for a specific document.
     * @param {string} docId
     * @returns {Promise<object[]>}
     */
    getChatHistory: function (docId) {
      if (!initialized || !db) return Promise.resolve([]);

      return db
        .collection("chats")
        .where("docId", "==", docId)
        .orderBy("createdAt", "asc")
        .get()
        .then(function (snapshot) {
          var messages = [];
          snapshot.forEach(function (doc) {
            messages.push(doc.data());
          });
          return messages;
        })
        .catch(function (err) {
          console.warn("LegalLens: Failed to fetch chat history:", err.message);
          return [];
        });
    },

    /**
     * Get current user ID.
     * @returns {string|null}
     */
    getUserId: function () {
      return userId;
    },
  };

  window.LegalLens = window.LegalLens || {};
  window.LegalLens.Firebase = FirebaseConfig;
})();
