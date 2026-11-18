/* Filtre des projets et copie de l'adresse email. */
(function () {
  'use strict';

  var cards = Array.prototype.slice.call(document.querySelectorAll('.project'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.filters .chip'));
  var status = document.getElementById('filter-status');
  var labels = {
    bi: 'Data & BI',
    ml: 'Machine learning & IA',
    web: 'applications full-stack',
    real: 'projets utilisés par de vraies personnes'
  };

  function show(key) {
    var shown = 0;
    cards.forEach(function (c) {
      var hit = !key || c.dataset.tags.split(' ').indexOf(key) !== -1;
      c.hidden = !hit;
      if (hit) shown++;
    });
    chips.forEach(function (ch) { ch.setAttribute('aria-pressed', String((ch.dataset.filter || '') === key)); });
    status.textContent = key
      ? shown + ' projet' + (shown > 1 ? 's' : '') + ' · ' + labels[key]
      : 'Les ' + cards.length + ' projets';
  }

  chips.forEach(function (ch) {
    ch.addEventListener('click', function () { show(ch.dataset.filter || ''); });
  });
  show('');

  var copyBtn = document.getElementById('copy-email');
  var copied = document.getElementById('copied');
  copyBtn.addEventListener('click', function () {
    var email = 'youssefhmidi17pro@gmail.com';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(
        function () { copied.textContent = 'Adresse copiée.'; },
        function () { copied.textContent = 'Copie bloquée ici : sélectionnez l\'adresse ci-dessus.'; }
      );
    } else {
      copied.textContent = 'Copie bloquée ici : sélectionnez l\'adresse ci-dessus.';
    }
  });
})();
