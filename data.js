// Shared data-fetching, classification, and formatting logic.
// Used by both index.html (map) and sources.html (data & freshness page).
// Exposed as window.FloodData — plain script, no bundler/build step.
// Also loadable under Node's test runner (no `window` there), hence globalThis.

(function () {
  const globalTarget = typeof window !== "undefined" ? window : globalThis;
  const BMA_API = "https://floodbangkok.bangkok.go.th/bkk/dds/services/api/floods/v1/items/";
  const LONGDO_EVENTS = "https://event.longdo.com/feed/json";
  // Undocumented, unauthenticated endpoint behind the official public Traffy
  // Fondue map (bangkok.traffy.in.th) — see docs/adr/0001 for why this is
  // used instead of Traffy's documented, auth-gated Exchange API.
  const TRAFFY_API = "https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2";
  // ThaiWater TWA's own map UI's canal-water-level GeoJSON endpoint — unpaginated,
  // grouped by basin. Requires the "x-api-key" header below: ThaiWater's official
  // JS bundle falls back to this exact public key whenever no signed-in user
  // token is present, so it's the same undocumented-but-public category as the
  // Traffy endpoint above. See CONTEXT.md "Related condition" and (once written)
  // docs/adr/0004 for the trade-off.
  const THAIWATER_CANAL_API = "https://twa-api-public.thaiwater.net/v2/waterlevel/canal";
  const THAIWATER_API_KEY = "TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x";

  // Hand-curated warning/critical water-level thresholds (meters), keyed by
  // ThaiWater's `station.stationCode` (BMA's own code, verbatim). ThaiWater's
  // API exposes no threshold fields of its own — these were parsed directly
  // from BMA's public dashboard (สำนักการระบายน้ำ กรุงเทพมหานคร, the same
  // agency that owns every one of these stations), https://weather.bangkok.go.th/water,
  // fetched and parsed from its raw server-rendered HTML table on 2026-09-28
  // (not a summarized/approximate read — the table's "ด้านใน"/inside-canal-
  // side current-level column was cross-checked against ThaiWater's live
  // `measureValue` for several shared stations to confirm this is the right
  // column to pair with, out of that table's three separate inside/outside/
  // river threshold pairs).
  //
  // A handful of stations publish a threshold pair where criticalM <=
  // warningM (e.g. a pump/gate station where a *low* reading is the actual
  // problem, not a high one) — those are deliberately left out of this table
  // rather than guessed at, since we don't have the engineering context to
  // know which direction is "worse" for that station. Missing from this
  // table at all (either BMA doesn't list the station, or its thresholds are
  // backwards) means `waterLevelStatus()` gets `null` and the station keeps
  // the existing neutral fallback color — see CONTEXT.md "Water-level status".
  //
  // This is a one-time hand-curated snapshot, not a live sync: BMA may
  // revise these numbers, add, or remove stations at any time without
  // this table following along. See docs/adr/0005-canal-water-level-status.md.
  const CANAL_STATION_THRESHOLDS = {
    "C00000002-WL.AJP.01": { warningM: 0.71, criticalM: 0.89 },
    "C00000002-WL.ANX.01": { warningM: 0.6, criticalM: 0.8 },
    "C00000002-WL.BAM.01": { warningM: 0.8, criticalM: 1.01 },
    "C00000002-WL.BBN.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BBN.03": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.BBR.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BBR.02": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.BBU.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.BCN.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BCN.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BCN.03": { warningM: 0.7, criticalM: 1.0 },
    "C00000002-WL.BJK.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BJK.02": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.BJK.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BJK.04": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BKA.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.BKA.02": { warningM: 0.7, criticalM: 0.9 },
    "C00000002-WL.BKA.03": { warningM: 0.5, criticalM: 0.7 },
    "C00000002-WL.BKA.04": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BKB.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.BKG.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.BKT.01": { warningM: 0.33, criticalM: 0.41 },
    "C00000002-WL.BKY.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.BKY.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BLP.02": { warningM: 1.65, criticalM: 1.85 },
    "C00000002-WL.BLY.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.BLY.02": { warningM: 0.92, criticalM: 1.15 },
    "C00000002-WL.BMA.02": { warningM: 2.14, criticalM: 2.68 },
    "C00000002-WL.BMK.01": { warningM: -0.3, criticalM: 0.0 },
    "C00000002-WL.BNA.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BNA.02": { warningM: 0.5, criticalM: 0.7 },
    "C00000002-WL.BNA.03": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.BNA.04": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.BNJ.01": { warningM: -0.5, criticalM: -0.4 },
    "C00000002-WL.BNJ.02": { warningM: -0.3, criticalM: -0.1 },
    "C00000002-WL.BNJ.03": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.BNJ.04": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BNS.01": { warningM: 2.78, criticalM: 3.47 },
    "C00000002-WL.BOA.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BOA.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BOA.03": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BPA.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.BPK.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BPM.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BPM.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BPM.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BPM.04": { warningM: 0.6, criticalM: 1.0 },
    "C00000002-WL.BPN.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BSK.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.BSU.01": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.BSU.03": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.BSU.04": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.BSU.05": { warningM: 0.3, criticalM: 0.5 },
    "C00000002-WL.BSU.06": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.BTL.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.BTY.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.BWK.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.BWK.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BWK.03": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.BYI.01": { warningM: 0.7, criticalM: 0.9 },
    "C00000002-WL.BYK.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.BYK.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.CKS.01": { warningM: -0.3, criticalM: -0.2 },
    "C00000002-WL.CKS.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.CKS.03": { warningM: 0.51, criticalM: 0.64 },
    "C00000002-WL.CNS.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.CPA.01": { warningM: 1.6, criticalM: 1.8 },
    "C00000002-WL.CPA.02": { warningM: 0.93, criticalM: 1.16 },
    "C00000002-WL.CYI.01": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.CYI.02": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.CYI.03": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.DKN.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.FTM.01": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.HKG.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.HKG.02": { warningM: 0.1, criticalM: 0.3 },
    "C00000002-WL.HMK.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.HMK.02": { warningM: 0.68, criticalM: 0.79 },
    "C00000002-WL.HMK.03": { warningM: 0.82, criticalM: 1.03 },
    "C00000002-WL.JRN.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KBU.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.KBU.02": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.KCD.01": { warningM: -0.4, criticalM: -0.2 },
    "C00000002-WL.KDN.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.KJA.01": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.KJA.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KJG.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KJK.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KJK.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KJN.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KJN.02": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.KJT.01": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.KJU.01": { warningM: 1.65, criticalM: 1.85 },
    "C00000002-WL.KKD.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.KKD.02": { warningM: 0.6, criticalM: 0.8 },
    "C00000002-WL.KKD.03": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.KKD.04": { warningM: 0.5, criticalM: 1.0 },
    "C00000002-WL.KKO.01": { warningM: 1.2, criticalM: 1.7 },
    "C00000002-WL.KKS.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KKS.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KKS.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KKS.04": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KKY.01": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.KKY.02": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.KLA.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KLD.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KLD.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KLT.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KMN.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.KNB.01": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.KNB.02": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.KPG.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.KPM.01": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.KPM.03": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.KPM.04": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.KPM.05": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.KPM.06": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.KSG.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.KSI.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.KSK.01": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.KSM.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.KSM.02": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.KSO.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.KSO.02": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.KTY.01": { warningM: -0.4, criticalM: -0.2 },
    "C00000002-WL.LBK.02": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.LBK.03": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.LCL.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.LCL.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.LKB.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.LOA.01": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.LPC.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.LPG.02": { warningM: 1.0, criticalM: 1.1 },
    "C00000002-WL.LPG.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.LPI.02": { warningM: 0.7, criticalM: 0.9 },
    "C00000002-WL.LPN.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.LPP.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.LPT.03": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.LPW.01": { warningM: 0.2, criticalM: 0.4 },
    "C00000002-WL.LPW.03": { warningM: 0.6, criticalM: 0.75 },
    "C00000002-WL.LPW.04": { warningM: 0.05, criticalM: 0.15 },
    "C00000002-WL.LPW.05": { warningM: -0.1, criticalM: 0.1 },
    "C00000002-WL.LSG.01": { warningM: 0.0, criticalM: 0.2 },
    "C00000002-WL.LSM.01": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.LYW.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.LYW.02": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.MCM.01": { warningM: 1.12, criticalM: 1.4 },
    "C00000002-WL.MFS.01": { warningM: 1.02, criticalM: 1.27 },
    "C00000002-WL.MKT.01": { warningM: 0.62, criticalM: 0.77 },
    "C00000002-WL.MSW.01": { warningM: 1.8, criticalM: 2.1 },
    "C00000002-WL.MSW.02": { warningM: 1.8, criticalM: 2.0 },
    "C00000002-WL.MSW.03": { warningM: 1.8, criticalM: 2.0 },
    "C00000002-WL.MTG.01": { warningM: 1.46, criticalM: 1.83 },
    "C00000002-WL.NBN.01": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.NCH.02": { warningM: 1.92, criticalM: 2.4 },
    "C00000002-WL.NK1.01": { warningM: 1.15, criticalM: 1.44 },
    "C00000002-WL.NK3.01": { warningM: 0.7, criticalM: 0.9 },
    "C00000002-WL.NKW.02": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.NSG.01": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.OAG.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.ORC.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.PKG.01": { warningM: 2.3, criticalM: 2.5 },
    "C00000002-WL.PKN.01": { warningM: -0.2, criticalM: -0.1 },
    "C00000002-WL.PLK.01": { warningM: 1.2, criticalM: 1.4 },
    "C00000002-WL.PLP.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.PNM.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.PSC.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.PSC.02": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.PSC.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.PSC.05": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.PSI.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.PSR.01": { warningM: 1.1, criticalM: 1.2 },
    "C00000002-WL.PSR.02": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.PSR.03": { warningM: 1.0, criticalM: 1.2 },
    "C00000002-WL.PSR.04": { warningM: 1.05, criticalM: 1.15 },
    "C00000002-WL.PSR.05": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.PST.01": { warningM: 0.15, criticalM: 0.19 },
    "C00000002-WL.PWT.01": { warningM: -0.2, criticalM: -0.1 },
    "C00000002-WL.PWT.02": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.PWT.04": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.PWT.05": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.PWT.06": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.PYW.01": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.RHN.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.RJK.01": { warningM: 0.55, criticalM: 0.6 },
    "C00000002-WL.RMT.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.RMT.02": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.SBR.01": { warningM: 1.8, criticalM: 2.0 },
    "C00000002-WL.SBR.02": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.SBT.01": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.SCO.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.SDN.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.SKG.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.SKT.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.SKT.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.SLL.01": { warningM: 0.1, criticalM: 0.25 },
    "C00000002-WL.SMK.01": { warningM: 0.35, criticalM: 0.44 },
    "C00000002-WL.SNC.01": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.SNC.02": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.SNC.03": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.SNO.01": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.SOL.01": { warningM: 0.65, criticalM: 0.81 },
    "C00000002-WL.SRE.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.SRG.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.SSB.01": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.SSB.03": { warningM: 0.0, criticalM: 0.15 },
    "C00000002-WL.SSB.04": { warningM: 0.0, criticalM: 0.2 },
    "C00000002-WL.SSB.06": { warningM: 0.2, criticalM: 0.35 },
    "C00000002-WL.SSB.08": { warningM: 0.35, criticalM: 0.45 },
    "C00000002-WL.SSB.09": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.SSB.10": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.SSB.11": { warningM: 1.0, criticalM: 1.1 },
    "C00000002-WL.SSB.12": { warningM: 1.0, criticalM: 1.1 },
    "C00000002-WL.SSG.01": { warningM: 1.2, criticalM: 1.7 },
    "C00000002-WL.SSM.01": { warningM: 1.0, criticalM: 1.1 },
    "C00000002-WL.SSN.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.SSN.02": { warningM: 0.4, criticalM: 0.5 },
    "C00000002-WL.SSN.04": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.SSN.06": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.SSN.07": { warningM: 0.0, criticalM: 0.1 },
    "C00000002-WL.SSN.08": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.SSN.10": { warningM: -0.1, criticalM: 0.0 },
    "C00000002-WL.SST.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.STN.01": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.STN.02": { warningM: 0.4, criticalM: 0.6 },
    "C00000002-WL.STN.03": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.STR.01": { warningM: 0.0, criticalM: 0.2 },
    "C00000002-WL.SWA.01": { warningM: 0.7, criticalM: 0.8 },
    "C00000002-WL.SWU.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.TCG.01": { warningM: -0.5, criticalM: -0.2 },
    "C00000002-WL.TPK.02": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.TPK.03": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.TSK.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.TTN.01": { warningM: 0.1, criticalM: 0.2 },
    "C00000002-WL.TUT.02": { warningM: 0.3, criticalM: 0.5 },
    "C00000002-WL.TWW.01": { warningM: 0.9, criticalM: 1.0 },
    "C00000002-WL.TWW.02": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.TWW.03": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.TWW.04": { warningM: 0.8, criticalM: 0.9 },
    "C00000002-WL.TWW.05": { warningM: 0.6, criticalM: 0.7 },
    "C00000002-WL.VPD.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.VPD.02": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.VPD.03": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.VPV.01": { warningM: 0.2, criticalM: 0.3 },
    "C00000002-WL.WHK.01": { warningM: 0.89, criticalM: 1.11 },
    "C00000002-WL.WKT.01": { warningM: 1.65, criticalM: 1.85 },
    "C00000002-WL.WLS.01": { warningM: 0.8, criticalM: 1.0 },
    "C00000002-WL.WSI.01": { warningM: 0.5, criticalM: 0.6 },
    "C00000002-WL.WSV.01": { warningM: 0.6, criticalM: 0.8 },
    "C00000002-WL.WTK.01": { warningM: 0.3, criticalM: 0.4 },
    "C00000002-WL.YPE.01": { warningM: 1.65, criticalM: 1.85 },
    "C00000002-WL.YPN.01": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.YPN.02": { warningM: -0.2, criticalM: 0.0 },
    "C00000002-WL.YSN.02": { warningM: 0.2, criticalM: 0.4 },
  };
  // Traffy attaches this exact stock "ศูนย์กทม. 1555" call-center logo as
  // photo_url on tickets forwarded without an actual citizen photo — not a
  // real per-report image. Confirmed live: ~56% of tickets share this one
  // URL verbatim while every genuine upload has a distinct one. Treated as
  // "no photo" so we never invite a user to "look at the photo" for evidence
  // that isn't there.
  const TRAFFY_PLACEHOLDER_PHOTO_URL =
    "https://storage.googleapis.com/traffy_public_bucket/attachment/2022-12/da2125e781282589d482070c3dba1726aa16a4a7.jpg";

  // BMA flood centre's hand-edited "flooded roads" Google Sheet (the declared
  // source behind now.bangkok.go.th's CCTV flood list). Undocumented, no
  // per-row timestamp, columns/gid may change — same risk class as ADR-0001.
  // See .scratch/peer-site-research/notes.md §6.2.
  const FLOOD_CENTRE_SHEET_CSV =
    "https://docs.google.com/spreadsheets/d/1CcX-TrFAOe1TdrWHK1XPAiaXqgQfdT9wvU_TCeFPmDs/gviz/tq?tqx=out:csv&gid=1730237192";

  const REFRESH_MS = 3 * 60 * 1000; // 3 min, matches BMA sensor refresh cadence
  const BMA_STALE_MS = 3 * 60 * 60 * 1000; // ignore BMA notifications older than 3h
  const LONGDO_FALLBACK_MS = 3 * 60 * 60 * 1000; // if a Longdo report has no "stop", expire after 3h
  // Absolute ceiling applied even when a Longdo report DOES have a `stop`.
  // Some entries carry a `stop` that rolls forward with the current day
  // (observed live: start=2026-01-30, stop still "today 23:59:59" almost 8
  // months later) — trusting `stop` alone can keep a dead report "active"
  // indefinitely. Set well above the longest legitimate multi-day highway
  // advisory observed live (~18.5 days) so real ongoing reports aren't
  // dropped early, but well below the observed anomaly (~241 days).
  const LONGDO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const TRAFFY_FALLBACK_MS = LONGDO_FALLBACK_MS; // same 3h closure fallback, reused per spec
  const STALE_WARN_MIN = 60; // flag a point as "stale" in the UI past this age

  // Depth thresholds (cm) for car passability — adjustable, transparent.
  const THRESH_YELLOW = 10; // >=10cm: passable with caution / high clearance only
  const THRESH_RED = 30; // >30cm: treat as impassable by car

  const STATUS_RANK = { red: 3, yellow: 2, gray: 1, green: 0 };
  const STATUS_BADGE = { red: "BLOCKED", yellow: "CAUTION", green: "CLEAR", gray: "UNKNOWN" };

  // The Longdo/iTIC feed is nationwide (it includes reports from other provinces, e.g.
  // Chon Buri) — this app is Bangkok-scoped, so we filter to a generous Bangkok
  // metropolitan bounding box. BMA's own feed is Bangkok-only already, no filter needed.
  const BKK_BBOX = { latMin: 13.49, latMax: 13.95, lngMin: 100.33, lngMax: 100.93 };
  function inBangkok(lat, lng) {
    return lat >= BKK_BBOX.latMin && lat <= BKK_BBOX.latMax && lng >= BKK_BBOX.lngMin && lng <= BKK_BBOX.lngMax;
  }

  function parseDepthCm(text) {
    if (!text) return null;
    const m = String(text).match(/(\d+(?:\.\d+)?)\s*(?:ซม|cm)/i);
    return m ? parseFloat(m[1]) : null;
  }

  // trustedDepth: true only for a directly-measured sensor reading (BMA) —
  // that's authoritative, so a vague/partial text mention like "small cars
  // can pass" must not be allowed to downgrade it. For Longdo/Traffy,
  // depthCm is itself only ever regex-scraped from this same free text, so
  // the explicit-claim override is at least as reliable as the number.
  function classify(depthCm, text, { trustedDepth = false } = {}) {
    const t = (text || "").toLowerCase();
    // "ไม่สามารถผ่าน(ได้)?" ("cannot pass") is a fixed Thai idiom that
    // contains "ผ่านได้" verbatim — matched here FIRST so it can't fall
    // through to the positive-passable check below. Deliberately NOT a
    // generic "ไม่ ... ผ่านได้ within N characters" window: that also
    // matched unrelated negations sharing the sentence (e.g. "ไม่หนัก
    // ผ่านได้สบายๆ" — "ไม่" negates "หนัก", not "ผ่านได้" — which must stay
    // "green"), so this only matches the specific fixed collocation.
    if (/ผ่านไม่ได้|ไม่สามารถผ่าน(?:ได้)?|impassable|not\s*passable/i.test(t)) return "red";
    // An explicit "passable" claim is evidence about the actual outcome, not
    // a guess — same footing as the "impassable" check above, and checked
    // before any parsed depth figure so a stray/unrelated cm number in the
    // same text (a historical peak, a different spot) can't override it. See
    // docs/adr/0003.
    if (!(trustedDepth && depthCm != null) && /ผ่านได้|passable/i.test(t)) return "green";
    if (depthCm != null) {
      if (depthCm > THRESH_RED) return "red";
      if (depthCm >= THRESH_YELLOW) return "yellow";
      return "green";
    }
    return "gray";
  }

  // A Citizen report (Traffy Fondue) is a single unverified submission, so it
  // can never independently produce a "blocked" verdict — see CONTEXT.md.
  function capCitizenSeverity(status) {
    return status === "red" ? "yellow" : status;
  }

  // A malformed date string (`new Date(...).getTime()`) yields NaN, which
  // is `!= null` — so callers doing `x != null` staleness checks would treat
  // an unparseable date as a valid, very-far-future timestamp instead of
  // "no date at all". Normalized to null here so every such check behaves
  // the same as a genuinely missing field.
  //
  // BMA's feed carries full ISO 8601 with an explicit `Z` (UTC). Longdo/iTIC
  // and Traffy Fondue instead send a naive "YYYY-MM-DD HH:MM:SS" with no
  // timezone marker at all — confirmed live to be Bangkok local time
  // (UTC+7), not UTC. `new Date()` parses a marker-less date-time string as
  // local time in whatever timezone the *viewing device* is set to, not
  // Bangkok time — silently wrong (and wrong by exactly that device's UTC
  // offset) for any viewer not set to Asia/Bangkok. `+07:00` is appended
  // only when no zone marker is already present, so BMA's `Z` strings are
  // untouched.
  function parseDateMs(s) {
    if (!s) return null;
    let str = String(s).replace(" ", "T");
    if (!/[Zz]|[+-]\d\d:?\d\d$/.test(str)) str += "+07:00";
    const ms = new Date(str).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  function ageMinutes(iso) {
    const ms = parseDateMs(iso);
    if (ms == null) return Infinity;
    return (Date.now() - ms) / 60000;
  }

  async function fetchJSON(url, extraHeaders) {
    const res = await fetch(url, { headers: { Accept: "application/json", ...extraHeaders } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  async function loadBMA() {
    const [profileRes, notifRes] = await Promise.all([
      fetchJSON(BMA_API + "sensor_profile?limit=-1"),
      // NOTE: sort=-date_created is unreliable on this feed — many rows come back with
      // date_created:null and out of order. -id is a reliable insertion-order proxy for
      // "most recent report", and start_flood (never null in samples) is used for the
      // actual age/staleness check and display timestamp.
      fetchJSON(BMA_API + "flood_notification?limit=500&sort=-id"),
    ]);
    const profiles = new Map((profileRes.data || []).map((p) => [p.id, p]));

    const latestBySensor = new Map();
    for (const n of notifRes.data || []) {
      const sid = n.sensor_profile;
      if (latestBySensor.has(sid)) continue; // already sorted desc by id (most recent first)
      latestBySensor.set(sid, n);
    }

    const points = [];
    for (const [sid, profile] of profiles) {
      const notif = latestBySensor.get(sid);
      if (!notif) continue;
      const ts = notif.start_flood || notif.date_created;
      const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
      const active = !notif.end_flood && age < BMA_STALE_MS;
      if (!active) continue; // only surface points with a currently-active report

      const depthCm = parseFloat(notif.value);
      const text = notif.text;
      points.push({
        key: `bma-${sid}`,
        label: profile.road || profile.name,
        sublabel: `${profile.name} · ${profile.district || ""}`,
        status: classify(depthCm, text, { trustedDepth: true }),
        depthCm,
        updated: ts,
        source: "BMA",
        lat: profile.lat,
        lng: profile.long,
        text,
      });
    }
    return { points, sensorCount: profiles.size, notificationCount: (notifRes.data || []).length };
  }

  async function loadLongdo() {
    return parseLongdo(await fetchJSON(LONGDO_EVENTS), Date.now());
  }

  // Pure parser — `now` (ms) is a parameter so it's testable with fixtures.
  function parseLongdo(events, now) {
    const points = [];
    const photos = []; // Report photos for the gallery — same flood/Bangkok/expiry filters as points
    let floodEventCount = 0;
    for (const e of events) {
      if (e.icon !== "flood") continue;
      floodEventCount++;
      const lat = parseFloat(e.latitude);
      const lng = parseFloat(e.longitude);
      if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;

      const stopMs = parseDateMs(e.stop);
      const startMs = parseDateMs(e.start);
      // No `stop` at all: use the tight LONGDO_FALLBACK_MS (our only
      // staleness signal). A `stop` present: trust it, but still cap age at
      // LONGDO_MAX_AGE_MS — see that constant's comment for why `stop` alone
      // isn't safe to trust indefinitely. See CONTEXT.md "Event report".
      const stopExpired = stopMs != null && stopMs < now;
      // Age-cap only kicks in when there's a `start` to measure it from.
      // `stop` present but `start` missing isn't observed in the live feed
      // (every flood event currently carries both) — in that theoretical
      // case, trust `stop` alone rather than dropping a report `stop` says
      // is still active. Only when NEITHER is present is there truly no
      // signal at all, so that's the one case treated as expired outright.
      const maxAgeMs = stopMs != null ? LONGDO_MAX_AGE_MS : LONGDO_FALLBACK_MS;
      const ageExpired = startMs != null ? now - startMs > maxAgeMs : stopMs == null;
      const expired = stopExpired || ageExpired;
      if (expired) continue;

      const text = `${e.title_en || e.title || ""} — ${e.description_en || e.description || ""}`;
      const depthCm = parseDepthCm(text);

      const updated = e.start ? e.start.replace(" ", "T") : null;
      const source = `Longdo/iTIC${e.contributor ? " · " + e.contributor : ""}`;
      const key = `longdo-${e.eid}`;
      points.push({
        key,
        label: e.title_en || e.title,
        sublabel: e.description_en || e.description || "",
        status: classify(depthCm, text),
        depthCm,
        updated,
        source,
        lat,
        lng,
        text,
      });
      // `images` is an array of event.longdo.com/image/view/<id> URLs on some
      // events. A photo is evidence only; it never touches `status`.
      const image = Array.isArray(e.images) ? e.images.find((u) => /^https?:\/\//i.test(u)) : null;
      if (image && startMs != null) {
        photos.push({
          key,
          photoUrl: image,
          updated,
          tsMs: startMs,
          place: e.title || e.title_en || "",
          district: null, // Longdo events carry no district field; they match by place text only
          searchText: `${e.title || ""} ${e.title_en || ""} ${e.description || ""} ${e.description_en || ""}`,
          source,
          lat,
          lng,
          resolved: false,
        });
      }
    }
    return { points, photos, eventCount: events.length, floodEventCount };
  }

  // Flood-only query reaches back ~25 h (vs ~13 h plain) — see ADR-0001
  // addendum. Both the parameter and the plain call are undocumented, so the
  // plain call is the fallback; if both fail the error propagates and the
  // source shows as unavailable.
  const TRAFFY_FLOOD_API = TRAFFY_API + "?problem_type=" + encodeURIComponent("น้ำท่วม");

  async function loadTraffy() {
    let geojson = null;
    try {
      const floodOnly = await fetchJSON(TRAFFY_FLOOD_API);
      if (floodOnly && Array.isArray(floodOnly.features) && floodOnly.features.length) geojson = floodOnly;
    } catch (e) {
      // fall through to the plain call
    }
    if (!geojson) geojson = await fetchJSON(TRAFFY_API);
    return parseTraffy(geojson, Date.now());
  }

  // Pure parser — `now` (ms) is a parameter so it's testable with fixtures.
  function parseTraffy(geojson, now) {
    const features = (geojson && geojson.features) || [];
    const points = [];
    // Report photo candidates for the "Latest photos" gallery: independent of
    // the verdict window (ADR-0007), so expired reports are kept here.
    const photos = [];
    let floodTicketCount = 0;

    // A real citizen-uploaded photo gets a unique per-ticket URL (observed:
    // content-addressed, e.g. .../attachment/<yyyy-mm>/<hash>.<ext>). A URL
    // repeated across multiple tickets in this same fetch is therefore a
    // shared stock/placeholder image, not real evidence — this is how we
    // caught the "ศูนย์กทม. 1555" call-center logo (reused on ~56% of
    // tickets observed live) without hardcoding that one URL, so detection
    // still works if Traffy adds or rotates placeholder assets.
    // TRAFFY_PLACEHOLDER_PHOTO_URL is kept as a belt-and-suspenders fallback
    // for a fetch too small to show the duplication. See docs/adr/0003.
    const photoUrlCounts = new Map();
    for (const f of features) {
      const u = f.properties && f.properties.photo_url;
      if (u) photoUrlCounts.set(u, (photoUrlCounts.get(u) || 0) + 1);
    }
    // Threshold of 3+ rather than "any duplicate" — two tickets legitimately
    // sharing one photo (a resubmission, or two citizens uploading the same
    // shot) is plausible; the actual placeholder repeats two orders of
    // magnitude more than that (168 of 300 tickets observed live), so 3+
    // still catches it with room to spare while not zeroing out a real but
    // coincidentally-duplicated photo.
    const isRealPhoto = (url) =>
      !!url && url !== TRAFFY_PLACEHOLDER_PHOTO_URL && photoUrlCounts.get(url) < 3;

    for (const f of features) {
      const props = f.properties || {};
      const types = props.problem_type_fondue || (props.type ? [props.type] : []);
      if (!types.includes("น้ำท่วม")) continue;
      floodTicketCount++;

      const coords = f.geometry && f.geometry.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords; // GeoJSON order — swapped to this app's {lat, lng}
      if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;

      // Status can be reverted (per research), so closure never trusts it
      // alone — see CONTEXT.md "Citizen report" and docs/adr/0001.
      const resolved = /เสร็จสิ้น|ไม่เกี่ยวข้อง|finish/i.test(
        `${props.state || ""} ${props.state_type_latest || ""}`
      );
      const ts = props.timestamp ? props.timestamp.replace(" ", "T") : null;
      const tsMs = parseDateMs(props.timestamp);
      const age = tsMs != null ? now - tsMs : Infinity;
      const expired = age > TRAFFY_FALLBACK_MS;

      if (tsMs != null && isRealPhoto(props.photo_url)) {
        photos.push({
          key: `traffy-${props.ticket_id || f.id}`,
          photoUrl: props.photo_url,
          updated: ts,
          tsMs,
          place: props.address || props.subdistrict || "",
          district: normalizeDistrict(props.district),
          searchText: `${props.district || ""} ${props.subdistrict || ""} ${props.address || ""} ${props.description || ""}`,
          source: "Traffy Fondue",
          lat,
          lng,
          resolved,
        });
      }
      if (resolved || expired) continue;

      const text = `${props.description || ""} ${props.address || ""}`;
      const depthCm = parseDepthCm(text);

      points.push({
        key: `traffy-${props.ticket_id || f.id}`,
        label: props.address || props.subdistrict || "รายงานจากประชาชน",
        sublabel: `${props.subdistrict || ""} ${props.district || ""}`.trim(),
        status: capCitizenSeverity(classify(depthCm, text)),
        depthCm,
        updated: ts,
        source: "Traffy Fondue",
        lat,
        lng,
        text,
        photoUrl: isRealPhoto(props.photo_url) ? props.photo_url : null,
      });
    }

    return { points, photos, ticketCount: features.length, floodTicketCount };
  }

  // The 50 Bangkok districts (Thai, without the "เขต" prefix), vendored so the
  // Area flood view's picker lists a district even when it has no reports.
  // Traffy's `district` values were checked live (2026-10-01): clean Thai names,
  // no blanks, all Bangkok.
  const BANGKOK_DISTRICTS = [
    "พระนคร", "ดุสิต", "หนองจอก", "บางรัก", "บางเขน", "บางกะปิ", "ปทุมวัน", "ป้อมปราบศัตรูพ่าย", "พระโขนง", "มีนบุรี",
    "ลาดกระบัง", "ยานนาวา", "สัมพันธวงศ์", "พญาไท", "ธนบุรี", "บางกอกใหญ่", "ห้วยขวาง", "คลองสาน", "ตลิ่งชัน", "บางกอกน้อย",
    "บางขุนเทียน", "ภาษีเจริญ", "หนองแขม", "ราษฎร์บูรณะ", "บางพลัด", "ดินแดง", "บึงกุ่ม", "สาทร", "บางซื่อ", "จตุจักร",
    "บางคอแหลม", "ประเวศ", "คลองเตย", "สวนหลวง", "จอมทอง", "ดอนเมือง", "ราชเทวี", "ลาดพร้าว", "วัฒนา", "บางแค",
    "หลักสี่", "สายไหม", "คันนายาว", "สะพานสูง", "วังทองหลาง", "คลองสามวา", "บางนา", "ทวีวัฒนา", "ทุ่งครุ", "บางบอน",
  ];

  function normalizeDistrict(d) {
    return (d || "").trim().replace(/^เขต\s*/, "");
  }

  // Report counts per district within `windowMs`, from the same resolved-
  // excluded, placeholder-free photo list the gallery uses. All 50 districts
  // are returned (zeros included), most reports first; Bangkok order breaks
  // ties. A count of reports only — no severity or flood level is implied.
  function countReportsByDistrict(photos, now, windowMs) {
    const counts = new Map(BANGKOK_DISTRICTS.map((d) => [d, 0]));
    for (const p of photos || []) {
      if (p.resolved || !p.district || !counts.has(p.district)) continue;
      if (now - p.tsMs <= windowMs) counts.set(p.district, counts.get(p.district) + 1);
    }
    return [...counts].map(([district, count]) => ({ district, count })).sort((a, b) => b.count - a.count);
  }

  // Pure gallery logic for the "Latest photos" section and the Area flood
  // view: newest first, resolved tickets hidden, no freshness cap (a photo's
  // age is shown, not filtered). `area` ({district, query}, both optional)
  // narrows to a district and/or a place-text match. When an area leaves
  // nothing, `emptyReason` says why: "stale" if even the newest photo anywhere
  // is older than the verdict window (we can't say), else "none" (the feed is
  // current and this area has no reports). Never implies "dry".
  function buildPhotoGallery(photos, now, limit, offset, area) {
    const all = (photos || []).filter((p) => !p.resolved).sort((a, b) => b.tsMs - a.tsMs);
    const district = normalizeDistrict(area && area.district);
    const query = ((area && area.query) || "").trim().toLowerCase();
    const sorted = all.filter(
      (p) =>
        (!district || p.district === district) &&
        (!query || (p.searchText || p.place || "").toLowerCase().includes(query))
    );
    let emptyReason = null;
    if ((district || query) && sorted.length === 0) {
      const newestMs = all.length ? all[0].tsMs : -Infinity;
      emptyReason = now - newestMs > TRAFFY_FALLBACK_MS ? "stale" : "none";
    }
    const items = sorted.slice(offset, offset + limit).map((p) => ({
      key: p.key,
      photoUrl: p.photoUrl,
      updated: p.updated,
      ageMinutes: (now - p.tsMs) / 60000,
      place: p.place,
      source: p.source,
      lat: p.lat,
      lng: p.lng,
    }));
    return { items, hasMore: offset + limit < sorted.length, emptyReason };
  }

  // Minimal RFC-4180 CSV reader: quoted fields, "" escapes, commas/newlines
  // inside quotes, CRLF. Returns an array of string arrays.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // BMA flood-centre flooded-roads sheet -> Related-condition-shaped items.
  // Deliberately NOT report-shaped: no status, depthCm, or timestamp (the sheet
  // has none), never passed through classify() or mergeCorroboration. The
  // note is BMA's own plain-language text, shown verbatim.
  function parseFloodCentreSheet(csvText) {
    const items = [];
    const rows = parseCsv(csvText || "").slice(1); // drop header
    rows.forEach((r, i) => {
      const [, road, segment, note, latStr, lngStr] = r.map((x) => (x || "").trim());
      if (!road || latStr === "" || lngStr === "") return;
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBangkok(lat, lng)) return;
      items.push({ key: `bma-floodcentre-${i}`, road, segment, note, lat, lng });
    });
    return items;
  }

  async function loadFloodCentreSheet() {
    const res = await fetch(FLOOD_CENTRE_SHEET_CSV);
    if (!res.ok) throw new Error(`${FLOOD_CENTRE_SHEET_CSV} -> HTTP ${res.status}`);
    const items = parseFloodCentreSheet(await res.text());
    if (items.length === 0) throw new Error("flood-centre sheet returned no usable rows");
    return { items };
  }

  // ThaiWater's canal-water-level response is a GeoJSON FeatureCollection per
  // basin id — flattened here across every basin rather than hardcoding the
  // Chao Phraya basin id, since a station right at Bangkok's edge could be
  // grouped under a neighboring basin. inBangkok() below is what actually
  // scopes the result to Bangkok, same as loadLongdo()/loadTraffy().
  // A station is deliberately NOT report-shaped (no `status`, `depthCm`, or
  // report-shaped `source`) — see CONTEXT.md "Related condition".
  function parseCanalStations(raw) {
    const basins = (raw && raw.data) || {};
    const stations = [];
    for (const basinId of Object.keys(basins)) {
      const features = (basins[basinId] && basins[basinId].features) || [];
      for (const f of features) {
        const coords = f.geometry && f.geometry.coordinates;
        if (!coords) continue;
        const [lng, lat] = coords; // GeoJSON order — swapped to this app's {lat, lng}
        const props = f.properties || {};
        const levelM = props.measureValue;
        if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;
        if (typeof levelM !== "number" || isNaN(levelM)) continue;

        const st = props.station || {};
        const thresholds = CANAL_STATION_THRESHOLDS[st.stationCode] || null;
        stations.push({
          key: `thaiwater-canal-${st.id}`,
          label: st.station || "สถานีวัดระดับน้ำคลอง",
          lat,
          lng,
          levelM,
          updated: props.measureAt || null,
          // Lookup key into CANAL_STATION_THRESHOLDS only — never shown in the UI.
          stationCode: st.stationCode || null,
          // Derived, sourced water-level status — see CONTEXT.md "Water-level status".
          // Never a guessed value: null whenever no threshold is known.
          waterLevelStatus: waterLevelStatus(levelM, thresholds),
          // Sourced from the same threshold table — null (not guessed) when
          // the station has none. The feed carries no bank figure, so this
          // is the only "how close to trouble" number we can honestly show.
          marginToCriticalM: canalMarginToCriticalM(levelM, thresholds),
        });
      }
    }
    return stations;
  }

  async function loadThaiWaterCanal() {
    const raw = await fetchJSON(THAIWATER_CANAL_API, { "x-api-key": THAIWATER_API_KEY });
    const stations = parseCanalStations(raw);
    return { stations, stationCount: stations.length };
  }

  const MERGE_DISTANCE_M = 300; // corroboration radius — see CONTEXT.md "Corroboration"

  // Haversine distance in meters between two lat/lng pairs.
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Points within MERGE_DISTANCE_M of each other, both still within the
  // existing freshness window, refer to the same real-world flood point —
  // merge them into one marker (see CONTEXT.md "Corroboration") instead of
  // showing duplicate pins. Union-find so a chain of nearby points (a-b-c)
  // merges transitively even if a and c themselves are far apart.
  function mergeCorroboration(points) {
    const parent = points.map((_, i) => i);
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function union(i, j) {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    }

    for (let i = 0; i < points.length; i++) {
      if (points[i].lat == null || points[i].lng == null) continue;
      if (ageMinutes(points[i].updated) > STALE_WARN_MIN) continue;
      for (let j = i + 1; j < points.length; j++) {
        if (points[j].lat == null || points[j].lng == null) continue;
        if (ageMinutes(points[j].updated) > STALE_WARN_MIN) continue;
        const dist = distanceMeters(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
        if (dist <= MERGE_DISTANCE_M) union(i, j);
      }
    }

    const clusters = new Map();
    points.forEach((p, i) => {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(p);
    });

    return [...clusters.values()].map((group) => {
      if (group.length === 1) return { ...group[0], contributors: [group[0]] };
      const worst = group.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
      const newest = group.reduce((a, b) => (ageMinutes(b.updated) < ageMinutes(a.updated) ? b : a));
      // A same-rank contributor's photo must survive the merge even when
      // `worst` (picked by status alone) isn't the one that has it — the
      // gray/photo cue in app.js checks the merged point's own photoUrl, not
      // per-contributor, so dropping it here silently hides real evidence.
      const photoUrl = group.map((p) => p.photoUrl).find((u) => u) || null;
      return {
        ...worst,
        key: group.map((p) => p.key).join("+"),
        updated: newest.updated,
        source: [...new Set(group.map((p) => p.source))].join(", "),
        photoUrl,
        contributors: group,
      };
    });
  }

  // Sorts by distance (reusing the same haversine helper mergeCorroboration
  // uses) and returns the closest `limit` stations — see CONTEXT.md "Related
  // condition" for why this never affects Passability status or route verdicts.
  function nearestStations(stations, lat, lng, limit) {
    return stations
      .map((s) => ({ station: s, dist: distanceMeters(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((s) => s.station);
  }

  // Bands a canal station's current level against its own BMA-published
  // thresholds. Deliberately never defaults to "green" when no threshold is
  // known — see CONTEXT.md "Water-level status".
  function waterLevelStatus(levelM, thresholds) {
    if (!thresholds) return null;
    if (levelM < thresholds.warningM) return "green";
    if (levelM < thresholds.criticalM) return "yellow";
    return "red";
  }

  // Metres of headroom below BMA's critical level (negative once over it).
  // Rounded to cm to hide floating-point noise (2.2 - 1.5 = 0.7000000000000002).
  function canalMarginToCriticalM(levelM, thresholds) {
    if (!thresholds) return null;
    return Math.round((thresholds.criticalM - levelM) * 100) / 100;
  }

  // Trend versus the previous reading. Null when there is none (first load).
  // Readings are compared at cm precision — the feed's own resolution.
  function canalTrend(prevLevelM, levelM) {
    if (prevLevelM == null || levelM == null) return null;
    const diffCm = Math.round((levelM - prevLevelM) * 100);
    return diffCm > 0 ? "rising" : diffCm < 0 ? "falling" : "steady";
  }

  // ThaiWater's feed has no previous-reading field, so the app remembers it.
  // `history` maps station key -> { levelM, updated, prevLevelM }. A poll that
  // returns the same `updated` stamp is the same reading, not a new one, so
  // it must not overwrite the comparison. Returns new stations + new history.
  function withCanalTrend(stations, history) {
    const nextHistory = new Map();
    const out = stations.map((s) => {
      const h = history.get(s.key);
      let prevLevelM = null;
      if (h) prevLevelM = h.updated === s.updated ? h.prevLevelM : h.levelM;
      nextHistory.set(s.key, { levelM: s.levelM, updated: s.updated, prevLevelM });
      return { ...s, prevLevelM, trend: canalTrend(prevLevelM, s.levelM) };
    });
    return { stations: out, history: nextHistory };
  }

  // GISTDA LifeDee 24 h flood-warning vector tiles — an undocumented Cloud
  // Run host (docs/adr/0008). Grid-cell polygons with an ordinal `class_risk`:
  // 1 = Watch, 2 = Warning. Anything else is not drawn.
  const GISTDA_WARN_TILE_URL =
    "https://check-water-map-service-726396821992.asia-southeast3.run.app/tiles/flood-warn/{z}/{x}/{y}.pbf";
  // z6/49/29 covers Bangkok; the probe only checks the host answers, not that
  // this tile holds polygons.
  const GISTDA_PROBE_URL = GISTDA_WARN_TILE_URL.replace("{z}/{x}/{y}", "6/49/29");
  function gistdaWarnStyle(classRisk) {
    if (classRisk === 1) return { label: "watch", fillColor: "#f9a825", color: "#f9a825", fillOpacity: 0.35, weight: 0.5, fill: true };
    if (classRisk === 2) return { label: "warning", fillColor: "#b71c1c", color: "#b71c1c", fillOpacity: 0.4, weight: 0.5, fill: true };
    return null;
  }
  // A 404 means "no polygons in this tile" (GISTDA's own client treats it so);
  // a network/CORS failure or 5xx/401/403 means the host is gone or blocked.
  async function probeGistdaTiles(fetchFn) {
    try {
      const res = await (fetchFn || fetch)(GISTDA_PROBE_URL, { signal: AbortSignal.timeout(8000) });
      return res.status === 404 || (res.status >= 200 && res.status < 300);
    } catch (_) {
      return false;
    }
  }

  // Answer-first header: status counts for the visible points, optionally
  // limited to a radius around the user's chosen/located origin. Pure — the
  // origin is passed in and never stored here (docs/adr/0009).
  function summarizePoints(points, opts) {
    const { origin, radiusM } = opts || {};
    const out = { red: 0, yellow: 0, green: 0, gray: 0, nearestBlocked: null };
    for (const p of points) {
      let distM = null;
      if (origin) {
        if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) continue;
        distM = distanceMeters(origin.lat, origin.lng, p.lat, p.lng);
        if (distM > radiusM) continue;
      }
      if (out[p.status] != null) out[p.status]++;
      if (origin && p.status === "red" && (!out.nearestBlocked || distM < out.nearestBlocked.distM)) {
        out.nearestBlocked = { point: p, distM };
      }
    }
    return out;
  }

  globalTarget.FloodData = {
    summarizePoints,
    isInBangkok: inBangkok,
    GISTDA_WARN_TILE_URL,
    gistdaWarnStyle,
    probeGistdaTiles,
    REFRESH_MS,
    BMA_STALE_MS,
    LONGDO_FALLBACK_MS,
    TRAFFY_FALLBACK_MS,
    STALE_WARN_MIN,
    THRESH_YELLOW,
    THRESH_RED,
    STATUS_RANK,
    STATUS_BADGE,
    classify,
    capCitizenSeverity,
    mergeCorroboration,
    distanceMeters,
    parseDepthCm,
    ageMinutes,
    loadBMA,
    loadLongdo,
    loadTraffy,
    parseTraffy,
    buildPhotoGallery,
    BANGKOK_DISTRICTS,
    countReportsByDistrict,
    parseLongdo,
    parseCanalStations,
    loadThaiWaterCanal,
    nearestStations,
    waterLevelStatus,
    parseFloodCentreSheet,
    loadFloodCentreSheet,
    canalTrend,
    canalMarginToCriticalM,
    withCanalTrend,
  };
})();
