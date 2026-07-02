# Ročišnik

Statična HTML aplikacija za raspored ročišta. Radi bez servera i sprema podatke u pregledniku kroz `localStorage`.

## GitHub Pages objava

1. Napravi novi GitHub repozitorij pod nazivom `rocisnik`.
2. U root repozitorija dodaj datoteke `index.html`, `styles.css`, `app.js` i `.nojekyll`.
3. Otvori `Settings > Pages`.
4. Pod `Build and deployment` odaberi `Deploy from a branch`.
5. Odaberi granu `main` i folder `/root`, zatim spremi.
6. Aplikacija će biti dostupna na adresi `https://<github-korisnik>.github.io/rocisnik/`.

## Izvoz u kalendar

Ročišnik može izvesti ročišta u `.ics` kalendarsku datoteku.

- U detaljima pojedinog ročišta koristi gumb **Izvezi u kalendar (.ics)** za izvoz samo tog ročišta.
- U panelu **Sigurnosna kopija** koristi gumb **Izvezi buduća ročišta u kalendar (.ics)** za izvoz svih budućih neobrisanih ročišta u jednu datoteku.
- `.ics` datoteka može se uvesti u Google Calendar, Apple Calendar, Outlook i slične kalendarske aplikacije.
- Ročišta bez posebnog trajanja izvoze se s trajanjem od 60 minuta.
- Ako ročište ima podsjetnike, oni se izvoze kao lokalni `VALARM` zapisi u `.ics` datoteci.

Sistemski podsjetnici kalendarske aplikacije pouzdaniji su od in-app podsjetnika kada je Ročišnik zatvoren, zato je za važne termine korisno uvesti događaje i u kalendar.

## Napomena

Podaci su lokalni za svaki preglednik i uređaj. Ročišta unesena na Android mobitelu ostaju spremljena u tom mobilnom pregledniku, ali se ne sinkroniziraju s računalom.
