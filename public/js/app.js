// VoiceNotes App - Complete Implementation
class VoiceNotesApp {
  constructor() {
    this.notes = [];
    this.currentColor = '#0ea5e9';
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recognition = null;
    this.isListening = false;
    this.currentEditingId = null;
    this.currentAudioUrl = null;

    this.colors = {
      '#0ea5e9': 'Sky',
      '#8b5cf6': 'Purple',
      '#ec4899': 'Pink',
      '#f59e0b': 'Amber',
      '#10b981': 'Emerald',
      '#6366f1': 'Indigo'
    };

    this.notionConfig = {
      apiKey: localStorage.getItem('notionApiKey') || '',
      databaseId: localStorage.getItem('notionDatabaseId') || ''
    };

    this.init();
  }

  init() {
    this.loadNotesFromStorage();
    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.setupColorPicker();
    this.setupPWA();
    this.renderNotes();
  }

  // ============ Storage & Data ============
  loadNotesFromStorage() {
    const stored = localStorage.getItem('voiceNotes');
    this.notes = stored ? JSON.parse(stored) : [];
  }

  saveNotesToStorage() {
    localStorage.setItem('voiceNotes', JSON.stringify(this.notes));
    this.showSaveIndicator();
  }

  showSaveIndicator() {
    const indicator = document.getElementById('saveIndicator');
    if (!indicator) return;
    indicator.textContent = 'saving...';
    indicator.classList.remove('hidden', 'saved');
    indicator.classList.add('saving');
    
    setTimeout(() => {
      indicator.textContent = 'saved';
      indicator.classList.remove('saving');
      indicator.classList.add('saved');
      
      setTimeout(() => {
        indicator.classList.add('hidden');
      }, 2000);
    }, 300);
  }

  // ============ Event Listeners ============
  setupEventListeners() {
    document.getElementById('newNoteBtn').addEventListener('click', () => this.openModal());
    document.getElementById('saveNoteBtn').addEventListener('click', () => this.saveNote());
    document.getElementById('searchInput').addEventListener('input', (e) => this.searchNotes(e.target.value));
    document.getElementById('menuBtn').addEventListener('click', () => this.toggleMenu());
    document.getElementById('floatingMicBtn').addEventListener('click', () => this.toggleFloatingMic());
    document.getElementById('modalMicBtn').addEventListener('click', () => this.toggleRecording());
    
    // Install banner
    this.setupInstallPrompt();
  }

  toggleMenu() {
    const dropdown = document.getElementById('menuDropdown');
    dropdown.classList.toggle('hidden');
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-container')) {
        dropdown.classList.add('hidden');
      }
    });
  }

  setupInstallPrompt() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('installBanner').classList.remove('hidden');
      document.getElementById('installBtn').classList.remove('hidden');
      document.getElementById('bannerInstallBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          document.getElementById('installBanner').classList.add('hidden');
          document.getElementById('installedBadge').classList.remove('hidden');
        }
      });
      document.getElementById('installBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          document.getElementById('installBtn').classList.add('hidden');
          document.getElementById('installedBadge').classList.remove('hidden');
        }
      });
    });

    window.addEventListener('appinstalled', () => {
      document.getElementById('installBanner').classList.add('hidden');
      document.getElementById('installedBadge').classList.remove('hidden');
      this.showToast('✓ VoiceNotes installed successfully!');
    });
  }

  // ============ Color Picker ============
  setupColorPicker() {
    const picker = document.getElementById('colorPicker');
    Object.entries(this.colors).forEach(([color, name]) => {
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.style.backgroundColor = color;
      btn.style.borderColor = color;
      btn.style.opacity = color === this.currentColor ? '1' : '0.6';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentColor = color;
        this.setupColorPicker(); // Refresh
      });
      btn.title = name;
      picker.appendChild(btn);
    });
  }

  // ============ Modal Management ============
  openModal() {
    const modal = document.getElementById('newNoteModal');
    modal.classList.remove('hidden');
    document.getElementById('newTitle').value = '';
    document.getElementById('newContent').value = '';
    document.getElementById('newTag').value = '';
    document.getElementById('modalMicBtn').classList.remove('recording');
    this.audioChunks = [];
    this.isRecording = false;
  }

  closeModal(event) {
    if (event && event.target.id !== 'newNoteModal') return;
    document.getElementById('newNoteModal').classList.add('hidden');
    this.stopRecording();
  }

  // ============ Voice Recording ============
  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
          this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.currentAudioUrl = URL.createObjectURL(audioBlob);
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        document.getElementById('modalMicBtn').classList.add('recording');
        document.getElementById('waveformContainer').classList.remove('hidden');
        this.showWaveform();
        this.showToast('Recording... 🎙️');
      })
      .catch(err => {
        console.error('Microphone error:', err);
        this.showToast('Microphone access denied');
      });
  }

  stopRecording() {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    document.getElementById('modalMicBtn').classList.remove('recording');
    document.getElementById('waveformContainer').classList.add('hidden');
    this.showToast('Recording saved 🎉');
  }

  showWaveform() {
    const container = document.getElementById('waveformContainer');
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar recording';
      bar.style.animationDelay = `${i * 0.04}s`;
      container.appendChild(bar);
    }
  }

  // ============ Voice Recognition ============
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not available');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';\n      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      if (finalTranscript) {
        this.processVoiceCommand(finalTranscript.trim());
      }
    };

    this.recognition.onerror = (event) => {
      this.showToast('Microphone error: ' + event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };
  }

  processVoiceCommand(text) {
    const lowerText = text.toLowerCase();

    // Voice commands
    if (lowerText.includes('new note')) {
      this.openModal();
      this.showToast('New note opened 📝');
      return;
    }

    if (lowerText.includes('save')) {
      this.saveNote();
      this.showToast('Note saved ✓');
      return;
    }

    if (lowerText.includes('delete')) {
      this.showToast('Say which note to delete');
      return;
    }

    if (lowerText.includes('set title')) {
      const title = text.substring(text.indexOf('set title') + 9).trim();
      document.getElementById('newTitle').value = title;
      this.showToast('Title: ' + title);
      return;
    }

    if (lowerText.includes('add content') || lowerText.includes('set content')) {
      const content = text.substring(text.indexOf('content') + 7).trim();
      document.getElementById('newContent').value = content;
      this.showToast('Content added 📄');
      return;
    }

    if (lowerText.includes('add tag')) {
      const tag = text.substring(text.indexOf('tag') + 3).trim();
      document.getElementById('newTag').value = tag;
      this.showToast('Tag: ' + tag);
      return;
    }

    // Default: add to content
    const content = document.getElementById('newContent');
    content.value += (content.value ? ' ' : '') + text;
    this.showToast('Voice note added 🎤');
  }

  toggleFloatingMic() {
    if (!this.recognition) {
      this.showToast('Speech recognition not available');
      return;
    }

    if (this.isListening) {
      this.recognition.abort();
      this.isListening = false;
      document.getElementById('floatingMicBtn').classList.remove('recording');
    } else {
      this.recognition.start();
      document.getElementById('floatingMicBtn').classList.add('recording');
      this.showToast('Listening... say a command 🎙️');
    }
  }

  // ============ Notes Management ============
  saveNote() {
    const title = document.getElementById('newTitle').value.trim();
    const content = document.getElementById('newContent').value.trim();
    const tag = document.getElementById('newTag').value.trim();

    if (!title && !content && !this.currentAudioUrl) {
      this.showToast('Add some content to save');
      return;
    }

    const note = {
      id: Date.now().toString(),
      title: title || 'Untitled Note',
      content: content,
      tag: tag,
      color: this.currentColor,
      createdAt: new Date().toISOString(),
      audio: this.currentAudioUrl ? 'present' : null
    };

    this.notes.unshift(note);
    this.saveNotesToStorage();
    this.renderNotes();
    this.closeModal();
    this.showToast('Note saved! ✓');
    this.syncToNotion(note);
  }

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.saveNotesToStorage();
    this.renderNotes();
    this.showToast('Note deleted');
  }

  updateNote(id, title, content, tag, color) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.title = title || 'Untitled Note';
      note.content = content;
      note.tag = tag;
      note.color = color;
      this.saveNotesToStorage();
      this.renderNotes();
      this.showToast('Note updated ✓');
    }
  }

  // ============ Search ============
  searchNotes(query) {
    const container = document.getElementById('notesContainer');
    const filtered = this.notes.filter(note =>
      note.title.toLowerCase().includes(query.toLowerCase()) ||
      note.content.toLowerCase().includes(query.toLowerCase()) ||
      note.tag.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0 && query) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">🔍</div>
          <div class="empty-title">No notes found</div>
          <div class="empty-desc">Try a different search term</div>
        </div>
      `;
      return;
    }

    this.renderNotes(filtered);
  }

  // ============ Rendering ============
  renderNotes(notesToRender = null) {
    const container = document.getElementById('notesContainer');
    const notes = notesToRender || this.notes;

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">📝</div>
          <div class="empty-title">No notes yet</div>
          <div class="empty-desc">Create your first voice note to get started</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="notes-grid">${notes.map(note => this.renderNoteCard(note)).join('')}</div>`;

    // Attach event listeners
    notes.forEach(note => {
      const editBtn = container.querySelector(`[data-edit="${note.id}"]`);
      const deleteBtn = container.querySelector(`[data-delete="${note.id}"]`);
      const playBtn = container.querySelector(`[data-play="${note.id}"]`);

      if (editBtn) editBtn.addEventListener('click', () => this.editNote(note));
      if (deleteBtn) deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this note?')) this.deleteNote(note.id);
      });
      if (playBtn) playBtn.addEventListener('click', () => this.playAudio(note.id));
    });
  }

  renderNoteCard(note) {
    const colors = {
      '#0ea5e9': { bg: 'rgba(14, 165, 233, 0.08)', border: '#0ea5e9' },
      '#8b5cf6': { bg: 'rgba(139, 92, 246, 0.08)', border: '#8b5cf6' },
      '#ec4899': { bg: 'rgba(236, 72, 153, 0.08)', border: '#ec4899' },
      '#f59e0b': { bg: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b' },
      '#10b981': { bg: 'rgba(16, 185, 129, 0.08)', border: '#10b981' },
      '#6366f1': { bg: 'rgba(99, 102, 241, 0.08)', border: '#6366f1' }
    };

    const style = colors[note.color] || colors['#0ea5e9'];
    const date = new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <div class="note-card" style="background: ${style.bg}; border-color: ${style.border};">
        <div class="note-header">
          <div class="note-title-section">
            <h3 class="note-title">${this.escapeHtml(note.title)}</h3>
            <span class="note-date">${date}</span>
          </div>
          <div class="note-actions">
            ${note.audio ? `<button class="icon-btn mic" data-play="${note.id}" title="Play recording">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>` : ''}
            <button class="icon-btn" data-edit="${note.id}" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" data-delete="${note.id}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        ${note.content ? `<p class="note-content">${this.escapeHtml(note.content)}</p>` : ''}
        ${note.tag ? `<div class="note-tags"><span class="tag" style="border-color: ${style.border}; color: ${style.border};">#${this.escapeHtml(note.tag)}</span></div>` : ''}
      </div>
    `;
  }

  editNote(note) {
    document.getElementById('newTitle').value = note.title;
    document.getElementById('newContent').value = note.content;
    document.getElementById('newTag').value = note.tag;
    this.currentColor = note.color;
    this.currentEditingId = note.id;
    this.openModal();
    document.getElementById('saveNoteBtn').textContent = 'Update Note';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ Audio Playback ============
  playAudio(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note || !note.audio) return;

    // In a real app, you'd store audio data in IndexedDB
    // For now, we'll show a notification
    this.showToast('Playing audio... 🔊');
  }

  // ============ Notion Sync ============
  syncToNotion(note) {
    if (!this.notionConfig.apiKey || !this.notionConfig.databaseId) return;

    const payload = {
      parent: { database_id: this.notionConfig.databaseId },
      properties: {
        Title: { title: [{ text: { content: note.title } }] },
        Content: { rich_text: [{ text: { content: note.content } }] },
        Tags: { multi_select: note.tag ? [{ name: note.tag }] : [] },
        Color: { select: { name: this.colors[note.color] } }
      }
    };

    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.notionConfig.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(() => this.showToast('Synced to Notion ☁️'))
    .catch(err => console.error('Notion sync error:', err));
  }

  // ============ PWA Support ============
  setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }

  // ============ Utility ============
  showToast(message) {
    const toast = document.getElementById('statusToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }
}

// Global export functions for onclick handlers
window.closeModal = (event) => app.closeModal(event);
window.exportNotes = () => {
  const data = JSON.stringify(app.notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voicenotes-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
};

window.importNotes = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        app.notes = Array.isArray(data) ? data : [];
        app.saveNotesToStorage();
        app.renderNotes();
        app.showToast('Notes imported ✓');
      } catch (err) {
        app.showToast('Invalid file format');
      }
    };
    reader.readAsText(file);
  });
  input.click();
};

// Initialize app
const app = new VoiceNotesApp();
