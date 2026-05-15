// VoiceNote App - Main Application Logic

class VoiceNote {
  constructor() {
    this.notes = [];
    this.currentColor = 'yellow';
    this.currentTags = [];
    this.init();
  }

  init() {
    this.loadNotes();
    this.setupEventListeners();
    this.renderNotes();
  }

  setupEventListeners() {
    document.getElementById('recordBtn').addEventListener('click', () => this.startRecording());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());
    document.getElementById('addNoteBtn').addEventListener('click', () => this.addNote());
    document.getElementById('colorPicker').addEventListener('change', (e) => this.currentColor = e.target.value);
    document.getElementById('tagInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const tag = e.target.value.trim();
        if (tag) {
          this.currentTags.push(tag);
          e.target.value = '';
          this.renderTagsList();
        }
      }
    });
    document.getElementById('syncBtn').addEventListener('click', () => this.syncWithNotion());
    document.getElementById('importBtn').addEventListener('click', () => this.importNotesFromNotion());
  }

  startRecording() {
    // Recording logic
    console.log('Recording started');
  }

  stopRecording() {
    // Stop recording logic
    console.log('Recording stopped');
  }

  addNote() {
    const titleInput = document.getElementById('noteTitle');
    const contentInput = document.getElementById('noteContent');
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (title && content) {
      const note = {
        id: Date.now().toString(),
        title,
        content,
        color: this.currentColor,
        tags: [...this.currentTags],
        created: new Date().toISOString(),
      };

      this.notes.push(note);
      this.saveNotes();
      this.renderNotes();
      this.resetForm();
    }
  }

  deleteNote(noteId) {
    this.notes = this.notes.filter(note => note.id !== noteId);
    this.saveNotes();
    this.renderNotes();
  }

  saveNotes() {
    localStorage.setItem('voiceNotes', JSON.stringify(this.notes));
  }

  loadNotes() {
    const saved = localStorage.getItem('voiceNotes');
    this.notes = saved ? JSON.parse(saved) : [];
  }

  renderNotes() {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';

    this.notes.forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = `note-card ${note.color}`;
      noteEl.innerHTML = `
        <h3>${this.escapeHtml(note.title)}</h3>
        <p>${this.escapeHtml(note.content)}</p>
        <div class="tags">${note.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}</div>
        <button onclick="app.deleteNote('${note.id}')">Delete</button>
      `;
      container.appendChild(noteEl);
    });
  }

  renderTagsList() {
    const tagsList = document.getElementById('tagsList');
    tagsList.innerHTML = this.currentTags.map((tag, idx) => 
      `<span class="tag-badge">${this.escapeHtml(tag)} <button onclick="app.removeTag(${idx})">x</button></span>`
    ).join('');
  }

  removeTag(index) {
    this.currentTags.splice(index, 1);
    this.renderTagsList();
  }

  resetForm() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('colorPicker').value = 'yellow';
    this.currentColor = 'yellow';
    this.currentTags = [];
    this.renderTagsList();
  }

  async syncWithNotion() {
    try {
      const response = await fetch('https://voicenote-worker.futuresuccess105.workers.dev/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.notes),
      });

      if (response.ok) {
        const results = await response.json();
        alert(`Synced ${results.filter(r => r.success).length} notes to Notion! ✅`);
      } else {
        alert('Sync failed. Please check your Worker configuration.');
      }
    } catch (error) {
      alert(`Sync error: ${error.message}`);
    }
  }

  async importNotesFromNotion() {
    try {
      const response = await fetch('https://voicenote-worker.futuresuccess105.workers.dev/sync', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const notesFromNotion = await response.json();
        this.notes = notesFromNotion;
        this.saveNotes();
        this.renderNotes();
        alert(`Imported ${notesFromNotion.length} notes from Notion! ✅`);
      } else {
        alert('Import failed. Please check your Worker configuration.');
      }
    } catch (error) {
      alert(`Import error: ${error.message}`);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new VoiceNote();
});