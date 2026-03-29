# 🍳 ReceptBox

Persoonlijke PWA voor receptbeheer — zoeken, uploaden, en maaltijdroulette.

## Features
- 🔍 Zoeken op naam, ingrediënt, tag, categorie
- 🎰 Maaltijdroulette met categorie-filter
- 📤 Upload PDF, DOCX of foto → tekst automatisch geëxtraheerd
- ✏️ Handmatig recepten toevoegen & bewerken
- 📱 PWA — installeerbaar op telefoon
- 🌐 Offline-support via service worker

## Stack
- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Frontend**: Vanilla JS, Playfair Display + Nunito fonts
- **Container**: Docker (amd64)

## Lokaal draaien (ontwikkeling)

```bash
cd backend
npm install
node server.js
```

Open http://localhost:3000

## Synology deployment

### 1. Mappen aanmaken op NAS
```bash
mkdir -p /volume1/docker/recept/data
mkdir -p /volume1/docker/recept/uploads
```

### 2. docker-compose.yml kopiëren
Kopieer `docker-compose.yml` naar `/volume1/docker/recept/` op je NAS.

### 3. Opstarten via Portainer of SSH
```bash
cd /volume1/docker/recept
docker-compose pull
docker-compose up -d
```

App is bereikbaar op `http://NAS-IP:3456`

### 4. Nginx Proxy Manager (optioneel)
Voeg een Proxy Host toe:
- **Forward Hostname**: receptbox (container naam)
- **Forward Port**: 3000
- **Domain**: recept.jouwdomein.be

## GitHub Actions CI/CD
Bij elke push naar `main` wordt automatisch een Docker image gebouwd en gepushed naar `ghcr.io/bigbuud/recept:latest`.

Na een nieuwe push, update je de container op de NAS met:
```bash
docker-compose pull && docker-compose up -d
```

## Categorieën
🥐 Ontbijt · 🥗 Lunch · 🍝 Diner · 🧁 Snack · 🍰 Dessert · 🍲 Soep · 🥦 Vegetarisch · 🍽️ Algemeen
