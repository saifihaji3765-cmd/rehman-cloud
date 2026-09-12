"use strict";

const DEFAULT_MIN_POINTS = 3;
const DEFAULT_FORECAST_HORIZON_DAYS = 7;
const MAX_FORECAST_HORIZON_DAYS = 90;

const FORECAST_STATUS = Object.freeze({
  READY: "ready",
  INSUFFICIENT_DATA: "insufficient_data",
  INVALID_DATA: "invalid_data",
  UNAVAILABLE: "unavailable",
});

const VALUE_TYPES = Object.freeze({
  COST: "cost",
  USAGE: "usage",
});

/**
 * Financial Forecast Agent
 *
 * IMPORTANT:
 * - This agent never creates fake cost/usage values.
 * - Forecasts are calculated only from real observations supplied by
 *   provider adapters, monitoring agents, or persisted financial snapshots.
 * - Historical observations must contain numeric values + timestamps.
 * - Forecasts are estimates, not provider billing guarantees.
 *
 * Expected observation format:
 *
 * {
 *   provider: "aws",
 *   value: 12.45,
 *   currency: "USD",
 *   timestamp: "2026-09-10T00:00:00.000Z",
 *   source: "aws-cost-explorer",
 *   status: "verified"
 * }
 *
 * OR for usage:
 *
 * {
 *   provider: "openai",
 *   value: 125000,
 *   unit: "tokens",
 *   timestamp: "2026-09-10T00:00:00.000Z",
 *   source: "openai-usage",
 *   status: "verified"
 * }
 */

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeProvider(provider) {
  if (typeof provider !== "string") {
    return null;
  }

  const normalized = provider.trim().toLowerCase();

  return normalized || null;
}

function normalizeStatus(status) {
  if (typeof status !== "string") {
    return null;
  }

  return status.trim().toLowerCase() || null;
}

function isVerifiedObservation(observation) {
  if (!isObject(observation)) {
    return false;
  }

  const status = normalizeStatus(observation.status);

  /*
   * Only verified/available observations are eligible for forecasting.
   *
   * "available" is accepted because some provider adapters may expose
   * availability rather than the exact word "verified".
   */
  return status === "verified" || status === "available";
}

function normalizeTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeObservation(observation, valueType) {
  if (!isObject(observation)) {
    return null;
  }

  const value = toFiniteNumber(
    observation.value ??
      observation.amount ??
      observation.cost ??
      observation.usage ??
      observation.total
  );

  const timestamp = normalizeTimestamp(
    observation.timestamp ??
      observation.retrievedAt ??
      observation.date ??
      observation.periodEnd
  );

  const provider = normalizeProvider(observation.provider);

  if (value === null || value < 0 || !timestamp || !provider) {
    return null;
  }

  if (!isVerifiedObservation(observation)) {
    return null;
  }

  const normalized = {
    provider,
    value,
    timestamp: timestamp.toISOString(),
    source:
      typeof observation.source === "string"
        ? observation.source.trim() || null
        : null,
    status: normalizeStatus(observation.status),
    valueType,
  };

  if (valueType === VALUE_TYPES.COST) {
    normalized.currency =
      typeof observation.currency === "string"
        ? observation.currency.trim().toUpperCase() || null
        : null;
  }

  if (valueType === VALUE_TYPES.USAGE) {
    normalized.unit =
      typeof observation.unit === "string"
        ? observation.unit.trim() || null
        : null;

    normalized.model =
      typeof observation.model === "string"
        ? observation.model.trim() || null
        : null;
  }

  return normalized;
}

function sortObservations(observations) {
  return [...observations].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() -
      new Date(b.timestamp).getTime()
  );
}

function deduplicateObservations(observations) {
  const map = new Map();

  for (const observation of observations) {
    const key = [
      observation.provider,
      observation.timestamp,
      observation.valueType,
      observation.source || "",
      observation.currency || "",
      observation.unit || "",
      observation.model || "",
    ].join("|");

    map.set(key, observation);
  }

  return Array.from(map.values());
}

function normalizeObservations(observations, valueType) {
  if (!Array.isArray(observations)) {
    return [];
  }

  const normalized = observations
    .map((observation) =>
      normalizeObservation(observation, valueType)
    )
    .filter(Boolean);

  return sortObservations(
    deduplicateObservations(normalized)
  );
}

function groupByProvider(observations) {
  const groups = new Map();

  for (const observation of observations) {
    if (!groups.has(observation.provider)) {
      groups.set(observation.provider, []);
    }

    groups.get(observation.provider).push(observation);
  }

  return groups;
}

function millisecondsBetween(first, second) {
  return (
    new Date(second.timestamp).getTime() -
    new Date(first.timestamp).getTime()
  );
}

function calculateAverageDailyValue(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const first = observations[0];
  const last = observations[observations.length - 1];

  const elapsedMs = millisecondsBetween(first, last);

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }

  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    return null;
  }

  const totalValue = observations.reduce(
    (sum, observation) => sum + observation.value,
    0
  );

  /*
   * This assumes observations represent incremental values for each
   * measurement period.
   *
   * If the adapter provides cumulative counters instead, it should
   * convert them into period deltas before passing them here.
   */
  return totalValue / elapsedDays;
}

function calculateIntervalBurnRate(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const intervals = [];

  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];

    const elapsedMs = millisecondsBetween(previous, current);

    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      continue;
    }

    const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

    if (elapsedDays <= 0) {
      continue;
    }

    const delta = current.value - previous.value;

    /*
     * Negative deltas can occur with cumulative counters after a reset.
     * They are not treated as a negative burn rate.
     */
    if (delta < 0) {
      continue;
    }

    intervals.push(delta / elapsedDays);
  }

  if (!intervals.length) {
    return null;
  }

  return (
    intervals.reduce((sum, value) => sum + value, 0) /
    intervals.length
  );
}

function calculateLatestDailyBurnRate(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const last = observations[observations.length - 1];
  const previous = observations[observations.length - 2];

  const elapsedMs = millisecondsBetween(previous, last);

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }

  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  if (elapsedDays <= 0) {
    return null;
  }

  const delta = last.value - previous.value;

  if (delta < 0) {
    return null;
  }

  return delta / elapsedDays;
}

function calculateWeightedBurnRate(observations) {
  const averageRate = calculateAverageDailyValue(observations);
  const intervalRate = calculateIntervalBurnRate(observations);
  const latestRate = calculateLatestDailyBurnRate(observations);

  const candidates = [
    averageRate,
    intervalRate,
    latestRate,
  ].filter(
    (value) => Number.isFinite(value) && value >= 0
  );

  if (!candidates.length) {
    return null;
  }

  /*
   * Give the latest observation more weight because recent usage/cost
   * generally provides a better signal for short-term forecasting.
   */
  if (
    Number.isFinite(latestRate) &&
    Number.isFinite(intervalRate) &&
    Number.isFinite(averageRate)
  ) {
    return (
      latestRate * 0.5 +
      intervalRate * 0.3 +
      averageRate * 0.2
    );
  }

  if (
    Number.isFinite(latestRate) &&
    Number.isFinite(intervalRate)
  ) {
    return latestRate * 0.6 + intervalRate * 0.4;
  }

  if (Number.isFinite(latestRate)) {
    return latestRate;
  }

  if (Number.isFinite(intervalRate)) {
    return intervalRate;
  }

  return averageRate;
}

function roundValue(value, decimals = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function calculateForecast(observations, horizonDays) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const burnRatePerDay =
    calculateWeightedBurnRate(observations);

  if (
    !Number.isFinite(burnRatePerDay) ||
    burnRatePerDay < 0
  ) {
    return null;
  }

  const latestObservation =
    observations[observations.length - 1];

  const latestValue = latestObservation.value;

  const projectedIncrement =
    burnRatePerDay * horizonDays;

  const projectedValue =
    latestValue + projectedIncrement;

  return {
    latestObservedValue: roundValue(latestValue),
    projectedIncrement: roundValue(projectedIncrement),
    projectedValue: roundValue(projectedValue),
    burnRatePerDay: roundValue(burnRatePerDay),
    horizonDays,
    forecastAsOf: latestObservation.timestamp,
  };
}

function calculateTrend(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return "unknown";
  }

  const first = observations[0];
  const last = observations[observations.length - 1];

  if (last.value > first.value) {
    return "increasing";
  }

  if (last.value < first.value) {
    return "decreasing";
  }

  return "stable";
}

function calculateVolatility(observations) {
  if (!Array.isArray(observations) || observations.length < 2) {
    return null;
  }

  const rates = [];

  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];

    const elapsedMs = millisecondsBetween(
      previous,
      current
    );

    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      continue;
    }

    const elapsedDays =
      elapsedMs / (24 * 60 * 60 * 1000);

    if (elapsedDays <= 0) {
      continue;
    }

    const delta = current.value - previous.value;

    if (delta < 0) {
      continue;
    }

    rates.push(delta / elapsedDays);
  }

  if (rates.length < 2) {
    return null;
  }

  const mean =
    rates.reduce((sum, value) => sum + value, 0) /
    rates.length;

  if (!Number.isFinite(mean)) {
    return null;
  }

  const variance =
    rates.reduce(
      (sum, value) =>
        sum + (value - mean) ** 2,
      0
    ) / rates.length;

  if (!Number.isFinite(variance)) {
    return null;
  }

  return roundValue(Math.sqrt(variance));
}

function resolveHorizonDays(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FORECAST_HORIZON_DAYS;
  }

  return Math.min(
    Math.floor(parsed),
    MAX_FORECAST_HORIZON_DAYS
  );
}

function resolveMinimumPoints(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 2) {
    return DEFAULT_MIN_POINTS;
  }

  return Math.floor(parsed);
}

function resolveCurrency(observations) {
  const currencies = [
    ...new Set(
      observations
        .map((observation) => observation.currency)
        .filter(Boolean)
    ),
  ];

  if (currencies.length !== 1) {
    return null;
  }

  return currencies[0];
}

function resolveUnit(observations) {
  const units = [
    ...new Set(
      observations
        .map((observation) => observation.unit)
        .filter(Boolean)
    ),
  ];

  if (units.length !== 1) {
    return null;
  }

  return units[0];
}

function buildProviderForecast(
  provider,
  observations,
  valueType,
  options
) {
  const minimumPoints = options.minimumPoints;
  const horizonDays = options.horizonDays;

  if (observations.length < minimumPoints) {
    return {
      provider,
      status: FORECAST_STATUS.INSUFFICIENT_DATA,
      valueType,
      observationCount: observations.length,
      requiredObservationCount: minimumPoints,
      forecast: null,
      trend: calculateTrend(observations),
      source: null,
      retrievedAt:
        observations.length
          ? observations[observations.length - 1].timestamp
          : null,
    };
  }

  const forecast = calculateForecast(
    observations,
    horizonDays
  );

  if (!forecast) {
    return {
      provider,
      status: FORECAST_STATUS.INVALID_DATA,
      valueType,
      observationCount: observations.length,
      requiredObservationCount: minimumPoints,
      forecast: null,
      trend: calculateTrend(observations),
      source: null,
      retrievedAt:
        observations[observations.length - 1]?.timestamp ||
        null,
    };
  }

  const latestObservation =
    observations[observations.length - 1];

  const result = {
    provider,
    status: FORECAST_STATUS.READY,
    valueType,
    observationCount: observations.length,
    requiredObservationCount: minimumPoints,
    forecast,
    trend: calculateTrend(observations),
    volatility: calculateVolatility(observations),
    source: latestObservation.source || null,
    retrievedAt: latestObservation.timestamp,
    currency:
      valueType === VALUE_TYPES.COST
        ? resolveCurrency(observations)
        : null,
    unit:
      valueType === VALUE_TYPES.USAGE
        ? resolveUnit(observations)
        : null,
    model:
      valueType === VALUE_TYPES.USAGE
        ? latestObservation.model || null
        : null,
  };

  return result;
}

function buildAggregateForecast(
  observations,
  valueType,
  options
) {
  if (!observations.length) {
    return {
      status: FORECAST_STATUS.UNAVAILABLE,
      valueType,
      observationCount: 0,
      forecast: null,
      reason: "No verified observations were supplied.",
    };
  }

  const providers = groupByProvider(observations);

  /*
   * Aggregation is intentionally conservative.
   *
   * For cost, values can only be combined when all observations have
   * the same verified currency.
   *
   * For usage, values can only be combined when all observations have
   * the same verified unit.
   */
  const currency =
    valueType === VALUE_TYPES.COST
      ? resolveCurrency(observations)
      : null;

  const unit =
    valueType === VALUE_TYPES.USAGE
      ? resolveUnit(observations)
      : null;

  if (
    (valueType === VALUE_TYPES.COST && !currency) ||
    (valueType === VALUE_TYPES.USAGE && !unit)
  ) {
    return {
      status: FORECAST_STATUS.UNAVAILABLE,
      valueType,
      observationCount: observations.length,
      forecast: null,
      reason:
        valueType === VALUE_TYPES.COST
          ? "Verified observations do not share one currency."
          : "Verified observations do not share one usage unit.",
    };
  }

  /*
   * Do not mix different providers' model semantics unless they expose
   * the same unit/currency. Each provider forecast remains the primary
   * provider-level result.
   *
   * Aggregate values are calculated from observations only when the
   * observation timestamps and measurement semantics are compatible.
   */
  const sorted = sortObservations(observations);

  if (sorted.length < options.minimumPoints) {
    return {
      status: FORECAST_STATUS.INSUFFICIENT_DATA,
      valueType,
      observationCount: sorted.length,
      requiredObservationCount: options.minimumPoints,
      forecast: null,
      reason: "Not enough verified observations.",
    };
  }

  const groupedByTimestamp = new Map();

  for (const observation of sorted) {
    const timestamp = observation.timestamp;

    if (!groupedByTimestamp.has(timestamp)) {
      groupedByTimestamp.set(timestamp, 0);
    }

    groupedByTimestamp.set(
      timestamp,
      groupedByTimestamp.get(timestamp) + observation.value
    );
  }

  const aggregateObservations = Array.from(
    groupedByTimestamp.entries()
  )
    .map(([timestamp, value]) => ({
      provider: "aggregate",
      value,
      timestamp,
      status: "verified",
      source: "provider-aggregate",
      valueType,
      ...(valueType === VALUE_TYPES.COST
        ? { currency }
        : { unit }),
    }))
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime()
    );

  if (
    aggregateObservations.length <
    options.minimumPoints
  ) {
    return {
      status: FORECAST_STATUS.INSUFFICIENT_DATA,
      valueType,
      observationCount: aggregateObservations.length,
      requiredObservationCount: options.minimumPoints,
      forecast: null,
      reason:
        "Not enough distinct timestamped aggregate observations.",
    };
  }

  const forecast = calculateForecast(
    aggregateObservations,
    options.horizonDays
  );

  if (!forecast) {
    return {
      status: FORECAST_STATUS.INVALID_DATA,
      valueType,
      observationCount: aggregateObservations.length,
      forecast: null,
      reason: "Unable to calculate a valid forecast.",
    };
  }

  return {
    status: FORECAST_STATUS.READY,
    valueType,
    observationCount: aggregateObservations.length,
    providerCount: providers.size,
    forecast,
    trend: calculateTrend(aggregateObservations),
    volatility: calculateVolatility(
      aggregateObservations
    ),
    ...(valueType === VALUE_TYPES.COST
      ? { currency }
      : { unit }),
  };
}

function normalizeProviderFilter(providers) {
  if (!Array.isArray(providers)) {
    return null;
  }

  return [
    ...new Set(
      providers
        .map(normalizeProvider)
        .filter(Boolean)
    ),
  ];
}

function filterProviders(observations, providers) {
  if (!providers || !providers.length) {
    return observations;
  }

  const allowed = new Set(providers);

  return observations.filter((observation) =>
    allowed.has(observation.provider)
  );
}

function filterDateRange(
  observations,
  startDate,
  endDate
) {
  let result = observations;

  if (startDate) {
    const start = normalizeTimestamp(startDate);

    if (start) {
      result = result.filter(
        (observation) =>
          new Date(observation.timestamp).getTime() >=
          start.getTime()
      );
    }
  }

  if (endDate) {
    const end = normalizeTimestamp(endDate);

    if (end) {
      result = result.filter(
        (observation) =>
          new Date(observation.timestamp).getTime() <=
          end.getTime()
      );
    }
  }

  return result;
}

function buildForecastMetadata({
  observations,
  valueType,
  horizonDays,
}) {
  const timestamps = observations.map(
    (observation) =>
      new Date(observation.timestamp).getTime()
  );

  const validTimestamps = timestamps.filter(
    Number.isFinite
  );

  return {
    valueType,
    horizonDays,
    observationCount: observations.length,
    firstObservation:
      validTimestamps.length
        ? new Date(
            Math.min(...validTimestamps)
          ).toISOString()
        : null,
    lastObservation:
      validTimestamps.length
        ? new Date(
            Math.max(...validTimestamps)
          ).toISOString()
        : null,
    generatedAt: new Date().toISOString(),
    methodology:
      "Historical observed values with weighted daily burn-rate projection.",
    warning:
      "Forecast is an estimate based only on supplied verified observations; provider billing systems may have reporting delays.",
  };
}

/**
 * Main Forecast Agent
 *
 * Supported input:
 *
 * {
 *   valueType: "cost" | "usage",
 *   observations: [],
 *   providers: [],
 *   startDate,
 *   endDate,
 *   horizonDays: 7,
 *   minimumPoints: 3
 * }
 */
async function forecastAgent(input = {}) {
  try {
    if (!isObject(input)) {
      return {
        success: false,
        status: FORECAST_STATUS.INVALID_DATA,
        message: "Forecast input must be an object.",
        data: null,
      };
    }

    const valueType =
      input.valueType === VALUE_TYPES.USAGE
        ? VALUE_TYPES.USAGE
        : VALUE_TYPES.COST;

    const horizonDays = resolveHorizonDays(
      input.horizonDays
    );

    const minimumPoints = resolveMinimumPoints(
      input.minimumPoints
    );

    const providers = normalizeProviderFilter(
      input.providers
    );

    const rawObservations = Array.isArray(
      input.observations
    )
      ? input.observations
      : [];

    if (!rawObservations.length) {
      return {
        success: true,
        status: FORECAST_STATUS.UNAVAILABLE,
        message:
          "No historical observations were supplied. Forecast cannot be calculated.",
        data: {
          valueType,
          forecast: null,
          providers: [],
          metadata: buildForecastMetadata({
            observations: [],
            valueType,
            horizonDays,
          }),
        },
      };
    }

    const normalizedObservations =
      normalizeObservations(
        rawObservations,
        valueType
      );

    const providerFiltered =
      filterProviders(
        normalizedObservations,
        providers
      );

    const dateFiltered = filterDateRange(
      providerFiltered,
      input.startDate,
      input.endDate
    );

    if (!dateFiltered.length) {
      return {
        success: true,
        status: FORECAST_STATUS.UNAVAILABLE,
        message:
          "No verified observations remain after filtering.",
        data: {
          valueType,
          forecast: null,
          providers: providers || [],
          metadata: buildForecastMetadata({
            observations: [],
            valueType,
            horizonDays,
          }),
        },
      };
    }

    const options = {
      minimumPoints,
      horizonDays,
    };

    const grouped = groupByProvider(
      dateFiltered
    );

    const providerForecasts = [];

    for (const [
      provider,
      providerObservations,
    ] of grouped.entries()) {
      providerForecasts.push(
        buildProviderForecast(
          provider,
          sortObservations(providerObservations),
          valueType,
          options
        )
      );
    }

    providerForecasts.sort((a, b) =>
      a.provider.localeCompare(b.provider)
    );

    const aggregate = buildAggregateForecast(
      dateFiltered,
      valueType,
      options
    );

    const readyProviderForecasts =
      providerForecasts.filter(
        (forecast) =>
          forecast.status ===
          FORECAST_STATUS.READY
      );

    let overallStatus =
      FORECAST_STATUS.INSUFFICIENT_DATA;

    if (readyProviderForecasts.length) {
      overallStatus = FORECAST_STATUS.READY;
    } else if (
      providerForecasts.some(
        (forecast) =>
          forecast.status ===
          FORECAST_STATUS.INVALID_DATA
      )
    ) {
      overallStatus =
        FORECAST_STATUS.INVALID_DATA;
    }

    return {
      success: true,
      status: overallStatus,
      message:
        overallStatus === FORECAST_STATUS.READY
          ? "Forecast calculated from verified observations."
          : "Forecast could not be reliably calculated from the available observations.",
      data: {
        valueType,
        horizonDays,
        minimumPoints,
        providerForecasts,
        aggregate,
        metadata: buildForecastMetadata({
          observations: dateFiltered,
          valueType,
          horizonDays,
        }),
        dataQuality: {
          rawObservationCount:
            rawObservations.length,
          validVerifiedObservationCount:
            normalizedObservations.length,
          filteredObservationCount:
            dateFiltered.length,
          providersAvailable:
            providerForecasts.map(
              (forecast) => forecast.provider
            ),
        },
      },
    };
  } catch (error) {
    console.error(
      "[ForecastAgent] Error:",
      error.message
    );

    return {
      success: false,
      status: FORECAST_STATUS.INVALID_DATA,
      message:
        "Forecast agent failed to process the supplied observations.",
      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

forecastAgent.FORECAST_STATUS = FORECAST_STATUS;
forecastAgent.VALUE_TYPES = VALUE_TYPES;

forecastAgent.normalizeObservations =
  normalizeObservations;

forecastAgent.calculateForecast =
  calculateForecast;

forecastAgent.calculateWeightedBurnRate =
  calculateWeightedBurnRate;

forecastAgent.calculateTrend =
  calculateTrend;

module.exports = forecastAgent;
