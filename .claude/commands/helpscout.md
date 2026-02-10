# HelpScout E-mail Workflow

Beheer de HelpScout mailbox: tag e-mails, prioriteer, en stel conceptantwoorden op met Notion context.

## Commando Varianten

| Commando | Actie |
|----------|-------|
| `/helpscout` | Volledige flow: eerst taggen, dan beantwoorden |
| `/helpscout tag` | Alleen e-mails taggen met trajectafkortingen |
| `/helpscout beantwoord` | Alleen beantwoorden (tags moeten al bestaan) |

---

## DATUM AWARENESS

**KRITIEK:** E-mails kunnen van gisteren of eerder zijn. Check ALTIJD:
1. Vandaag is: `[huidige datum]` (check systeemdatum)
2. E-mail datum: wanneer is de mail gestuurd?
3. Referenties in mail: "morgen", "vandaag", "volgende week" → bereken juiste datum
4. Geplande afspraken: bereken correct welke dag het is (morgen, overmorgen, donderdag, etc.)

### WEEKDAG BEREKENEN - VERPLICHT!

**NOOIT een weekdag raden!** Bereken ALTIJD de weekdag expliciet:

1. **Gebruik Google Calendar MCP** om de dag te verifiëren:
```
mcp__google-calendar__get-current-time()
```
Dit geeft de huidige datum én weekdag terug.

2. **Bij afspraken in de mail**, controleer de weekdag:
   - Mail zegt "afspraak op 12 februari"
   - Bereken: welke weekdag is 12 februari?
   - Gebruik kalender of tel dagen vanaf bekende datum

3. **Weekdag berekening formule:**
   - Ken je referentiepunt (bijv. 1 feb 2026 = zondag)
   - Tel dagen vooruit en deel door 7
   - Restant geeft weekdag (0=zo, 1=ma, 2=di, 3=wo, 4=do, 5=vr, 6=za)

**Voorbeeld - Weekdag berekenen:**
- 1 februari 2026 = zondag
- 12 februari = 1 feb + 11 dagen
- 11 mod 7 = 4 → donderdag
- FOUT: "Tot woensdag!"
- GOED: "Tot donderdag!"

**Voorbeeld 1 - Inkomende mail interpreteren:**
- Vandaag = 4 februari 2026
- E-mail van 3 februari zegt: "ik bel haar morgen"
- "morgen" = 4 februari = VANDAAG

**Voorbeeld 2 - Uitgaande mail schrijven:**
- Vandaag = dinsdag 10 februari 2026
- Interview gepland op donderdag 12 februari
- FOUT: "Tot morgen!"
- GOED: "Tot donderdag!" of "Tot 12 februari!"

**Pas je antwoord aan:**
- FOUT: "Succes morgen met de call!"
- GOED: "Succes vandaag met de call!" of "Hoe ging de call vandaag?"

**Bij twijfel: gebruik harde datums!**
Als je niet 100% zeker bent welke weekdag het is, gebruik dan gewoon de datum:
- Onzeker: "Tot volgende week!" of "Tot woensdag!"
- Zeker: "Tot donderdag 12 februari!"

---

## FASE 1: TAGGEN

### Stap 1.1: Actieve E-mails Ophalen
```
mcp__helpscout__searchConversations({
  status: "active",
  limit: 50
})
```

Filter uit:
- E-mails toegewezen aan Vanessa (skip)
- Automatische notificaties (LinkedIn, Moneybird, Bloc4)

### Stap 1.2: Trajecten Ophalen uit Notion
Haal alle actieve trajecten op met hun afkortingen:

```
mcp__notion__notion-search({
  query: "Trajecten database status lopend"
})
```

### Stap 1.3: E-mails Matchen & Taggen
Voor elke e-mail:
1. Check e-mailadres afzender tegen `E-mailadressen` veld in Trajecten
2. Check afzendernaam tegen `Klantnaam` in Trajecten
3. Check onderwerp/preview tegen trajectnamen
4. Bij match → tag toevoegen:

```
mcp__helpscout__updateConversationTags({
  conversationId: "...",
  tags: ["PFP"],  // Project afkorting
  preserveExisting: true
})
```

### Stap 1.4: Nieuwe Leads Identificeren
Als een e-mail NIET matcht met een traject:
- Check of het een nieuwe lead zou kunnen zijn (>95% zeker)
- Zo ja: voeg toe aan Leads (klanten) database
- Zo nee: meld aan gebruiker voor handmatige beoordeling

---

## FASE 2: BEANTWOORDEN

### Stap 2.1: Prioritering Bepalen

**HOGE PRIORITEIT** (eerste 2 e-mails pakken):
1. Klanten in actief verkooptraject (fase: Markt op gaan, Onderhandelen)
2. Langst wachtende klant
3. Deadline-gerelateerde communicatie
4. Due diligence vragen

**MIDDEL PRIORITEIT**:
- Verkoopklaar trajecten (coaching)
- Updates zonder deadline
- Potentiele kopers met vragen

**LAGE PRIORITEIT / SKIP**:
- Automatische notificaties
- CC'd berichten waar al op gereageerd is
- Newsletters

### Stap 2.2: Context Ophalen (per e-mail)

**A. Traject Context**
```
mcp__notion__notion-fetch({
  id: "[traject-page-id]"
})
```
Haal op:
- Fase (waar staat het traject?)
- Volgende actie
- Deadline
- Laatste mail samenvatting
- Exit score
- Adviseur (Maarten of Bernd?)

**B. Potentiele Kopers Context** (indien van toepassing)
Als de e-mail van een potentiele koper is:
```
mcp__notion__notion-search({
  query: "[e-mailadres afzender] potentiele kopers"
})
```
Haal op:
- Status (IM verstuurd, Interesse bevestigd, etc.)
- NDA getekend (BELANGRIJK!)
- Laatste contact

**C. Leads Context** (indien nieuwe klant/lead)
```
mcp__notion__notion-search({
  query: "[e-mailadres] leads klanten"
})
```

### Stap 2.3: Verduidelijkingsvragen Stellen

**VOORDAT** je een conceptmail schrijft, stel verduidelijkingsvragen aan de gebruiker:

Voorbeeldvragen:
- "Wil je [specifieke actie] bevestigen of zijn er wijzigingen?"
- "Is er een deadline die ik moet vermelden?"
- "Welke documenten/info wil je delen?"
- "Moet ik urgentie communiceren over [onderwerp]?"
- "Zijn er andere kandidaten/kopers die ik kan noemen voor urgentie?"

Wacht op antwoord voordat je de draft maakt.

### Stap 2.4: Conceptmail Opstellen

**Schrijfstijl:**
- Toon: natuurlijk, conversationeel, niet robotisch
- Taal: Nederlands
- Vermijd: "tevens", "desondanks", "concluderend", "stakeholders", "learnings"
- Geen Title Case in zinnen
- Kort en to-the-point
- **NOOIT CAPSLOCK** voor nadruk, gebruik `<strong>dikgedrukt</strong>` (HTML) in plaats daarvan
- **NOOIT Markdown** gebruiken - HelpScout verwacht HTML: `<strong>` voor bold, `<br><br>` voor nieuwe paragraaf, `<br>` voor regelafbreking
- **NOOIT em dashes (—)** gebruiken, dit ziet er AI-achtig uit. Gebruik gewone streepjes (-) of herschrijf de zin
- **NOOIT afsluiting toevoegen** - geen "Met vriendelijke groet, Maarten" want dit wordt automatisch als handtekening toegevoegd

**NDA Protocol:**
- Check ALTIJD of NDA getekend is voordat je bedrijfsnaam noemt
- NDA niet getekend → gebruik omschrijving ("het bedrijf", "de onderneming")
- NDA wel getekend → bedrijfsnaam mag gebruikt worden

**Draft aanmaken:**
```
mcp__helpscout__createDraftReply({
  conversationId: "...",
  text: "Hi [naam],<br><br>Eerste paragraaf.<br><br>Tweede paragraaf."
})
```

**LET OP:**
- Draft wordt NIET verstuurd - gebruiker moet handmatig reviewen en versturen!
- **GEEN handtekening toevoegen** - "Groet, Maarten" staat al in de e-mail signature

### Stap 2.5: Gebruiker Review
- Toon de draft aan de gebruiker
- Wacht op bevestiging: "Mail is goed" of aanpassingen
- Pas aan indien nodig

### Stap 2.6: Notion Bijwerken

**Na elke verstuurde mail, update Notion:**

**A. Traject bijwerken:**
- `Laatste mail datum`: vandaag
- `Laatste mail samenvatting`: korte samenvatting (1-2 zinnen)
- `Volgende actie`: update indien gewijzigd
- `Deadline volgende actie`: update indien relevant

**B. Potentiele Koper bijwerken** (indien van toepassing):
- `Status`: update (bijv. "IM verstuurd" → "Wacht op antwoord")
- `Laatste contact`: vandaag

**C. Lead bijwerken** (indien van toepassing):
- `Fase van deal`: update
- `AI-samenvatting`: toevoegen/updaten

---

## Actieve Trajecten Referentie

Haal altijd de actuele lijst op uit Notion, maar hier een snapshot:

| Afkorting | Traject | Type | Status |
|-----------|---------|------|--------|
| PFP | Profit First Professionals | Verkooptraject | Lopend |
| DPC | DressagePro Collection | Verkooptraject | Lopend |
| GIV | Green Involvement | Verkoopklaar | Lopend |
| UDA | UD-Autoparts BV | Verkoopklaar | Lopend |
| HOC | House of Care BV | Verkoopklaar | Lopend |
| SED | Seductionail BV | Verkoopklaar | Lopend |
| FYB | Fysio Barendrecht | Verkoopklaar | Lopend |

---

## Notion Database Velden

### Trajecten - Velden om bij te werken
| Veld | Wanneer bijwerken |
|------|-------------------|
| Laatste mail datum | Na elke mail |
| Laatste mail samenvatting | Na elke mail |
| Volgende actie | Bij nieuwe actie |
| Deadline volgende actie | Bij nieuwe deadline |
| Fase | Bij fase-overgang |

### Potentiele Kopers - Velden om bij te werken
| Veld | Wanneer bijwerken |
|------|-------------------|
| Status | Bij statuswijziging |
| Laatste contact | Na elk contact |
| NDA getekend | Na ondertekening |

### Leads (klanten) - Velden om bij te werken
| Veld | Wanneer bijwerken |
|------|-------------------|
| Fase van deal | Bij fase-overgang |
| AI-samenvatting | Na belangrijke interactie |
| Volgende actie | Bij nieuwe actie |

---

## Output Format

### Na Taggen:
```
## E-mails Getagd

| # | Van | Onderwerp | Tag | Prioriteit |
|---|-----|-----------|-----|------------|
| 11461 | Alex Leuning | Re: cijfers | GIV | Hoog |
| 11456 | Femke Hogema | Update | PFP | Hoog |
| 11434 | LinkedIn | Notificatie | - | Skip |

Totaal: X e-mails getagd, Y overgeslagen
```

### Na Beantwoorden:
```
## E-mail Beantwoord

**Conversation:** #11461 (GIV)
**Van:** Alex Leuning
**Onderwerp:** Re: cijfers

**Context uit Notion:**
- Fase: Verkoopklaar traject
- Volgende actie: Cijfers Q4 verzamelen

**Draft aangemaakt:** Ja
**Notion bijgewerkt:**
- Traject GIV: Laatste mail datum + samenvatting
```

---

## Belangrijke Regels

1. **Nooit e-mails direct versturen** - alleen drafts maken
2. **Geen handtekening in drafts** - "Groet, Maarten" staat al in e-mail signature
3. **Altijd NDA checken** voordat je bedrijfsnaam noemt
4. **Altijd verduidelijkingsvragen stellen** voordat je draft maakt
5. **ALTIJD Notion bijwerken als laatste stap** - Notion = single source of truth
6. **Skip e-mails van Vanessa** - die zijn aan haar toegewezen
7. **Bij twijfel (<95% zeker)** - vraag de gebruiker
8. **Check ALTIJD de datum** - e-mails kunnen van gisteren zijn, pas "morgen/vandaag" aan naar de juiste datum
9. **Gebruik notities** bij beslissingen om niet direct te reageren
10. **Bernd-trajecten automatisch sluiten** - na notitie + gebruiker bevestiging

---

## INTERNE NOTITIES

### Wanneer een notitie plaatsen?

Plaats een **interne notitie** (niet zichtbaar voor klant) wanneer je besluit om:
- **Nog niet te reageren** - wachten op iets (call, deadline, antwoord)
- **Later te reageren** - specifieke datum/tijd
- **Context te documenteren** - beslissingen, redenen, afspraken

### Notitie aanmaken
```
mcp__helpscout__createNote({
  conversationId: "...",
  text: "[DATUM] [ACTIE]: [REDEN]"
})
```

### Notitie Format
Gebruik dit format voor consistentie:
```
[4 feb 2026] WACHTEN: Na call Debbie vandaag, dan pas reageren.
[4 feb 2026] GEPLAND: Reageren op 6 feb na ontvangst cijfers.
[4 feb 2026] BESLUIT: Geen actie nodig, informatief bericht.
```

### Voorbeelden

**Wachten op externe actie:**
```
[4 feb 2026] WACHTEN: Femke belt vandaag met Debbie over PFP overname.
Na afloop van die call pas reageren op deze mail.
```

**Gepland voor later:**
```
[4 feb 2026] GEPLAND: Reageren na 10 feb wanneer jaarcijfers binnen zijn.
Klant weet dat we wachten op cijfers.
```

**Beslissing gedocumenteerd:**
```
[4 feb 2026] BESLUIT: Geen reply nodig - dit is een CC op mail aan Bernd.
Bernd pakt dit zelf op.
```

**Team communicatie:**
```
[4 feb 2026] OVERDRACHT: Bernd neemt dit traject over vanaf volgende week.
Maarten houdt zich bezig met andere trajecten.
```

---

## BERND TRAJECTEN - AUTOMATISCH SLUITEN

Als een e-mail betrekking heeft op een traject dat door **Bernd** wordt begeleid en de gebruiker bevestigt "Bernd reageert" of "Bernd handelt af":

### Workflow
1. **Notitie plaatsen** met context:
```
mcp__helpscout__createNote({
  conversationId: "...",
  text: "[4 feb 2026] BERND: Dit traject wordt door Bernd begeleid. Bernd reageert zelf."
})
```

2. **E-mail sluiten** (automatisch na notitie):
```
mcp__helpscout__updateConversationStatus({
  conversationId: "...",
  status: "closed"
})
```

3. **Notion updaten** met laatste mail info

### Bernd Trajecten
Check het `Adviseur` veld in Notion. Momenteel door Bernd begeleid:
- GIV (Green Involvement)
- UDA (UD-Autoparts BV)

---

## NOTION = SINGLE SOURCE OF TRUTH

**KRITIEK:** Sluit ELKE e-mail workflow af met Notion updates!

### Verplichte afsluiting
Na ELKE afgehandelde e-mail (draft gemaakt, notitie geplaatst, of gesloten):
1. Update het relevante traject in Notion
2. Bevestig aan gebruiker welke velden zijn bijgewerkt

### Waarom?
- Notion is de single source of truth voor trajectstatus
- Andere teamleden vertrouwen op actuele Notion data
- Voorkomt duplicate werk en miscommunicatie

---

## HelpScout Inboxen

| Inbox | ID |
|-------|-----|
| Exit Score | 314991 |
| Verkoop je zaak | 314992 |
