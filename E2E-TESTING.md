# E2E Testing Checklist — MercurBot

## Critical Path

### 1. PDF Upload & Processing
- [ ] Upload a text PDF (not scanned)
- [ ] Processing status shows in correct locale
- [ ] Robot mascot animates during processing
- [ ] Briefing card appears after processing
- [ ] Chat becomes active after processing

### 2. Chat Interaction
- [ ] Type a question and get a response
- [ ] Response cites pages with [Page N] or [Pág. N]
- [ ] Citations are clickable and navigate to correct page
- [ ] Copy response button works
- [ ] Download markdown button works
- [ ] Clear chat button works

### 3. Voice Features
- [ ] Dictation button activates microphone
- [ ] Speech is transcribed to text
- [ ] TTS reads responses aloud
- [ ] Mute/unmute button works
- [ ] Stop audio button works

### 4. PDF Viewer
- [ ] PDF renders correctly
- [ ] Page navigation works (prev/next)
- [ ] Search within PDF works
- [ ] Page citations highlight text
- [ ] Hide panel button works

### 5. Chart Generation
- [ ] Generate chart button appears when document loaded
- [ ] Chart confirmation dialog shows
- [ ] Chart generates with verified data
- [ ] Chart discarded message shows when data not verified

### 6. Sidebar
- [ ] New analysis button works
- [ ] Upload button works
- [ ] Recents library shows previous documents
- [ ] Remove document from library works
- [ ] Customize robot button works

### 7. Onboarding
- [ ] First-time user sees onboarding tour
- [ ] User name and robot name can be set
- [ ] Robot customization saves

## Edge Cases

### Scanned PDF
- [ ] Upload a scanned PDF (images only)
- [ ] Error message shows in correct locale
- [ ] Suggestion to use OCR appears

### Password-Protected PDF
- [ ] Upload a password-protected PDF
- [ ] Error message shows in correct locale

### Large Document
- [ ] Upload a PDF with 50+ pages
- [ ] Processing completes without timeout
- [ ] Chart generation works with large document

### Network Errors
- [ ] Disconnect network during chat
- [ ] Error message shows in correct locale
- [ ] Retry button works

## Cross-Browser

### Chrome
- [ ] All features work

### Firefox
- [ ] Dictation shows "not available" message
- [ ] Other features work

### Safari
- [ ] All features work

### Edge
- [ ] All features work

## Mobile

### iOS Safari
- [ ] Touch interactions work
- [ ] PDF viewer scrollable
- [ ] Chat input accessible

### Android Chrome
- [ ] Touch interactions work
- [ ] PDF viewer scrollable
- [ ] Chat input accessible

## Performance

### Initial Load
- [ ] Landing page loads in < 3 seconds
- [ ] No layout shift

### PDF Processing
- [ ] Processing status updates smoothly
- [ ] No UI freezes during processing

### Chat
- [ ] Responses stream smoothly
- [ ] No lag when typing
