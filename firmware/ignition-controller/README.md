# Programmable CDI Ignition Controller

Single-cylinder ignition timing controller for **Arduino Nano v3** (ATmega328P @ 16 MHz).

A Hall sensor triggers once per revolution at a fixed physical position BTDC. The
controller measures the revolution period, looks up the target advance for the
current RPM, and schedules the SCR gate pulse `(SENSOR_ANGLE - advance)` degrees later.

## Wiring

| Pin | Signal | Notes |
|---|---|---|
| D2 | `HALL_TRIG` | INT0, falling edge, through an automotive Schmitt buffer |
| D4 | `GATE_CMD` | PD4, 10 µs active-high into UCC27517A. **External 1k pulldown to GND** |
| D7 | `MAP_SEL` | Internal pull-up. Open = Curve 1, grounded = Curve 2 |
| D8 | `HV_READY` | PB0, from the TLV3012 comparator. Plain INPUT — external 100k pulldown (R44) |
| D9 | `CHARGE_EN_RAW` | PB1, LOW disables the LT3751. **External pulldown required** |
| A0 | `CHARGER_FAULT` | PC0, read as digital. LOW = LT3751 fault. External pull-up |

### Required external parts

These two resistors are not optional:

- **D2 pull-up (1k–4.7k to 5V).** Most Hall ICs are open-collector. The AVR's
  internal pull-up is 20–50 kΩ, which against a metre of cable capacitance gives
  a multi-microsecond rise time — slow edges next to an HT lead invite double
  triggering.
- **D4 pulldown (1k to GND).** All AVR pins are high-Z during reset, so the gate
  driver input floats and can self-trigger on ignition noise. Firmware cannot
  cover this window; only the resistor can.

The specified **Allegro A1101LUA** is a unipolar (non-latching) switch, so a
single magnet gives one clean edge per revolution, and its −40 to +150 °C range
suits an engine bay. Do not substitute a latching type such as the US1881 — that
needs alternating N/S poles, and with one magnet it latches on and never produces
a second edge, which presents as an engine that simply will not run.

### Power

Feed the board from a **switching buck converter (MP1584/LM2596) into the 5V
pin**, not VIN. The onboard regulator is rated 7–12 V with a 15 V absolute
maximum; a 3S Li-ion pack is 12.6 V full and 4S LiFePO4 reaches 14.6 V on
charge, which leaves no headroom for transients and wastes the difference as
heat.

Also recommended for a battery-fed ignition system:

- Reverse-polarity protection (series Schottky or P-FET).
- TVS across the supply — SMBJ16A for 3S, SMBJ18A for 4S.
- 470–1000 µF bulk plus 100 nF at the converter input, and 100 nF at the Nano's 5V/GND.
- **Enable the BOD fuse at 2.7 V.** Many Nano clones ship with brown-out
  detection disabled. A pack sagging under crank can otherwise drop the rail
  into the range where the MCU executes garbage instead of resetting cleanly.
- Run the Hall lead in shielded cable, shield grounded at the Arduino end only.

`SENSOR_ANGLE` (default 35.0°) **must** match the sensor's real physical position
BTDC. The spark can only ever be scheduled *after* this point, so no map may
request advance at or beyond it — `buildDelayTable()` caps anything that does.

## CDI power stage

Specified for a **400 V rail into 1.1 µF — 88 mJ per spark**, sustained to the
11,000 RPM limiter. The two decisions that drive everything else are that rail
energy and the choice to drive the SCR through an **isolated gate transformer**
rather than straight off a pin.

| Block | Part | Key spec |
|---|---|---|
| Charger controller | **ADI LT3751EFE#PBF** | Flyback capacitor charger in feedback regulation, 397–400 V |
| Flyback transformer | **Coilcraft GA3459-BL** | 1:10, four primary windings paralleled |
| Primary switch | **ST STP30NF20** | 200 V, with a 6 mΩ Kelvin current shunt (17.67 A limit) |
| HV rectifier | **MUR1100E** | 1000 V, 1 A ultrafast |
| Discharge capacitor | **5 × WIMA FKP 1, 0.22 µF / 1000 V** = 1.10 µF | Polypropylene pulse film |
| SCR | **ST TYN1225RG** | 25 A, 1200 V, TO-220AB |
| Gate driver | **TI UCC27517A-Q1** + **Coilcraft DA2099-AL** | Isolated pulse-transformer gate drive |
| HV-ready comparator | **TI TLV3012** | Independent of the LT3751; 361.3 V rising, 357.6 V falling |
| Coil | **MSD 8253 Blaster HVC-II** | External CD coil, ~3.5 mH primary |
| Hall sensor | **Allegro A1101** | Unipolar (non-latching), filtered through a Schmitt buffer |
| 5 V supply | **Murata OKI-78SR-5/1.5-W36-C** | Switching regulator into the Nano's 5V pin |

Supply is restricted to a **4S LiFePO4 total-loss pack, 10.0–14.6 V**. Not for an
alternator, stator-regulator, or any bus that can present a load dump.

### Why five capacitors instead of one

**Corrected against the measured coil.** An earlier revision of this document
justified the five-way split with a peak current of 57 A and 54 V/µs, computed
from an assumed **50 µH** coil primary. The MSD 8253's primary is **3.5 mH** —
70× higher — so the real tank is far gentler:

| | Assumed 50 µH | Actual 3.5 mH |
|---|---|---|
| Peak primary current | 59 A | **7.09 A** |
| Rise time | 11.6 µs | **97.5 µs** |
| Capacitor dV/dt | 53.9 V/µs | **6.45 V/µs** |
| Current per capacitor | 11.9 A | **1.42 A** |

A single 1.1 µF part would carry 7 A at 6.5 V/µs, which is unremarkable for
polypropylene film. **The five-way split is therefore not required by pulse
current** — the original argument for it does not hold.

It is kept anyway, for reasons that survive the correction: paralleling drops
ESL and ESR roughly fivefold, spreads the ripple heating, and 0.22 µF / 1000 V
FKP 1 parts are cheaper and physically easier to place in a tight discharge loop
than one large part. 1000 V on a 400 V rail is 2.5× derating.

Mount them as a tight cluster with short, wide copper to the SCR and coil; the
loop area of the discharge path matters more than any single component here.

### Why isolated gate drive

Driving the SCR gate directly from PD4 would have forced two constraints: the
SCR cathode must sit at MCU ground (low-side only), and the device must be a
sensitive-gate type whose I<sub>GT</sub> fits an AVR pin's ~20 mA budget.

An earlier revision also justified this on dI/dt. **That argument does not
survive the real coil** — with a 3.5 mH primary, max dI/dt is V/L = **0.11 A/µs**,
which any thyristor handles without comment. (The assumed 50 µH would have given
8 A/µs.) The SCR's dI/dt rating is simply not a binding constraint here.

The decision stands on the two reasons that do hold: it removes the low-side
topology constraint, and it keeps the MCU galvanically clear of the 400 V stage
— the single biggest reliability risk in a system this electrically noisy. The
Rev A schematic drives the DA2099-AL from a UCC27517A-Q1 for exactly that reason.

**This is why `GATE_PULSE_US` is 10, not 25.** The gate transformer's
volt-second product is the binding limit. Worst case is at the top of the pack
range, not at 5 V: **14.6 V × 10 µs = 146 V·µs** against the DA2099-AL's 221 V·µs
rating. The SCR itself only needs 1–2 µs to turn on and then self-commutates
below holding current, so 10 µs is already generous. **Raising it eats the
remaining margin** — 15 µs at 14.6 V would be 219 V·µs, essentially at the limit.

Volt-second arithmetic alone does not validate the gate stage. Capture U6 OUT,
T2 primary current, and SCR gate-to-cathode voltage through *both* pulse edges,
and confirm the falling edge resets the transformer without an unacceptable
negative excursion.

### Energy and recharge budget

| Quantity | Value |
|---|---|
| Energy per spark | ½CV² = **88 mJ** |
| Sparks/second at limiter | 11,000 / 60 = **183.3** |
| Charger output power | **16.1 W** |
| Draw from 12 V at ~80% efficiency | **≈ 1.7 A** |
| Time available between sparks | **5.45 ms** at 11,000 RPM, 9.23 ms at 6,500 |
| Peak primary current | V·√(C/L) = **7.09 A** (1.42 A per capacitor) |
| Peak dV/dt | V/√(LC) = **6.45 V/µs** |
| Discharge rise time | (π/2)·√(LC) = **97.5 µs** |
| LT3751 current limit (6 mΩ shunt) | **17.67 A** |

That 1.7 A is on top of the Nano and is the dominant load — size the pack wiring,
fusing and the regulator for it. Discharge takes ~98 µs against 5.45 ms between
sparks at the limiter, a **56× margin**, so the ring is long over before the next
revolution.

### Charge-ready and fault interface

**`DONE` is not the charge-ready signal.** An earlier revision used the LT3751's
`DONE` pin on D8. That was wrong: `DONE` reports that a charge *cycle* finished,
which is not the same claim as the rail sitting at voltage. The schematic routes
`DONE` to a test point as diagnostic only, and D8 instead comes from an
independent **TLV3012** comparator on the HV divider — 361.3 V rising, 357.6 V
falling.

The firmware **fires regardless** of D8 — a weak spark beats a guaranteed
misfire — but counts under-charged sparks via `readWeakSparks()`. A count that
climbs with revs means the charger is not keeping up.

**D9 (`CHARGE_EN_RAW`)** holds the LT3751 off through reset and initialisation,
and is raised only after the 5 V rail settles (20 ms) *and* A0 shows no fault.

**A0 (`CHARGER_FAULT`)** is polled in `loop()`. On a fault the firmware drops D9,
disarms any pending Timer1 compare, forces the gate command low, latches the
condition, and suppresses sparks. Once A0 recovers it holds the charger off a
further 10 ms before restarting regulation, so a chattering fault cannot
free-run. Exposed via `readFaultCount()` and `chargerFaulted()`.

An external charge-kill switch pulls `CHARGE_CTL` low directly and overrides D9.
Battery disconnect remains the primary emergency stop.

### Why this coil

Capacitor and coil **primary inductance** form the discharge tank, so the coil
must be a capacitive-discharge type. Much of the inductive/Kettering range has a
primary inductance one to two orders of magnitude too high, which stretches rise
time and collapses peak current:

The **MSD 8253 Blaster HVC-II** is specified by MSD for capacitive-discharge
boxes. Its ~3.5 mH primary sets the tank behaviour above.

Primary inductance is not a published catalogue figure, and this controller does
not depend on knowing it: the firmware sets *when* the spark fires, not the
discharge dynamics. That claim was worth making precisely because the assumption
turned out to be **70× off** — 3.5 mH against an assumed 50 µH — and the timing
conclusion still held, with the ring finishing 56× inside one revolution instead
of the predicted 460×. What the wrong assumption *did* invalidate was the peak
current and dV/dt figures, and the capacitor argument built on them (above).

The binding requirement is simply that the coil is manufacturer-stated for
capacitive discharge — a coil sold for a points or transistorised system is not,
whatever the brand on it.

## Curves

| | Curve 1 (D7 open) | Curve 2 (D7 grounded) |
|---|---|---|
| Use | Dry track / max power | Wet, mud, detonation protection |
| Peak advance | 24° @ 6500 RPM | 20° @ 6500 RPM |

Curves are defined as RPM/advance breakpoints and linearly interpolated.

## Operating limits

| Limit | Value | Behaviour |
|---|---|---|
| Noise debounce | 2700 µs | Edges closer than this are rejected (~22,200 RPM) |
| Plausibility gate | 0.5× | Edge implying >2× speed increase in one rev is rejected as EMI |
| Minimum RPM | 100 | No spark below this |
| Rev limiter | 11000 RPM | Hard spark cut, resumes below 10700 (hysteresis) |
| Stall timeout | 1 s | Clears RPM readout and drops crank sync |
| Watchdog | 250 ms | Resets on a hung main loop |

Rejected edges do **not** commit the reference timestamp, so a spike cannot skew
the following measurement. Simulated across spike offsets from 2.7–10 ms, none
disturbed the next genuine edge's RPM. After 3 consecutive rejections the
controller assumes sync was genuinely lost and resyncs rather than locking the
spark out indefinitely.

## Trigger latency compensation

`TRIGGER_LATENCY_US` is set to **8** — about 5 µs of propagation delay for the
specified A1101 plus ~3 µs of AVR interrupt latency through the
`attachInterrupt()` prologue. It is subtracted from the scheduled delay. Being a
fixed *time*, as an *angle* it grows with RPM and always retards the spark:

| RPM | 8 µs of latency |
|---|---|
| 1,200 | 0.06° |
| 6,500 | 0.31° |
| 11,000 | 0.53° |

Both terms are definitely non-zero, so 8 µs is a much better estimate than zero.
Trim it against the timing light during commissioning if you want the last tenth
of a degree at the top end.

## Timing implementation

Timer1 free-runs at /64 — **4 µs per tick, 262.1 ms per wrap**. The spark is
scheduled as an absolute compare target relative to `TCNT1` captured at the
sensor edge, so time spent computing inside the ISR is absorbed instead of
being added to the delay as extra retard.

The float curve interpolation runs once at boot into a fixed-point lookup table
(128 RPM per bin, interpolated between bins). The ISR does one table lookup and
one 32-bit multiply/divide — no floating point per revolution. Worst deviation
from the ideal curve is under 0.3° across the whole range.

### Why not prescaler /8

`/8` gives 0.5 µs resolution but only a **32.77 ms** range. At low RPM the delay
exceeds that and the 16-bit tick count silently wraps: at 101 RPM the spark
lands at 34.7° BTDC instead of the intended 15° — a **+19.9° over-advance**,
right in the kickback window during a slow kick or pull start. `/64` covers the
full range in one prescaler setting, and its 4 µs quantisation is only 0.26° even
at 11,000 RPM.

## Building

Open in the Arduino IDE (board: *Arduino Nano*, processor: *ATmega328P*) and upload.

Syntax/size check without the IDE:

```bash
avr-g++ -mmcu=atmega328p -DF_CPU=16000000UL -Os -std=gnu++11 -Wall -Wextra \
  -x c++ ignition-controller.ino -c -o /tmp/out.o
```

## Trigger noise: what is fixed, and what cannot be

Two defences were added against the noise weakness: **spark blanking** and a
**tightened plausibility gate**. One further failure mode is not fixable in
firmware at all, and it is important to know which is which.

### Spark blanking (fixed)

The dominant EMI source is the controller's own discharge. It is entirely
predictable — the spark fires 11–34° after the trigger and the tank rings for
~98 µs — so `SPARK_BLANK_US` (400 µs) discards every edge inside that window.

Simulated with three spikes in each discharge ring over 400 revolutions:

| RPM | Resyncs before | Resyncs after |
|---|---|---|
| 300 | 398 | **0** |
| 600 | 398 | **0** |
| 1200 | 398 | **0** |
| 3000+ | 0 | 0 |

At cranking and idle speeds the old gate was tearing down and re-establishing
crank sync on *every revolution* — the region where stability matters most. Above
~3000 RPM the 2700 µs debounce already covered it. Blanking can never mask a
genuine edge: one is a full revolution away, and swallowing one would take about
150,000 RPM.

### Tightened plausibility gate (improved)

The threshold moved from 1/2 to **3/4** of the previous interval, roughly
doubling the rejection window for asynchronous spikes. It still allows a 33%
speed gain per revolution against the 5–10% real engines manage. The cost shows
only beyond ~40%/rev, where it resyncs rather than locking out.

### Synchronous noise at a displaced phase (NOT fixable here)

> A noise source firing **once per revolution at a fixed offset** — say 0.6 of
> the way through the period — has *exactly the same period as the crank*. Once
> such an edge is accepted it becomes the reference, and the genuine edge then
> measures 0.4 of a period and is rejected as implausible. The spike train
> captures sync and holds it.
>
> No interval-based filter can prevent this, tightened threshold or not. The two
> trains are identical in period and differ only in phase, and **phase is
> unobservable with one trigger per revolution.**

The defences against it are not firmware:

- The Rev A hardware filter — shielded Hall cable bonded at the enclosure, a
  1 µs RC filter, and an automotive Schmitt buffer — which is why the schematic
  has them.
- Layout discipline: keep the Hall run away from the HT lead, the coil, and the
  discharge loop.
- If it still occurs, an **absolute phase reference** (multi-tooth or
  missing-tooth wheel) is the real answer, and that is a hardware change beyond
  this controller.

**Bench and dummy-load testing is fine. Verify against real ignition noise with
the sensor in its final routing before running an engine.**

## Commissioning

Follow the staged bring-up: 5 V regulator alone first, then signal circuitry
(confirming D4 and D9 stay LOW through reset), then the charger without the SCR
or coil on a current-limited supply, then the capacitor bank and HV-ready
comparator, then the SCR into a dummy load, and only then the coil. Do not
assemble the whole board and apply battery power.

Every ignition build gets timed on the engine it runs on — `SENSOR_ANGLE` is a
physical measurement of your trigger position, and no firmware can verify it.

1. Confirm the magnet passes the A1101 with the specified air gap and that D2
   gives one clean falling edge per revolution.
2. Crank with the plug grounded and confirm spark.
3. **Put a timing light on it against a degree wheel** and check the fired angle
   matches the curve at idle and at a mid-range hold. If it reads consistently
   retarded at high RPM, raise `TRIGGER_LATENCY_US`.
4. Read `readWeakSparks()` and `readFaultCount()` after a full-throttle run. Any
   climb in weak sparks with revs means the charger is not keeping up.

> **This drives a live ignition system at 400 V and tens of kV.** Discharge the
> capacitor bank before touching the power stage — 88 mJ at 400 V is enough to
> hurt, and the bank holds charge after the pack is disconnected. The bleeder
> takes about 10 s to fall from 400 V to 60 V; verify with a properly rated meter
> rather than trusting the clock.
