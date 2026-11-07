# NavBajs

NavBajs je navigacija biciklom po Zagrebu. Kaže kamo hodati, gdje uzeti ili vratiti Bajs i gdje ostaviti vlastiti bicikl, pa vodi korak po korak do cilja.

Aplikacija radi u pregledniku, na telefonu i na računalu. Može se instalirati na početni zaslon. Sučelje je na hrvatskom. Pokriva Zagreb.

Karta je uvijek vidljiva. Na telefonu se detalji otvaraju u donjoj ploči, a na širem zaslonu u bočnoj ploči.

NavBajs ne otključava bicikl i ne naplaćuje najam. To ostaje u službenoj Bajs aplikaciji. Gumb **Otvori Bajs** samo otvara tu aplikaciju.

## Što radi

1. Pokaže kartu Zagreba sa stanicama Bajs, javnim parkiralištima za bicikle i biciklističkim stazama.
2. Pita odakle se kreće i kamo se ide: upis adrese, trenutna lokacija, dodir na karti, nedavno mjesto ili stanica.
3. Čim postoje obje točke, odmah računa tri načina putovanja i pokaže vrijeme za svaki.
4. Korisnik odabere način. Odabir ne pokreće novi račun.
5. Pokaže ukupno vrijeme, udaljenost, dionice i upute za skretanje.
6. Tijekom vožnje prati lokaciju, preostalo vrijeme i sljedeći korak. Ako korisnik skrene s rute, ruta se ponovo računa.

## Polazište i odredište

Na početku piše **Kamo idete?** Kad je odredište odabrano, aplikacija pita **Odakle krećete?**

- **Moja lokacija** tek tada traži GPS. Ako signal ne stigne, piše da je čekanje isteklo i nudi upis adrese.
- **Upiši polazište** otvara polje za adresu.

GPS se ne uključuje sam. Pitanje se postavlja nakon odredišta, na telefonu i na webu, dok polazište nije odabrano. Ako preglednik već ima nedavnu lokaciju, ona se pokaže odmah, a zatim se profini.

Tekst u jednom polju ostaje dok se piše drugo. Odabrano polazište pamti se među nedavnima i nudi se i kad se sljedeći put traži odredište. Isto vrijedi u drugom smjeru.

Odredište i polazište mogu se zadati na više načina:

- upis ulice, kućnog broja, trga, fakulteta ili poznatog mjesta
- **Moja lokacija**
- nedavna mjesta, **Dom** i **Posao**
- stanica Bajs s popisa ili s karte
- **Odaberi na karti** u popisu prijedloga
- **Klikni na kartu** desno od pretrage. Karta prima dodir tek nakon te opcije.

**Zamijeni** mijenja polazište i odredište.

Pretraga poznatih mjesta kreće od dva znaka, a udaljeni izvori od tri. Kućni brojevi se traže u lokalnom indeksu službenih adresa Grada Zagreba, koji se učita jednom. Poznata mjesta, na primjer FER, nude se odmah iz lokalnog popisa. Ako lokalno nema dovoljno pogodaka, traži se i OpenStreetMap. Prijedlozi su ograničeni na Zagreb, osim ako upit spominje Veliku Goricu, Zaprešić ili Samobor.

Ako točne adrese nema, može se pojaviti najbliži kućni broj u istoj ulici, označen kao približna lokacija. Ako pretraga nije dostupna, piše **Pretraga trenutno nije dostupna**, uz ponovni pokušaj i odabir točke na karti.

## Tri načina

Kad postoje polazište i odredište, računaju se sva tri načina odjednom. Na karticama piše **Bajs**, **Svoj bicikl** i **Pješice**. Odabir ostaje na onome što korisnik pritisne. Na početku je označen Bajs. Dok se računa, na kartici piše **Računam**. Klik na karticu odmah pokazuje taj način i ne šalje novi zahtjev.

**Kreni** vodi odabranim načinom. Uključen je tek kad je taj način izračunat.

Ako ruta ne može biti izračunata, piše **Rutu trenutno nije moguće izračunati. Pokušajte ponovno.**

Hod kraći od jedne minute ne ulazi u pregled dionica. Koraci su iza **Prikaži korake**. Gumb **Kreni** ostaje na dnu ploče.

### Bajs

Hod do stanice na kojoj ima bicikl, vožnja Bajsom do stanice sa slobodnim mjestom, pa opet hod do cilja.

Aplikacija gleda pet najbližih stanica s barem jednim biciklom i pet najbližih sa slobodnim mjestom, pa bira spoj koji ukupno traje najkraće. U vrijeme ulaze i jedna minuta za uzimanje bicikla i jedna minuta za vraćanje. Stanice u održavanju se ne nude.

Bajs se vraća samo na Bajs stanicu, ne na obično parkiralište.

Ako je čisto pješačka ruta brža, na kartici Bajs piše **Pješice je brže**. Biciklistička ruta ostaje dostupna.

**Već sam na Bajsu** je prekidač za slučaj kad je bicikl već uzet. Ruta tada ide od trenutne točke do stanice sa slobodnim mjestom, zatim pješice do cilja. U vrijeme ulazi jedna minuta za vraćanje. Ako se tijekom vožnje ruta ponovo računa, a bicikl je već uzet, ostaje ovaj način.

### Svoj bicikl

Vožnja vlastitim biciklom do javnog parkirališta blizu cilja, pa kratak hod do odredišta.

Prvo se gledaju parkirališta u krugu od 300 metara. Ako ih nema, krug se širi na 600 metara i to se napiše u upozorenju. Od više parkirališta bira se ono s najkraćim zbirom vožnje, minute za vezanje i hoda. Ostala se mogu ručno izabrati.

Ako u 600 metara nema evidentiranog parkirališta, ruta vodi do same adrese, uz napomenu da bicikl treba vezati uz stalak ili stup.

Na kraju rute aplikacija podsjeća: zaključaj okvir, ne samo kotač.

### Pješice

Samo hod od polazišta do odredišta.

## Rezultat

Rezultat pokazuje:

- ukupno vrijeme i udaljenost
- koliko minuta otpada na uzimanje, vraćanje ili vezanje bicikla
- udio vožnje koji ide blizu službenih biciklističkih staza Grada Zagreba, zaokružen na 5 posto i označen kao procjena
- dionice: hod do stanice, vožnja, hod do cilja, s udaljenošću i listom koraka
- upozorenja, ako ih ima

Ako račun traje dulje od uobičajenog, piše **Još računam, ovo traje dulje nego inače.**

## Tijekom navigacije

Donja ploča pokazuje sljedeću uputu, udaljenost do tog skretanja te preostalo vrijeme i preostalu udaljenost.

Karta prati korisnika. Ako se karta ručno pomakne, praćenje staje dok se ne pritisne **Prati me**.

Ako se korisnik više puta nađe daleko od linije rute, NavBajs ponovo računa put od trenutne lokacije. Dok je Bajs već uzet, novi račun ide kao **Već sam na Bajsu**: do stanice za povrat, pa pješice.

Na dolasku piše da je odredište tu. Za vlastiti bicikl, pred kraj i na cilju, ostaje podsjetnik da se bicikl zaključa.

**Završi** gasi navigaciju. Dok navigacija traje, aplikacija pokušava držati zaslon upaljenim.

Stanice Bajs se i dalje osvježavaju. Ako na odabranoj stanici nestane bicikla ili slobodnog mjesta, ruta se može ponovo složiti.

## Karta

Filtar u gornjem desnom kutu uključuje i gasi slojeve:

| Sloj | Što se vidi |
| --- | --- |
| Stanice Bajs | Krug u boji ploče, prsten u boji stanja. Plavo: više od 3. Žuto: 1 do 3. Sivo: nema bicikla. Crveno: održavanje. Daleko je samo točkica, bliže se vide i slobodna mjesta. |
| Parkirališta za bicikle | Javna parkirališta. U detalju: vrsta, broj stalaka, kapacitet, nadstrešnica kad je poznata, godina, gradska četvrt, mjesni odbor. |
| Biciklističke staze | Službene staze Grada Zagreba. |

Isti izbornik mijenja svijetlu i tamnu temu i, kad preglednik to nudi, instalira aplikaciju.

Dodir na stanicu otvara broj slobodnih bicikala, slobodnih mjesta i stalaka te napomenu ako je stanica u održavanju. Nazivi stanica pišu se uobičajenim slovima, ne velikim slovima iz izvora.

## Odakle dolaze podaci

- **Stanice Bajs** su uživo: koliko se bicikala može iznajmiti i koliko ima slobodnih mjesta za povrat. Osvježavaju se otprilike svakih 40 sekundi. Povrat se nudi samo gdje ima barem jedno slobodno mjesto i stanica nije u održavanju.
- **Adrese** za kućni broj dolaze iz službenog sloja Grada Zagreba. Ostala mjesta dolaze iz lokalnog popisa i OpenStreetMapa.
- **Parkirališta i staze** su otvoreni podaci Grada Zagreba. Parkirališta dopunjuje OpenStreetMap tamo gdje se točka poklapa s gradskim zapisom. Zauzetost parkirališta se ne zna. Ako ime nije poznato, piše **Parkiralište za bicikle**.
- **Karta** je OpenStreetMap.
- **Ruta** se računa na javnim poslužiteljima, biciklističkim i pješačkim profilom. Ako prvi ne odgovori, aplikacija pokušava drugi. Biciklistički profil bira bržu vožnju. Kolnik nema kaznu. Staza uđe u put samo kad je kraća po vremenu.

Bez interneta karta iz predmemorije može ostati vidljiva. Stanice uživo i novi račun rute trebaju mrežu.

## Upozorenja koja aplikacija sama ispisuje

- Vožnja Bajsom dulja od 30 minuta: provjeriti cijenu najma u službenoj Bajs aplikaciji. To nije cjenik.
- Stanica je označena kao u održavanju.
- Točka je izvan okvira Zagreba. Rutiranje je podešeno za grad.
- Nema stanice s biciklom, ili nema stanice sa slobodnim mjestom.
- Nema parkirališta u 300 m, pa je uzet širi krug, ili uopće nema evidentiranog parkirališta.
- Parkirališta ili staze nisu učitani. Ruta i dalje može raditi. Vlastiti bicikl tada ide do adrese, a postotak staza se ne računa.

## Što NavBajs ne radi

- Ne otključava Bajs, ne vraća ga u sustav i ne naplaćuje.
- Nema glasovne navigacije.
- Ne zna je li parkiralište trenutačno puno.
- Ne vodi pouzdano dok je zaslon zaključan, posebno na iPhoneu.
- Ne bira među svim stanicama u gradu, nego među nekoliko zračno najbližih. Malo dalja stanica ponekad može biti brža, a da nije ušla u izbor.
- Ne jamči da je javni poslužitelj ruta uvijek dostupan.
