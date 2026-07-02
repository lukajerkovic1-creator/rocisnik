# Ročišnik

Statična HTML aplikacija za raspored ročišta. Radi bez servera i sprema podatke lokalno u pregledniku.

## GitHub Pages Objava

1. Napravi novi GitHub repozitorij pod nazivom `rocisnik`.
2. U root repozitorija dodaj datoteke `index.html`, `styles.css`, `app.js` i `.nojekyll`.
3. Otvori `Settings > Pages`.
4. Pod `Build and deployment` odaberi `Deploy from a branch`.
5. Odaberi granu `main` i folder `/root`, zatim spremi.
6. Aplikacija će biti dostupna na adresi `https://<github-korisnik>.github.io/rocisnik/`.

## Izvoz U Kalendar

Ročišnik može izvesti ročišta u `.ics` kalendarsku datoteku.

- U detaljima pojedinog ročišta koristi gumb **Izvezi u kalendar (.ics)** za izvoz samo tog ročišta.
- U panelu **Sigurnosna kopija** koristi gumb **Izvezi buduća ročišta u kalendar (.ics)** za izvoz svih budućih neobrisanih ročišta u jednu datoteku.
- `.ics` datoteka može se uvesti u Google Calendar, Apple Calendar, Outlook i slične kalendarske aplikacije.
- Ročišta bez posebnog trajanja izvoze se s trajanjem od 60 minuta.
- Ako ročište ima podsjetnike, oni se izvoze kao lokalni `VALARM` zapisi u `.ics` datoteci.

Sistemski podsjetnici kalendarske aplikacije pouzdaniji su od in-app podsjetnika kada je Ročišnik zatvoren, zato je za važne termine korisno uvesti događaje i u kalendar.

## Lokalna Lozinka I Zaključavanje

Ročišnik koristi lokalnu lozinku za zaključavanje prikaza aplikacije u ovom pregledniku.

- Pri prvom korištenju potrebno je postaviti lozinku od najmanje 10 znakova.
- Lozinka se ne sprema u čitljivom obliku. Aplikacija sprema samo šifrirani verifier izveden kroz Web Crypto API, PBKDF2 i AES-GCM.
- Aktivna lokalna baza ročišta sprema se kao šifrirani blob u `localStorage`, pod ključem `rocisnik.encryptedDatabase.v2`.
- Stariji plaintext zapis `rocisnik.hearings.v1` koristi se samo kao legacy ulaz za migraciju i briše se tek nakon uspješnog šifriranja i provjere dešifriranja.
- Nakon osvježavanja stranice ili ponovnog otvaranja aplikacije potrebno je unijeti lozinku.
- Gumb **Zaključaj** ručno skriva aplikaciju i uklanja prikazane podatke iz sučelja.
- Aplikacija se automatski zaključava nakon 15 minuta neaktivnosti.
- Zaboravljena lokalna lozinka ne može se vratiti. Ako nema valjanog backup-a, lokalni podaci u tom pregledniku nisu dostupni.

## Sigurnosne Kopije

Lokalna baza i backup datoteka nisu isto:

- Lokalna baza je šifrirana lozinkom aplikacije i ostaje u ovom pregledniku.
- Šifrirani backup je zasebna datoteka koju korisnik izvozi ručno i može spremiti izvan preglednika.
- Lozinka backup datoteke nije automatski ista kao lokalna lozinka aplikacije, osim ako korisnik sam odabere istu lozinku.
- Backup treba redovito izvoziti jer brisanje podataka preglednika, kvar uređaja ili promjena uređaja mogu dovesti do gubitka lokalnih unosa.

## Restore I Test Backupa

Obnova podataka ide kroz siguran pregled prije stvarnog restorea.

- Gumb **Pregledaj backup** učitava JSON ili šifrirani backup i prikazuje sažetak prije obnove.
- Preview prikazuje je li backup čitljiv, je li šifriran, broj ročišta, buduće/prošle zapise, raspon datuma, nedostajuća polja i upozorenja.
- Gumb **Testiraj backup bez uvoza** provjerava da se backup može pročitati i normalizirati, ali ne mijenja postojeće podatke.
- Restore se izvršava tek nakon odabira načina obnove i dodatne potvrde.
- **Zamijeni sve postojeće podatke** briše trenutni radni skup i učitava podatke iz backupa; za ovu opciju treba upisati `ZAMIJENI`.
- **Spoji i preskoči iste ID-jeve** dodaje samo zapise čiji ID ne postoji u trenutnoj bazi.
- **Spoji i generiraj nove ID-jeve za konflikte** dodaje i konfliktne zapise, ali im dodjeljuje novi ID.
- Ako restore ne uspije, postojeća baza ostaje netaknuta.

Preporuka: povremeno testirajte backup bez uvoza kako biste provjerili da je datoteka čitljiva prije nego vam zatreba stvarna obnova.

Ova zaštita ne štiti od kompromitiranog uređaja, malwarea, zlonamjernih browser ekstenzija ili osobe koja ima pristup već otključanom uređaju.

## Napomena

Podaci su lokalni za svaki preglednik i uređaj. Ročišta unesena na Android mobitelu ostaju spremljena u tom mobilnom pregledniku, ali se ne sinkroniziraju s računalom.
