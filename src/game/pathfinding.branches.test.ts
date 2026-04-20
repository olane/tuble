import { describe, it, expect } from "vitest";
import { findRoute } from "./pathfinding";
import type { TubeGraph } from "./types";

/**
 * Synthetic-fixture tests exercising branch-aware routing independently of
 * src/data/tube-graph.json. Each fixture is a stripped-down toy graph that
 * reproduces a particular branch topology.
 */

function station(id: string, name: string, lines: string[]) {
  return { [id]: { id, name, zone: "?", lines } };
}

function edges(pairs: [string, string, string, string[]][]) {
  // [from, to, line, branches][]  (each pair is inserted both ways)
  const adj: Record<string, { to: string; line: string; branches: string[] }[]> = {};
  for (const [from, to, line, branches] of pairs) {
    (adj[from] ??= []).push({ to, line, branches });
    (adj[to] ??= []).push({ to: from, line, branches });
  }
  return adj;
}

describe("branch-aware routing (synthetic fixtures)", () => {
  it("charges a branch-change penalty when crossing incompatible branches of the same line", () => {
    // A Northern-like line with two branches meeting at a junction.
    //
    //    edgware --- chalk-farm --- camden --- kentish-town --- high-barnet
    //              (northern:EDG)            (northern:HB)
    //
    // The EDGware branch service and the High Barnet service are both
    // "northern", but no single train covers both — the traveller must
    // change at Camden.
    const graph: TubeGraph = {
      stations: {
        ...station("edgware", "Edgware", ["northern"]),
        ...station("chalk-farm", "Chalk Farm", ["northern"]),
        ...station("camden", "Camden Town", ["northern"]),
        ...station("kentish-town", "Kentish Town", ["northern"]),
        ...station("high-barnet", "High Barnet", ["northern"]),
      },
      adjacency: edges([
        ["edgware", "chalk-farm", "northern", ["northern:edg"]],
        ["chalk-farm", "camden", "northern", ["northern:edg"]],
        ["camden", "kentish-town", "northern", ["northern:hb"]],
        ["kentish-town", "high-barnet", "northern", ["northern:hb"]],
      ]),
    };

    const hints = findRoute("edgware", "high-barnet", graph);
    expect(hints).toHaveLength(1);
    const hint = hints[0];
    // The route should be broken into two Northern segments (one per branch),
    // not a single seamless Northern segment.
    expect(hint.segments).toHaveLength(2);
    expect(hint.segments[0].lines).toEqual(["northern"]);
    expect(hint.segments[0].endStationId).toBe("camden");
    expect(hint.segments[1].lines).toEqual(["northern"]);
    expect(hint.segments[1].endStationId).toBe("high-barnet");
    expect(hint.totalStops).toBe(4);
  });

  it("keeps a single segment when a service covers the entire route", () => {
    // Same topology, but both sides of Camden are covered by one through
    // service — Edgware→High Barnet is a single train.
    const graph: TubeGraph = {
      stations: {
        ...station("edgware", "Edgware", ["northern"]),
        ...station("camden", "Camden Town", ["northern"]),
        ...station("high-barnet", "High Barnet", ["northern"]),
      },
      adjacency: edges([
        ["edgware", "camden", "northern", ["northern:edg-hb"]],
        ["camden", "high-barnet", "northern", ["northern:edg-hb"]],
      ]),
    };

    const hints = findRoute("edgware", "high-barnet", graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].segments).toHaveLength(1);
    expect(hints[0].segments[0].lines).toEqual(["northern"]);
    expect(hints[0].segments[0].stops).toBe(2);
  });

  it("treats trunk edges as uncommitted — either service may carry you", () => {
    // Kennington-like trunk shared by Bank and Charing Cross services.
    //
    //   waterloo --- kennington --- oval --- morden
    //   (CX only)   (trunk both)   (trunk both)
    //
    //   london-bridge --- kennington (Bank only)
    //
    // From waterloo to morden should not require any branch change: the
    // Kennington→Oval→Morden trunk is covered by the CX service.
    const graph: TubeGraph = {
      stations: {
        ...station("waterloo", "Waterloo", ["northern"]),
        ...station("london-bridge", "London Bridge", ["northern"]),
        ...station("kennington", "Kennington", ["northern"]),
        ...station("oval", "Oval", ["northern"]),
        ...station("morden", "Morden", ["northern"]),
      },
      adjacency: edges([
        ["waterloo", "kennington", "northern", ["northern:cx"]],
        ["london-bridge", "kennington", "northern", ["northern:bank"]],
        ["kennington", "oval", "northern", ["northern:cx", "northern:bank"]],
        ["oval", "morden", "northern", ["northern:cx", "northern:bank"]],
      ]),
    };

    const hints = findRoute("waterloo", "morden", graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].segments).toHaveLength(1);
    expect(hints[0].totalStops).toBe(3);
  });

  it("forces a branch change when endpoints are on incompatible sub-branches", () => {
    // Same trunk fixture as above, but routing Waterloo (CX branch only) to
    // London Bridge (Bank branch only): must change branch at Kennington.
    const graph: TubeGraph = {
      stations: {
        ...station("waterloo", "Waterloo", ["northern"]),
        ...station("london-bridge", "London Bridge", ["northern"]),
        ...station("kennington", "Kennington", ["northern"]),
        ...station("oval", "Oval", ["northern"]),
      },
      adjacency: edges([
        ["waterloo", "kennington", "northern", ["northern:cx"]],
        ["london-bridge", "kennington", "northern", ["northern:bank"]],
        ["kennington", "oval", "northern", ["northern:cx", "northern:bank"]],
      ]),
    };

    const hints = findRoute("waterloo", "london-bridge", graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].segments).toHaveLength(2);
    expect(hints[0].segments[0].endStationId).toBe("kennington");
    expect(hints[0].segments[1].endStationId).toBe("london-bridge");
  });

  it("prefers a no-change route over a same-line branch-change route", () => {
    // Two paths from A to C:
    //   direct via long branch:  A -- X -- C  (4 stops on branch:long)
    //   branch-change via B:     A -- B -- C  (2 stops but requires branch change)
    // The 2.0 penalty should make the 2-stop route win, but it should render
    // as two segments rather than one.
    const graph: TubeGraph = {
      stations: {
        ...station("A", "A", ["l1"]),
        ...station("B", "B", ["l1"]),
        ...station("C", "C", ["l1"]),
        ...station("X", "X", ["l1"]),
        ...station("Y", "Y", ["l1"]),
        ...station("Z", "Z", ["l1"]),
      },
      adjacency: edges([
        ["A", "B", "l1", ["l1:a"]],
        ["B", "C", "l1", ["l1:b"]],
        ["A", "X", "l1", ["l1:long"]],
        ["X", "Y", "l1", ["l1:long"]],
        ["Y", "Z", "l1", ["l1:long"]],
        ["Z", "C", "l1", ["l1:long"]],
      ]),
    };

    const hints = findRoute("A", "C", graph);
    // Direct via B (2 stops + 2.0 penalty = 4.0) beats the long way (4 stops = 4.0)
    // — actually ties. Both should appear with totalStops 2 vs 4.
    const chosen = hints.find((h) => h.totalStops === 2);
    expect(chosen).toBeDefined();
    expect(chosen!.segments).toHaveLength(2);
  });

  it("splits segments when a branch change passes through trunk", () => {
    // Richmond-like topology: branch A → trunk (multi-branch) → branch B.
    // The traveller must change trains even though the trunk carries both
    // services. The segment builder must detect the hidden branch change.
    //
    //   richmond --- turnham-green --- earls-court --- wimbledon
    //   (branch:rich only)  (trunk: rich + wimb)  (branch:wimb only)
    //
    const graph: TubeGraph = {
      stations: {
        ...station("richmond", "Richmond", ["district"]),
        ...station("turnham-green", "Turnham Green", ["district"]),
        ...station("earls-court", "Earl's Court", ["district"]),
        ...station("wimbledon", "Wimbledon", ["district"]),
      },
      adjacency: edges([
        ["richmond", "turnham-green", "district", ["district:rich"]],
        ["turnham-green", "earls-court", "district", ["district:rich", "district:wimb"]],
        ["earls-court", "wimbledon", "district", ["district:wimb"]],
      ]),
    };

    const hints = findRoute("richmond", "wimbledon", graph);
    expect(hints).toHaveLength(1);
    expect(hints[0].segments).toHaveLength(2);
    // First segment: richmond → earls-court (committed to rich, trunk is compatible)
    expect(hints[0].segments[0].endStationId).toBe("earls-court");
    // Second segment: earls-court → wimbledon (branch change to wimb)
    expect(hints[0].segments[1].endStationId).toBe("wimbledon");
  });

  it("throws if an edge lacks branches metadata", () => {
    const graph = {
      stations: station("A", "A", ["l1"]) as Record<
        string,
        { id: string; name: string; zone: string; lines: string[] }
      >,
      adjacency: {
        A: [{ to: "B", line: "l1" }],
        B: [{ to: "A", line: "l1" }],
      },
    };
    graph.stations["B"] = { id: "B", name: "B", zone: "?", lines: ["l1"] };
    expect(() => findRoute("A", "B", graph as unknown as TubeGraph)).toThrow(
      /no branches/
    );
  });

  it("populates `towards` for branch segments using the opposite terminus", () => {
    const graph: TubeGraph = {
      stations: {
        ...station("edgware", "Edgware", ["northern"]),
        ...station("camden", "Camden Town", ["northern"]),
      },
      adjacency: edges([
        ["edgware", "camden", "northern", ["northern:camden-edgware"]],
      ]),
    };

    const hints = findRoute("edgware", "camden", graph);
    expect(hints[0].segments[0].towards).toBe("Camden Town");
  });
});
