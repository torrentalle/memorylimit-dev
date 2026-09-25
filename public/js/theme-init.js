// Applies the saved theme before first paint. Loaded as a render-blocking
// classic script in <head> (an external file rather than inline, so the CSP
// needs no 'unsafe-inline' for scripts). The toggle itself lives in theme.js,
// which uses the same storage key.
{
  try {
    const theme = localStorage.getItem('memorylimit-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}
