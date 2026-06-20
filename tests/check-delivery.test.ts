import { describe, it, expect } from "vitest";
import { runHeartbeat, loadChannels, type Channel } from "../src/delivery/heartbeat.js";
import { CanaryError } from "../src/lib/cli-result.js";

describe("delivery heartbeat (S5 / A4 — the differentiator)", () => {
  it("reports delivered:true when every mock channel is alive", async () => {
    const channels: Channel[] = [
      { name: "pd", type: "mock" },
      { name: "slack", type: "mock" },
    ];
    const r = await runHeartbeat(channels);
    expect(r.delivered).toBe(true);
    expect(r.dead).toEqual([]);
  });

  it("detects a dead channel AND escalates via a DIFFERENT alive channel within one cycle", async () => {
    const channels: Channel[] = [
      { name: "pd", type: "mock", dead: true },
      { name: "slack", type: "mock" },
    ];
    const r = await runHeartbeat(channels);
    expect(r.delivered).toBe(false);
    expect(r.dead).toContain("pd");
    expect(r.escalations).toEqual([{ deadChannel: "pd", viaChannel: "slack" }]);
    // the escalation channel must NOT be the dead one (S5 "a DIFFERENT channel")
    for (const e of r.escalations) expect(e.viaChannel).not.toBe(e.deadChannel);
  });

  it("cannot escalate when there is no alive channel (the page truly cannot be delivered)", async () => {
    const channels: Channel[] = [{ name: "only", type: "mock", dead: true }];
    const r = await runHeartbeat(channels);
    expect(r.delivered).toBe(false);
    expect(r.dead).toContain("only");
    expect(r.escalations).toEqual([]);
  });

  it("throws BAD_INPUT when no channels are configured (a firing rule != a delivered page)", async () => {
    await expect(runHeartbeat([])).rejects.toThrow(CanaryError);
  });

  it("loads channels from CANARY_DELIVERY_CHANNELS and narrows by --channel filter", () => {
    const prev = process.env.CANARY_DELIVERY_CHANNELS;
    process.env.CANARY_DELIVERY_CHANNELS = JSON.stringify([
      { name: "pd", type: "pagerduty", target: "x" },
      { name: "mock1", type: "mock" },
    ]);
    try {
      const all = loadChannels({});
      expect(all.length).toBe(2);
      const onlyMock = loadChannels({ channelFilter: "mock" });
      expect(onlyMock.map((c) => c.name)).toEqual(["mock1"]);
    } finally {
      if (prev === undefined) delete process.env.CANARY_DELIVERY_CHANNELS;
      else process.env.CANARY_DELIVERY_CHANNELS = prev;
    }
  });

  it("a synthetic page through a webhook includes a dedup_key (§8.5 — the most important field)", async () => {
    // Spin a tiny receiver that captures the body; assert dedup_key is present.
    const { createServer } = await import("node:http");
    let captured: Record<string, unknown> | null = null;
    const srv = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        captured = JSON.parse(body);
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const addr = srv.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const r = await runHeartbeat([
        { name: "wh", type: "webhook", target: `http://localhost:${port}/hook` },
      ]);
      expect(r.delivered).toBe(true);
      expect(captured).not.toBeNull();
      expect((captured as Record<string, unknown>).dedup_key).toBe("canary-heartbeat-wh");
    } finally {
      srv.close();
    }
  });
});
