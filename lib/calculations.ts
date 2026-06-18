/**
 * PMZ Pricing Assistant — Labor Rate Calculations
 * 
 * All functions are pure and easily testable.
 * Model is designed to be transparent and defensible to contractors.
 */

export interface LaborRateInputs {
  role: string;
  baseWage: number;                    // $ per hour the employee is paid (union base or open-shop wage)

  // === Statutory / Percentage Burdens (applied as % of wages) ===
  payrollTaxes: number;                // % (FICA, Medicare, FUTA, SUTA — usually on base wage)
  workersComp: number;                 // Rate in $ per $100 of payroll (common construction quoting method)
  pto: number;                         // % (Paid time off, holidays, vacation — usually on base)

  // === Operational Burdens ===
  supervision: number;                 // % (Foreman / supervision / PM burden allocated to field labor)
  downtime: number;                    // % (Non-billable: weather, travel, shop, breaks, mobilization)

  // === Pricing Goals ===
  targetMargin: number;                // % (Desired net profit margin on the final billable rate)
  perDiem: number;                     // $ per hour (vehicle, subsistence, tool allowance, etc.)

  // === Union / Prevailing Wage Fixed Fringes (real dollars per hour) ===
  // These are the critical fields for MN Highway & Heavy, union, and Davis-Bacon work
  healthAndWelfare: number;            // $ / hr — H&W / medical
  pension: number;                     // $ / hr — Pension / retirement / annuity
  training: number;                    // $ / hr — Training / JATC / apprenticeship fund
  otherFixedFringes: number;           // $ / hr — Vacation, supplemental, other fixed fringes

  // === Insurance (payroll-based rate) ===
  generalLiabilityPerThousand: number; // $ per $1,000 of payroll (GL, umbrella, etc.)

  // Legacy field kept for backward compatibility with old saved rates
  // (no longer shown in the UI or used in new calculations)
  benefits?: number;
}

export interface LaborRateResult {
  // === Breakdown for transparency (especially important for union work) ===
  fixedFringesTotal: number;             // Sum of all fixed $/hr fringes (H&W + Pension + Training + Other)
  workersCompPerHour: number;            // WC converted to per-hour: (ratePer100 / 100) * baseWage
  generalLiabilityPerHour: number;       // GL converted to per-hour: (ratePer1000 / 1000) * baseWage

  // Legacy aggregated % fields (kept for table compatibility & explanations)
  directBurdenPercent: number;           // Approximate % view of statutory burdens
  totalBurdenPercent: number;            // For backward display in saved rates table

  // The three numbers that actually matter to the owner
  employerCostPerWorkedHour: number;     // True loaded cost while the person is on the clock
  trueCostPerBillableHour: number;       // Real internal cost per hour you can actually invoice
  recommendedBillableRate: number;       // What you should charge the customer to hit target margin

  // Convenience / display
  marginOnRecommendedRate: number;
}

/**
 * Core labor rate calculation.
 * Returns all key figures with clear semantics.
 */
export function calculateLaborRate(inputs: LaborRateInputs): LaborRateResult {
  const {
    baseWage,
    payrollTaxes,
    workersComp,
    pto,
    supervision,
    downtime,
    targetMargin,
    perDiem,
    healthAndWelfare = 0,
    pension = 0,
    training = 0,
    otherFixedFringes = 0,
    generalLiabilityPerThousand = 0,
  } = inputs;

  // =====================================================
  // UNION / HEAVY CONSTRUCTION STYLE CALCULATION
  // =====================================================

  // Fixed fringes are real dollars per hour (the key difference from traditional % models)
  const fixedFringesTotal = round2(
    healthAndWelfare + pension + training + otherFixedFringes
  );

  // General Liability: payroll-based (GL_Rate_Per_1000 / 1000) × Base Wage
  const generalLiabilityPerHour = round2((generalLiabilityPerThousand / 1000) * baseWage);

  // --- Statutory burdens (dollars) ---

  // Payroll taxes (FICA, etc.) almost always calculated on base wage only
  const payrollTaxDollars = baseWage * (payrollTaxes / 100);

  // Workers' Comp: payroll-based (WC_Rate_Per_100 / 100) × Base Wage
  const workersCompDollars = baseWage * (workersComp / 100);
  const workersCompPerHour = round2(workersCompDollars);

  // PTO is typically a percentage of base wage
  const ptoDollars = baseWage * (pto / 100);

  // --- Supervision burden ---
  // Applied to everything loaded so far (base + fixed fringes + statutory)
  const loadedBeforeSupervision =
    baseWage +
    fixedFringesTotal +
    payrollTaxDollars +
    workersCompDollars +
    ptoDollars;

  const supervisionDollars = loadedBeforeSupervision * (supervision / 100);

  // --- Final employer cost per actual hour worked ---
  const employerCostPerWorkedHour = round2(
    loadedBeforeSupervision +
      supervisionDollars +
      perDiem +
      generalLiabilityPerHour
  );

  // --- True cost per billable hour (accounting for reality) ---
  const billableFraction = Math.max(0.01, (100 - downtime) / 100);
  const trueCostPerBillableHour = round2(
    employerCostPerWorkedHour / billableFraction
  );

  // --- Recommended billable rate (what you invoice the customer) ---
  const recommendedBillableRate = round2(
    trueCostPerBillableHour / (1 - targetMargin / 100)
  );

  // --- Legacy % fields (for table compatibility) ---
  // These are approximate now that we have mixed % + fixed. Still useful for display.
  const directBurdenPercent = round2(payrollTaxes + workersComp + pto);
  const totalBurdenPercent = round2(directBurdenPercent + supervision);

  return {
    fixedFringesTotal,
    workersCompPerHour,
    generalLiabilityPerHour,
    directBurdenPercent,
    totalBurdenPercent,
    employerCostPerWorkedHour,
    trueCostPerBillableHour,
    recommendedBillableRate,
    marginOnRecommendedRate: round2(targetMargin),
  };
}

/** 
 * Quick sensitivity helper — "What if base wage changes by this delta?"
 * Useful for "What if I give everyone a $3 raise?" scenarios.
 * Works correctly with the new union-style fixed fringe fields.
 */
export function calculateSensitivity(
  baseInputs: LaborRateInputs,
  baseWageDelta: number
): {
  newRecommendedRate: number;
  delta: number;
  percentChange: number;
} {
  const modified: LaborRateInputs = {
    ...baseInputs,
    baseWage: baseInputs.baseWage + baseWageDelta,
  };

  const original = calculateLaborRate(baseInputs);
  const modifiedResult = calculateLaborRate(modified);

  const delta = modifiedResult.recommendedBillableRate - original.recommendedBillableRate;
  const percentChange =
    original.recommendedBillableRate > 0
      ? (delta / original.recommendedBillableRate) * 100
      : 0;

  return {
    newRecommendedRate: round2(modifiedResult.recommendedBillableRate),
    delta: round2(delta),
    percentChange: round2(percentChange),
  };
}

/**
 * Normalizes inputs coming from localStorage or old saved rates.
 * Ensures all new union-style fields exist with safe defaults (0).
 * This prevents NaN / undefined issues when loading old data.
 */
export function normalizeLaborRateInputs(raw: Partial<LaborRateInputs>): LaborRateInputs {
  return {
    role: raw.role || "Untitled Role",
    baseWage: raw.baseWage ?? 0,
    payrollTaxes: raw.payrollTaxes ?? 0,
    workersComp: raw.workersComp ?? 0,
    pto: raw.pto ?? 0,
    supervision: raw.supervision ?? 0,
    downtime: raw.downtime ?? 0,
    targetMargin: raw.targetMargin ?? 0,
    perDiem: raw.perDiem ?? 0,

    // New union fields — default to 0 so old saved rates don't break
    healthAndWelfare: raw.healthAndWelfare ?? 0,
    pension: raw.pension ?? 0,
    training: raw.training ?? 0,
    otherFixedFringes: raw.otherFixedFringes ?? 0,
    generalLiabilityPerThousand: raw.generalLiabilityPerThousand ?? 0,

    // Legacy (ignored in new calculations)
    benefits: raw.benefits,
  };
}

/** Formats a dollar amount nicely for display */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formats a percentage */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Realistic default for Minnesota Highway & Heavy / Union Operating Engineer style work.
 * These numbers are representative of actual 2024-2026 prevailing wage packages.
 * Contractors should replace with their exact remittance rates.
 */
export const DEFAULT_LABOR_INPUTS: LaborRateInputs = {
  role: "Operating Engineer - Highway & Heavy",
  baseWage: 48.75,

  // Statutory burdens (still %)
  payrollTaxes: 7.65,
  workersComp: 21.5,        // Higher in heavy civil / highway work
  pto: 6.5,

  // Operational
  supervision: 8.5,
  downtime: 17.0,           // Includes weather, mobilization, shop time common in heavy construction

  // Pricing
  targetMargin: 16.0,
  perDiem: 0,

  // === Fixed Union Fringes (the critical new fields) ===
  healthAndWelfare: 15.40,  // H&W / medical
  pension: 13.25,           // Pension + annuity
  training: 1.10,           // JATC / training fund
  otherFixedFringes: 2.85,  // Vacation, supplemental unemployment, etc.

  // Insurance (very common presentation in heavy highway bids)
  generalLiabilityPerThousand: 10,    // $10 per $1,000 payroll (payroll-based: produces realistic ~$0.49/hr at default base wage)
};

/* =====================================================
   EQUIPMENT RATE CALCULATIONS
   Clean, transparent model for contractors
===================================================== */

export interface EquipmentCostLine {
  cost: number; // annual cost for this ownership/operating line
}

// Real Equipment Rate Builder model: depreciation from start/end book values over the asset's life
// (derived from start/end dates), plus annual ownership + operating cost lines, divided by annual hours.
export interface EquipmentRateInputs {
  startDate?: string;
  endDate?: string;
  startingValue: number;          // purchase / book value
  endingValue: number;            // salvage / residual value
  ownership: EquipmentCostLine[]; // annual ownership cost lines
  operating: EquipmentCostLine[]; // annual operating cost lines
  estimatedHours: number;         // forward-looking billable hours/year (drives the planning rate)
  actualHours: number;            // actual hours/year (drives the "actual use" view)
  targetMargin: number;           // desired margin % on the final hourly rate
}

export interface EquipmentRateResult {
  years: number;
  depreciationTotal: number;
  annualDepreciation: number;
  depreciationPerHour: number;
  ownershipAnnual: number;
  ownershipPerHour: number;
  operatingAnnual: number;
  operatingPerHour: number;
  totalAnnualCost: number;
  totalCostPerHour: number;       // the true total cost per billable hour
  recommendedRate: number;        // with target margin applied
  // "Actual use" view (uses actualHours instead of estimatedHours)
  actualDepreciationPerHour: number;
  actualOwnershipPerHour: number;
  actualOperatingPerHour: number;
  actualTotalPerHour: number;
}

// True equipment cost per billable hour. Depreciation is ANNUALIZED — whole-life depreciation
// (starting − ending value) ÷ years (derived from start/end dates, default 8) — before dividing by
// annual hours, then summed with annual ownership + operating ÷ annual hours. Single source of truth
// for both the Equipment builder and the rate store's getEquipmentCostPerHour.
export function calculateEquipmentRate(inputs: EquipmentRateInputs): EquipmentRateResult {
  const {
    startingValue,
    endingValue,
    ownership,
    operating,
    estimatedHours,
    actualHours,
    targetMargin,
    startDate,
    endDate,
  } = inputs;

  // Depreciation
  const depreciationTotal = Math.max(0, (startingValue || 0) - (endingValue || 0));

  // Approximate years from dates (for annualizing depreciation); default 8 when dates are absent.
  let years = 8;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    years = Math.max(1, diffMs / (1000 * 60 * 60 * 24 * 365.25));
  }
  const annualDepreciation = depreciationTotal / years;

  // Ownership + operating totals (annual)
  const ownershipAnnual = (ownership || []).reduce((sum, line) => sum + (line.cost || 0), 0);
  const operatingAnnual = (operating || []).reduce((sum, line) => sum + (line.cost || 0), 0);

  // Use estimated hours for the forward-looking "Cost Per Unit"
  const hoursForRate = Math.max(1, estimatedHours);

  const depreciationPerHour = annualDepreciation / hoursForRate;
  const ownershipPerHour = ownershipAnnual / hoursForRate;
  const operatingPerHour = operatingAnnual / hoursForRate;

  const totalAnnualCost = annualDepreciation + ownershipAnnual + operatingAnnual;
  const totalCostPerHour = totalAnnualCost / hoursForRate;

  // Recommended rate with target margin
  const recommendedRate = totalCostPerHour / (1 - targetMargin / 100);

  // For the "actual use" view
  const actualHoursForCalc = Math.max(1, actualHours);

  return {
    years: Math.round(years * 10) / 10,
    depreciationTotal: round2(depreciationTotal),
    annualDepreciation: round2(annualDepreciation),
    depreciationPerHour: round2(depreciationPerHour),
    ownershipAnnual: round2(ownershipAnnual),
    ownershipPerHour: round2(ownershipPerHour),
    operatingAnnual: round2(operatingAnnual),
    operatingPerHour: round2(operatingPerHour),
    totalAnnualCost: round2(totalAnnualCost),
    totalCostPerHour: round2(totalCostPerHour),
    recommendedRate: round2(recommendedRate),
    actualDepreciationPerHour: round2(annualDepreciation / actualHoursForCalc),
    actualOwnershipPerHour: round2(ownershipAnnual / actualHoursForCalc),
    actualOperatingPerHour: round2(operatingAnnual / actualHoursForCalc),
    actualTotalPerHour: round2((annualDepreciation + ownershipAnnual + operatingAnnual) / actualHoursForCalc),
  };
}

export const DEFAULT_EQUIPMENT_INPUTS: EquipmentRateInputs = {
  startDate: "",
  endDate: "",
  startingValue: 52000,
  endingValue: 12000,
  ownership: [],
  operating: [],
  estimatedHours: 1200,
  actualHours: 980,
  targetMargin: 15,
};
