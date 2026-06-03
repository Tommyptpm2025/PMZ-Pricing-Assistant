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

  // === Insurance (often priced per 1,000 hours) ===
  generalLiabilityPerThousand: number; // $ per 1,000 hours worked (GL, umbrella, etc.)

  // Legacy field kept for backward compatibility with old saved rates
  // (no longer shown in the UI or used in new calculations)
  benefits?: number;
}

export interface LaborRateResult {
  // === Breakdown for transparency (especially important for union work) ===
  fixedFringesTotal: number;             // Sum of all fixed $/hr fringes (H&W + Pension + Training + Other)
  generalLiabilityPerHour: number;       // GL converted to per-hour cost

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

  // General Liability converted to per-hour cost (very common in heavy civil / highway)
  const generalLiabilityPerHour = round2(generalLiabilityPerThousand / 1000);

  // --- Statutory burdens (dollars) ---

  // Payroll taxes (FICA, etc.) almost always calculated on base wage only
  const payrollTaxDollars = baseWage * (payrollTaxes / 100);

  // Workers' Comp in heavy construction / union work is usually applied to the
  // total package (base + fringes) because the insurance carrier sees the full payroll cost.
  const wcBase = baseWage + fixedFringesTotal;
  const workersCompDollars = wcBase * (workersComp / 100);

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
  generalLiabilityPerThousand: 485,   // $485 per 1,000 hours worked
};

/* =====================================================
   EQUIPMENT RATE CALCULATIONS
   Clean, transparent model for contractors
===================================================== */

export interface EquipmentRateInputs {
  description: string;

  // Ownership inputs
  purchasePrice: number;
  salvageValue: number;           // residual value at end of life
  usefulLifeYears: number;
  annualUtilizationHours: number; // expected billable hours per year
  annualInsurance: number;
  annualStorageTransport: number;
  financingInterestRate: number;  // cost of capital / loan interest %

  // Operating inputs
  fuelCostPerHour: number;
  annualMaintenanceRepairs: number;

  // Pricing
  targetRecoveryMargin: number;   // desired margin on the final hourly rate
}

export interface EquipmentRateResult {
  hourlyOwnershipCost: number;
  hourlyOperatingCost: number;
  totalHourlyCost: number;
  recommendedHourlyRate: number;  // with target margin applied
  utilizationPercent: number;     // for display
}

export function calculateEquipmentRate(inputs: EquipmentRateInputs): EquipmentRateResult {
  const {
    purchasePrice,
    salvageValue,
    usefulLifeYears,
    annualUtilizationHours,
    annualInsurance,
    annualStorageTransport,
    financingInterestRate,
    fuelCostPerHour,
    annualMaintenanceRepairs,
    targetRecoveryMargin,
  } = inputs;

  // === Ownership Costs (per year) ===
  const depreciation = (purchasePrice - salvageValue) / usefulLifeYears;
  const averageInvestment = (purchasePrice + salvageValue) / 2;
  const interestCost = averageInvestment * (financingInterestRate / 100);

  const annualOwnershipCosts =
    depreciation +
    interestCost +
    annualInsurance +
    annualStorageTransport;

  // === Hourly Ownership Cost ===
  const hourlyOwnershipCost = annualOwnershipCosts / annualUtilizationHours;

  // === Hourly Operating Cost ===
  const hourlyMaintenance = annualMaintenanceRepairs / annualUtilizationHours;
  const hourlyOperatingCost = fuelCostPerHour + hourlyMaintenance;

  // === Total True Cost per Hour ===
  const totalHourlyCost = hourlyOwnershipCost + hourlyOperatingCost;

  // === Recommended Rate with Target Margin ===
  const recommendedHourlyRate =
    totalHourlyCost / (1 - targetRecoveryMargin / 100);

  return {
    hourlyOwnershipCost: round2(hourlyOwnershipCost),
    hourlyOperatingCost: round2(hourlyOperatingCost),
    totalHourlyCost: round2(totalHourlyCost),
    recommendedHourlyRate: round2(recommendedHourlyRate),
    utilizationPercent: round2((annualUtilizationHours / 8760) * 100), // rough full year reference
  };
}

export const DEFAULT_EQUIPMENT_INPUTS: EquipmentRateInputs = {
  description: "2022 Ford F-250 Service Truck",
  purchasePrice: 52000,
  salvageValue: 12000,
  usefulLifeYears: 8,
  annualUtilizationHours: 1200,     // realistic for support truck
  annualInsurance: 1850,
  annualStorageTransport: 650,
  financingInterestRate: 7.5,
  fuelCostPerHour: 4.25,
  annualMaintenanceRepairs: 4200,
  targetRecoveryMargin: 15,
};
