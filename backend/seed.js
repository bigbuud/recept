// seed.js — run eenmalig om voorbeeldrecepten toe te voegen
// Gebruik: node seed.js
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || '/data/recept.db';
const db = new Database(DB_PATH);

const recipes = [
  {
    title: 'Gegratineerde witloof met hesp',
    description: 'Een Belgische klassieker: witloof gebakken in de oven met hesp en kaassaus.',
    category: 'belgisch',
    tags: ['belgisch', 'klassieker', 'oven'],
    ingredients: ['4 stronkjes witloof', '4 sneetjes gekookte hesp', '30g boter', '30g bloem', '500ml melk', '100g geraspte kaas (Gruyère)', 'Nootmuskaat, peper, zout'],
    instructions: 'Stap 1: Kook het witloof 10 min in gezouten water. Laat uitlekken en dep droog.\nStap 2: Wikkel elk stronkje in een sneetje hesp en leg in een ingevette ovenschaal.\nStap 3: Maak een bechamelsaus: smelt boter, voeg bloem toe, giet melk al roerend erbij. Kruid met nootmuskaat, peper en zout.\nStap 4: Giet de saus over het witloof. Bestrooi met geraspte kaas.\nStap 5: Gratineer 20 min op 200°C.',
    prep_time: 15, cook_time: 30, servings: 4
  },
  {
    title: 'Vlaamse stoofkarbonades',
    description: 'Het ultieme Vlaamse stoofgerecht met Belgisch bier.',
    category: 'belgisch',
    tags: ['belgisch', 'stoofpot', 'bier', 'vlees'],
    ingredients: ['800g runderkarbonade (in stukken)', '2 uien', '2 el bruin suiker', '1 fles Trappistenbier (33cl)', '2 el mosterd', '2 sneetjes brood', 'Tijm, laurier, peper, zout', 'Boter om te bakken'],
    instructions: 'Stap 1: Bak het vlees bruin in boter. Haal uit de pan.\nStap 2: Fruit de uien glazig. Voeg bruine suiker toe en laat karameliseren.\nStap 3: Leg het vlees terug. Giet het bier erbij. Voeg tijm en laurier toe.\nStap 4: Bestrijk het brood met mosterd en leg dit op het vlees.\nStap 5: Laat 2 uur sudderen op laag vuur. Brood lost op en bindt de saus.',
    prep_time: 20, cook_time: 120, servings: 4
  },
  {
    title: 'Moules-frites',
    description: 'Mosselen op zijn Belgisch — met friet uiteraard!',
    category: 'belgisch',
    tags: ['belgisch', 'mosselen', 'zeevruchten', 'zomer'],
    ingredients: ['2 kg mosselen', '2 uien', '2 stengels selder', '1 glas witte wijn', '100ml room', 'Peterselie', 'Boter', 'Frieten en mayonaise'],
    instructions: 'Stap 1: Was de mosselen grondig.\nStap 2: Fruit ui en selder in boter.\nStap 3: Voeg witte wijn toe, breng aan de kook.\nStap 4: Voeg mosselen toe, dek af en stoom 5-7 min tot ze open zijn.\nStap 5: Roer de room erdoor, strooi peterselie. Serveer met friet.',
    prep_time: 15, cook_time: 15, servings: 2
  },
  {
    title: 'Tomatensoep met balletjes',
    description: 'Klassieke Belgische tomatensoep met gehaktballetjes.',
    category: 'soep',
    tags: ['soep', 'belgisch', 'klassiek'],
    ingredients: ['1 blik gepelde tomaten (400g)', '2 uien', '2 wortelen', '1 l bouillon', '200g gehakt', '1 ei', 'Paneermeel', 'Kervel, peper, zout'],
    instructions: 'Stap 1: Maak balletjes van gehakt, ei, paneermeel, peper en zout.\nStap 2: Fruit ui en wortel. Voeg tomaten en bouillon toe. Kook 20 min.\nStap 3: Mix de soep glad. Breng op smaak.\nStap 4: Pocheer de balletjes 8 min in de soep.\nStap 5: Bestrooi met verse kervel.',
    prep_time: 20, cook_time: 30, servings: 4
  },
  {
    title: 'Pasta Carbonara',
    description: 'Authentieke Italiaanse carbonara — zonder room!',
    category: 'pasta',
    tags: ['pasta', 'italiaans', 'snel'],
    ingredients: ['400g spaghetti', '150g pancetta of spek', '4 eigelen', '1 heel ei', '80g Pecorino Romano (geraspt)', 'Zwarte peper', 'Zout'],
    instructions: 'Stap 1: Kook spaghetti al dente, bewaar 1 kop kookwater.\nStap 2: Bak spek krokant in een droge pan.\nStap 3: Klop eigelen, ei en kaas samen met veel peper.\nStap 4: Haal de pan van het vuur. Voeg pasta toe, dan het eiermengsel. Roer snel.\nStap 5: Voeg beetje bij beetje kookwater toe voor een romige saus.',
    prep_time: 10, cook_time: 15, servings: 4
  },
  {
    title: 'Thaise groene curry',
    description: 'Pittige en aromatische Thaise curry met kokosmelk.',
    category: 'internationaal',
    tags: ['thais', 'curry', 'pittig', 'internationaal'],
    ingredients: ['400ml kokosmelk', '2 el groene currypasta', '400g kipfilet (in stukken)', '1 courgette', '100g erwtjes', 'Thaise basilicum', '1 limoen', 'Vissaus', 'Jasmijnrijst'],
    instructions: 'Stap 1: Verhit een deel van de kokosmelk in de wok.\nStap 2: Bak de currypasta 1 min mee.\nStap 3: Voeg kip toe en bak gaar.\nStap 4: Giet de rest van de kokosmelk erbij met groenten.\nStap 5: Breng op smaak met vissaus en limoen. Garneer met basilicum.',
    prep_time: 15, cook_time: 20, servings: 4
  },
  {
    title: 'Croque Monsieur',
    description: 'De Belgisch-Franse klassieker als snelle lunch.',
    category: 'lunch',
    tags: ['lunch', 'snel', 'belgisch', 'brood'],
    ingredients: ['4 sneetjes witbrood', '4 sneetjes hesp', '100g geraspte kaas', '20g boter', '1 el bloem', '200ml melk', 'Mosterd, nootmuskaat'],
    instructions: 'Stap 1: Maak een snelle bechamelsaus met boter, bloem en melk.\nStap 2: Besmeer brood met mosterd. Beleg met hesp en kaas.\nStap 3: Lepel wat bechamel over de bovenkant. Bestrooi met extra kaas.\nStap 4: Gratineer 5-8 min onder de grill.',
    prep_time: 10, cook_time: 10, servings: 2
  },
  {
    title: 'Dame Blanche',
    description: 'Hét Belgische ijsdessert: vanille-ijs met warme chocoladesaus.',
    category: 'dessert',
    tags: ['dessert', 'belgisch', 'ijs', 'chocolade'],
    ingredients: ['4 bollen vanille-ijs', '150g pure chocolade', '100ml slagroom', '1 el boter', 'Slagroom (uit spuitbus)', 'Amandelschaafsel'],
    instructions: 'Stap 1: Smelt chocolade met room au bain-marie. Roer boter erdoor.\nStap 2: Verwarm de saus op laag vuur tot glanzend.\nStap 3: Schep ijs in coupes.\nStap 4: Giet warme chocoladesaus erover.\nStap 5: Werk af met slagroom en amandelschaafsel.',
    prep_time: 5, cook_time: 10, servings: 4
  }
];

const stmt = db.prepare(`
  INSERT OR IGNORE INTO recipes (id, title, description, category, tags, ingredients, instructions, prep_time, cook_time, servings)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((items) => {
  for (const r of items) {
    stmt.run(
      uuidv4(), r.title, r.description, r.category,
      JSON.stringify(r.tags), JSON.stringify(r.ingredients),
      r.instructions, r.prep_time, r.cook_time, r.servings
    );
  }
});

insertMany(recipes);
console.log(`✅ ${recipes.length} voorbeeldrecepten toegevoegd.`);
db.close();
