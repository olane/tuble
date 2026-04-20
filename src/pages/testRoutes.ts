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

  // --- Single-line, longer ---
  { label: "Piccadilly end-to-end", from: "heathrow-terminal-5", to: "cockfosters" },
  { label: "Central end-to-end", from: "west-ruislip", to: "epping" },
  { label: "Jubilee end-to-end", from: "stanmore", to: "stratford" },
  { label: "Bakerloo end-to-end", from: "elephant-and-castle", to: "harrow-and-wealdstone" },
  { label: "Victoria end-to-end", from: "brixton", to: "walthamstow-central" },
  { label: "District long haul", from: "richmond", to: "upminster" },
  { label: "Northern (both branches)", from: "morden", to: "high-barnet" },
  { label: "Metropolitan far north", from: "aldgate", to: "amersham" },

  // --- Parallel lines (multiple equally-optimal options) ---
  { label: "Parallel lines: Circle / District", from: "victoria", to: "embankment" },
  { label: "Parallel lines: H&C / Circle / Met", from: "baker-street", to: "kings-cross-st-pancras" },
  { label: "Parallel lines: Jubilee / DLR", from: "canning-town", to: "canary-wharf" },

  // --- Multi-interchange ---
  { label: "1 change", from: "paddington", to: "liverpool-street" },
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
  { label: "Central with split", from: "stratford", to: "ealing-broadway" },

  // --- Same-line branch changes (expect ≥2 segments on the same line) ---
  { label: "Northern branch change at Camden Town (Edgware → High Barnet)", from: "edgware", to: "high-barnet" },
  { label: "Northern no branch change (Mill Hill East → Morden)", from: "mill-hill-east", to: "morden" },
  { label: "Metropolitan branch changes at Chalfont & Harrow (Chesham → Uxbridge)", from: "chesham", to: "uxbridge" },
  { label: "District branch change at Earl's Court (Richmond → Wimbledon)", from: "richmond", to: "wimbledon" },

  // --- Branch-aware but no same-line change expected (trunk handles it) ---
  { label: "Northern branch change at Camden Town (Morden → High Barnet)", from: "morden", to: "high-barnet" },
  { label: "Piccadilly via shared trunk, no change (T4 → Uxbridge)", from: "heathrow-terminal-4", to: "uxbridge" },

  // --- Routes that use Elizabeth line as a shortcut ---
  { label: "Central via Elizabeth shortcut (West Ruislip → Epping)", from: "west-ruislip", to: "epping" },
  { label: "Central via Elizabeth (Hainault → Ealing Broadway)", from: "hainault", to: "ealing-broadway" },
];
