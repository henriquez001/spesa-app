// Ricettario. Ogni ricetta dice quali alimenti della dieta usa, quali verdure e quali
// aggiunte "senza calorie" (spezie, erbe, limone, aceto, soia). Le grammature non sono qui:
// arrivano dalla dieta di ciascuno, quindi la stessa ricetta vale per due porzioni diverse.
// Nei passaggi {proteina}, {verdura} e {carbo} diventano i nomi degli alimenti scelti.
// Un passaggio che comincia con "[f]" compare solo se la farina fuori piano è accesa.

export type Slot = "colazione" | "spuntino" | "pranzo" | "merenda" | "cena";

export interface Recipe {
  id: string;
  title: string;
  /** pasti in cui può comparire */
  slots: ("pranzo" | "cena")[];
  /** alimento principale accettato: id (es. "merluzzo") o gruppo (es. "pesce_bianco") */
  proteins: string[];
  /** altri alimenti che il pasto della dieta deve contenere */
  needs?: string[];
  /** se c'è, il carboidrato del pasto deve essere uno di questi (piatto unico); altrimenti va a parte */
  carbs?: string[];
  veg: string[];
  aromi: string[];
  flour?: boolean;
  minutes: number;
  steps: string[];
}

const R = (r: Recipe) => r;

export const RECIPES: Recipe[] = [
  // ------------------------------------------------------------ pollo
  R({ id: "pollo-limone-finocchi", title: "Pollo al limone e rosmarino con finocchi al forno", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["finocchi"], aromi: ["limone", "rosmarino", "aglio"], minutes: 35, steps: [
    "Accendi il forno a 200 °C. Taglia i finocchi a spicchi sottili.",
    "Taglia il {proteina} a bocconi e lascialo 10 minuti in una ciotola con succo e scorza di mezzo limone, rosmarino tritato, uno spicchio d'aglio schiacciato, sale e pepe.",
    "Metti finocchi e pollo nella stessa teglia con carta forno e condisci con l'olio pesato.",
    "Cuoci 22–25 minuti girando a metà; gli ultimi 3 minuti con il grill per dorare.",
  ] }),
  R({ id: "pollo-soia-zucchine", title: "Straccetti di pollo alla soia con zucchine e zenzero", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["zucchine"], aromi: ["salsa di soia", "zenzero", "cipollotto"], flour: true, minutes: 20, steps: [
    "Taglia il {proteina} a strisce sottili.",
    "[f]Passa le strisce nella farina di riso: in cottura si forma una salsina che lega.",
    "Taglia le zucchine a bastoncini e il cipollotto a rondelle; grattugia un pezzetto di zenzero.",
    "Scalda l'olio pesato in una padella antiaderente e cuoci il pollo 4 minuti a fuoco vivo.",
    "Aggiungi zucchine, cipollotto e zenzero e salta 5 minuti.",
    "Sfuma con 2 cucchiai di salsa di soia e un goccio d'acqua, 1 minuto.",
  ] }),
  R({ id: "pollo-paprika-peperoni", title: "Bocconcini di pollo alla paprika con peperoni e pomodorini", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["peperoni", "pomodorini"], aromi: ["paprika dolce", "origano"], minutes: 25, steps: [
    "Taglia il {proteina} a bocconi e cospargilo di paprika dolce, origano e sale.",
    "Taglia i peperoni a listarelle e i pomodorini a metà.",
    "In padella con l'olio pesato cuoci i peperoni 6 minuti con il coperchio.",
    "Aggiungi il pollo e cuoci 5 minuti, poi i pomodorini per altri 4 minuti.",
  ] }),
  R({ id: "pollo-curry-cavolfiore", title: "Pollo al curry con cavolfiore arrosto", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["cavolfiore"], aromi: ["curry", "curcuma", "coriandolo"], minutes: 35, steps: [
    "Accendi il forno a 210 °C. Dividi il cavolfiore in cimette e condiscilo con metà dell'olio pesato, curcuma e sale.",
    "Infornalo per 25 minuti.",
    "Taglia il {proteina} a cubetti e massaggialo con curry e un pizzico di sale.",
    "Cuocilo in padella con l'olio rimasto 7–8 minuti, poi sfuma con mezzo bicchiere d'acqua.",
    "Servi con il cavolfiore e coriandolo fresco.",
  ] }),
  R({ id: "pollo-cacciatora", title: "Pollo alla cacciatora leggero con funghi", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["funghi", "passata"], aromi: ["rosmarino", "aglio", "aceto di vino"], minutes: 30, steps: [
    "Taglia il {proteina} a pezzi e rosolalo in una casseruola con l'olio pesato e l'aglio, 5 minuti.",
    "Sfuma con due cucchiai di aceto di vino.",
    "Aggiungi i funghi a fette, la passata e il rosmarino; sala.",
    "Coperchio e fuoco basso per 15 minuti, finché il sugo si stringe.",
  ] }),
  R({ id: "pollo-cartoccio-verdure", title: "Pollo al cartoccio con zucchine, carote e timo", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["zucchine", "carote"], aromi: ["timo", "limone"], minutes: 35, steps: [
    "Accendi il forno a 200 °C. Taglia zucchine e carote a bastoncini sottili.",
    "Su un foglio di carta forno metti le verdure, sopra il {proteina} aperto a libro, timo, fette di limone, sale e l'olio pesato.",
    "Chiudi il cartoccio e cuoci 25 minuti.",
  ] }),
  R({ id: "pollo-verza-soia", title: "Pollo saltato con verza e aceto balsamico", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["verza", "cipolla"], aromi: ["aceto balsamico", "pepe nero"], minutes: 25, steps: [
    "Affetta sottile la verza e la cipolla.",
    "Stufale in padella con metà dell'olio pesato e mezzo bicchiere d'acqua, 10 minuti.",
    "Aggiungi il {proteina} a striscioline e l'olio rimasto, cuoci 6 minuti.",
    "Sfuma con un cucchiaio di aceto balsamico e pepe nero.",
  ] }),
  R({ id: "pollo-zucca-salvia", title: "Pollo con zucca al forno e salvia", slots: ["cena", "pranzo"], proteins: ["pollo"], veg: ["zucca"], aromi: ["salvia", "noce moscata"], minutes: 35, steps: [
    "Accendi il forno a 200 °C. Taglia la zucca a cubetti.",
    "Metti zucca e {proteina} a bocconi in teglia con salvia, noce moscata, sale e l'olio pesato.",
    "Cuoci 25 minuti girando a metà.",
  ] }),

  // ------------------------------------------------------------ uova
  R({ id: "frittata-spinaci", title: "Frittata al forno con spinaci e cipollotto", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["spinaci"], aromi: ["cipollotto", "noce moscata"], minutes: 30, steps: [
    "Accendi il forno a 180 °C. Appassisci gli spinaci in padella 3 minuti con il cipollotto e un pizzico di sale.",
    "Sbatti le {proteina} con pepe e noce moscata e unisci gli spinaci strizzati.",
    "Ungi una teglia piccola con l'olio pesato e versa il composto.",
    "Cuoci 18–20 minuti, finché il centro è sodo.",
  ] }),
  R({ id: "uova-purgatorio", title: "Uova in purgatorio con pomodorini e basilico", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["pomodorini"], aromi: ["basilico", "aglio", "peperoncino"], minutes: 20, steps: [
    "Taglia i pomodorini a metà e cuocili 8 minuti in padella con l'olio pesato, aglio e peperoncino.",
    "Fai delle conche nel sugo e rompici dentro le {proteina}.",
    "Coperchio e fuoco basso per 6–7 minuti, finché l'albume è rappreso.",
    "Finisci con basilico fresco.",
  ] }),
  R({ id: "frittata-cavolo-nero", title: "Frittata di cavolo nero alla curcuma", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["cavolo_nero"], aromi: ["curcuma", "aglio"], minutes: 25, steps: [
    "Togli la costa al cavolo nero, taglialo a strisce e sbollentalo 4 minuti.",
    "Ripassalo in padella con metà dell'olio pesato e uno spicchio d'aglio.",
    "Sbatti le {proteina} con curcuma, sale e pepe e versale sul cavolo.",
    "Cuoci a fuoco basso con il coperchio 8 minuti, gira la frittata e cuoci altri 3 minuti con l'olio rimasto.",
  ] }),
  R({ id: "uova-sode-fagiolini", title: "Insalata tiepida di uova sode, fagiolini e pomodorini", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["fagiolini", "pomodorini"], aromi: ["origano", "aceto di mele", "erba cipollina"], minutes: 20, steps: [
    "Cuoci le {proteina} 9 minuti in acqua bollente, poi raffreddale e sgusciale.",
    "Lessa i fagiolini spuntati 8 minuti.",
    "Unisci fagiolini, pomodorini a metà e uova a spicchi.",
    "Condisci con l'olio pesato, un cucchiaio di aceto di mele, origano ed erba cipollina.",
  ] }),
  R({ id: "frittata-zucchine-menta", title: "Frittata di zucchine e menta", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["zucchine"], aromi: ["menta", "scorza di limone"], minutes: 25, steps: [
    "Grattugia le zucchine a fori larghi, salale e strizzale dopo 5 minuti.",
    "Sbatti le {proteina} con menta tritata, scorza di limone e pepe; aggiungi le zucchine.",
    "Cuoci in padella antiaderente con l'olio pesato, coperchio e fuoco basso, 8 minuti per lato.",
  ] }),
  R({ id: "uova-carciofi", title: "Uova strapazzate con carciofi e prezzemolo", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["carciofi"], aromi: ["prezzemolo", "aglio", "limone"], minutes: 25, steps: [
    "Pulisci i carciofi, tagliali a spicchi sottili e tienili in acqua e limone.",
    "Cuocili in padella con l'olio pesato, aglio e mezzo bicchiere d'acqua, 12 minuti con il coperchio.",
    "Aggiungi le {proteina} sbattute con sale e pepe e mescola a fuoco basso finché si rapprendono morbide.",
    "Prezzemolo tritato alla fine.",
  ] }),
  R({ id: "frittata-funghi-timo", title: "Frittata ai funghi e timo", slots: ["cena", "pranzo"], proteins: ["uova"], veg: ["funghi"], aromi: ["timo", "aglio"], minutes: 25, steps: [
    "Affetta i funghi e saltali 6 minuti in padella con metà dell'olio pesato, aglio e timo.",
    "Sbatti le {proteina} con sale e pepe e versale sui funghi.",
    "Coperchio, fuoco basso, 8 minuti; gira e cuoci 3 minuti con l'olio rimasto.",
  ] }),

  // ------------------------------------------------------------ pesce bianco
  R({ id: "merluzzo-erbe-broccoli", title: "{proteina} in crosta di erbe e limone con broccoli", slots: ["cena", "pranzo"], proteins: ["pesce_bianco"], veg: ["broccoli"], aromi: ["prezzemolo", "scorza di limone", "aglio"], flour: true, minutes: 30, steps: [
    "Accendi il forno a 200 °C. Dividi i broccoli in cimette e mettili in teglia con metà dell'olio pesato.",
    "Trita prezzemolo, aglio e scorza di limone.",
    "[f]Mescola il trito con la farina di riso: farà una crosticina.",
    "Adagia il {proteina} sui broccoli, coprilo con il trito e l'olio rimasto.",
    "Cuoci 15–18 minuti. Succo di limone al momento.",
  ] }),
  R({ id: "merluzzo-acqua-pazza", title: "Pesce all'acqua pazza con pomodorini", slots: ["cena", "pranzo"], proteins: ["pesce_bianco"], veg: ["pomodorini"], aromi: ["aglio", "prezzemolo", "peperoncino"], minutes: 25, steps: [
    "In una padella larga scalda l'olio pesato con aglio e peperoncino.",
    "Aggiungi i pomodorini a metà e un bicchiere d'acqua; porta a bollore.",
    "Adagia il {proteina}, sala, coperchio e cuoci 8–10 minuti a fuoco medio.",
    "Prezzemolo tritato e un po' del sughetto sopra.",
  ] }),
  R({ id: "merluzzo-cartoccio-finocchi", title: "Pesce al cartoccio con finocchi, arancia e finocchietto", slots: ["cena", "pranzo"], proteins: ["pesce_bianco", "pesce_grasso"], veg: ["finocchi"], aromi: ["scorza d'arancia", "finocchietto", "pepe rosa"], minutes: 30, steps: [
    "Accendi il forno a 190 °C. Affetta i finocchi molto sottili.",
    "Su carta forno metti i finocchi, sopra il {proteina}, scorza d'arancia, finocchietto, pepe rosa, sale e l'olio pesato.",
    "Chiudi il cartoccio e cuoci 20 minuti.",
  ] }),
  R({ id: "merluzzo-curcuma-zucchine", title: "Bocconcini di pesce alla curcuma con zucchine", slots: ["cena", "pranzo"], proteins: ["pesce_bianco"], veg: ["zucchine"], aromi: ["curcuma", "zenzero", "limone"], flour: true, minutes: 20, steps: [
    "Taglia il {proteina} a cubotti e condiscilo con curcuma, zenzero grattugiato e sale.",
    "[f]Passa i cubotti nella farina di riso.",
    "Cuoci le zucchine a rondelle 5 minuti in padella con metà dell'olio pesato.",
    "Aggiungi il pesce e l'olio rimasto e cuoci 5 minuti girando con delicatezza.",
    "Spruzza di limone.",
  ] }),
  R({ id: "merluzzo-livornese", title: "Pesce alla livornese leggero", slots: ["cena", "pranzo"], proteins: ["pesce_bianco"], veg: ["passata", "cipolla"], aromi: ["capperi dissalati", "prezzemolo", "aglio"], minutes: 25, steps: [
    "Stufa la cipolla affettata con l'olio pesato e mezzo bicchiere d'acqua, 5 minuti.",
    "Aggiungi la passata, un cucchiaino di capperi sciacquati e l'aglio; 5 minuti.",
    "Adagia il {proteina} nel sugo, coperchio, 10 minuti a fuoco basso.",
    "Prezzemolo alla fine.",
  ] }),
  R({ id: "merluzzo-spinaci-limone", title: "Pesce in padella al limone con spinaci all'aglio", slots: ["cena", "pranzo"], proteins: ["pesce_bianco", "pesce_grasso"], veg: ["spinaci"], aromi: ["limone", "aglio", "timo"], flour: true, minutes: 20, steps: [
    "[f]Infarina leggermente il pesce con la farina di riso.",
    "Cuoci il {proteina} in padella con metà dell'olio pesato, 4 minuti per lato, poi sfuma con il succo di mezzo limone e timo.",
    "Nella stessa padella appassisci gli spinaci con l'aglio e l'olio rimasto, 3 minuti.",
  ] }),
  R({ id: "merluzzo-cavolfiore-capperi", title: "Pesce al vapore con cavolfiore, capperi e prezzemolo", slots: ["cena", "pranzo"], proteins: ["pesce_bianco"], veg: ["cavolfiore"], aromi: ["capperi dissalati", "prezzemolo", "limone"], minutes: 25, steps: [
    "Cuoci al vapore le cimette di cavolfiore 10 minuti.",
    "Aggiungi il {proteina} nel cestello e cuoci altri 8 minuti.",
    "Condisci con l'olio pesato, capperi sciacquati, prezzemolo, limone e pepe.",
  ] }),

  // ------------------------------------------------------------ pesce grasso
  R({ id: "salmone-finocchi-arancia", title: "{proteina} al forno con finocchi e arancia", slots: ["cena", "pranzo"], proteins: ["pesce_grasso"], veg: ["finocchi"], aromi: ["scorza d'arancia", "finocchietto", "pepe rosa"], minutes: 30, steps: [
    "Accendi il forno a 190 °C. Affetta i finocchi sottili e mettili in teglia con metà dell'olio pesato, sale e pepe rosa.",
    "Cuoci i finocchi 10 minuti da soli.",
    "Aggiungi il {proteina}, la scorza d'arancia e l'olio rimasto.",
    "Altri 12 minuti di forno.",
  ] }),
  R({ id: "salmone-soia-broccoli", title: "{proteina} glassato alla soia con broccoli", slots: ["cena", "pranzo"], proteins: ["pesce_grasso"], veg: ["broccoli"], aromi: ["salsa di soia", "zenzero", "aglio"], minutes: 25, steps: [
    "Lascia il {proteina} 10 minuti in 2 cucchiai di salsa di soia con zenzero grattugiato.",
    "Cuoci le cimette di broccoli al vapore 6 minuti, poi saltale con l'aglio e metà dell'olio pesato.",
    "Cuoci il pesce in padella con l'olio rimasto 3 minuti per lato, versando sopra la marinata alla fine.",
  ] }),
  R({ id: "salmone-zucchine-aneto", title: "{proteina} con zucchine all'aneto e limone", slots: ["cena", "pranzo"], proteins: ["pesce_grasso"], veg: ["zucchine"], aromi: ["aneto", "limone"], minutes: 20, steps: [
    "Taglia le zucchine a nastri con il pelapatate e saltale 3 minuti con metà dell'olio pesato.",
    "Cuoci il {proteina} in padella con l'olio rimasto, 4 minuti dal lato della pelle e 2 dall'altro.",
    "Servi sulle zucchine con aneto e limone.",
  ] }),
  R({ id: "pesce-grasso-pomodorini-origano", title: "Pesce al forno con pomodorini e origano", slots: ["cena", "pranzo"], proteins: ["pesce_grasso", "pesce_bianco"], veg: ["pomodorini", "cipolla"], aromi: ["origano", "aglio", "limone"], minutes: 30, steps: [
    "Accendi il forno a 200 °C. In teglia metti pomodorini a metà e cipolla a spicchi con metà dell'olio pesato.",
    "Cuoci 10 minuti, poi aggiungi il {proteina}, origano, aglio a fettine e l'olio rimasto.",
    "Altri 12–15 minuti. Limone al momento.",
  ] }),

  // ------------------------------------------------------------ manzo
  R({ id: "tagliata-rucola", title: "Tagliata con rucola, pomodorini e aceto balsamico", slots: ["cena"], proteins: ["manzo"], veg: ["rucola", "pomodorini"], aromi: ["rosmarino", "aceto balsamico", "sale grosso"], minutes: 20, steps: [
    "Togli la {proteina} dal frigo 20 minuti prima e condiscila con rosmarino e sale grosso.",
    "Piastra rovente: 3 minuti per lato, poi 5 minuti di riposo coperta.",
    "Affettala e servila su rucola e pomodorini con l'olio pesato e un filo di aceto balsamico.",
  ] }),
  R({ id: "manzo-pizzaiola", title: "Bistecca alla pizzaiola con origano", slots: ["cena"], proteins: ["manzo"], veg: ["passata", "insalata"], aromi: ["origano", "aglio", "capperi dissalati"], minutes: 20, steps: [
    "Scalda la passata con aglio, origano e capperi, 5 minuti.",
    "Rosola la {proteina} in padella con l'olio pesato, 2 minuti per lato.",
    "Coprila con il sugo e cuoci 4 minuti con il coperchio.",
    "Accompagna con l'insalata.",
  ] }),
  R({ id: "manzo-straccetti-radicchio", title: "Straccetti di manzo con radicchio e balsamico", slots: ["cena"], proteins: ["manzo"], veg: ["radicchio"], aromi: ["aceto balsamico", "rosmarino"], minutes: 15, steps: [
    "Taglia la {proteina} a straccetti sottili.",
    "Salta il radicchio a strisce 3 minuti con metà dell'olio pesato e mettilo da parte.",
    "Nella stessa padella, olio rimasto e fuoco vivo: manzo per 2 minuti, poi radicchio e un cucchiaio di balsamico.",
  ] }),
  R({ id: "manzo-peperoni-paprika", title: "Bistecca alla griglia con peperoni arrosto e paprika", slots: ["cena"], proteins: ["manzo"], veg: ["peperoni"], aromi: ["paprika affumicata", "aglio", "prezzemolo"], minutes: 30, steps: [
    "Arrostisci i peperoni in forno a 220 °C per 20 minuti, poi spellali e tagliali a falde.",
    "Condiscili con aglio, prezzemolo e metà dell'olio pesato.",
    "Cuoci la {proteina} sulla piastra con paprika affumicata, 3 minuti per lato, e condisci con l'olio rimasto.",
  ] }),

  // ------------------------------------------------------------ piatti unici di Alice
  R({ id: "pasta-fagioli-rosmarino", title: "Pasta e fagioli al rosmarino", slots: ["pranzo"], proteins: ["fagioli"], carbs: ["pasta"], veg: ["sedano", "carote", "passata"], aromi: ["rosmarino", "aglio"], minutes: 30, steps: [
    "Trita sedano e carota e stufali 5 minuti con metà dell'olio pesato, aglio e rosmarino.",
    "Aggiungi i {proteina} sciacquati, la passata e 400 ml d'acqua; 10 minuti.",
    "Frulla un mestolo di fagioli e rimettilo nella pentola per rendere cremoso.",
    "Cuoci la {carbo} direttamente nella minestra, aggiungendo acqua se serve. Olio rimasto a crudo.",
  ] }),
  R({ id: "pasta-fredda-fagioli", title: "Pasta fredda con fagioli, pomodorini e sedano", slots: ["pranzo"], proteins: ["fagioli"], carbs: ["pasta"], veg: ["pomodorini", "sedano"], aromi: ["basilico", "origano", "aceto di vino"], minutes: 20, steps: [
    "Cuoci la {carbo} al dente e raffreddala sotto l'acqua.",
    "Unisci i {proteina} sciacquati, pomodorini a metà e sedano a rondelle.",
    "Condisci con l'olio pesato, un cucchiaino di aceto, origano e basilico.",
  ] }),
  R({ id: "pasta-fagioli-cavolo-nero", title: "Pasta con fagioli e cavolo nero", slots: ["pranzo"], proteins: ["fagioli"], carbs: ["pasta"], veg: ["cavolo_nero"], aromi: ["aglio", "peperoncino"], minutes: 25, steps: [
    "Sbollenta il cavolo nero a strisce 5 minuti nell'acqua della pasta, poi cuoci la {carbo} nella stessa acqua.",
    "In padella scalda l'olio pesato con aglio e peperoncino, aggiungi cavolo e {proteina}.",
    "Scola la pasta e mantecala in padella con un mestolino d'acqua di cottura.",
  ] }),
  R({ id: "riso-tonno-zucchine", title: "Riso con tonno, zucchine e limone", slots: ["pranzo"], proteins: ["tonno"], carbs: ["riso"], veg: ["zucchine"], aromi: ["scorza di limone", "menta"], minutes: 20, steps: [
    "Cuoci il {carbo} in acqua salata.",
    "Salta le zucchine a cubetti con l'olio pesato 5 minuti.",
    "Unisci il {proteina} sgocciolato, scorza di limone e menta, poi il riso scolato.",
  ] }),
  R({ id: "insalata-riso-tonno", title: "Insalata di riso con tonno, peperoni e cetrioli", slots: ["pranzo"], proteins: ["tonno"], carbs: ["riso"], veg: ["peperoni", "cetrioli"], aromi: ["basilico", "aceto di mele"], minutes: 20, steps: [
    "Cuoci il {carbo}, scolalo e raffreddalo sotto l'acqua.",
    "Taglia peperoni e cetrioli a dadini.",
    "Unisci tutto al {proteina} sgocciolato e condisci con l'olio pesato, un goccio di aceto di mele e basilico.",
  ] }),
  R({ id: "riso-tonno-pomodoro", title: "Riso al pomodoro con tonno e capperi", slots: ["pranzo"], proteins: ["tonno"], carbs: ["riso"], veg: ["passata"], aromi: ["capperi dissalati", "origano", "aglio"], minutes: 20, steps: [
    "Cuoci il {carbo} in acqua salata.",
    "In padella scalda la passata con aglio, capperi e origano per 8 minuti; aggiungi il {proteina}.",
    "Unisci il riso scolato e l'olio pesato a crudo.",
  ] }),
  R({ id: "pasta-pesto-pomodorini", title: "Pasta fredda al pesto con pomodorini", slots: ["pranzo"], proteins: ["pesto"], carbs: ["pasta"], veg: ["pomodorini"], aromi: ["basilico"], minutes: 15, steps: [
    "Cuoci la {carbo} al dente e raffreddala.",
    "Condiscila con il {proteina}, l'olio pesato e i pomodorini a metà.",
    "Basilico fresco sopra.",
  ] }),
  R({ id: "pasta-pesto-fagiolini", title: "Pasta al pesto con fagiolini", slots: ["pranzo"], proteins: ["pesto"], carbs: ["pasta"], veg: ["fagiolini"], aromi: ["basilico"], minutes: 20, steps: [
    "Cuoci i fagiolini a pezzetti nella stessa acqua della {carbo}, buttandoli 5 minuti prima.",
    "Scola e condisci con il {proteina}, l'olio pesato e un cucchiaio di acqua di cottura.",
  ] }),
  R({ id: "pasta-pesto-zucchine", title: "Pasta al pesto con zucchine grigliate", slots: ["pranzo"], proteins: ["pesto"], carbs: ["pasta"], veg: ["zucchine"], aromi: ["menta", "scorza di limone"], minutes: 20, steps: [
    "Griglia le zucchine a fette 2 minuti per lato e tagliale a listarelle.",
    "Cuoci la {carbo} e condiscila con il {proteina}, l'olio pesato e le zucchine.",
    "Menta e scorza di limone alla fine.",
  ] }),
  R({ id: "riso-mozzarella-pomodoro", title: "Riso al pomodoro con mozzarella filante e basilico", slots: ["pranzo"], proteins: ["mozzarella"], carbs: ["riso"], veg: ["passata"], aromi: ["basilico", "origano"], minutes: 25, steps: [
    "Cuoci il {carbo} in acqua salata.",
    "Scalda la passata con origano e un pizzico di sale per 8 minuti.",
    "Unisci il riso scolato, poi la {proteina} a cubetti e l'olio pesato; mescola finché fila.",
    "Basilico fresco.",
  ] }),
  R({ id: "riso-mozzarella-zucchine", title: "Insalata di riso con mozzarella, zucchine e pomodorini", slots: ["pranzo"], proteins: ["mozzarella"], carbs: ["riso"], veg: ["zucchine", "pomodorini"], aromi: ["basilico", "origano"], minutes: 20, steps: [
    "Cuoci il {carbo}, scolalo e raffreddalo.",
    "Salta le zucchine a cubetti 4 minuti senza grassi.",
    "Unisci zucchine, pomodorini, la {proteina} a dadini, basilico e l'olio pesato.",
  ] }),
  R({ id: "riso-mozzarella-melanzane", title: "Riso con melanzane al forno e mozzarella", slots: ["pranzo"], proteins: ["mozzarella"], carbs: ["riso"], veg: ["melanzane", "pomodorini"], aromi: ["basilico", "aglio"], minutes: 35, steps: [
    "Accendi il forno a 210 °C. Taglia le melanzane a cubetti e infornale 20 minuti con aglio e sale.",
    "Cuoci il {carbo}.",
    "Unisci riso, melanzane, pomodorini a metà, la {proteina} a cubetti, l'olio pesato e basilico.",
  ] }),
  R({ id: "pasta-pomodoro-parmigiano", title: "Pasta al sugo di pomodoro semplice e parmigiano", slots: ["pranzo"], proteins: ["parmigiano"], carbs: ["pasta"], veg: ["passata"], aromi: ["basilico", "aglio"], minutes: 20, steps: [
    "Scalda la passata con uno spicchio d'aglio e un pizzico di sale per 10 minuti; togli l'aglio.",
    "Cuoci la {carbo} e saltala nel sugo con l'olio pesato.",
    "Servi con il {proteina} grattugiato e basilico.",
  ] }),
  R({ id: "pasta-cavolfiore-parmigiano", title: "Pasta con cavolfiore, pomodoro e parmigiano", slots: ["pranzo"], proteins: ["parmigiano"], carbs: ["pasta"], veg: ["cavolfiore", "passata"], aromi: ["aglio", "peperoncino"], minutes: 25, steps: [
    "Cuoci le cimette di cavolfiore nell'acqua della pasta per 8 minuti, poi butta la {carbo}.",
    "In padella scalda la passata con aglio, peperoncino e l'olio pesato.",
    "Scola pasta e cavolfiore nella padella e mescola. {proteina} grattugiato sopra.",
  ] }),
  R({ id: "pasta-zucca-parmigiano", title: "Pasta con zucca, rosmarino e parmigiano", slots: ["pranzo"], proteins: ["parmigiano"], carbs: ["pasta"], veg: ["zucca"], aromi: ["rosmarino", "noce moscata"], minutes: 30, steps: [
    "Cuoci la zucca a cubetti in padella con l'olio pesato, rosmarino e un bicchiere d'acqua, 15 minuti; schiacciala in crema.",
    "Cuoci la {carbo} e mantecala nella crema con un mestolino d'acqua di cottura.",
    "Noce moscata e {proteina} grattugiato.",
  ] }),
  R({ id: "riso-freddo-gamberetti-limone", title: "Riso freddo con gamberetti e limone", slots: ["pranzo"], proteins: ["crostacei"], carbs: ["riso"], veg: ["zucchine"], aromi: ["limone", "prezzemolo", "aglio"], minutes: 25, steps: [
    "Cuoci il {carbo}, scolalo e raffreddalo sotto l'acqua.",
    "Salta le zucchine a dadini con metà dell'olio pesato e l'aglio, 4 minuti; aggiungi i {proteina} per 2 minuti.",
    "Unisci tutto con succo e scorza di limone, prezzemolo e l'olio rimasto.",
  ] }),
  R({ id: "riso-gamberetti-pomodorini", title: "Insalata di riso con gamberetti, pomodorini e rucola", slots: ["pranzo"], proteins: ["crostacei"], carbs: ["riso"], veg: ["pomodorini", "rucola"], aromi: ["limone", "erba cipollina"], minutes: 25, steps: [
    "Cuoci il {carbo} e raffreddalo.",
    "Scotta i {proteina} 2 minuti in acqua bollente salata.",
    "Unisci riso, gamberetti, pomodorini a metà e rucola; condisci con l'olio pesato, limone ed erba cipollina.",
  ] }),
  R({ id: "riso-gamberetti-curry", title: "Riso al curry con gamberetti, zucchine e carote", slots: ["pranzo"], proteins: ["crostacei"], carbs: ["riso"], veg: ["zucchine", "carote"], aromi: ["curry", "zenzero"], minutes: 25, steps: [
    "Cuoci il {carbo}.",
    "Salta zucchine e carote a dadini piccoli con l'olio pesato e zenzero, 5 minuti.",
    "Aggiungi i {proteina} e un cucchiaino di curry, 2 minuti, poi il riso scolato.",
  ] }),

  // ------------------------------------------------------------ con le patate al posto del riso
  R({ id: "patate-tonno-limone", title: "Patate e tonno con zucchine, limone e menta", slots: ["pranzo"], proteins: ["tonno"], carbs: ["patate"], veg: ["zucchine"], aromi: ["limone", "menta"], minutes: 25, steps: [
    "Lessa le {carbo} a cubetti per 12 minuti.",
    "Salta le zucchine a cubetti con l'olio pesato 5 minuti.",
    "Unisci patate, zucchine e {proteina} sgocciolato; condisci con succo e scorza di limone e menta.",
  ] }),
  R({ id: "patate-mozzarella-pomodorini", title: "Patate al forno con mozzarella filante e pomodorini", slots: ["pranzo"], proteins: ["mozzarella"], carbs: ["patate"], veg: ["pomodorini", "passata"], aromi: ["origano", "basilico"], minutes: 35, steps: [
    "Accendi il forno a 200 °C. Taglia le {carbo} a fette sottili e cuocile in teglia con l'olio pesato e origano, 20 minuti.",
    "Aggiungi la passata, i pomodorini a metà e la {proteina} a cubetti.",
    "Altri 8 minuti, finché la mozzarella fila. Basilico fresco.",
  ] }),
  R({ id: "patate-gamberetti-limone", title: "Insalata di patate e gamberetti al limone", slots: ["pranzo"], proteins: ["crostacei"], carbs: ["patate"], veg: ["zucchine", "rucola"], aromi: ["limone", "prezzemolo"], minutes: 25, steps: [
    "Lessa le {carbo} a cubetti per 12 minuti e lasciale intiepidire.",
    "Scotta i {proteina} 2 minuti in acqua bollente salata; salta le zucchine a dadini 4 minuti.",
    "Unisci tutto con la rucola, l'olio pesato, limone e prezzemolo.",
  ] }),
];

/** Colazione con il pancake della dieta: il gusto ruota tra aggiunte senza calorie. */
export const PANCAKE_FLAVOURS = ["alla cannella", "alla vaniglia", "al cacao amaro", "alla scorza d'arancia", "allo zenzero"];
export const PANCAKE_STEPS = [
  "Mescola lo yogurt e l'albume fino a ottenere un composto omogeneo.",
  "Aggiungi la farina di riso, mezzo cucchiaino di lievito per dolci, le gocce di cioccolato e dolcificante a piacere, più l'aroma del giorno.",
  "Lascia riposare 2–3 minuti.",
  "Versa il composto in una padella antiaderente e cuoci a fuoco medio 2–3 minuti per lato.",
];

/** Come si cuoce il carboidrato servito a parte. */
export const SIDE_CARB_STEP: Record<string, string> = {
  riso: "Cuoci il riso basmati in acqua salata per 12 minuti e servilo accanto.",
  patate: "Lessa le patate a cubetti per 12 minuti (oppure al forno a 200 °C per 25 minuti) e servile accanto.",
  pane_schar: "Accompagna con il pane Schär, anche tostato.",
  pane_integrale: "Accompagna con il pane integrale, anche tostato.",
  pasta: "Cuoci la pasta in acqua salata e servila accanto.",
};
