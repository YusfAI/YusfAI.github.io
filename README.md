# yusfai.github.io

Mon portfolio, en ligne sur **https://yusfai.github.io**.

Un site statique (HTML, CSS et un peu de JavaScript, sans étape de build), en français, avec un assistant qui répond aux questions des recruteurs.

## Structure

```
index.html          la page
assets/style.css    styles (thème clair et sombre)
assets/site.js      filtre des projets, copie de l'email
assets/chatbot.js   l'assistant (moteur de recherche + interface)
assets/img/         captures d'écran des projets
knowledge.json      la fiche de faits : seule source de l'assistant
tests/              tests de l'assistant
og.png              image d'aperçu des liens
```

## L'assistant

Le chat s'appelle Youssef et répond **à la première personne**, comme si je répondais moi-même au recruteur. Il **n'utilise pas d'IA générative** et n'a besoin d'aucune clé d'API : il compare la question aux mots-clés de `knowledge.json` et affiche, mot pour mot, la réponse que j'ai rédigée. Écrivez donc les réponses avec « je ». Les demandes clairement hors sujet (`offtopicTerms` : traduire, poème, blague…) sont refusées directement.

- Question sur Youssef présente dans la fiche → la réponse validée
- Question sur Youssef absente de la fiche → « je n'ai pas cette information » + coordonnées
- Question hors sujet → refus poli

Pour ajouter ou corriger un fait : modifiez `answer` dans l'entrée concernée de `knowledge.json`, ou ajoutez une entrée avec des mots-clés (`key` = 5 points, `strong` = 3, `medium` = 2, `weak` = 1 ; il faut au moins 2 points pour répondre). Puis lancez les tests :

```bash
node tests/chatbot.test.js
```

## En local

`knowledge.json` est chargé avec `fetch`, il faut donc un petit serveur (ouvrir le fichier directement ne suffit pas) :

```bash
python -m http.server 8000
```

puis ouvrez http://localhost:8000.

## Publier

Poussez sur `main` : GitHub Pages republie en une minute environ. Après une modification de CSS ou de JS, augmentez le `?v=` dans `index.html` pour que les navigateurs prennent la nouvelle version.
