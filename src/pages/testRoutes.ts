/**
 * Hand-picked start/end pairs that exercise interesting cases of the
 * rendering engine. Grouped loosely by the shape of the route rather
 * than by any in-game difficulty.
 */
export interface TestRoute {
  label: string;
  from: string;
  to: string;
}

export const TEST_ROUTES: TestRoute[] = [
  // --- Tiny routes ---
  { label: "1 stop, same line", from: "oxford-circus", to: "tottenham-court-road" },
  { label: "OSI pair (Bank ↔ Monument)", from: "bank", to: "monument" },
  { label: "2 stops, same line", from: "victoria", to: "westminster" },
  { label: "Paddington to Liv Street", from: "paddington", to: "liverpool-street" },

  // --- Single-line end-to-end (some use Elizabeth line as a shortcut) ---
  { label: "Bakerloo end-to-end", from: "elephant-and-castle", to: "harrow-and-wealdstone" },
  { label: "Victoria end-to-end", from: "brixton", to: "walthamstow-central" },
  { label: "Metropolitan far north", from: "aldgate", to: "amersham" },
  { label: "Piccadilly end-to-end (via Elizabeth)", from: "heathrow-terminal-5", to: "cockfosters" },
  { label: "Central end-to-end", from: "west-ruislip", to: "epping" },
  { label: "Jubilee end-to-end (via Elizabeth/Met)", from: "stanmore", to: "stratford" },
  { label: "District long haul (via Elizabeth)", from: "richmond", to: "upminster" },

  // --- Parallel lines (multiple equally-optimal options) ---
  { label: "Parallel lines: Circle / District", from: "victoria", to: "embankment" },
  { label: "Parallel lines: H&C / Circle / Met", from: "baker-street", to: "kings-cross-st-pancras" },
  { label: "Parallel lines: Jubilee / DLR", from: "canning-town", to: "canary-wharf" },

  // --- Multi-interchange ---
  { label: "2 changes across centre", from: "wimbledon", to: "walthamstow-central" },
  { label: "Heathrow → Canary Wharf", from: "heathrow-terminal-5", to: "canary-wharf" },
  { label: "Richmond → Stratford", from: "richmond", to: "stratford" },
  { label: "Outer SW → Outer NE", from: "morden", to: "epping" },

  // --- Geographic zig-zags / backtracks ---
  { label: "Diagonal NW → SE", from: "harrow-and-wealdstone", to: "elephant-and-castle" },
  { label: "Short hop, forced change", from: "waterloo", to: "london-bridge" },
  { label: "Loop-ish (Circle line)", from: "tower-hill", to: "embankment" },

  // --- Branching edge cases ---
  { label: "Northern via Bank branch", from: "london-bridge", to: "kings-cross-st-pancras" },
  { label: "Northern: change at Camden Town (Edgware → High Barnet)", from: "edgware", to: "high-barnet" },
  { label: "Metropolitan: change at Harrow (Chesham → Uxbridge)", from: "chesham", to: "uxbridge" },
  { label: "District: change at Turnham Green (Richmond → Ealing Broadway)", from: "richmond", to: "ealing-broadway" },
  { label: "District: change at Earl's Court (Richmond → Wimbledon)", from: "richmond", to: "wimbledon" },
  { label: "Piccadilly: change at Acton Town (T4 → Uxbridge)", from: "heathrow-terminal-4", to: "uxbridge" },
  { label: "Piccadilly: change at Acton Town (T5 → Uxbridge)", from: "heathrow-terminal-5", to: "uxbridge" },
  { label: "Central: change at Woodford (Epping → Roding Valley)", from: "epping", to: "roding-valley" },

  // --- No branch change (same TfL through-route) ---
  { label: "Northern: no change (Morden → High Barnet)", from: "morden", to: "high-barnet" },
  { label: "Northern: no change (Mill Hill East → Morden)", from: "mill-hill-east", to: "morden" },
  { label: "Central: Hainault loop (via Elizabeth)", from: "hainault", to: "ealing-broadway" },

  // --- DLR ---
  { label: "DLR: Bank → Lewisham", from: "bank", to: "lewisham" },
  { label: "DLR: Stratford → Canary Wharf (DLR-only)", from: "stratford-international", to: "canary-wharf" },
  { label: "DLR: Beckton → Woolwich Arsenal", from: "beckton", to: "woolwich-arsenal" },
  { label: "DLR branch: Lewisham → Beckton (change at Poplar)", from: "lewisham", to: "beckton" },
  { label: "DLR → Tube: Cutty Sark → Westminster", from: "cutty-sark-for-maritime-greenwich", to: "westminster" },
  { label: "Tube → DLR: Oxford Circus → London City Airport", from: "oxford-circus", to: "london-city-airport" },
];
