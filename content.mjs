export const guides = [
  { title: 'Keep marks with the letter', text: 'Marks are part of the text. When you search, copy, compare, or replace, use the exact character sequence you see. The workspace search treats those sequences literally.', action: 'Search exact text', route: 'search' },
  { title: 'Use a document as a safe working copy', text: 'Create a named document for each working text. Changes are saved in this browser after a successful write. Export a text file or workspace file whenever you need a portable copy.', action: 'Open the writer', route: 'write' },
  { title: 'Compare before replacing', text: 'Place the earlier text in Text Lab, then make a revision and compare the two versions. The comparison lists inserted and removed text without explaining or changing it.', action: 'Open Text Lab', route: 'lab' },
  { title: 'Find recurring passages', text: 'Search looks through every active local document and shows a short surrounding excerpt with its line number. Select a result to open that document at the matching text.', action: 'Search workspace', route: 'search' }
];

export const keyboardRows = [
  ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'],
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL'],
  ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM'],
  ['BracketLeft','BracketRight','Semicolon','Comma','Period','Slash']
];
