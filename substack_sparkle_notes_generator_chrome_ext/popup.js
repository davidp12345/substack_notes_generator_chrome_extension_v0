// popup.js
// Discovered from substack repo:
// NOTE_COMPOSE_PATH = '/home'
// NOTE_PREFILL_PARAM = 'message'

const NOTE_COMPOSE_PATH = '/home';
const NOTE_PREFILL_PARAM = 'message';
class NotesGeneratorPopup {
  constructor() {
    this.candidates = [];
    this.expandedCandidates = new Set();
    this.init();
  }

  async init() {
    try {
      document.getElementById('generate-btn').addEventListener('click', () => {
        this.generateCandidates();
      });

      // Check if we're on a Substack post
      const tab = await this.getCurrentTab();
      console.log('Current tab URL:', tab.url);
      
      if (!tab.url.includes('substack.com') || !tab.url.includes('/p/')) {
        this.showError('Please navigate to a Substack post first');
        return;
      }
    } catch (error) {
      console.error('Init error:', error);
      this.showError('Extension initialization failed');
    }
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async generateCandidates() {
    this.showLoading();

    try {
      const tab = await this.getCurrentTab();
      console.log('Extracting content from:', tab.url);
      
      const postData = await this.extractPostContent(tab.id);
      console.log('Extracted post data:', postData);

      if (!postData.content || postData.content.length < 100) {
        throw new Error('Could not extract sufficient post content');
      }

      if (!postData.title) {
        throw new Error('Could not extract post title');
      }

      this.candidates = this.generateSimpleCandidates(postData);
      console.log('Generated candidates:', this.candidates);

      this.displayCandidates();

    } catch (error) {
      console.error('Error generating candidates:', error);
      this.showError(`Failed: ${error.message}`);
    }
  }

  async extractPostContent(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: () => {
          // Advanced content extraction with cleaning
          let title = '';
          let content = '';
          let cleanParagraphs = [];
          
          // Get title with multiple fallbacks
          const titleSelectors = [
            'h1[class*="post-title"]',
            'h1[class*="title"]', 
            '.post-header h1',
            'article h1',
            'h1'
          ];
          
          for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element?.textContent?.trim()) {
              title = element.textContent.trim();
              break;
            }
          }
          
          // Get clean content paragraphs
          const contentSelectors = [
            '.markup p',
            '.post-content p', 
            'article p',
            '.pencraft p'
          ];
          
          let foundParagraphs = [];
          for (const selector of contentSelectors) {
            const paragraphs = document.querySelectorAll(selector);
            if (paragraphs.length > 0) {
              foundParagraphs = Array.from(paragraphs);
              break;
            }
          }
          
          // Clean and filter paragraphs
          foundParagraphs.forEach(p => {
            let text = p.textContent?.trim();
            if (text && text.length > 50) {
              // Remove common UI elements
              if (!text.includes('Share this post') && 
                  !text.includes('Copy link') &&
                  !text.includes('Subscribe') &&
                  !text.includes('Leave a comment') &&
                  !text.match(/^(Like|Share|Comment)/) &&
                  !text.includes('Get ') &&
                  text.length < 1000) {
                cleanParagraphs.push(text);
              }
            }
          });
          
          content = cleanParagraphs.join('\n\n');
          
          // Fallback: try to get first few sentences from any text content
          if (!content || content.length < 100) {
            const allText = document.body.textContent || '';
            const sentences = allText.split(/[.!?]+/).filter(s => 
              s.trim().length > 30 && 
              !s.includes('Share this post') &&
              !s.includes('Copy link') &&
              !s.includes('Subscribe')
            );
            content = sentences.slice(0, 5).join('. ').trim();
          }
          
          return {
            title: title,
            content: content,
            paragraphs: cleanParagraphs,
            url: window.location.href
          };
        }
      });

      return results[0].result;
    } catch (error) {
      console.error('Content extraction error:', error);
      throw new Error('Failed to extract content from page');
    }
  }

  generateSimpleCandidates(postData) {
    const candidates = [];
    
    if (!postData.paragraphs || postData.paragraphs.length === 0) {
      throw new Error('No clean content paragraphs found');
    }
    
    // Helpers
    const sanitizeSectionText = (text) => {
      let t = (text || '').trim();
      // Remove leading artifacts like 'From "Note":' or 'Note:'
      t = t.replace(/^from\s+"?note"?\s*:\s*/i, '');
      t = t.replace(/^note\s*:\s*/i, '');
      // Remove leading 'From "<anything>":'
      t = t.replace(/^from\s+\"[^\"]+\"\s*:\s*/i, '');
      // Collapse whitespace
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    };

    // Extract sentences and paragraphs from actual content
    const allSentences = postData.paragraphs.join(' ').split(/[.!?]+/)
      .map(s => sanitizeSectionText(s))
      .filter(s => s.length > 20 && s.length < 400);
    
    const paragraphs = postData.paragraphs
      .map(p => sanitizeSectionText(p))
      .filter(p => p.length > 30);
    
    const finalizeNote = (raw) => {
      let text = sanitizeSectionText(raw || '');
      // Remove unmatched leading or trailing quotes
      const startsQuote = /^["“]/.test(text);
      const endsQuote = /["”]$/.test(text);
      if (startsQuote && !endsQuote) text = text.replace(/^["“]+/, '');
      if (!startsQuote && endsQuote) text = text.replace(/["”]+$/, '');
      // Ensure sentences end cleanly; cut at last sentence boundary <= 800
      const maxLen = 800;
      if (text.length > maxLen) {
        const slice = text.slice(0, 800);
        const lastBoundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastBoundary > 200) {
          text = slice.slice(0, lastBoundary + 1).trim();
        } else {
          text = slice.trim();
        }
      }
      // Ensure terminal punctuation
      if (!/[.!?]$/.test(text)) text += '.';
      return text;
    };

    // Helper function with flexible character limits (targeting 400-800 but allowing 200-800)
    const createCandidate = (type, content, score) => {
      const fullContent = finalizeNote(content);
      // Accept 250-800 characters to keep concise but self-contained
      if (fullContent.length >= 250 && fullContent.length <= 800) {
        return { type, content: fullContent, engagementScore: score };
      }
      return null;
    };
    
    // Create natural content combinations, ensure self-contained notes
    const contentPieces = [...paragraphs, ...allSentences];

    // Dedup helpers
    const normalize = (t) => sanitizeSectionText(t).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const seen = new Set();
    const usedLeadStarts = new Set();
    
    // Generate 10 different natural combinations
    for (let i = 0; i < 10 && contentPieces.length > 0; i++) {
      let noteContent = '';
      
      if (i < paragraphs.length) {
        // Use paragraph as main content
        noteContent = paragraphs[i];
        
        // If too short, add another sentence
        if (noteContent.length < 250 && allSentences.length > i) {
          noteContent += '\n\n' + allSentences[i];
        }
      } else if (i - paragraphs.length < allSentences.length) {
        // Use sentences
        const sentenceIndex = i - paragraphs.length;
        noteContent = allSentences[sentenceIndex];
        
        // Combine multiple sentences if needed
        if (noteContent.length < 250) {
          for (let j = 1; j <= 3; j++) {
            if (sentenceIndex + j < allSentences.length) {
              const nextSentence = allSentences[sentenceIndex + j];
              const normNext = normalize(nextSentence);
              if (!normalize(noteContent).includes(normNext) && (noteContent + ' ' + nextSentence).length < 700) {
                noteContent += ' ' + nextSentence;
              }
            }
          }
        }
      } else {
        // Fallback: use first paragraph with different formatting
        noteContent = paragraphs[0] || allSentences[0] || '';
      }
      
      // Remove any leftover 'From "Title":' prefixes in content
      noteContent = noteContent.replace(/^from\s+\"[^\"]+\"\s*:\s*/i, '');
      
      // Trim if too long (leaving room for URL)
      if (noteContent.length > 750) {
        noteContent = noteContent.substring(0, 747) + '...';
      }
      
      // Deduplicate
      const leadKey = normalize(noteContent.slice(0, 80));
      if (usedLeadStarts.has(leadKey)) {
        return; // skip duplicate lead
      }
      const norm = normalize(noteContent);
      if (seen.has(norm)) {
        return; // exact duplicate
      }

      const candidate = createCandidate(
        `note${i + 1}`, 
        noteContent, 
        95 - (i * 3)
      );
      
      if (candidate) {
        candidates.push(candidate);
        seen.add(norm);
        usedLeadStarts.add(leadKey);
      }
    }
    
    // Ensure we have at least a few candidates
    if (candidates.length === 0 && allSentences.length > 0) {
      // Emergency fallback: create simple candidates
      for (let i = 0; i < Math.min(3, allSentences.length); i++) {
        const simple = finalizeNote(allSentences[i] + ' ' + (allSentences[i + 1] || ''));
        const candidate = createCandidate(`fallback${i + 1}`, simple, 50 - i * 5);
        if (candidate) candidates.push(candidate);
      }
    }
    
    if (candidates.length === 0) {
      throw new Error('Could not create any candidates from the extracted content');
    }
    
    // Renumber sequentially to avoid missing NOTE1
    return candidates.slice(0, 10).map((c, idx) => ({ ...c, type: `note${idx + 1}` }));
  }

  displayCandidates() {
    const container = document.getElementById('candidates');
    container.innerHTML = '';

    this.candidates.forEach((candidate, index) => {
      const div = document.createElement('div');
      div.className = 'candidate-item';
      div.innerHTML = `
        <div class="candidate-header">
          <span class="candidate-type">${candidate.type.toUpperCase()}</span>
          <span class="candidate-score">Score: ${candidate.engagementScore}</span>
        </div>
        <div class="candidate-content">${this.formatContent(candidate.content, this.expandedCandidates.has(index))}</div>
        <div class="candidate-actions">
          <button class="see-more-btn" data-index="${index}">${this.expandedCandidates.has(index) ? 'See less' : 'See more'}</button>
          <button class="edit-btn" data-index="${index}">Edit in Notes</button>
        </div>
      `;
      container.appendChild(div);
    });

    // Add click handlers
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.openInNotesEditor(index);
      });
    });

    container.querySelectorAll('.see-more-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (this.expandedCandidates.has(index)) {
          this.expandedCandidates.delete(index);
        } else {
          this.expandedCandidates.add(index);
        }
        // Re-render just this item by re-calling display
        this.displayCandidates();
      });
    });

    this.showCandidates();
  }

  async openInNotesEditor(candidateIndex) {
    try {
      const candidate = this.candidates[candidateIndex];
      await this.openNoteEditorWithText(candidate.content);
      window.close();
      
    } catch (error) {
      console.error('Error opening notes editor:', error);
      this.showError('Failed to open notes editor');
    }
  }

  async openNoteEditorWithText(noteText) {
    try {
      // Always use the global reader host for composing notes
      const readerBase = 'https://substack.com';

      // Fallback: store pending text in case param prefill fails
      await chrome.storage.local.set({ pendingNoteText: noteText, pendingNoteTs: Date.now() });

      // Build compose URL using official prefill param
      const params = new URLSearchParams();
      params.set('action', 'compose');
      params.set(NOTE_PREFILL_PARAM, noteText);
      const composeUrl = `${readerBase}${NOTE_COMPOSE_PATH}?${params.toString()}`;

      console.log('[NotesExtension] Opening compose URL:', composeUrl);
      await chrome.tabs.create({ url: composeUrl });
    } catch (err) {
      console.error('openNoteEditorWithText error', err);
      throw err;
    }
  }

  formatContent(content, expanded = false) {
    const text = expanded ? content : (content.length > 150 ? content.substring(0, 150) + '...' : content);
    return text.replace(/\n/g, '<br>');
  }

  showLoading() {
    document.getElementById('generate-section').classList.add('hidden');
    document.getElementById('candidates').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
  }

  showCandidates() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('generate-section').classList.add('hidden');
    document.getElementById('candidates').classList.remove('hidden');
  }

  showError(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('candidates').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
    console.error('Extension error:', message);
  }
}

// Initialize
new NotesGeneratorPopup();