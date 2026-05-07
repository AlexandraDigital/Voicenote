// Colors and constants
    const COLORS = {
      sky: "#0ea5e9",
      skyDark: "#0284c7",
      skyLight: "#e0f2fe",
      skyLighter: "#f0f9ff",
      slate: "#1e293b",
      slateLight: "#64748b",
      slateLighter: "#94a3b8",
      bg: "#f8fafc",
      white: "#ffffff",
      border: "#e2e8f0",
      danger: "#ef4444",
      dangerLight: "#fee2e2",
      green: "#22c55e",
      greenLight: "#dcfce7",
    };

    const NOTE_COLORS = [
      { bg: "#fff7ed", border: "#fed7aa", label: "Peach" },
      { bg: "#f0fdf4", border: "#bbf7d0", label: "Mint" },
      { bg: "#eff6ff", border: "#bfdbfe", label: "Blue" },
      { bg: "#fdf4ff", border: "#e9d5ff", label: "Lavender" },
      { bg: "#fefce8", border: "#fef08a", label: "Yellow" },
      { bg: "#fff1f2", border: "#fecdd3", label: "Rose" },
    ];

    // Tag to color mapping
    const TAG_COLORS = {
      work: 2,       // Blue
      personal: 4,   // Yellow
      urgent: 5,     // Rose
      idea: 1,       // Mint
      todo: 3,       // Lavender
      home: 0,       // Peach
      project: 2,    // Blue
      health: 4,     // Yellow
      finance: 5,    // Rose
      learning: 1,   // Mint
      reminder: 5,   // Rose
      meeting: 2,    // Blue
      note: 3,       // Lavender
      recipe: 0,     // Peach
      bug: 5,        // Rose
      feature: 1,    // Mint
    };

    const STORAGE_KEY = "voicenotes_notes";
    const DRAFT_KEY = "voicenotes_draft";

    const DEFAULT_NOTES = [
      {
        id: 1,
        title: "Team standup ideas",
        content: "Discuss the new feature roadmap, Q3 priorities, and blockers from last week. Also bring up the design review scheduled for Thursday.",
        date: new Date(Date.now() - 3600000 * 2),
        colorIdx: 0,
        tags: ["work"]
      },
      {
        id: 2,
        title: "Grocery list",
        content: "Eggs, oat milk, sourdough bread, cherry tomatoes, olive oil, garlic, lemons, pasta, parmesan.",
        date: new Date(Date.now() - 86400000),
        colorIdx: 4,
        tags: ["personal"]
      },
    ];

    // State
    let notes = loadNotes();
    let search = "";
    let isRecording = false;
    let transcript = "";
    let editingId = null;
    let editContent = "";
    let editTitle = "";
    let showNewNote = false;
    let newTitle = "";
    let newContent = "";
    let newColorIdx = 2;
    let newTag = "";
    let explicitColorIdx = null; // Color from voice command (overrides tag color)
    let recordingNote = null;
    let voiceMode = false;
    let installPrompt = null;
    let isInstalled = false;
    let saveIndicator = "";
    let recognitionRef = null;
    let autosaveTimer = null;
    let editAutosaveTimer = null;

    // Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    let lastProcessedWords = []; // For mobile-specific word deduplication

    // Load data from storage
    function loadNotes() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw).map(n => ({ ...n, date: new Date(n.date) }));
        }
      } catch (e) {}
      return DEFAULT_NOTES;
    }

    function loadDraft() {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return null;
    }

    function saveDraft() {
      if (showNewNote && (newTitle || newContent)) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: newTitle, content: newContent, colorIdx: newColorIdx, tag: newTag }));
      }
    }

    // Utility functions
    function formatDate(date) {
      const d = new Date(date);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    function showStatus(msg, duration = 3000) {
      const toast = document.getElementById("statusToast");
      toast.textContent = msg;
      toast.classList.remove("hidden");
      setTimeout(() => toast.classList.add("hidden"), duration);
    }

    function setSaveIndicator(state) {
      saveIndicator = state;
      const ind = document.getElementById("saveIndicator");
      if (state) {
        ind.textContent = state === "saving" ? "Saving…" : "✓ Saved";
        ind.className = "save-indicator " + state;
      } else {
        ind.classList.add("hidden");
      }
    }

    // Persist notes
    function persistNotes() {
      setSaveIndicator("saving");
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
          setSaveIndicator("saved");
          setTimeout(() => setSaveIndicator(""), 1800);
        } catch (e) {}
      }, 600);
    }

    // UI Rendering
    function setupEditInputListeners(noteId) {
      const titleInput = document.getElementById("editTitleInput");
      const contentInput = document.getElementById("editContentInput");
      
      if (titleInput) {
        titleInput.addEventListener("input", (e) => {
          editTitle = e.target.value;
          autosaveEdit(noteId, editTitle, editContent);
        });
      }
      
      if (contentInput) {
        contentInput.addEventListener("input", (e) => {
          editContent = e.target.value;
          autosaveEdit(noteId, editTitle, editContent);
        });
      }
    }

    function renderNotes() {
      const filtered = notes.filter(n =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some(t => t.includes(search.toLowerCase()))
      );

      const container = document.getElementById("notesContainer");
      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-emoji">📝</div>
            <p class="empty-title">${search ? "No notes found" : "No notes yet"}</p>
            <p class="empty-desc">${search ? "Try a different search term" : "Click 'New' or tap the mic to get started"}</p>
          </div>
        `;
        return;
      }

      container.innerHTML = '<div class="notes-grid">' + filtered.map((note, idx) => {
        const col = NOTE_COLORS[note.colorIdx ?? 0];
        const isEditing = editingId === note.id;
        const isRecordingThis = recordingNote === note.id;

        return `
          <div class="note-card" style="background: ${col.bg}; border-color: ${col.border}; animation-delay: ${idx * 0.05}s;">
            ${isEditing ? `
              <div>
                <input type="text" value="${escapeHtml(editTitle)}" class="input-group" id="editTitleInput" style="margin-bottom: 8px; font-weight: 600; font-size: 15px; background: rgba(255,255,255,0.8);">
                <textarea class="textarea-large input-group" id="editContentInput" style="background: rgba(255,255,255,0.8);">${escapeHtml(editContent)}</textarea>
                <div class="edit-actions">
                  <span class="autosave-text">Autosaving…</span>
                  <div style="flex: 1;"></div>
                  <button class="btn-cancel" onclick="cancelEdit()">Done</button>
                  <button class="btn-save" onclick="saveEdit(${note.id})">Save</button>
                </div>
              </div>
            ` : `
              <div class="note-header">
                <div class="note-title-section">
                  <h3 class="note-title">${escapeHtml(note.title)}</h3>
                  <span class="note-date">${formatDate(note.date)}</span>
                </div>
                <div class="note-actions">
                  <button class="icon-btn mic ${isRecordingThis ? 'recording' : ''}" onclick="toggleRecordNote(${note.id})" title="${isRecordingThis ? 'Stop recording' : 'Append voice'}">
                    ${isRecordingThis ? '<div class="pulse-ring" style="inset: -4px;"></div>' : ''}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                  </button>
                  <button class="icon-btn" onclick="startEditNote(${note.id})" title="Edit note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button class="icon-btn danger" onclick="deleteNote(${note.id})" title="Delete note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
              ${isRecordingThis && transcript ? `<div class="voice-transcript">🎙 ${escapeHtml(transcript)}</div>` : ''}
              ${isRecordingThis && !transcript ? `<div class="recording-indicator"><div class="waveform">${[1,2,3,4,5,4,3].map((_, i) => `<div class="waveform-bar recording" style="height: ${i < 3 ? (i + 1) * 4 : (7 - i) * 4}px; animation-delay: ${i * 0.1}s;"></div>`).join('')}</div><span>Listening…</span></div>` : ''}
              <p class="note-content">${note.content || '<span style="font-style: italic; color: var(--slate-lighter);">No content</span>'}</p>
              ${note.tags.length > 0 ? `
                <div class="note-tags">
                  ${note.tags.map(tag => `<span class="tag" style="border-color: ${col.border};">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l6.3-6.3a1 1 0 0 0 0-1.41L12 2Z" />
                      <circle cx="7" cy="7" r="1" fill="currentColor" />
                    </svg>
                    ${escapeHtml(tag)}
                  </span>`).join('')}
                </div>
              ` : ''}
            `}
          </div>
        `;
      }).join('') + '</div>';
      
      // Setup event listeners for edit mode if active
      if (editingId !== null) {
        setTimeout(() => setupEditInputListeners(editingId), 0);
      }
    }

    function renderColorPicker() {
      const picker = document.getElementById("colorPicker");
      picker.innerHTML = NOTE_COLORS.map((c, i) => `
        <button class="color-btn" style="background: ${c.bg}; border-color: ${i === newColorIdx ? COLORS.sky : c.border};" onclick="setColorIdx(${i})"></button>
      `).join('');
    }

    function updateModalContent() {
      const col = NOTE_COLORS[newColorIdx];
      const modal = document.getElementById("modalContent");
      modal.style.background = col.bg;
      modal.style.borderColor = col.border;
      renderColorPicker();
    }

    // Modal functions
    function openNewNoteModal() {
      showNewNote = true;
      const modal = document.getElementById("newNoteModal");
      modal.classList.remove("hidden");
      updateModalContent();
      document.getElementById("newTitle").focus();
      const draft = loadDraft();
      if (draft) {
        newTitle = draft.title || "";
        newContent = draft.content || "";
        newColorIdx = draft.colorIdx !== undefined ? draft.colorIdx : 2;
        newTag = draft.tag || "";
      }
      renderColorPicker();
      document.getElementById("newTitle").value = newTitle;
      document.getElementById("newContent").value = newContent;
      document.getElementById("newTag").value = newTag;
    }

    function closeModal(e) {
      if (e && e.target !== e.currentTarget) return;
      if (isRecording) stopRecognition();
      showNewNote = false;
      explicitColorIdx = null;
      document.getElementById("newNoteModal").classList.add("hidden");
    }

    function setColorIdx(i) {
      newColorIdx = i;
      updateModalContent();
    }

    function getColorFromTag(tag) {
      const tagLower = tag.trim().toLowerCase();
      return TAG_COLORS[tagLower] !== undefined ? TAG_COLORS[tagLower] : 2; // Default to Blue
    }

    function getColorFromName(colorName) {
      if (!colorName) return null;
      const normalized = colorName.trim().toLowerCase();
      const colorMap = {
        peach: 0, orange: 0,
        mint: 1, green: 1,
        blue: 2, navy: 2,
        lavender: 3, purple: 3,
        yellow: 4, gold: 4,
        rose: 5, red: 5, pink: 5,
      };
      return colorMap[normalized] !== undefined ? colorMap[normalized] : null;
    }

    // Note management
    function saveNewNote() {
      if (!newTitle.trim() && !newContent.trim()) return;
      
      // Determine color with priority:
      // 1. Explicit color specified (from voice command)
      // 2. Tag's default color
      // 3. User-selected color
      let colorIdx = newColorIdx;
      if (explicitColorIdx !== null) {
        colorIdx = explicitColorIdx;
      } else if (newTag.trim()) {
        colorIdx = getColorFromTag(newTag);
      }
      
      const note = {
        id: Date.now(),
        title: newTitle.trim() || "Untitled",
        content: newContent.trim(),
        date: new Date(),
        colorIdx: colorIdx,
        tags: newTag.trim() ? [newTag.trim().toLowerCase()] : [],
      };
      notes = [note, ...notes];
      newTitle = "";
      newContent = "";
      newTag = "";
      newColorIdx = 2;
      explicitColorIdx = null;
      closeModal();
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      showStatus("✅ Note saved!");
      persistNotes();
      renderNotes();
    }

    function startEditNote(id) {
      const note = notes.find(n => n.id === id);
      if (note) {
        editingId = id;
        editTitle = note.title;
        editContent = note.content;
        renderNotes();
        setTimeout(() => {
          const titleInput = document.getElementById("editTitleInput");
          if (titleInput) titleInput.focus();
        }, 0);
      }
    }

    function autosaveEdit(id, title, content) {
      clearTimeout(editAutosaveTimer);
      editAutosaveTimer = setTimeout(() => {
        notes = notes.map(n => n.id === id ? { ...n, title, content, date: new Date() } : n);
        persistNotes();
      }, 800);
    }

    function saveEdit(id) {
      const titleInput = document.getElementById("editTitleInput");
      const contentInput = document.getElementById("editContentInput");
      if (titleInput && contentInput) {
        editTitle = titleInput.value;
        editContent = contentInput.value;
      }
      notes = notes.map(n => n.id === id ? { ...n, title: editTitle, content: editContent, date: new Date() } : n);
      editingId = null;
      showStatus("✅ Note updated!");
      persistNotes();
      renderNotes();
    }

    function cancelEdit() {
      editingId = null;
      renderNotes();
    }

    function deleteNote(id) {
      notes = notes.filter(n => n.id !== id);
      showStatus("🗑 Note deleted");
      persistNotes();
      renderNotes();
    }

    // NOTION SYNC CONFIG
    const NOTION_CONFIG = {
      databaseId: "35929f4c08ff803a8b90f8aa48b4447a",
      dataSourceId: "35929f4c-08ff-8016-be10-000bb394681b",
      apiEndpoint: "https://voicenote-bgd.pages.dev/notion-sync" // Cloudflare backend endpoint
    };

    async function exportNotesToNotion() {
      try {
        showStatus("📤 Syncing notes to Notion...");
        
        const notesToSync = notes.map(note => ({
          "File Name": note.title || "Untitled",
          "File Type": "Audio", // Notes from voice are audio type
          "File Size": (note.content?.length || 0).toString(),
          "Status": "Active",
          "Upload Date": note.date ? new Date(note.date).toISOString() : new Date().toISOString(),
          "userDefined:URL": "",
          content: note.content || "",
          tags: note.tags?.join(", ") || "",
          colorIdx: note.colorIdx || 0
        }));

        // Check if backend is available
        if (typeof fetch !== 'undefined') {
          const response = await fetch(NOTION_CONFIG.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'export',
              notes: notesToSync,
              databaseId: NOTION_CONFIG.databaseId
            })
          });

          if (response.ok) {
            showStatus("✅ Notes synced to Notion! Check your database.");
          } else {
            // Fallback: Download as JSON for manual import
            downloadNotesAsJSON();
            showStatus("⚠️ Backend unavailable. Downloaded as JSON. See instructions.");
          }
        } else {
          downloadNotesAsJSON();
        }
      } catch (err) {
        console.error("Export error:", err);
        downloadNotesAsJSON();
        showStatus("⚠️ Notion sync unavailable. Downloaded as JSON instead.");
      }
    }

    async function importNotesFromNotion() {
      try {
        showStatus("📥 Loading notes from Notion...");
        
        const response = await fetch(NOTION_CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'import',
            databaseId: NOTION_CONFIG.databaseId
          })
        });

        if (response.ok) {
          const data = await response.json();
          const importedNotes = data.notes.map((item, idx) => ({
            id: Date.now() + idx,
            title: item["File Name"] || "Untitled",
            content: item.content || item["File Size"] || "",
            date: item["Upload Date"] ? new Date(item["Upload Date"]) : new Date(),
            colorIdx: item.colorIdx || 0,
            tags: item.tags ? item.tags.split(", ").filter(t => t) : []
          }));

          notes = importedNotes;
          persistNotes();
          renderNotes();
          showStatus(`✅ Imported ${importedNotes.length} notes from Notion!`);
        } else {
          showStatus("❌ Could not load from Notion. Please check your connection.");
        }
      } catch (err) {
        console.error("Import error:", err);
        showStatus("❌ Notion import failed. Manual import unavailable.");
      }
    }

    function downloadNotesAsJSON() {
      const dataStr = JSON.stringify(notes, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      link.href = url;
      link.download = `voicenotes-backup-${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }

    function exportNotes() {
      // Show options to export to Notion or as JSON
      const choice = confirm("Export to Notion (OK) or Download as JSON (Cancel)?");
      if (choice) {
        exportNotesToNotion();
      } else {
        downloadNotesAsJSON();
        showStatus("📥 Notes exported as JSON!");
      }
    }

    function importNotes() {
      // Show options to import from Notion or JSON file
      const choice = confirm("Import from Notion (OK) or Upload JSON file (Cancel)?");
      if (choice) {
        importNotesFromNotion();
      } else {
        importFromJSON();
      }
    }

    function importFromJSON() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result);
            if (Array.isArray(imported)) {
              notes = imported;
              persistNotes();
              renderNotes();
              showStatus("📤 Notes imported from JSON!");
            } else {
              showStatus("❌ Invalid backup file");
            }
          } catch (err) {
            showStatus("❌ Error importing file");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // Extract only new words not already in transcript
    function getNewWords(fullText, currentTranscript) {
      if (!fullText) return "";
      fullText = fullText.trim();
      currentTranscript = currentTranscript.trim();
      
      // If transcript is empty, return full text
      if (!currentTranscript) return fullText;
      
      // Check if fullText starts with current transcript
      if (fullText.toLowerCase().startsWith(currentTranscript.toLowerCase())) {
        // Extract only the new part (skip the current transcript)
        const newPart = fullText.slice(currentTranscript.length).trim();
        return newPart;
      }
      
      // Fallback: compare words and find first difference
      const currentWords = currentTranscript.split(/\s+/);
      const fullWords = fullText.split(/\s+/);
      
      for (let i = 0; i < currentWords.length && i < fullWords.length; i++) {
        if (currentWords[i].toLowerCase() !== fullWords[i].toLowerCase()) {
          // Found divergence, return from this point onward
          return fullWords.slice(i).join(" ");
        }
      }
      
      // If we got here, current is prefix, return remainder
      if (fullWords.length > currentWords.length) {
        return fullWords.slice(currentWords.length).join(" ");
      }
      
      return "";
    }

    // Strict word deduplication for mobile
    function deduplicateWords(text) {
      if (!text || text.length === 0) return text;
      const words = text.split(/\s+/);
      const deduped = [];
      for (let i = 0; i < words.length; i++) {
        // Skip if word is same as previous
        if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
          deduped.push(words[i]);
        }
      }
      return deduped.join(" ");
    }

    // Voice recognition
    function startRecognition(onResult, onEnd) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showStatus("⚠️ Voice recognition not supported in this browser");
        return;
      }
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.maxAlternatives = 1; // Reduce API variations

      let finalTranscript = "";
      let ended = false;
      lastProcessedWords = []; // Reset tracking

      rec.onresult = (e) => {
        // Only process NEW results from e.resultIndex — rebuilding from 0
        // every call causes duplicates when Chrome re-reports previous results.
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            let fullText = e.results[i][0].transcript.trim();
            
            if (isMobile) {
              // Mobile: Extract only truly new words not already in transcript
              let newText = getNewWords(fullText, finalTranscript);
              newText = deduplicateWords(newText); // Remove consecutive duplicates
              
              if (newText) {
                finalTranscript += (finalTranscript ? " " : "") + newText;
              }
            } else {
              // Desktop: Just remove consecutive duplicates
              fullText = deduplicateWords(fullText);
              if (fullText) {
                finalTranscript += (finalTranscript ? " " : "") + fullText;
              }
            }
          }
        }
        let interim = "";
        const last = e.results[e.results.length - 1];
        // On mobile, don't show interim text while user is still speaking
        // Only show final text after pause for cleaner UX
        if (!last.isFinal && !isMobile) {
          interim = deduplicateWords(last[0].transcript.trim());
        }
        onResult(finalTranscript.trim(), interim);
      };

      rec.onend = () => {
        if (ended) return;
        ended = true;
        lastProcessedWords = [];
        recognitionRef = null;
        isRecording = false;
        updateMicButtons();
        onEnd(finalTranscript.trim());
      };

      rec.onerror = (e) => {
        if (ended) return;
        ended = true;
        lastProcessedWords = [];
        recognitionRef = null;
        isRecording = false;
        updateMicButtons();
        if (e.error !== "aborted") showStatus("Voice error: " + e.error);
        onEnd(finalTranscript.trim());
      };

      recognitionRef = rec;
      rec.start();
      isRecording = true;
      updateMicButtons();
    }

    function stopRecognition() {
      if (recognitionRef) {
        recognitionRef.stop();
      }
    }

    function toggleRecordNote(noteId) {
      if (isRecording && recordingNote === noteId) {
        stopRecognition();
      } else {
        recordingNote = noteId;
        transcript = "";
        startRecognition(
          (final, interim) => {
            transcript = final + interim;
            renderNotes();
          },
          (final) => {
            recordingNote = null;
            transcript = "";
            if (final) {
              notes = notes.map(n => n.id === noteId ? { ...n, content: n.content ? n.content + "\n\n" + final : final, date: new Date() } : n);
              showStatus("🎙 Voice appended to note");
            }
            persistNotes();
            renderNotes();
          }
        );
      }
    }

    function updateMicButtons() {
      const floatingBtn = document.getElementById("floatingMicBtn");
      const modalBtn = document.getElementById("modalMicBtn");
      if (isRecording) {
        floatingBtn.classList.add("recording");
        modalBtn.classList.add("recording");
      } else {
        floatingBtn.classList.remove("recording");
        modalBtn.classList.remove("recording");
      }
    }

    function parseVoiceCommand(text) {
      // Parse commands like "title My Title", "tag work", "color blue"
      console.log("parseVoiceCommand input:", text);
      let result = { title: "", tag: "", color: "", content: "" };
      let remaining = text;

      // Extract title (order-independent: can appear anywhere)
      const titleMatch = remaining.match(/\btitle\s*:?\s+(.+?)(?=\s+(?:tag|color)\s*:?\s+|\s*$)/i);
      console.log("titleMatch:", titleMatch);
      if (titleMatch) {
        result.title = titleMatch[1].trim();
        remaining = remaining.replace(titleMatch[0], "").trim();
        console.log("After title removal, remaining:", remaining);
      }

      // Extract tag (order-independent: can appear anywhere)
      const tagMatch = remaining.match(/\btag\s*:?\s+(.+?)(?=\s+color\s*:?\s+|\s*$)/i);
      console.log("tagMatch:", tagMatch);
      if (tagMatch) {
        result.tag = tagMatch[1].trim();
        remaining = remaining.replace(tagMatch[0], "").trim();
        console.log("After tag removal, remaining:", remaining);
      }

      // Extract color (order-independent: can appear anywhere)
      const colorMatch = remaining.match(/\bcolor\s*:?\s+(\w+)/i);
      console.log("colorMatch:", colorMatch);
      if (colorMatch) {
        result.color = colorMatch[1].toLowerCase();
        remaining = remaining.replace(colorMatch[0], "").trim();
        console.log("After color removal, remaining:", remaining);
      }

      // Whatever's left is the content
      result.content = remaining;
      console.log("Final result:", result);

      return result;
    }


    function handleModalMicClick() {
      if (isRecording) {
        stopRecognition();
      } else {
        voiceMode = true;
        transcript = "";
        
        startRecognition(
          (final, interim) => {
            transcript = final + (interim ? " " + interim : "");
            const voiceDiv = document.getElementById("voiceTranscript");
            voiceDiv.textContent = transcript;
            voiceDiv.classList.remove("hidden");
          },
          (final) => {
            voiceMode = false;
            transcript = "";
            document.getElementById("voiceTranscript").classList.add("hidden");
            if (final) {
              // Parse voice commands
              const parsed = parseVoiceCommand(final);
              
              if (parsed.title) {
                newTitle = parsed.title;
                document.getElementById("newTitle").value = newTitle;
              }
              
              if (parsed.tag) {
                newTag = parsed.tag;
                document.getElementById("newTag").value = newTag;
              }
              
              if (parsed.color) {
                // Convert color name to index
                const colorIdx = getColorFromName(parsed.color);
                if (colorIdx !== null) {
                  explicitColorIdx = colorIdx;
                  newColorIdx = colorIdx;
                  updateModalContent();
                }
              }
              
              if (parsed.content) {
                // Only add to existing content if there's something there
                if (newContent && newContent.trim()) {
                  newContent = newContent + "\n" + parsed.content;
                } else {
                  newContent = parsed.content;
                }
                document.getElementById("newContent").value = newContent;
              }
              
              showStatus("🎙 Voice command processed");
            }
            renderNotes();
          }
        );
      }
    }

    function handleFloatingMicClick() {
      if (isRecording) {
        stopRecognition();
      } else if (showNewNote) {
        handleModalMicClick();
      } else {
        openNewNoteModal();
        setTimeout(() => handleModalMicClick(), 100);
      }
    }

    // Install PWA
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      installPrompt = e;
      document.getElementById("installBanner").classList.remove("hidden");
    });

    if (window.matchMedia("(display-mode: standalone)").matches) {
      isInstalled = true;
    }

    window.addEventListener("appinstalled", () => {
      isInstalled = true;
      installPrompt = null;
      document.getElementById("installBanner").classList.add("hidden");
      document.getElementById("installBtn").classList.add("hidden");
      document.getElementById("installedBadge").classList.remove("hidden");
    });

    async function handleInstall() {
      if (installPrompt) {
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === "accepted") {
          isInstalled = true;
          installPrompt = null;
          document.getElementById("installBanner").classList.add("hidden");
          document.getElementById("installBtn").classList.add("hidden");
          document.getElementById("installedBadge").classList.remove("hidden");
          showStatus("🎉 VoiceNotes installed!");
        }
      } else {
        showStatus("📲 Use your browser's 'Add to Home Screen' option to install", 5000);
      }
    }

    // Menu dropdown toggle
    const menuBtn = document.getElementById("menuBtn");
    const menuDropdown = document.getElementById("menuDropdown");
    
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle("hidden");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".menu-container")) {
        menuDropdown.classList.add("hidden");
      }
    });

    // Event listeners
    document.getElementById("installBtn").addEventListener("click", handleInstall);
    document.getElementById("bannerInstallBtn").addEventListener("click", handleInstall);
    document.getElementById("newNoteBtn").addEventListener("click", openNewNoteModal);
    document.getElementById("saveNoteBtn").addEventListener("click", saveNewNote);
    document.getElementById("modalMicBtn").addEventListener("click", handleModalMicClick);
    document.getElementById("floatingMicBtn").addEventListener("click", handleFloatingMicClick);

    document.getElementById("searchInput").addEventListener("input", (e) => {
      search = e.target.value;
      renderNotes();
    });

    // Draft autosave
    document.getElementById("newTitle").addEventListener("input", (e) => {
      newTitle = e.target.value;
      saveDraft();
    });

    document.getElementById("newContent").addEventListener("input", (e) => {
      if (!voiceMode) newContent = e.target.value;
      saveDraft();
    });

    document.getElementById("newTag").addEventListener("input", (e) => {
      newTag = e.target.value;
      // Auto-update color based on tag (manual tag entry resets explicit color)
      explicitColorIdx = null;
      if (newTag.trim()) {
        newColorIdx = getColorFromTag(newTag);
        updateModalContent();
      }
      saveDraft();
    });

    // Init
    if (isInstalled) {
      document.getElementById("installBtn").classList.add("hidden");
      document.getElementById("installedBadge").classList.remove("hidden");
    }
    renderNotes();

    function escapeHtml(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }
