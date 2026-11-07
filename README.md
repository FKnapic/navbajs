# NavBajs

Navigacija biciklom po Zagrebu. Aplikacija vodi pješice do Bajs stanice, Bajsom do stanice uz odredište i opet pješice, ili vlastitim biciklom do javnog parkirališta. Sučelje je na hrvatskom, radi kao PWA i jednako je upotrebljivo na telefonu i na računalu.

## Arhitektura

Preglednik drži kartu (MapLibre GL JS, OpenFreeMap) i stanje rute. Algoritam je u `src/routing/planner.ts`, a Valhalla je iza sučelja `RoutingProvider` (`src/routing/ValhallaRoutingProvider.ts`). URL poslužitelja je `VITE_VALHALLA_URL`. Ako izravni poziv ne uspije, klijent proba isti zahtjev preko `/api/valhalla`, gdje upstream određuje runtime varijabla `VALHALLA_URL`.

Bajs stanice dolaze iz Nextbike live JSON-a. Proxy `GET /api/bajs` drži odgovor 30 sekundi i klijent ga traži otprilike svakih 40 sekundi. Ako proxy nije podignut, preglednik zove Nextbike izravno (CORS je otvoren). Broj na markeru je `bikes_available_to_rent`. Slobodno mjesto za povrat je `free_racks`.

Javna parkirališta i biciklističke staze skinuti su s data.gov.hr (Grad Zagreb, Otvorena dozvola) i leže u `public/data/`. Parkirališta su GeoJSON u CRS84. Staze dolaze s ArcGIS FeatureServera jer CKAN download trenutno vraća grešku. OpenStreetMap oznake `amenity=bicycle_parking` su dopuna; točke bliže od 15 m spajaju se s gradskim zapisom. Udio rute na stazama računa Turf.js (uzorak svakih 30 m, pogod u radijusu 20 m).

`server/app.ts` je Hono aplikacija. `server/node.ts` je lokalni API, a u produkciji poslužuje i `dist`. Isti API ide na Cloudflare Worker (`worker/index.ts`) i na Vercel (`api/[...path].ts`).

## Pokretanje

Potrebni su Node.js 20+ i npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Otvori [http://localhost:5173](http://localhost:5173). API sluša na portu 8787, a Vite ga prosljeđuje na `/api`.

Osvježavanje otvorenih podataka (nije nužno za prvi start, datoteke su već u `public/data/`):

```bash
npm run fetch-data
```

Provjera algoritma bez preglednika:

```bash
npm run smoke
SMOKE_LIVE=1 npm run smoke
```

Produkcijski Node poslužitelj (statički build i API na istom portu):

```bash
npm run build
npm start
```

Otvori [http://localhost:8787](http://localhost:8787).

## Varijable okoline

| Varijabla | Tko je čita | Značenje |
| --- | --- | --- |
| `VITE_VALHALLA_URL` | klijent, u trenutku `npm run build` | izravni Valhalla URL ili `/api/valhalla` |
| `VALHALLA_URL` | proxy | upstream za `/api/valhalla` |
| `NEXTBIKE_URL` | proxy | live stanice, Zagreb `city=1172` |
| `PHOTON_URL` / `VITE_PHOTON_URL` | poslužitelj i klijent | Photon (OpenStreetMap). Kućni brojevi idu preko `layer=house`. Javni Nominatim se ne koristi. |
| `PORT` | `npm start` | port Node poslužitelja |

Biciklistički profil šalje `bicycle_type: "City"` i `use_roads: 0.1`.

## Deploy

### Cloudflare

```bash
npm run build
npx wrangler@latest deploy
```

`wrangler.toml` poslužuje `dist` i šalje `/api/*` u Worker. Varijable su u `[vars]`.

### Vercel

```bash
npx vercel
```

Build je `npm run build`, izlaz `dist`. `vercel.json` ostavlja `/api` serverless funkciji, a ostale staze vraća na `index.html`. U projektu postavi `VALHALLA_URL` i, ako želiš vlastiti Valhalla poslužitelj u klijentu, `VITE_VALHALLA_URL` prije builda.

### Samo statički hosting

`npm run build` i objavi `dist`. Javni Nextbike, Photon i Valhalla imaju CORS, pa ruta radi i bez proxyja. Predmemorija stanica tada živi samo u pregledniku. Parkirališta i staze su u samom buildu i ulaze u service worker.

## Podaci i atribucija

Na karti piše: © OpenStreetMap, Grad Zagreb (data.gov.hr). Pločice su OpenFreeMap.

- Bajs / Nextbike live: `bikes_available_to_rent`, `free_racks`, `bike_racks`, `bikes`, `maintenance`, `active_place`, `lat`, `lng`, `name`, `number`, `uid`.
- Parkirališta, skup `geoportal-javna-parkiralista-za-bicikle`: `naziv`, `lokacija`, `vrsta`, `broj_stalaka`, `broj_bicikala`, `godina_postavljanja`, `GRADSKA_CETVRT`, `MJESNI_ODBOR`. Nema zasebnog polja za nadstrešnicu; ono dolazi iz OSM-a (`covered`) kad se točka spoji.
- Staze, skup `geoportal-biciklisticke-staze`: `kategorija_id`, `lokacija`, `zavrsni_sloj`, `duljina`.
- Oba gradska skupa: Otvorena dozvola, [data.gov.hr](https://data.gov.hr/ckan/dataset/geoportal-javna-parkiralista-za-bicikle).

Aplikacija i dalje računa pješačku i Bajs rutu ako parkirališta ili staze nedostaju. Vlastiti bicikl tada ide do adrese, uz poruku da nema evidentiranog parkirališta.

## Načini

1. **Vozim Bajs.** Pet najbližih stanica s barem jednim biciklom i pet sa slobodnim mjestom. Matrica pješačkih i biciklističkih vremena. Minimum je hod + 60 s + vožnja + 60 s + hod. Ako je samo pješice brže, to se nudi.
2. **Već vozim Bajs.** Od trenutne točke biciklom do stanice sa slobodnim mjestom, zatim pješice. Uključena je minuta za vraćanje.
3. **Vozim svoj bicikl.** Parkirališta u 300 m (pa 600 m) od cilja, do pet najbližih. Minimum je vožnja + 60 s vezanja + hod. Ruta završava na parkiralištu. Ako ih nema, vodi do adrese.
4. **Pješice.**

Tijekom navigacije `watchPosition` prati korak, preostalo vrijeme i skretanje s rute (ponovni izračun). Zaslon se pokušava držati budnim preko Screen Wake Lock API-ja. Gumb „Otvori Bajs aplikaciju” vodi u službenu aplikaciju; otključavanje i plaćanje nisu ovdje.

## Poznata ograničenja

- Javni `valhalla1.openstreetmap.de` je dijeljeni poslužitelj bez jamstva dostupnosti. Tekst skretanja slaže se lokalno iz tipa manevra jer odgovor stiže na engleskom.
- `free_racks` je često 0 i kad je na stanici više bicikala nego stalaka. Povrat se nudi samo gdje je `free_racks` barem 1.
- U izbor ulazi pet zračno najbližih kandidata, pa malo dalja stanica može biti brža, a da nije u skupu.
- Postotak staza mjeri blizinu službenoj crti, ne to da je Valhalla stvarno vozila tom stazom. `use_roads: 0.1` samo naginje profil prema stazama.
- Gradski skup nema zauzetost parkirališta ni, sam po sebi, nadstrešnicu.
- Nema glasovne navigacije ni pouzdanog GPS-a dok je zaslon zaključan, posebno na iOS-u.
- Rutiranje ne radi bez mreže. Service worker čuva ljusku aplikacije, pločice i skinute skupove.
- Upozorenje nakon 30 minuta vožnje Bajsom nije službeni cjenik.
- Geokoder je ograničen na okvir Zagreba.
