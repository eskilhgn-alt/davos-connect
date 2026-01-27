// src/features/weather/anchormanQuotes.ts

export type AnchormanQuote = {
  quote: string;
  speaker: string;
  use: string;
};

export type QuoteCategory =
  | "sun_bluebird"
  | "powder_new_snow"
  | "storm_wind"
  | "whiteout_fog_flatlight"
  | "cold_snap"
  | "spring_slush_hot"
  | "ice_hardpack"
  | "apres";

export const ANCHORMAN_QUOTES: Record<QuoteCategory, AnchormanQuote[]> = {
  sun_bluebird: [
    { quote: "San Diego. Drink it in. It always goes down smooth.", speaker: "Ron Burgundy", use: "perfekt sol/bluebird" },
    { quote: "By the beard of Zeus!", speaker: "Ron Burgundy", use: "sol + hype" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy", use: "klassisk 'alt sitter'" },
    { quote: "I don't know how to put this, but I'm kind of a big deal.", speaker: "Ron Burgundy", use: "sol + selvtillit" },
    { quote: "I have many leather-bound books, and my apartment smells of rich mahogany.", speaker: "Ron Burgundy", use: "bluebird = unødvendig luksus" },
    { quote: "Super duper, gang! Super duper!", speaker: "Ron Burgundy", use: "sol = alt er super" },
  ],
  powder_new_snow: [
    { quote: "Cannonball!", speaker: "Ron Burgundy", use: "send det i nysnø" },
    { quote: "Panda Watch! The mood is tense.", speaker: "Brian Fantana", use: "førstespor-stemning" },
    { quote: "No commercials! No mercy!", speaker: "Public News anchor", use: "powder = null nåde" },
    { quote: "That's how I roll!", speaker: "Motorcyclist", use: "først ned / hard charging" },
    { quote: "This is happening.", speaker: "Motorcyclist", use: "nysnø = nå skjer det" },
    { quote: "Go time.", speaker: "Narrator", use: "nysnø-morgen" },
  ],
  storm_wind: [
    { quote: "Boy, that escalated quickly.", speaker: "Ron Burgundy", use: "vær som går fra 0 til 100" },
    { quote: "I mean, that really got out of hand fast!", speaker: "Ron Burgundy", use: "storm + kaos" },
    { quote: "It jumped up a notch.", speaker: "Champ Kind", use: "vinden tar over" },
    { quote: "There were horses and a man on fire...", speaker: "Brick Tamland", use: "ren storm-fantasi" },
    { quote: "The sewers run red with Burgundy's blood.", speaker: "Arturo Mendez", use: "overdrevent stormdrama" },
    { quote: "Policia!", speaker: "Arturo Mendez", use: "storm = 'løp'" },
  ],
  whiteout_fog_flatlight: [
    { quote: "I'm in a glass case of emotion!", speaker: "Ron Burgundy", use: "whiteout-panikk (humor)" },
    { quote: "I don't know what we're yelling about!", speaker: "Brick Tamland", use: "flatlys-forvirring" },
    { quote: "Loud noises!", speaker: "Brick Tamland", use: "tåke + stress" },
    { quote: "Agree to disagree.", speaker: "Ron Burgundy", use: "når fjellet nekter samarbeid" },
    { quote: "That doesn't make any sense.", speaker: "Ron Burgundy", use: "når sikten er 'nei'" },
    { quote: "I'm Ron Burgundy?", speaker: "Ron Burgundy", use: "når alt blir usikkert" },
  ],
  cold_snap: [
    { quote: "Mm, I love scotch. I love Scotch. Scotchy, Scotch, Scotch.", speaker: "Ron Burgundy", use: "sprengkulde = varm drikke-vibb" },
    { quote: "Here it goes down. Down into my belly.", speaker: "Ron Burgundy", use: "kulde = trøst" },
    { quote: "It's quite pungent.", speaker: "Ron Burgundy", use: "kul luft som 'stinger'" },
    { quote: "It stings the nostrils.", speaker: "Ron Burgundy", use: "iskald luft" },
    { quote: "In a good way.", speaker: "Ron Burgundy", use: "kulde men bra dag" },
    { quote: "60% of the time, it works every time.", speaker: "Brian Fantana", use: "selvtillit i kulda" },
  ],
  spring_slush_hot: [
    { quote: "It's so damn hot... milk was a bad choice!", speaker: "Ron Burgundy", use: "vårslush / varmegrader" },
    { quote: "Milk was a bad choice.", speaker: "Ron Burgundy", use: "kort versjon" },
    { quote: "I'm expressing my inner anguish THROUGH THE MAJESTY OF SONG!", speaker: "Ron Burgundy", use: "slush = dramatikk" },
    { quote: "Neat-o, gang.", speaker: "Ron Burgundy", use: "lett vårstemning" },
    { quote: "Super duper!", speaker: "Ron Burgundy", use: "sol + slush-humør" },
    { quote: "Cannonball!", speaker: "Ron Burgundy", use: "vårføre = lek" },
  ],
  ice_hardpack: [
    { quote: "Keep your head on a swivel.", speaker: "Ron Burgundy", use: "isføre = skjerp deg" },
    { quote: "That's bush. Bush league.", speaker: "Ron Burgundy", use: "hardpack = 'skjerpings'" },
    { quote: "If you were a man, I would punch you.", speaker: "Ron Burgundy", use: "isføre = aggressiv edge-energi" },
    { quote: "It's terrible!", speaker: "Ron Burgundy", use: "når det er glassføre" },
    { quote: "Big deal. I am very professional.", speaker: "Ron Burgundy", use: "hardpack = 'kjør riktig'" },
    { quote: "Anything you put on that prompter, Burgundy will read!", speaker: "Ed Harken", use: "isføre = alt du gjør får konsekvens" },
  ],
  apres: [
    { quote: "We've been coming to the same party for 12 years now...and in no way is that depressing.", speaker: "Ron Burgundy", use: "klassisk afterski-liv" },
    { quote: "Champ here. I'm all about havin' fun.", speaker: "Champ Kind", use: "après-modus" },
    { quote: "Time to musk up.", speaker: "Brian Fantana", use: "før afterski" },
    { quote: "It stings the nostrils. In a good way.", speaker: "Ron Burgundy", use: "shots/aftershave/après" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy", use: "avslutt kvelden" },
    { quote: "Go fuck yourself, San Diego!", speaker: "Ron Burgundy", use: "rowdy etterfest" },
  ],
};
