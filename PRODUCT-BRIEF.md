# Nakhla — PRODUCT BRIEF (Breaking Bytes · A-001 Smart Farming for the Desert)

1. **Who:** the farm worker or owner who runs the pump on a UAE date-palm farm (Liwa, Al Ain). They often don't read English, have a basic phone and use WhatsApp.
2. **Pain, how often:** every day they decide how long to run the drip. Habit is ~300 L per palm per day **all year**. Research (Environment Agency Abu Dhabi + NZ Plant & Food, sap-flow study) shows palms need ~180 L in summer and 60–80 L in winter.
3. **Problem inside the problem:** "use less water" isn't safe advice on its own. Liwa wells are brackish, and if you cut water blindly, salt builds up in the root zone and kills the palm. So growers over-water out of fear. Nakhla cuts water *and* adds back exactly the salt-flush (leaching) fraction the water's salinity needs, so following it is safe.
4. **Why now:** free, real, daily FAO-56 evapotranspiration forecasts (Open-Meteo) exist for any farm's coordinates. A AED 30 TDS/EC pen gives the salinity. No sensors needed.
5. **The decision:** "Block B: run the drip 1 h 50 min tonight" for each block, every day, plus *why*.
6. **MVP:** a web app with a farm setup (blocks, palms, emitters, water EC), today's decision per block, a "why" breakdown, a habit-vs-Nakhla chart on real Liwa weather, and a short SMS/WhatsApp message (EN/AR/HI/UR) with read-aloud.
7. **Anti-goals:** no hardware, no login, no image/disease detection, no ML training. FAO-56 + FAO-29 are the method (explainable and defensible).
8. **Desert rules:** Water is the product. Weak connectivity: <160-char message, works offline on the last cached forecast. Affordable: free and runs on any phone browser; the only kit is a cheap EC pen.
9. **60-second judge view:** open the app → it says "Today: 1 h 50 min instead of the usual 5 h 10 min" → tap Why → the chart shows a year of real Liwa weather: habit vs Nakhla, m³ saved, and no salt-risk days.
10. **Data:** REAL Open-Meteo ERA5/forecast ET0 for Liwa (23.12 N, 53.77 E), snapshot Sep–Nov 2026 + monthly means Nov 2025–Nov 2026. Farm layout and water EC are realistic, stated defaults.

## ICE (topics)
| Topic | I | C | E | ICE |
|---|---|---|---|---|
| A-001 Desert farming | 4 | 5 | 2 | 10 |
| T-001 Off-grid comms | 4 | 3 | 3 | 4 |
| W-001 Water early warning | 5 | 2 | 4 | 2.5 |

## Slice plan (orch-build-mvp)
1. Engine: ET0 → litres/palm → drip minutes, with leaching (unit tests first).
2. Real data snapshot + habit comparison (60 days daily, 12 months).
3. UI: decision card + Why panel + chart.
4. Farm message: SMS/WhatsApp share, 4 languages, read-aloud, offline cache.
5. Verify, README, demo script.
