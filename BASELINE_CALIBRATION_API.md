# Baseline Calibration API contract

This contract supports the **Baseline Calibration** workflow in the frontend.  It is intentionally separate from the existing `bms.tools.discharge.*` endpoints: a discharge event records the discharge calculation, while a baseline calibration is the complete, auditable commissioning procedure around it.

## Scope and safety boundary

The server must **not** operate MCBs, connect a test load, or control a charger unless that capability is explicitly implemented and interlocked in hardware.  The API records the operator's physical confirmations, measurement evidence, and BMS observations.

Every mutable request requires the platform session token, as existing `bms.*` calls do.  The server must derive `createdBy`, `updatedBy`, timestamps, and the approval audit record from the authenticated user rather than trusting browser-provided fields.

## State machine

```
DRAFT
  -> PRECHECK_CONFIRMED
  -> INITIAL_CHARGE_RUNNING
  -> INITIAL_CHARGE_CONFIRMED
  -> CHARGER_ISOLATED
  -> COOLDOWN_RUNNING
  -> COOLDOWN_CONFIRMED
  -> DISCHARGING
  -> DISCHARGE_COMPLETE
  -> RECOVERY_RUNNING
  -> RECOVERY_DURATION_CONFIRMED
  -> SAMPLE_CAPTURED
  -> SAMPLE_ACCEPTED
  -> FLOAT_OPERATION_CONFIRMED
  -> CAPTURED
  -> PENDING_APPROVAL
  -> ACTIVE

Any non-terminal state -> ABORTED
PENDING_APPROVAL -> REJECTED
```

Only the server can perform state transitions.  A request must be rejected when the preceding state or required evidence is missing.  An `ACTIVE` calibration is immutable; a later baseline supersedes it but must never overwrite it.

## Data model

### Calibration

```ts
type BaselineCalibration = {
  id: string;
  stringIndex: number;
  kind: 'INITIAL_BASELINE' | 'PERIODIC_CAPACITY_CHECK';
  state: CalibrationState;
  profile: {
    cellCount: number;
    ratedCapacityAh: number;
    boostVoltageV: number;
    floatVoltageV: number;
    chargeCurrentLimitA: number;
    dischargeCurrentA: number;
    dischargeProfile: 'C10_0_1' | 'C5_0_2' | 'CUSTOM';
    cutoffPerCellV: number;
    sampleIntervalSeconds: number;
    manufacturerProfileId?: string;
  };
  dischargeEventId?: number;
  result?: {
    usedAh: number;
    sohPercent: number;
    lowestCellId: number;
    lowestCellVoltageV: number;
    stopReason: 'CELL_CUTOFF' | 'OPERATOR_STOP' | 'SAFETY_ALARM' | 'BACKEND_FAULT';
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  supersedesId?: string;
};
```

### Measurement snapshot

```ts
type MeasurementSource = 'BMS' | 'MANUAL_METER' | 'CALCULATED';
type BaselineSnapshot = {
  calibrationId: string;
  capturedAt: string;
  capturedBy: string;
  sourceSummary: MeasurementSource[];
  string: {
    voltageV?: number;
    midpointVoltageV?: number;
    floatCurrentMa?: number;
    chargerOutputVoltageV?: number;
    ambientTemperatureC?: number;
    rippleNoLoadMvAc?: number;
    rippleWithLoadMvAc?: number;
  };
  cells: Array<{
    cellId: number;
    voltageV?: number;
    temperatureC?: number;
    resistanceMicroOhm?: number;
    source: MeasurementSource;
    measuredAt: string;
  }>;
};
```

The backend should preserve every submitted snapshot.  The `ACTIVE` report must point to the final full-charge snapshot and must not be recalculated from current telemetry.

## JSON-RPC methods

All methods below follow the existing convention: `params` includes the session `token`; response data is returned inside `result`.

| Method | Purpose |
|---|---|
| `bms.baseline.create` | Create a `DRAFT` calibration from a validated string and profile. |
| `bms.baseline.list` | List calibrations, filtered by `stringIndex`, state, and period. |
| `bms.baseline.get` | Get calibration, checklist, transitions, snapshots, and report readiness. |
| `bms.baseline.updateProfile` | Update only a `DRAFT` profile. Store the profile revision in audit history. |
| `bms.baseline.confirmChecklist` | Submit a named procedure checklist and operator acknowledgement. |
| `bms.baseline.startInitialCharge` | Store the requested Vboost/Vfloat/current-limit profile and begin tracking the initial charge. |
| `bms.baseline.getInitialChargeStatus` | Return charger state, string voltage, current, Vboost reached time, float-transition time, and whether telemetry satisfies the profile. |
| `bms.baseline.confirmInitialCharge` | Operator confirms the measured boost/float result after the status endpoint says the targets are met. |
| `bms.baseline.confirmChargerIsolated` | Record that the charger DC MCB was physically opened; this never switches the MCB remotely. |
| `bms.baseline.startCooldown` | Start a cool-down wait with `ambientTemperatureC`, `targetTemperatureC`, and allowed delta. |
| `bms.baseline.getCooldownStatus` | Return the latest per-cell temperatures, ambient temperature, and stable/unstable result. |
| `bms.baseline.confirmCooldown` | Operator confirms the stable temperature and visual inspection before discharge. |
| `bms.baseline.startDischarge` | Validate procedure preconditions, create/link `bms.tools.discharge` event, and move to `DISCHARGING`. |
| `bms.baseline.getDischargeStatus` | Return linked event status plus latest per-cell snapshot and safety signals. |
| `bms.baseline.completeDischarge` | Record the terminal result after the discharge worker stops. |
| `bms.baseline.startRecoveryCharge` | Start a timed boost/recovery charge (4–8 hours) before float stabilisation. |
| `bms.baseline.getRecoveryStatus` | Return configured and elapsed duration, charger state, string voltage, and float current. |
| `bms.baseline.confirmRecoveryDuration` | Operator confirms that the configured recovery duration and float-stable condition are complete. |
| `bms.baseline.captureSnapshot` | Save a BMS/manual/calculated reference snapshot after recovery charge. |
| `bms.baseline.acceptSnapshot` | Operator accepts a captured snapshot. This freezes the values used in the report review. |
| `bms.baseline.confirmFloatOperation` | Records physical confirmation that the load MCB and float-charge MCB are closed. |
| `bms.baseline.validate` | Return required-data failures, warnings, and report readiness without changing state. |
| `bms.baseline.submitForApproval` | Lock submitted evidence and move to `PENDING_APPROVAL`. |
| `bms.baseline.approve` | Reviewer approval; atomically supersede prior active baseline and activate this one. |
| `bms.baseline.reject` | Return the report to `CAPTURED` with a mandatory reviewer reason. |
| `bms.baseline.abort` | Abort an incomplete calibration with a reason; never delete its audit trace. |
| `bms.baseline.report` | Return a printable/exportable report payload, including frozen snapshots. |

## Required server-side guards

1. `startDischarge` requires completed safety checklist, confirmed initial-charge targets, charger-isolated confirmation, and confirmed cool-down telemetry.
2. The discharge worker must stop on the **lowest valid cell voltage**, not on string-average voltage.
3. The server must reject `completeDischarge` without a terminal reason, discharged Ah, and lowest-cell reading.
4. `captureSnapshot` requires a confirmed recovery duration; it must save string voltage, midpoint, charger output, float current, ambient temperature and every available cell/block voltage, negative-terminal temperature, and resistance.
5. `acceptSnapshot` requires all configured cells to have voltage, temperature, and resistance readings, unless a privileged user supplies an explicit exception reason.
6. `approve` requires an accepted complete snapshot, confirmed restoration to float operation, and a reviewer different from the operator when the policy requires separation of duties.
6. Keep the following as profile-driven warnings, not hard-coded universal limits: 1.80 V/cell at 0.1C10, 1.75 V/cell at 0.2C5, float current below 100 mA for a newly charged battery, cell temperature delta 4°C, string-to-ambient delta 6°C/8°C.

## Relationship with existing APIs

The current frontend can continue to use:

- `bms.tools.discharge.create`, `list`, `samples`, `stop`, and `activateBaseline` during migration.
- `bms.tools.strings.list` for string profile defaults.

The existing discharge sample format is insufficient for a baseline report because it exposes aggregate values only.  Add a per-cell snapshot endpoint or embed this in `bms.baseline.getDischargeStatus`:

```ts
{
  sampledAt: string,
  stringVoltageV: number,
  cells: Array<{ cellId: number; voltageV: number; temperatureC: number; soc?: number; soh?: number }>
}
```

## Frontend integration order

1. Replace the local wizard state with `bms.baseline.create/get/updateProfile`.
2. Persist checklists with `confirmChecklist` at each completed step.
3. Replace the temporary manual discharge result inputs with `getDischargeStatus` and `completeDischarge`.
4. Load the complete cell table from `captureSnapshot`; keep manual inputs only for instruments that are not connected to BMS.
5. Use `validate`, `submitForApproval`, and `approve` instead of directly calling `activateBaselineEvent`.
