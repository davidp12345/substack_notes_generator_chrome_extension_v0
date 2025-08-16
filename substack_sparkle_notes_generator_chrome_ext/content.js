// content.js
(function() {
  'use strict';
  
  const url = new URL(window.location.href);
  const isNotesNew = url.pathname.includes('/notes') && (url.pathname.includes('/new') || url.search.includes('compose'));
  const isFeedCompose = url.pathname.startsWith('/home') && url.searchParams.get('action') === 'compose';
  
  // Run on official compose path (/home?action=compose) or legacy (/notes/new)
  if (isNotesNew || isFeedCompose) {
    
    console.log('Notes composer detected, checking for stored content...');
    
    // Wait for page to load
    setTimeout(async () => {
      try {
        const result = await chrome.storage.local.get(['generatedNoteContent', 'timestamp', 'pendingNoteText', 'pendingNoteTs']);
        
        const now = Date.now();
        const hasLegacy = result.generatedNoteContent && result.timestamp && (now - result.timestamp) < 5 * 60 * 1000;
        const hasPending = result.pendingNoteText && result.pendingNoteTs && (now - result.pendingNoteTs) < 5 * 60 * 1000;

        const contentToUse = hasLegacy ? result.generatedNoteContent : (hasPending ? result.pendingNoteText : null);

        if (contentToUse) {
          console.log('Found stored note content, populating editor...');
          populateEditor(contentToUse);
          chrome.storage.local.remove(['generatedNoteContent', 'timestamp', 'pendingNoteText', 'pendingNoteTs']);
        }
      } catch (error) {
        console.error('Error checking stored content:', error);
      }
    }, 2000);
  }

  function populateEditor(content) {
    // Try multiple approaches to populate the editor
    
    // Method 1: Find contenteditable element
    const contentEditable = document.querySelector('[contenteditable="true"]');
    if (contentEditable) {
      contentEditable.innerHTML = content.replace(/\n/g, '<br>');
      contentEditable.focus();
      console.log('Content populated via contenteditable');
      return;
    }

    // Method 2: Find textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = content;
      textarea.focus();
      console.log('Content populated via textarea');
      return;
    }

    // Method 3: Wait longer and try again
    setTimeout(() => {
      const editor = document.querySelector('[contenteditable="true"]') || 
                    document.querySelector('textarea') ||
                    document.querySelector('.ProseMirror');
      
      if (editor) {
        if (editor.tagName === 'TEXTAREA') {
          editor.value = content;
        } else {
          editor.innerHTML = content.replace(/\n/g, '<br>');
        }
        editor.focus();
        console.log('Content populated via delayed attempt');
      } else {
        console.log('Could not find editor element');
      }
    }, 3000);
  }
})();