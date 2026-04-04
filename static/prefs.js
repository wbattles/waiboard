// apply saved display preferences on page load
(function() {
  var font = localStorage.getItem('waiboard-font');
  if (font) document.body.style.fontFamily = font;

  var mode = localStorage.getItem('waiboard-mode');
  if (mode === 'dark') document.body.classList.add('dark');
})();
