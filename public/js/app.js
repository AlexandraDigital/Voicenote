// VoiceNotes App - Complete functionality with voice commands, recording, and local storage
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

    this.colors = {
      '#0ea5e9': { label: 'Sky', bg: 'rgba(14, 165, 233, 0.08)', border: '#0ea5e9' },
      '#8b5cf6': { label: 'Purple', bg: 'rgba(139, 92, 246, 0.08)', border: '#8b5cf6' },
      '#ec4899': { label: 'Pink', bg: 'rgba(236, 72, 153, 0.08)', border: '#ec4899' },
      '#f59e0b': { label: 'Amber', bg: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b' },
      '#10b981': { label: 'Emerald', bg: 'rgba(16, 185, 129, 0.08)', border: '#10b981' },
      '#6366f1': { label: 'Indigo', bg: 'rgba(99, 102, 241, 0.08)', border: '#6366f1' }
    };

    this.init();
  }

  init() {
    this.setupSpeechRecognition();
    this.loadNotesFromStorage();
    this.setupEventListeners();
    this.renderNotes();
    this.setupColorPicker();
    this.setupPWA();
  }

  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI();
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.processVoiceCommand(transcript.toLowerCase());
        } else {
          interimTranscript += transcript;
        }
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateUI();
    };

    this.recognition.onerror = (event) => {
      console.error('Speech Recognition error:', event.error);
      this.isListening = false;
      this.updateUI();
    };
  }

  processVoiceCommand(command) {
    // Voice commands for note operations
    if (command.includes('new note')) {
      this.openNoteModal();
    } else if (command.includes('set title')) {
      const title = command.replace('set title', '').trim();
      if (title) {
        document.getElementById('noteTitle').value = title;
      }
    } else if (command.includes('set color')) {
      const colorName = command.replace('set color', '').trim();
      Object.entries(this.colors).forEach(([hex, data]) => {
        if (data.label.toLowerCase() === colorName) {
          this.currentColor = hex;
          this.updateUI();
        }
      });
    } else if (command.includes('add tag')) {
      const tag = command.replace('add tag', '').trim();
      if (tag) {
        const tagsInput = document.getElementById('noteTags');
        const currentTags = tagsInput.value ? tagsInput.value.split(',').map(t => t.trim()) : [];
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          tagsInput.value = currentTags.join(', ');
        }
      }
    } else if (command.includes('set content')) {
      const content = command.replace('set content', '').trim();
      if (content) {
        document.getElementById('noteContent').value = content;
      }
    } else if (command.includes('save')) {
      this.saveNote();
    } else if (command.includes('delete')) {
      if (this.currentEditingId) {
        this.deleteNote(this.currentEditingId);
      }
    }
  }

  setupEventListeners() {
    // FAB button - new note
    document.getElementById('fabBtn').addEventListener('click', () => this.openNoteModal());
    
    // Modal controls
    document.getElementById('closeModal').addEventListener('click', () => this.closeNoteModal());
    document.getElementById('saveNoteBtn').addEventListener('click', () => this.saveNote());
    
    // Voice buttons
    document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
    document.getElementById('voiceCommandBtn').addEventListener('click', () => this.toggleVoiceCommands());
    
    // Voice input buttons
    document.getElementById('voiceTitleBtn').addEventListener('click', () => this.voiceInputField('noteTitle'));
    document.getElementById('voiceContentBtn').addEventListener('click', () => this.voiceInputField('noteContent'));
    document.getElementById('voiceTagsBtn').addEventListener('click', () => this.voiceInputField('noteTags'));
    
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => this.filterNotes(e.target.value));
    
    // Close modal when clicking outside
    document.getElementById('noteModal').addEventListener('click', (e) => {
      if (e.target.id === 'noteModal') this.closeNoteModal();
    });
  }

  openNoteModal() {
    this.currentEditingId = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteTags').value = '';
    document.getElementById('audioRecording').innerHTML = '';
    this.currentColor = '#0ea5e9';
    this.audioChunks = [];
    document.getElementById('noteModal').style.display = 'flex';
  }

  closeNoteModal() {
    document.getElementById('noteModal').style.display = 'none';
    if (this.isRecording) this.toggleRecording();
  }

  saveNote() {
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const content = document.getElementById('noteContent').value.trim();
    const tags = document.getElementById('noteTags').value.split(',').map(t => t.trim()).filter(t => t);
    
    const audioData = this.audioChunks.length > 0 ? await this.getAudioDataURL() : null;

    const note = {
      id: this.currentEditingId || Date.now(),
      title,
      content,
      tags,
      color: this.currentColor,
      audio: audioData,
      created: this.currentEditingId ? null : new Date().toISOString(),
      updated: new Date().toISOString()
    };

    if (this.currentEditingId) {
      const index = this.notes.findIndex(n => n.id === this.currentEditingId);
      if (index !== -1) {
        this.notes[index] = { ...this.notes[index], ...note };
      }
    } else {
      this.notes.push(note);
    }

    this.saveNotesToStorage();
    this.renderNotes();
    this.closeNoteModal();
  }

  async getAudioDataURL() {
    return new Promise((resolve) => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(audioBlob);
    });
  }

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.saveNotesToStorage();
    this.renderNotes();
    this.closeNoteModal();
  }

  toggleRecording() {
    if (!this.isRecording) {
      this.startRecording();
    } else {
      this.stopRecording();
    }
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        this.audioChunks.push(e.data);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      document.getElementById('recordBtn').textContent = '⏹ Stop Recording';
      document.getElementById('recordBtn').style.backgroundColor = '#ef4444';
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audioPlayer = document.createElement('div');
        audioPlayer.innerHTML = `
          <div style="margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px;">
            <audio controls style="width: 100%; height: 30px;">
              <source src="${audioUrl}" type="audio/wav">
            </audio>
          </div>
        `;
        document.getElementById('audioRecording').innerHTML = audioPlayer.innerHTML;
      };
      
      this.isRecording = false;
      document.getElementById('recordBtn').textContent = '🎙️ Record Voice Note';
      document.getElementById('recordBtn').style.backgroundColor = '';
    }
  }

  toggleVoiceCommands() {
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
    }
  }

  voiceInputField(fieldId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition not supported in your browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }

      const field = document.getElementById(fieldId);
      if (fieldId === 'noteTags') {
        const currentTags = field.value ? field.value.split(',').map(t => t.trim()) : [];
        const newTags = finalTranscript.split(',').map(t => t.trim()).filter(t => t);
        field.value = [...currentTags, ...newTags].join(', ');
      } else {
        field.value += (field.value ? ' ' : '') + finalTranscript;
      }
    };

    recognition.onerror = (event) => {
      console.error('Voice input error:', event.error);
    };

    recognition.start();
  }

  filterNotes(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = this.notes.filter(note => 
      note.title.toLowerCase().includes(term) ||
      note.content.toLowerCase().includes(term) ||
      note.tags.some(tag => tag.toLowerCase().includes(term))
    );
    this.renderNotes(filtered);
  }

  renderNotes(notesToRender = this.notes) {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';

    notesToRender.forEach(note => {
      const colorData = this.colors[note.color];
      const noteCard = document.createElement('div');
      noteCard.className = 'note-card';
      noteCard.style.borderColor = note.color;
      noteCard.style.backgroundColor = colorData.bg;

      const tagsHTML = note.tags.length > 0 
        ? `<div class="tags">${note.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`
        : '';

      const audioHTML = note.audio 
        ? `<audio controls style="width: 100%; margin: 8px 0; height: 28px;"><source src="${note.audio}" type="audio/wav"></audio>`
        : '';

      const timeago = this.getTimeAgo(note.updated);

      noteCard.innerHTML = `
        <div class="note-header">
          <h3>${note.title}</h3>
          <span class="color-badge" style="background: ${note.color};"></span>
        </div>
        <p class="note-preview">${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>
        ${audioHTML}
        ${tagsHTML}
        <div class="note-footer">
          <span class="time">${timeago}</span>
          <button class="delete-btn" onclick="app.deleteNote(${note.id})">Delete</button>
        </div>
      `;

      noteCard.addEventListener('click', () => this.editNote(note));
      container.appendChild(noteCard);
    });

    if (notesToRender.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No notes yet. Click + to create one!</div>';
    }
  }

  editNote(note) {
    this.currentEditingId = note.id;
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    document.getElementById('noteTags').value = note.tags.join(', ');
    this.currentColor = note.color;
    
    if (note.audio) {
      document.getElementById('audioRecording').innerHTML = `
        <div style="margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px;">
          <audio controls style="width: 100%; height: 30px;">
            <source src="${note.audio}" type="audio/wav">
          </audio>
        </div>
      `;
    }
    
    document.getElementById('noteModal').style.display = 'flex';
  }

  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  saveNotesToStorage() {
    localStorage.setItem('voiceNotes', JSON.stringify(this.notes));
  }

  loadNotesFromStorage() {
    const stored = localStorage.getItem('voiceNotes');
    this.notes = stored ? JSON.parse(stored) : [];
  }

  setupColorPicker() {
    const colorPicker = document.getElementById('colorPicker');
    Object.entries(this.colors).forEach(([hex, data]) => {
      const btn = document.createElement('button');
      btn.className = 'color-option';
      btn.style.backgroundColor = hex;
      btn.addEventListener('click', () => {
        this.currentColor = hex;
        this.setupColorPicker();
      });
      if (hex === this.currentColor) btn.classList.add('active');
      colorPicker.appendChild(btn);
    });
  }

  setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('Service Worker registration failed:', err);
      });
    }
  }

  updateUI() {
    const btn = document.getElementById('voiceCommandBtn');
    if (this.isListening) {
      btn.style.backgroundColor = '#ef4444';
      btn.textContent = '🎤 Listening...';
    } else {
      btn.style.backgroundColor = '';
      btn.textContent = '🎤 Voice Commands';
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceNotesApp();
});