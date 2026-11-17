# Nakhla: 3-minute demo script

**Setup before you go on stage:** open the app on a laptop *and* a phone, Liwa Oasis selected, demo farm reset, English. Have the backup video ready.

## 0:00 – 0:20 · Problem (say it, don't show slides)
"In Abu Dhabi, date palms use about a third of the groundwater spent on major crops. Farmers give each palm around 300 litres a day, every day of the year. Research by the Environment Agency Abu Dhabi found palms need about 180 in summer and only 60 to 80 in winter. So why do farmers over-water? Because their wells are salty. Water less, and salt builds up and kills the palm. 'Use less water' is not safe advice on its own."

## 0:20 – 1:50 · Live happy path
1. **Today card:** "It's 16 November in Liwa. Real evaporation today is 4.4 mm. Block A gets 1 h 30, Block B 2 h 20, instead of the usual 4 h 45. That's 55 m³ saved on this farm today."
2. Tap **Why 2 h 20 min?** "This is the core: the palm uses 75 L, drip losses add a bit, and because this well is 6 dS/m we *add* 63 L of salt flush. That's the FAO-29 leaching requirement. We save water without salting the soil."
3. Point at the blue **blending tip**: "This is the problem inside the problem: 43% of this block's water only flushes salt. Blending it 50/50 with Block A's water cuts that to 108 L."
4. **Send it to the farm:** "The worker gets one SMS, 88 characters, any basic phone." Switch to **اردو / हिन्दी**, then tap **Read aloud**. "Many farm workers here speak Urdu or Hindi, and some don't read."
5. **Why it beats the habit**, last 60 days: "Real Open-Meteo data, 60 days, 1,233 m³ saved on one block." Switch to **12 months**, then Block B, then type 8 into Water EC: "On a really salty well the habit is *starving* the palms all summer: 8 months of salt build-up. Nakhla isn't a water-cutting app, it's a right-water app."
6. Turn on airplane mode and reload on the phone: "No signal at the farm? It still works on the last forecast."

## 1:50 – 2:20 · How it works
"Pure JavaScript, no dependencies, runs on a cheap phone. Live FAO-56 evaporation from Open-Meteo for any farm's coordinates, the FAO-56 date-palm crop coefficient, and the FAO-29 salt formula. We checked it against the EAD sap-flow study: our model gives 176 L in June and 62 in January. 19 unit tests."

## 2:20 – 2:40 · Impact and next steps
"No sensors: the only kit is a 30-dirham TDS pen. Next: a WhatsApp Business bot, a Bluetooth EC pen, and satellite NDVI for stressed palms."

## Why we chose this angle (the 1-minute question)
"Every team will say 'save water'. We found the reason farmers *don't*: salt. Our tool saves water only where it's safe, and tells them when they're actually under-watering. That's what makes it trustworthy enough to follow."

## Likely judge questions
- **Is it real data?** Yes. Weather is real Open-Meteo/ERA5 for Liwa, and the habit benchmark is from the EAD study. The farm layout is a realistic demo farm and can be edited.
- **Why not ML?** FAO-56 is the agronomic standard, it's explainable to a farmer, and it needs no training data. We validated it against field measurements.
- **What if the EC reading is wrong?** We round run times up, warn on unusable water, and ask for a monthly re-test.

## "What are the drawbacks?" (answer with confidence)
Say: "Three honest ones, and what we've already done about them."
1. **Hand-entered water salinity.** If the reading is wrong, the flush is wrong. We round every run time *up*, block water that's too salty to use, and the next step is a Bluetooth EC pen.
2. **It models salt instead of measuring it in the soil.** FAO-29 is a steady-state model. Next is one soil EC test a month per block to correct it.
3. **No feedback loop yet.** We don't know whether the worker actually ran the plan. Next is a WhatsApp bot where the worker replies "done", plus a flow meter.

Then show what we already fixed during the hackathon:
- **Palm size per block:** young palms need about a third of the water, so it isn't one-size-fits-all.
- **Bottle test:** time one dripper filling a 1-litre bottle. Salty water clogs drippers, and this catches it for free.
